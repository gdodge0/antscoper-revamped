import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts.export_snapshot import merge, export
from websoc.parse import parse_time

class SnapshotTests(unittest.TestCase):
    def test_buffer_and_meridiem(self):
        self.assertEqual(parse_time('TuTh 3:30- 4:50p'), (['tu', 'th'], (15.5, 17.0)))
        self.assertEqual(parse_time('MW 11:00-11:50p'), (['m', 'w'], (23.0, 24)))
        self.assertEqual(parse_time('F 11:00-12:20p'), (['f'], (11.0, 12.5)))
        self.assertEqual(parse_time('F 12:00-12:50p'), (['f'], (12.0, 13.0)))
    def test_merge_deduplicates_adjacent_and_overlapping_meetings(self):
        self.assertEqual(merge([(10, 11), (9, 10), (9, 10), (10.5, 12), (14, 15)]), [[540, 720], [840, 900]])
    def test_invalid_interval_rejected(self):
        with self.assertRaises(ValueError): merge([(15, 14)])
    def test_failure_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'snapshot.json'
            path.write_text('original')
            with patch('scripts.export_snapshot.documents', side_effect=RuntimeError('network')):
                with self.assertRaises(RuntimeError): export('2026-92', path)
            self.assertEqual(path.read_text(), 'original')
    def test_committed_snapshot_is_nonempty_current_and_physical(self):
        data = json.loads(Path('frontend/fixtures/demo.json').read_text())
        self.assertEqual(data['metadata']['bufferMinutes'], 10)
        self.assertGreater(len(data['rooms']), 100)
        self.assertEqual(len({r['id'] for r in data['rooms']}), len(data['rooms']))
        for room in data['rooms']:
            self.assertNotIn(room['building'], {'on', 'vrtl', 'tba'})
            self.assertEqual(len(room['schedule']), 7)
            self.assertTrue(any(room['schedule']))
            for day in room['schedule']:
                previous = -1
                for start, end in day:
                    self.assertGreaterEqual(start, previous)
                    self.assertLess(start, end)
                    self.assertLessEqual(end, 1440)
                    previous = end
