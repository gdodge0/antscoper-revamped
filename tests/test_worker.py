from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

from worker.data import calendar_terms, normalize, select_terms, location
from worker.__main__ import Store, atomic, due, next_run

TERM = {'id': '2026-92', 'year': '2026', 'quarter': 'Fall', 'instructionStart': '2026-09-24',
        'instructionEnd': '2026-12-04', 'finalsStart': '2026-12-05', 'finalsEnd': '2026-12-11', 'socAvailable': '2026-05-02'}
SECTION = {'sectionCode': '1', 'status': 'OPEN', 'meetings': [
    {'timeIsTBA': False, 'days': 'TuTh', 'bldg': ['ELH 100'], 'startTime': {'hour': 8, 'minute': 0}, 'endTime': {'hour': 9, 'minute': 20}}],
    'finalExam': {'examStatus': 'SCHEDULED_FINAL', 'month': 11, 'day': 8, 'bldg': ['ELH 100', 'SSL 290'],
                  'startTime': {'hour': 8, 'minute': 0}, 'endTime': {'hour': 10, 'minute': 0}}}


def response(sections):
    return {'schools': [{'departments': [{'courses': [{'sections': sections}]}]}]}


def dataset():
    return normalize([TERM], {'2026-92': response([SECTION, SECTION])}, date(2026, 10, 29), datetime(2026, 10, 29, 13, tzinfo=timezone.utc))


class WorkerTests(unittest.TestCase):
    def test_deduplicates_and_buffers_regular_and_dated_finals_once(self):
        data = dataset()
        room = next(r for r in data['rooms'] if r['id'] == 'elh-100')
        self.assertEqual(room['meetings'], [{'term': '2026-92', 'days': [2, 4], 'start': 480, 'end': 570}])
        self.assertEqual(room['exams'], [{'term': '2026-92', 'date': '2026-12-08', 'start': 480, 'end': 610}])
        self.assertEqual(len(data['rooms']), 2)

    def test_unknown_exams_and_invalid_physical_rooms(self):
        section = deepcopy(SECTION)
        section['finalExam'] = {'examStatus': 'TBA_FINAL'}
        section['meetings'][0]['bldg'] += ['ON LINE', 'VRTL REMOTE']
        data = normalize([TERM], {'2026-92': response([section])}, date(2026, 10, 29))
        self.assertEqual(len(data['rooms']), 1)
        self.assertEqual(data['rooms'][0]['uncertainFinals'], ['2026-92'])
        self.assertEqual(location('UCI BARN'), ('uci-barn', 'uci', 'BARN'))

    def test_summer_overlap_and_unpublished_terms(self):
        terms = [dict(TERM, id='2027-25', year='2027', quarter='Summer1', instructionStart='2027-06-21', instructionEnd='2027-07-26', finalsStart='2027-07-27', finalsEnd='2027-07-28', socAvailable='2027-03-01'),
                 dict(TERM, id='2027-39', year='2027', quarter='Summer10wk', instructionStart='2027-06-21', instructionEnd='2027-08-26', finalsStart='2027-08-27', finalsEnd='2027-08-27', socAvailable='2027-03-01'),
                 dict(TERM, id='2027-92', year='2027', socAvailable='2027-08-01', instructionStart='2027-09-20', instructionEnd='2027-12-03', finalsStart='2027-12-04', finalsEnd='2027-12-10')]
        self.assertEqual([t['id'] for t in select_terms(terms, date(2027, 7, 1))], ['2027-25', '2027-39'])

    def test_rejects_empty_or_malformed_terms(self):
        for r in [{'schools': []}, response([])]:
            with self.assertRaises(ValueError): normalize([TERM], {'2026-92': r}, date(2026, 10, 29))
        with self.assertRaises(ValueError): calendar_terms([dict(TERM, instructionEnd='2026-01-01')])

    def test_six_am_tracks_both_dst_transitions(self):
        zone = ZoneInfo('America/Los_Angeles')
        for day, offset in [('2027-03-14', -7), ('2027-11-07', -8)]:
            now = datetime.fromisoformat(day + 'T05:59:00').replace(tzinfo=zone)
            target = next_run(now)
            self.assertEqual(target.hour, 6)
            self.assertEqual(target.utcoffset(), timedelta(hours=offset))
            self.assertTrue(due(target, {}, True))
            self.assertFalse(due(now, {}, True))
            self.assertFalse(due(target, {'completedDate': day}, True))

    def test_bootstrap_and_missed_refresh_catchup(self):
        now = datetime(2026, 10, 29, 4, tzinfo=ZoneInfo('America/Los_Angeles'))
        self.assertTrue(due(now, {}, False))
        self.assertFalse(due(now, {'lastAttempt': now.isoformat(), 'completedDate': '2026-10-28'}, False))
        self.assertTrue(due(now.replace(hour=9), {'completedDate': '2026-10-28'}, True))

    def test_bootstrap_before_six_does_not_skip_scheduled_refresh(self):
        now = datetime(2026, 10, 29, 4, tzinfo=ZoneInfo('America/Los_Angeles'))
        with tempfile.TemporaryDirectory() as root:
            store = Store(root)
            with patch('worker.__main__.Provider.get', side_effect=[calendar_terms([TERM]), response([SECTION])]):
                self.assertTrue(store.refresh(now))
            state = json.loads((Path(root) / 'private/state.json').read_text())
            self.assertEqual(state['completedDate'], '2026-10-28')
            self.assertFalse(due(now, state, True))
            self.assertTrue(due(now.replace(hour=6), state, True))

    def test_failure_keeps_publication_and_bounds_retries(self):
        with tempfile.TemporaryDirectory() as root:
            store = Store(root)
            atomic(store.snapshot, dataset())
            before = store.snapshot.read_bytes()
            now = datetime.now(timezone.utc)
            with patch('worker.__main__.Provider.get', side_effect=OSError('private upstream detail')):
                for i in range(3): self.assertFalse(store.refresh(now + timedelta(minutes=i * 25)))
            self.assertEqual(store.snapshot.read_bytes(), before)
            status = json.loads((Path(root) / 'public/status.json').read_text())
            self.assertEqual(status['error'], 'OSError')
            self.assertNotIn('private upstream', json.dumps(status))
            self.assertIsNone(json.loads((Path(root) / 'private/state.json').read_text())['retryAt'])

    def test_lock_publication_permissions_backups_and_retention(self):
        with tempfile.TemporaryDirectory() as root:
            store = Store(root)
            with store.lock():
                with self.assertRaises(BlockingIOError):
                    with store.lock(): pass
            now = datetime.now(timezone.utc)
            store.publish(dataset(), {'source': {'ok': True}}, now)
            archives = list((Path(root) / 'backups').glob('*.json.gz'))
            self.assertEqual(len(archives), 1)
            with gzip.open(archives[0], 'rt') as f:self.assertEqual(json.load(f)['snapshot']['schemaVersion'], 2)
            self.assertEqual((Path(root) / 'backups').stat().st_mode & 0o777, 0o700)
            self.assertTrue(store.snapshot.stat().st_mode & 0o004)
            import os
            old = now.timestamp() - 31 * 86400
            os.utime(archives[0], (old, old))
            new = dataset()
            store.publish(new, {}, now + timedelta(seconds=1))
            self.assertEqual(len(list((Path(root) / 'backups').glob('*.json.gz'))), 1)


if __name__ == '__main__': unittest.main()
