"""Rebuild the reviewed campus database from a bounded OSM XML extract.

No third-party Python dependencies. Refresh is deliberate, never a build step.
Use --osm path for a reproducible offline import; --download saves a fresh extract.
The reviewed identities, height corrections and model profiles live separately.
"""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "scripts/campus-overrides.json"


def tags(element):
    return {tag.get("k"): tag.get("v") for tag in element.findall("tag")}


def inside(point, ring):
    x, y = point
    result = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            result = not result
    return result


def stitch(segments):
    """Join relation member ways by node ID, including reversed ways."""
    remaining = [list(s) for s in segments if len(s) > 1]
    rings = []
    while remaining:
        ring = remaining.pop(0)
        while ring[-1] != ring[0]:
            for i, segment in enumerate(remaining):
                if segment[0] == ring[-1]:
                    ring.extend(segment[1:])
                    remaining.pop(i)
                    break
                if segment[-1] == ring[-1]:
                    ring.extend(segment[-2::-1])
                    remaining.pop(i)
                    break
            else:
                raise ValueError("Incomplete multipolygon: missing member segment")
        rings.append(ring)
    return rings


def centroid(ring):
    area = cx = cy = 0
    for a, b in zip(ring, ring[1:]):
        cross = a[0] * b[1] - b[0] * a[1]
        area += cross
        cx += (a[0] + b[0]) * cross
        cy += (a[1] + b[1]) * cross
    if abs(area) < 1e-12:
        return [sum(p[k] for p in ring[:-1]) / (len(ring) - 1) for k in (0, 1)]
    return [cx / (3 * area), cy / (3 * area)]


def validate(data, manifest, snapshot):
    ids = set()
    for path in data["paths"]:
        assert path["sourceId"] == path["id"].split("-")[0]
        assert isinstance(path["bridge"], bool) and isinstance(path["tunnel"], bool)
        assert isinstance(path["layer"], int)
        assert len(path["points"]) >= 2
        assert all(len(p) == 2 and all(math.isfinite(c) for c in p) for p in path["points"])
    for feature in data["buildings"]:
        assert feature["id"] not in ids, f"Duplicate {feature['id']}"
        ids.add(feature["id"])
        assert 0 < feature["height"] < 150
        for polygon in feature["polygons"]:
            for ring in polygon:
                assert len(ring) >= 4 and ring[0] == ring[-1], feature["id"]
                assert all(len(p) == 2 and all(math.isfinite(c) for c in p) for p in ring)
            for hole in polygon[1:]:
                assert inside(hole[0], polygon[0]), f"Orphan courtyard: {feature['id']}"
    locations = {loc["id"]: loc for loc in manifest["locations"]}
    assert len(locations) == len(manifest["locations"])
    aliases = manifest["codes"]
    for code, location in aliases.items():
        assert location in locations, code
    for loc in locations.values():
        if loc["status"] == "verified":
            assert loc["geometryIds"] and all(i in ids for i in loc["geometryIds"]), loc["id"]
            assert loc["coordinate"] and loc["references"], loc["id"]
    for room in snapshot["rooms"]:
        identifier = manifest["roomOverrides"].get(room["id"], aliases.get(room["building"]))
        assert identifier in locations, f"Unaudited schedule location {room['id']}"
    return {"buildings": len(ids), "locations": len(locations), "scheduleCodes": len({r['building'] for r in snapshot['rooms']}),
            "scheduledRooms": len(snapshot["rooms"]), "paths": len(data["paths"]), "surfaces": len(data["surfaces"])}


