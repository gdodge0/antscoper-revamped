import { campusPaths, campusFeatures, type Point } from "./campusGeography";
import { bridgeProfiles } from "./bridgeProfiles";
import { siteBuildingBase } from "./buildingPlacement";

export function distanceToRoad(x: number, z: number, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
function crossing(a: Point, b: Point, c: Point, d: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    ex = d[0] - c[0],
    ez = d[1] - c[1];
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-8) return null;
  const t = ((c[0] - a[0]) * ez - (c[1] - a[1]) * ex) / den;
  const u = ((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / den;
  return t > 0.001 && t < 0.999 && u >= 0 && u <= 1 ? t : null;
}
export function createBridgeAlignments(
  elevation: (x: number, z: number) => number,
) {
  const roads = campusPaths.filter((p) => p.kind === "road" && !p.bridge);
  return Object.entries(bridgeProfiles).map(([id, profile]) => {
    const path = campusPaths.find((p) => p.sourceId === id)!;
    if (!path || (!path.bridge && !profile.underpass))
      throw new Error(`Missing reviewed bridge ${id}`);
    const distances = [0];
    for (let i = 1; i < path.points.length; i++)
      distances.push(
        distances[i - 1] +
          Math.hypot(
            path.points[i][0] - path.points[i - 1][0],
            path.points[i][1] - path.points[i - 1][1],
          ),
      );
    const length = distances.at(-1)!;
    function pointAt(distance: number): Point {
      const s = Math.max(0, Math.min(length, distance));
      let i = distances.findIndex((v, j) => j > 0 && v >= s);
      if (i < 1) i = distances.length - 1;
      const a = path.points[i - 1],
        b = path.points[i],
        t = (s - distances[i - 1]) / (distances[i] - distances[i - 1]);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    const a = elevation(...pointAt(0)),
      b = elevation(...pointAt(length));
    const level =
      profile.levelDeck ||
      profile.style === "arts" ||
      profile.style === "truss";
    const building = profile.attachment
      ? campusFeatures.find((f) => f.id === profile.attachment!.buildingId)!
      : null;
    const attachmentBase = building
      ? siteBuildingBase(building, elevation)
      : null;
    const attachmentHeight = building
      ? attachmentBase! +
        ((profile.attachment!.floor - 1) * building.height) / building.levels
      : null;
    let start = attachmentHeight ?? (level ? Math.max(a, b) : a) + 0.08;
    let end = attachmentHeight ?? (level ? Math.max(a, b) : b) + 0.08;
    const deckAt = (s: number) =>
      start + (end - start) * Math.max(0, Math.min(1, s / length));
    const thickness = 0.32;
    const crossings: {
      point: Point;
      station: number;
      tangent: Point;
      width: number;
      slope: number;
      bed: number;
    }[] = [];
    const crossedWays = profile.underpass
      ? campusPaths.filter((p) => p.sourceId === profile.underpass)
      : roads;
    const nearRoads = crossedWays.filter((r) => {
      let intersects = false;
      for (let i = 1; i < r.points.length; i++)
        for (let j = 1; j < path.points.length; j++) {
          const t = crossing(
            path.points[j - 1],
            path.points[j],
            r.points[i - 1],
            r.points[i],
          );
          if (t === null) continue;
          intersects = true;
          const station =
            distances[j - 1] + t * (distances[j] - distances[j - 1]);
          const point = pointAt(station),
            ra = r.points[i - 1],
            rb = r.points[i];
          const distance = Math.hypot(rb[0] - ra[0], rb[1] - ra[1]);
          const tangent: Point = [
            (rb[0] - ra[0]) / distance,
            (rb[1] - ra[1]) / distance,
          ];
          const slope = Math.max(
            -0.06,
            Math.min(
              0.06,
              (elevation(
                point[0] + tangent[0] * 25,
                point[1] + tangent[1] * 25,
              ) -
                elevation(
                  point[0] - tangent[0] * 25,
                  point[1] - tangent[1] * 25,
                )) /
                50,
            ),
          );
          crossings.push({
            point,
            station,
            tangent,
            width: r.width,
            slope,
            bed: deckAt(station) - thickness - profile.clearance - 0.65,
          });
        }
      return intersects;
    });
    if (profile.deckRise !== undefined) {
      let required = Math.max(start, a + 0.08);
      for (let station = 0; station <= length; station += 0.5) {
        const p = pointAt(station),
          before = pointAt(station - 0.1),
          after = pointAt(station + 0.1);
        const angle = Math.atan2(after[1] - before[1], after[0] - before[0]);
        for (const side of [-1, 0, 1]) {
          const x = p[0] - ((Math.sin(angle) * profile.width) / 2) * side,
            z = p[1] + ((Math.cos(angle) * profile.width) / 2) * side;
          if (
            nearRoads.some((r) =>
              r.points.some(
                (v, i) =>
                  i > 0 &&
                  distanceToRoad(x, z, r.points[i - 1], v) <= r.width / 2 + 3,
              ),
            )
          )
            required = Math.max(
              required,
              elevation(x, z) +
                profile.clearance +
                thickness +
                0.35 -
                (profile.deckRise * station) / length,
            );
        }
      }
      start = required;
      end = start + profile.deckRise;
    }
    const roadAt = (x: number, z: number, margin = 0) =>
      nearRoads.some((r) =>
        r.points.some(
          (p, i) =>
            i > 0 &&
            distanceToRoad(x, z, r.points[i - 1], p) <= r.width / 2 + margin,
        ),
      );
    const samples = [
      ...new Set([
        0,
        ...distances,
        ...Array.from(
          {
            length: profile.style === "concrete" ? 0 : Math.ceil(length / 2),
          },
          (_, i) => Math.min(length, (i + 1) * 2),
        ),
        length,
      ]),
    ].sort((a, b) => a - b);
    return {
      id,
      ...profile,
      path,
      length,
      thickness,
      level,
      pointAt,
      deckAt,
      roadAt,
      nearRoads,
      crossings,
      samples,
      attachmentBase,
    };
  });
}
