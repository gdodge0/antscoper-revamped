"""Smoke test the production images without making upstream network requests.

Build antscoper-test-web and antscoper-test-worker first. Run with --engine podman
or --engine docker. Every container and volume created here is temporary.
"""
import argparse
from datetime import datetime, timezone
import json
import subprocess
import time
import traceback
import urllib.error
import urllib.request
import uuid
from zoneinfo import ZoneInfo

from tests.test_worker import dataset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', choices=['docker', 'podman'], default='docker')
    args = parser.parse_args()
    prefix = 'antscoper-smoke-' + uuid.uuid4().hex[:8]
    volume, web, worker = prefix + '-data', prefix + '-web', prefix + '-worker'
    def run(*parts, input=None):
        result = subprocess.run([args.engine, *parts], input=input, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(f'{args.engine} {parts[0]} failed: {result.stderr.strip()} {result.stdout.strip()}')
        return result.stdout.strip()
    def seed(data):
        code = "from worker.__main__ import Store,atomic; import json,sys; from datetime import datetime,timezone; from zoneinfo import ZoneInfo; s=Store('/var/lib/antscoper'); d=json.load(sys.stdin); now=datetime.now(timezone.utc); s.publish(d,{},now); s.status({'lastAttempt':now.isoformat(),'lastSuccess':now.isoformat(),'completedDate':now.astimezone(ZoneInfo('America/Los_Angeles')).date().isoformat()},now)"
        run('run', '--rm', '-i', '-v', volume + ':/var/lib/antscoper', '--entrypoint', 'python', 'antscoper-test-worker', '-c', code, input=json.dumps(data))
    try:
        run('volume', 'create', volume)
        run('run', '--rm', '--user', '0:0', '-v', volume + ':/var/lib/antscoper', 'antscoper-test-worker', 'init')
        run('run', '-d', '--name', web, '-v', volume + ':/var/lib/antscoper:ro', '-p', '127.0.0.1::8080', 'antscoper-test-web')
        address = run('port', web, '8080/tcp').splitlines()[0]
        base = 'http://' + address
        def get(path):
            try:
                with urllib.request.urlopen(base + path, timeout=10) as response:
                    return response.status, response.read(), response.headers
            except urllib.error.HTTPError as e:
                return e.code, e.read(), e.headers
        for _ in range(30):
            try:
                if get('/health')[0] == 200: break
            except OSError: pass
            time.sleep(0.2)
        assert get('/data/snapshot.json')[0] == 503, 'No production demo fallback'
        assert get('/health')[0] == 200
        assert get('/version.json')[0] == 200
        assert get('/?room=alp-1100')[0] == 200
        data = dataset()
        seed(data)
        assert json.loads(get('/data/snapshot.json')[1])['metadata']['publicationId'] == data['metadata']['publicationId']
        for path in ['/backups/', '/private/state.json', '/data/../backups/', '/.runtime/private/state.json']:
            assert get(path)[0] == 404, path
        assert 'no-cache' in get('/data/snapshot.json')[2]['Cache-Control']
        run('run', '-d', '--name', worker, '-v', volume + ':/var/lib/antscoper', 'antscoper-test-worker')
        for _ in range(30):
            try:
                run('exec', worker, 'python', '-m', 'worker', 'health')
                break
            except RuntimeError:time.sleep(0.2)
        else:raise AssertionError('Worker heartbeat failed')
        assert run('exec', worker, 'id', '-u') == '10001'
        assert run('exec', web, 'id', '-u') == '101'
        second = dataset()
        seed(second)
        assert json.loads(get('/data/snapshot.json')[1])['metadata']['publicationId'] == second['metadata']['publicationId']
        run('restart', web, worker)
        # Docker may allocate a new ephemeral host port when restarting a container.
        base = 'http://' + run('port', web, '8080/tcp').splitlines()[0]
        for _ in range(30):
            try:
                if get('/health')[0] == 200:break
            except OSError:pass
            time.sleep(0.2)
        else:raise AssertionError('Web did not become ready after restart')
        assert json.loads(get('/data/snapshot.json')[1])['metadata']['publicationId'] == second['metadata']['publicationId']
        backups = json.loads(run('exec', worker, 'python', '-c', "from pathlib import Path;import json;print(json.dumps(sorted(str(p) for p in Path('/var/lib/antscoper/backups').glob('*.json.gz'))))"))
        first = next(path for path in backups if data['metadata']['publicationId'] in path)
        run('exec', worker, 'python', '-m', 'worker', 'restore', '--backup', first)
        assert json.loads(get('/data/snapshot.json')[1])['metadata']['publicationId'] == data['metadata']['publicationId']
        print('Container smoke passed: unavailable state, live publication, persistence, private backups, restore, health and unprivileged users.')
    except Exception:
        # CI annotations keep the failure useful even without authenticated log access.
        detail = traceback.format_exc().replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::error title=Container smoke::' + detail, flush=True)
        for name in [web, worker]:
            result = subprocess.run([args.engine, 'logs', '--tail', '30', name], capture_output=True, text=True)
            print(name, result.stdout, result.stderr, flush=True)
        raise
    finally:
        for name in [web, worker]:
            subprocess.run([args.engine, 'rm', '-f', name], capture_output=True)
        subprocess.run([args.engine, 'volume', 'rm', volume], capture_output=True)


if __name__ == '__main__':main()
