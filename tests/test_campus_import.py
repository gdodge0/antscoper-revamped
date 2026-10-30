import unittest
from scripts.import_campus import stitch, inside, centroid


class CampusGeometryTests(unittest.TestCase):
    def test_joins_reversed_multipolygon_members(self):
        self.assertEqual(stitch([[1, 2], [3, 2], [1, 4], [4, 3]]), [[1, 2, 3, 4, 1]])

    def test_incomplete_ring_is_rejected_instead_of_filled(self):
        with self.assertRaises(ValueError):
            stitch([[1, 2], [2, 3]])

    def test_centroid_ignores_extra_collinear_nodes(self):
        square = [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [0, 0]]
        self.assertEqual(centroid(square), [1, 1])
        self.assertTrue(inside([1, 1], square))
        self.assertFalse(inside([3, 3], square))


if __name__ == "__main__":
    unittest.main()
