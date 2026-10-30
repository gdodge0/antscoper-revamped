import json
import unittest
from pathlib import Path
from scripts.import_terrain import validate
from scripts.import_campus import build

ROOT = Path(__file__).resolve().parents[1]


class TerrainImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.grid = json.loads((ROOT / 'frontend/public/data/campus-terrain.json').read_text())

    def test_committed_grid_covers_campus_with_real_meter_elevations(self):
        result = validate(self.grid)
        self.assertGreater(result['terrainSamples'], 100000)
        self.assertGreater(result['elevationMeters'][1] - result['elevationMeters'][0], 30)

    def test_incomplete_invalid_or_unreferenced_grid_is_rejected(self):
        for field, value in [('samples', [1, 2]), ('samples', [float('nan')] * len(self.grid['samples'])),
                             ('spacing', 0), ('sourceSha256', ''), ('x0', 0)]:
            with self.subTest(field=field):
                data = {**self.grid, field: value}
                with self.assertRaises(AssertionError):
                    validate(data)

    def test_import_retains_bridge_layer_and_tunnel_tags(self):
        config = {'locations': [], 'displayBounds': [-118, 33, -117, 34],
                  'districts': [{'id': 'test', 'coordinate': [-117.5, 33.5]}],
                  'outside': [], 'codeOverrides': {}, 'roomOverrides': {},
                  'origin': [-117.5, 33.5], 'bbox': [-118, 33, -117, 34], 'retrievedAt': '2026-10-29'}
        raw = b'<osm><node id="1" lon="-117.6" lat="33.5"/><node id="2" lon="-117.5" lat="33.5"/><way id="3"><nd ref="1"/><nd ref="2"/><tag k="highway" v="footway"/><tag k="bridge" v="yes"/><tag k="layer" v="1"/></way><way id="4"><nd ref="1"/><nd ref="2"/><tag k="highway" v="service"/><tag k="tunnel" v="yes"/><tag k="layer" v="-1"/></way></osm>'
        paths = build(raw, config)[0]['paths']
        self.assertEqual((paths[0]['sourceId'], paths[0]['bridge'], paths[0]['layer']), ('w3', True, 1))
        self.assertEqual((paths[1]['tunnel'], paths[1]['layer']), (True, -1))


if __name__ == '__main__':
    unittest.main()