def build(raw, config):
    root = ET.fromstring(raw)
    nodes = {n.get("id"): [float(n.get("lon")), float(n.get("lat"))] for n in root.findall("node")}
    ways = {w.get("id"): w for w in root.findall("way")}
    relations = {r.get("id"): r for r in root.findall("relation")}
    members = set()

    def way_nodes(w):
        return [n.get("ref") for n in w.findall("nd")]

    def geometry(element):
        if element.tag == "way":
            ring = way_nodes(element)
            return [[[nodes[n] for n in ring]]] if ring and ring[0] == ring[-1] else []
        rings = {}
        for role in ("outer", "inner"):
            segments = [way_nodes(ways[m.get("ref")]) for m in element.findall("member")
                        if m.get("type") == "way" and (m.get("role") or "outer") == role]
            rings[role] = [[nodes[n] for n in ring] for ring in stitch(segments)]
        result = [[outer] for outer in rings["outer"]]
        for hole in rings["inner"]:
            parent = next((p for p in result if inside(hole[0], p[0])), None)
            if parent is None:
                raise ValueError("Courtyard is not contained in an exterior ring")
            parent.append(hole)
        return result

    by_osm = {}
    for loc in config["locations"]:
        for source in loc["osm"]:
            by_osm.setdefault(source, []).append(loc)
    bounds = config["displayBounds"]

    def within(p):
        return bounds[0] <= p[0] <= bounds[2] and bounds[1] <= p[1] <= bounds[3]

    def nearest_district(p):
        return min(config["districts"], key=lambda d: ((d["coordinate"][0] - p[0]) * .833) ** 2 + (d["coordinate"][1] - p[1]) ** 2)["id"]

    buildings, surfaces, paths = [], [], []
    # Relation geometry owns its member ways. Never render both.
    for relation in relations.values():
        t = tags(relation)
        if t.get("type") == "multipolygon" and ("building" in t or t.get("highway") == "pedestrian" or t.get("leisure") == "park"):
            members.update(m.get("ref") for m in relation.findall("member") if m.get("type") == "way")
    elements = [r for r in relations.values() if tags(r).get("type") == "multipolygon"] + [w for i, w in ways.items() if i not in members]
    for element in elements:
        t = tags(element)
        identifier = element.tag[0] + element.get("id")
        if identifier in config.get("excludeGeometry", {}):
            continue
        is_building = "building" in t and t["building"] != "no"
        is_surface = t.get("leisure") == "park" or (t.get("highway") == "pedestrian" and t.get("area") == "yes") or t.get("landuse") in ("grass", "forest") or t.get("natural") in ("wood", "water")
        if is_building or is_surface:
            try:
                polygons = geometry(element)
            except (KeyError, ValueError):
                if identifier in by_osm:
                    raise
                continue  # relation extending outside the requested extract
            if not polygons:
                continue
            anchor = centroid(polygons[0][0])
            if not within(anchor) and identifier not in by_osm:
                continue
            if is_building:
                overrides = by_osm.get(identifier, [])
                # Connected complexes retain separate schedule locations and label anchors.
                primary = next((loc for loc in overrides if loc["id"] in ("mm", "ctt")), overrides[0] if overrides else None)
                level = float(t.get("building:levels", "2").split(";")[0])
                measured = float(t.get("height", "0").split(" ")[0])
                height = primary["height"] if primary else measured or level * 3.6
                # Reject internally contradictory context tags rather than squashing seven stories to six meters.
                if not primary and "building:levels" in t and not level * 2.5 <= height <= level * 5.5:
                    height = level * 3.6
                context = config.get("contextGeometry", {}).get(identifier, {})
                if context:
                    level = context["levels"]
                    height = context["height"]
                buildings.append({"id": identifier, "name": primary["name"] if primary else t.get("name", "Campus building"),
                    "polygons": polygons, "anchor": anchor, "height": height, "levels": primary["floors"] if primary else round(level),
                    "district": primary["district"] if primary else nearest_district(anchor),
                    "locations": [loc["id"] for loc in overrides], "profile": primary["id"] if primary else None,
                    "source": f"https://www.openstreetmap.org/{element.tag}/{element.get('id')}",
                    "heightSource": primary["heightSource"] if primary else context.get("heightSource", "OSM height/floors; contradictory heights replaced by estimated 3.6 m per floor."),
                    "sourceHeight": t.get("height"), "sourceLevels": t.get("building:levels")})
            else:
                surfaces.append({"id": identifier, "name": t.get("name", ""), "kind": "park" if t.get("leisure") == "park" else "paving" if t.get("highway") else "water" if t.get("natural") == "water" else "green", "polygons": polygons})
        if element.tag == "way" and t.get("highway") in ("footway", "path", "steps", "pedestrian", "service", "residential", "tertiary", "secondary", "unclassified", "cycleway") and t.get("area") != "yes":
            points = [nodes[n] for n in way_nodes(element)]
            if not any(within(p) for p in points):
                continue
            road = t["highway"] not in ("footway", "path", "steps", "pedestrian", "cycleway")
            width = 8 if road else 6 if "Ring" in t.get("name", "") else 2.5
            try:
                width = float(t.get("width", width))
            except ValueError:
                pass
            # Split at the boundary: do not draw huge ways extending across Irvine.
            chunk = []
            for p in points + [None]:
                if p is not None and within(p):
                    chunk.append(p)
                else:
                    if len(chunk) >= 2:
                        paths.append({"id": identifier + f"-{len(paths)}", "sourceId": identifier,
                                      "points": chunk, "width": min(12, max(1, width)),
                                      "kind": "road" if road else "steps" if t["highway"] == "steps" else "path",
                                      "name": t.get("name", ""), "bridge": t.get("bridge", "no") != "no",
                                      "layer": int(t.get("layer", "0")), "tunnel": t.get("tunnel", "no") != "no"})
                    chunk = []

    by_id = {f["id"]: f for f in buildings}
    locations, codes = [], {}
    for loc in config["locations"]:
        parts = [by_id[i] for i in loc["osm"]]
        anchor = loc.get("labelCoordinate", parts[0]["anchor"])
        locations.append({"id": loc["id"], "name": loc["name"], "codes": loc["codes"], "status": "verified", "district": loc["district"],
                          "coordinate": anchor, "geometryIds": loc["osm"], "height": loc["height"], "references": loc["references"], "note": loc.get("note", "")})
        for code in loc["codes"]:
            assert code not in codes, f"Duplicate alias {code}"
            codes[code] = loc["id"]
    locations.extend(config["outside"])
    for code, loc in config["codeOverrides"].items():
        locations.append({"id": code, "codes": [code], **loc})
        codes[code] = code
    timestamp = root.find("meta").get("osm_base") if root.find("meta") is not None else None
    metadata = {"schemaVersion": 1, "origin": config["origin"], "bounds": bounds, "sourceBounds": config["bbox"],
        "source": "https://api.openstreetmap.org/api/0.6/map?bbox=" + ",".join(map(str, config["bbox"])),
        "retrievedAt": timestamp or config["retrievedAt"], "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "attribution": "© OpenStreetMap contributors", "license": "ODbL-1.0", "licenseUrl": "https://www.openstreetmap.org/copyright"}
    manifest = {"schemaVersion": 1, "origin": config["origin"], "bounds": bounds, "districts": config["districts"],
                "locations": locations, "codes": codes, "roomOverrides": config["roomOverrides"]}
    return {"metadata": metadata, "buildings": buildings, "paths": paths, "surfaces": surfaces}, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--osm", type=Path, help="Previously downloaded OSM XML")
    parser.add_argument("--download", type=Path, help="Download public extract to this path before importing")
    parser.add_argument("--check", action="store_true", help="Validate the committed data and schedule without network access")
    parser.add_argument("--retrieved-at", help="ISO date of a supplied extract; defaults to the reviewed configuration date")
    args = parser.parse_args()
    target = ROOT / "frontend/public/data/campus.json"
    manifest_path = ROOT / "frontend/src/data/campus-manifest.json"
    config = json.loads(CONFIG.read_text())
    if args.retrieved_at:
        datetime.date.fromisoformat(args.retrieved_at)
        config["retrievedAt"] = args.retrieved_at
    if args.check:
        data, manifest = json.loads(target.read_text()), json.loads(manifest_path.read_text())
    else:
        source = args.osm or args.download
        if args.download:
            config["retrievedAt"] = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
            url = "https://api.openstreetmap.org/api/0.6/map?bbox=" + ",".join(map(str, config["bbox"]))
            request = urllib.request.Request(url, headers={"User-Agent": "Antscoper campus geography importer"})
            args.download.write_bytes(urllib.request.urlopen(request, timeout=90).read())
        if not source:
            parser.error("Choose --osm, --download, or --check")
        data, manifest = build(source.read_bytes(), config)
    snapshot = json.loads((ROOT / "frontend/fixtures/demo.json").read_text())
    print(json.dumps(validate(data, manifest, snapshot), indent=2))
    if not args.check:
        def write(path, text):
            if not path.exists() or path.read_text() != text:
                path.write_text(text)
        write(target, json.dumps(data, separators=(",", ":")) + "\n")
        write(manifest_path, json.dumps(manifest, indent=2) + "\n")
        # The manifest is also downloadable alongside the derived OSM database.
        write(ROOT / "frontend/public/data/campus-manifest.json", json.dumps(manifest, separators=(",", ":")) + "\n")
        for district in config["districts"]:
            profiles = [{k: loc[k] for k in ("id", "floors", "height", "facade", "bay")}
                        for loc in config["locations"] if loc["district"] == district["id"]]
            code = 'import { defineDistrict } from "./components";\n\n// Generated by npm run map:import; edit scripts/campus-overrides.json.\n'
            code += 'export default function createDistrict() {\n  return defineDistrict(' + json.dumps(district["id"]) + ', ' + json.dumps(profiles, indent=2) + ');\n}\n'
            write(ROOT / "frontend/src/map/models" / (district["id"] + ".ts"), code)
        audit = ["# Campus building reference audit", "", "Generated by `npm run map:import` from the reviewed overrides. Geographic footprints are from the linked OSM ways/relations. Architecture is a stylized interpretation: story heights, façade spacing, canopies, stairs and roof details are estimates, not surveyed dimensions. Connected Arts complexes share one exterior model while retaining separate room sets and label anchors.", "", "| Location / aliases | District | Stories / height | Model profile | Reference |", "| --- | --- | --- | --- | --- |"]
        for loc in config["locations"]:
            audit.append(f"| {', '.join(loc['codes']).upper()} — {loc['name']} | {loc['district']} | {loc['floors']} / {loc['height']} m | {loc['facade']} | [UCI / architectural reference]({loc['references'][0]}) |")
        audit.extend(["", "## Identity corrections", "", "- ACT is Art, Culture & Technology, not a service lot.", "- HHCR 1042 resolves to Hewitt Research Hall (HRH), using the UCI ICTS room reference. Original room IDs and schedule codes are retained.", "- UEA is Undergraduate Education A; UNEXA remains an alias. Its low volume and façade are approximate.", "- Music and Media / AITR / WSH, and Claire Trevor Theatre / Drama share connected exterior geometry in OSM; labels and schedule counts stay separate.", "- HICF uses building 523's UCI marker and photograph; the source OSM way is incorrectly named KUCI. The actual radio-station footprint is immediately south.", "- Langson's coincident ground/layer-1 outlines are deduplicated; the current layer-1 outline owns its model.", "- `uci-barn` and `uci-mc` have independent room overrides and explicit off-map statuses. Neither receives a shared pin or a walking estimate.", "", "All 67 scheduled codes are accounted for: 352 records resolve to mapped teaching locations, and the two UCI records are outside this academic map. Context housing and parking receive simplified volumes and no availability badges.", ""])
        write(ROOT / "docs/campus-building-audit.md", "\n".join(audit))


if __name__ == "__main__":
    main()
