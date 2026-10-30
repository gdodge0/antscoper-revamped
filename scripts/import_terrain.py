"""Import a public USGS bare-earth DEM into the campus's local-meter height grid.

Only importing requires scripts/requirements-terrain.txt. --check is offline and
uses the standard library, as do normal builds and the geography audit.
"""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "frontend/public/data/campus-terrain.json"
SOURCE = "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_CaliforniaGaps_B23/TIFF/USGS_1M_11_x42y373_CA_CaliforniaGaps_B23.tif"


def validate(data):
    assert data["schemaVersion"] == 1
    assert data["spacing"] == 5 and data["units"] == "meters"
    assert data["sampleScale"] == 0.1
    assert 2 <= data["columns"] <= 1000 and 2 <= data["rows"] <= 1000
    assert len(data["samples"]) == data["columns"] * data["rows"]
    assert all(isinstance(v, int) and -1000 < v < 30000 for v in data["samples"])
    assert all(math.isfinite(data[k]) for k in ("x0", "z0", "referenceElevation"))
    assert len(data["sourceSha256"]) == 64
    assert data["source"] == SOURCE
    assert data["sourceCrs"] and data["verticalDatum"]
    config = json.loads((ROOT / "scripts/campus-overrides.json").read_text())
    lon0, lat0 = config["origin"]
    west, south, east, north = config["displayBounds"]
    sx = 111320 * math.cos(math.radians(lat0))
    assert data["x0"] <= (west - lon0) * sx
    assert data["z0"] <= (lat0 - north) * 111320
    assert data["x0"] + (data["columns"] - 1) * 5 >= (east - lon0) * sx
    assert data["z0"] + (data["rows"] - 1) * 5 >= (lat0 - south) * 111320
    return {"terrainSamples": len(data["samples"]), "elevationMeters": [min(data["samples"]) / 10, max(data["samples"]) / 10]}


def build(path):
    import numpy as np
    import rasterio
    from rasterio.transform import Affine
    from rasterio.warp import reproject, Resampling

    config = json.loads((ROOT / "scripts/campus-overrides.json").read_text())
    lon0, lat0 = config["origin"]
    sx = 111320 * math.cos(math.radians(lat0))
    west, south, east, north = config["displayBounds"]
    spacing = 5
    x0 = math.floor(((west - lon0) * sx - 90) / spacing) * spacing
    z0 = math.floor(((lat0 - north) * 111320 - 90) / spacing) * spacing
    columns = math.ceil(((east - lon0) * sx + 90 - x0) / spacing) + 1
    rows = math.ceil(((lat0 - south) * 111320 + 90 - z0) / spacing) + 1
    # Pixel centers are grid nodes; rows run north -> south (increasing local Z).
    transform = Affine(spacing / sx, 0, lon0 + (x0 - spacing / 2) / sx,
                       0, -spacing / 111320, lat0 - (z0 - spacing / 2) / 111320)
    values = np.full((rows, columns), np.nan, dtype=np.float32)
    with rasterio.open(path) as source:
        reproject(source=rasterio.band(source, 1), destination=values,
                  src_transform=source.transform, src_crs=source.crs,
                  src_nodata=source.nodata, dst_transform=transform,
                  dst_crs="EPSG:4326", dst_nodata=np.nan, resampling=Resampling.bilinear)
        crs = str(source.crs)
    if not np.isfinite(values).all():
        raise ValueError("DEM does not cover the whole campus and terrain margin")
    samples = np.rint(values * 10).astype(np.int32)
    gx, gz = -x0 / spacing, -z0 / spacing
    ix, iz = math.floor(gx), math.floor(gz)
    tx, tz = gx - ix, gz - iz
    reference = ((samples[iz, ix] * (1 - tx) + samples[iz, ix + 1] * tx) * (1 - tz)
                 + (samples[iz + 1, ix] * (1 - tx) + samples[iz + 1, ix + 1] * tx) * tz) / 10
    return {"schemaVersion": 1, "units": "meters", "spacing": spacing,
            "x0": x0, "z0": z0, "columns": columns, "rows": rows,
            "referenceElevation": float(reference), "sampleScale": 0.1,
            "source": SOURCE, "sourceTitle": "USGS 1 Meter 11 x42y373 CA_CaliforniaGaps_B23",
            "sourcePublishedAt": "2025-08-20", "retrievedAt": datetime.date.today().isoformat(),
            "sourceSha256": hashlib.file_digest(path.open("rb"), "sha256").hexdigest(),
            "sourceCrs": crs, "verticalDatum": "NAVD88", "attribution": "USGS 3DEP · Public domain",
            "samples": samples.flatten().tolist()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dem", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        data = json.loads(TARGET.read_text())
    elif args.dem:
        data = build(args.dem)
    else:
        parser.error("Choose --dem /path/to/USGS.tif or --check")
    print(json.dumps(validate(data), indent=2))
    if not args.check:
        TARGET.write_text(json.dumps(data, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
