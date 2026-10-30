"""Usage: python -m worker [serve|refresh|restore|health|init] [--root PATH]."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import gzip
import json
import os
from pathlib import Path
import signal
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

from .data import calendar_terms, normalize, select_terms

PACIFIC = ZoneInfo('America/Los_Angeles')
API = 'https://anteaterapi.com/v2/rest'


def log(event, **values):
    print(json.dumps({'event': event, **values}), flush=True)


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, separators=(',', ':'))
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def read(path, default=None):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return {} if default is None else default


def next_run(now):
    local = now.astimezone(PACIFIC)
    target = local.replace(hour=6, minute=0, second=0, microsecond=0)
    if target <= local:
        target = (local + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
    return target


def due(now, state, has_snapshot):
    local = now.astimezone(PACIFIC)
    if not has_snapshot and not state.get('lastAttempt'):
        return True
    retry = state.get('retryAt')
    if retry:
        return now >= datetime.fromisoformat(retry)
    return local.hour >= 6 and state.get('completedDate') != local.date().isoformat()


class Provider:
    def __init__(self, deadline, key=None):
        self.deadline, self.key, self.raw = deadline, key, {}

    def get(self, path, **params):
        url = API + path + ('?' + urllib.parse.urlencode(params) if params else '')
        headers = {'Accept': 'application/json', 'Accept-Encoding': '', 'User-Agent': 'Antscoper/2 (+https://antscoper.gdodge.dev)'}
        if self.key:
            headers['Authorization'] = 'Bearer ' + self.key
        for attempt in range(3):
            if time.monotonic() >= self.deadline:
                raise TimeoutError('Refresh deadline exceeded')
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=min(30, max(1, self.deadline - time.monotonic()))) as response:
                    data = json.load(response)
                if data.get('ok') is not True or 'data' not in data:
                    raise ValueError('Invalid provider envelope')
                self.raw[url] = data
                return data['data']
            except (OSError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(2 ** (attempt + 1))


class Store:
    def __init__(self, root):
        self.root = Path(root)
        for name in ('public', 'private', 'backups'):
            (self.root / name).mkdir(parents=True, exist_ok=True)
        for name in ('private', 'backups'):
            (self.root / name).chmod(0o700)

    @property
    def snapshot(self):
        return self.root / 'public/snapshot.json'

    @contextmanager
    def lock(self):
        with (self.root / 'private/refresh.lock').open('a') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield

    def publish(self, dataset, raw, now):
        # Complete and fsync an immutable generation before publishing the public file.
        ident = dataset['metadata']['publicationId']
        generation = self.root / 'private/generations' / ident
        generation.mkdir(parents=True)
        atomic(generation / 'snapshot.json', dataset)
        archive = self.root / 'backups' / (now.strftime('%Y%m%dT%H%M%S') + '-' + ident + '.json.gz')
        with gzip.open(archive, 'wt') as stream:
            json.dump({'snapshot': dataset, 'responses': raw}, stream, separators=(',', ':'))
        # Copy-and-replace keeps Nginx's read-only mount independent of private directory access.
        atomic(self.snapshot, dataset)
        cutoff = now.timestamp() - 30 * 86400
        for path in (self.root / 'backups').glob('*.json.gz'):
            if path.stat().st_mtime < cutoff:
                path.unlink()
        # Public file is self-contained. Only keep the current private staging generation.
        for path in (self.root / 'private/generations').iterdir():
            if path.name != ident:
                (path / 'snapshot.json').unlink(missing_ok=True)
                path.rmdir()

    def status(self, state, now):
        snapshot = read(self.snapshot)
        atomic(self.root / 'public/status.json', {
            'lastAttempt': state.get('lastAttempt'), 'lastSuccess': state.get('lastSuccess'),
            'nextRun': state.get('retryAt') or next_run(now).isoformat(),
            'error': state.get('error'), 'terms': snapshot.get('metadata', {}).get('terms', []),
            'publicationId': snapshot.get('metadata', {}).get('publicationId'),
        })
        atomic(self.root / 'private/state.json', state)

    def refresh(self, now=None, manual=False):
        now = now or datetime.now(timezone.utc)
        with self.lock():
            state = read(self.root / 'private/state.json')
            day = now.astimezone(PACIFIC).date()
            slot = (day if now.astimezone(PACIFIC).hour >= 6 else day - timedelta(days=1)).isoformat()
            if state.get('attemptDate') != slot:
                state.update(attemptDate=slot, attempts=0)
            state.update(lastAttempt=now.isoformat(), attempts=state.get('attempts', 0) + 1)
            self.status(state, now)
            try:
                provider = Provider(time.monotonic() + 900, os.environ.get('ANTEATER_API_KEY'))
                try:
                    calendar = calendar_terms(provider.get('/calendar/all'))
                    atomic(self.root / 'private/calendar.json', calendar)
                except (OSError, ValueError):
                    calendar = read(self.root / 'private/calendar.json', [])
                    if not calendar:
                        raise
                override = [s.strip() for s in os.environ.get('SCHEDULE_TERMS', '').split(',') if s.strip()] or None
                terms = select_terms(calendar, day, override)
                responses = {}
                for term in terms:
                    responses[term['id']] = provider.get('/websoc', year=term['year'], quarter=term['quarter'])
                dataset = normalize(terms, responses, day, now)
                self.publish(dataset, provider.raw, now)
                state.update(lastSuccess=now.isoformat(), error=None, retryAt=None, completedDate=slot)
                log('refresh_succeeded', publicationId=dataset['metadata']['publicationId'], rooms=len(dataset['rooms']), terms=dataset['metadata']['terms'])
                success = True
            except Exception as error:
                # Never emit upstream bodies, credentials, or request headers.
                code = 'provider_http_' + str(error.code) if isinstance(error, urllib.error.HTTPError) else type(error).__name__
                retry = [5, 20][state['attempts'] - 1] if state['attempts'] <= 2 else None
                state.update(error=code, retryAt=(now + timedelta(minutes=retry)).isoformat() if retry else None)
                if retry is None:
                    state['completedDate'] = slot
                log('refresh_failed', error=code, attempt=state['attempts'])
                success = False
            self.status(state, datetime.now(timezone.utc))
            return success


def serve(store):
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    pool = ThreadPoolExecutor(max_workers=1)
    job, started = None, 0
    try:
        while not stopped.is_set():
            now = datetime.now(timezone.utc)
            atomic(store.root / 'private/heartbeat.json', {'at': now.isoformat()})
            if job and job.done():
                try:
                    job.result()
                except BlockingIOError:
                    log('refresh_already_running')
                job = None
            if job and time.monotonic() - started > 930:
                log('refresh_deadline_exceeded')
                os._exit(1)  # Container restart releases the OS lock and stops hung I/O.
            state = read(store.root / 'private/state.json')
            if job is None and due(now, state, store.snapshot.exists()):
                job = pool.submit(store.refresh)
                started = time.monotonic()
            stopped.wait(30)
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['serve', 'refresh', 'restore', 'health', 'init'], nargs='?', default='serve')
    parser.add_argument('--root', type=Path, default=Path(os.environ.get('SCHEDULE_ROOT', '/var/lib/antscoper')))
    parser.add_argument('--backup', type=Path)
    args = parser.parse_args()
    if args.command == 'init':
        store = Store(args.root)
        for path in [args.root, *args.root.iterdir()]:
            os.chown(path, 10001, 10001)
        return
    if args.command == 'health':
        heartbeat = read(args.root / 'private/heartbeat.json')
        if not heartbeat or (datetime.now(timezone.utc) - datetime.fromisoformat(heartbeat['at'])).total_seconds() > 120:
            raise SystemExit(1)
        return
    store = Store(args.root)
    if args.command == 'serve':
        serve(store)
    elif args.command == 'refresh':
        raise SystemExit(0 if store.refresh(manual=True) else 1)
    elif args.command == 'restore':
        if not args.backup:
            parser.error('--backup is required')
        with store.lock(), gzip.open(args.backup, 'rt') as stream:
            archive = json.load(stream)
            dataset = archive['snapshot']
            if dataset.get('schemaVersion') != 2 or not dataset.get('rooms') or not dataset.get('terms'):
                raise ValueError('Invalid backup')
            atomic(store.snapshot, dataset)
            state = read(store.root / 'private/state.json')
            state.update(lastSuccess=dataset['metadata']['fetchedAt'], error='restored_backup')
            store.status(state, datetime.now(timezone.utc))
            log('backup_restored', publicationId=dataset['metadata']['publicationId'])


if __name__ == '__main__':
    main()
