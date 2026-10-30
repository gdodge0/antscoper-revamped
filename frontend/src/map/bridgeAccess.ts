import * as T from "three";
import { campusPaths, campusSurfaces, type Point } from "./campusGeography";
import { groundHeightAt } from "./terrain";
import type { CampusBridge } from "./bridges";

export function studentCenterTerrace(bridge: CampusBridge) {
  const outline = campusSurfaces.find((s) => s.id === "w1213661221")!
    .polygons[0][0];
  return outline
    .slice(0, -1)
    .map(([x, z]) => new T.Vector3(x, bridge.deckAt(bridge.length), z));
}
function descendingPath(points: Point[], top: number, bottom: number) {
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ),
    );
  return points.map(
    ([x, z], i) =>
      new T.Vector3(
        x,
        top + ((bottom - top) * distances[i]) / distances.at(-1)!,
        z,
      ),
  );
}
export function studentCenterAccess(bridge: CampusBridge) {
  const outline = studentCenterTerrace(bridge);
  // The exposed edge runs from the bridge, around the broad terrace, to the
  // south wing. The remaining outline is against the Student Center facade.
  const edge = [...outline.slice(9), outline[0]];
  const path = [
    ...campusPaths.find((p) => p.sourceId === "w1213661222")!.points,
  ].reverse();
  const stairs = descendingPath(
    path,
    bridge.deckAt(bridge.length),
    groundHeightAt(...path.at(-1)!) + 0.08,
  );
  return { outline, edge, stairs, depth: 0.95, stairWidth: 9 };
}
export function parkingArtsLanding(bridge: CampusBridge) {
  const [x, z] = bridge.pointAt(bridge.length),
    y = bridge.deckAt(bridge.length);
  return [new T.Vector3(x, y, z), new T.Vector3(x + 9, y, z + 1)];
}
export function watsonAccess(bridge: CampusBridge) {
  const y = bridge.deckAt(bridge.length);
  const approach = [
    ...campusPaths.find((p) => p.sourceId === "w171194269")!.points,
  ].reverse();
  // The spiral itself is a separate OSM way without a bridge tag. Preserve
  // its actual location, changing radius, and connection to the ground path.
  const spiral = [
    ...campusPaths.find((p) => p.sourceId === "w171194224")!.points,
  ].reverse();
  const smoothSpiral = new T.CatmullRomCurve3(
    spiral.map(([x, z]) => new T.Vector3(x, 0, z)),
    false,
    "centripetal",
  )
    .getPoints((spiral.length - 1) * 2)
    .map((p): Point => [p.x, p.z]);
  const spiralDeck = descendingPath(
    smoothSpiral,
    y,
    groundHeightAt(...spiral.at(-1)!) + 0.08,
  );
  const ramp = [
    ...approach.slice(0, -1).map(([x, z]) => new T.Vector3(x, y, z)),
    ...spiralDeck,
  ];
  const stairs = ["w171194256", "w219169792"].map((id) => {
    const path = campusPaths.find((p) => p.sourceId === id)!;
    const points = [...path.points].reverse();
    const head = points[0];
    let station = 0,
      distance = Infinity;
    for (const s of bridge.samples) {
      const p = bridge.pointAt(s),
        d = Math.hypot(p[0] - head[0], p[1] - head[1]);
      if (d < distance) {
        distance = d;
        station = s;
      }
    }
    const flight = descendingPath(
      points,
      bridge.deckAt(station),
      groundHeightAt(...path.points[0]) + 0.08,
    );
    return {
      points: flight,
      top: flight[0],
      bottom: flight.at(-1)!,
      width: 3.6,
    };
  });
  // Exclude the straight sidewalk exit when measuring the open spiral core.
  const core = new T.Box2()
    .setFromPoints(spiral.slice(0, -2).map(([x, z]) => new T.Vector2(x, z)))
    .getCenter(new T.Vector2());
  const coreRadius =
    Math.min(
      ...smoothSpiral
        .slice(0, -4)
        .map(([x, z]) => Math.hypot(x - core.x, z - core.y)),
    ) - 2.1;
  return { ramp, spiral: spiralDeck, core, coreRadius, stairs };
}
export function exteriorBridgeAccess(bridge: CampusBridge) {
  if (!["w171169265", "w1196280279"].includes(bridge.id)) return [];
  return [0, bridge.length].map((station, end) => {
    const p = bridge.pointAt(station),
      next = bridge.pointAt(end ? station - 1 : 1);
    const dx = p[0] - next[0],
      dz = p[1] - next[1],
      tangentLength = Math.hypot(dx, dz);
    const direction = new T.Vector2(dx / tangentLength, dz / tangentLength);
    const y = bridge.deckAt(station),
      center = new T.Vector3(p[0], y, p[1]);
    const id =
      bridge.id === "w171169265"
        ? end
          ? "w171169279"
          : "w171169280"
        : end
          ? "w1196280910"
          : "w300631781";
    const path = [
      ...campusPaths.find(
        (q) =>
          q.sourceId === id &&
          q.points.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < 0.1),
      )!.points,
    ];
    if (Math.hypot(path[0][0] - p[0], path[0][1] - p[1]) > 0.1) path.reverse();
    if (id === "w1196280910")
      path.push(
        campusPaths.find((q) => q.sourceId === "w1196280911")!.points[1],
      );
    const distances = [0];
    for (let i = 1; i < path.length; i++)
      distances.push(
        distances[i - 1] +
          Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]),
      );
    const pointAt = (s: number): Point => {
      let i = distances.findIndex((d, j) => j > 0 && d >= s);
      if (i < 1) i = path.length - 1;
      const t = (s - distances[i - 1]) / (distances[i] - distances[i - 1]);
      return [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
      ];
    };
    const width = bridge.width + 3.5,
      length = 8;
    const q = pointAt(Math.min(6, distances.at(-1)!));
    const vector = new T.Vector2(q[0] - p[0], q[1] - p[1]).normalize();
    const along = vector.dot(direction),
      across = vector.dot(new T.Vector2(-direction.y, direction.x));
    const start = Math.min(
      length / 2 / Math.abs(along || 1e-9),
      width / 2 / Math.abs(across || 1e-9),
    );
    const finish = Math.min(18, distances.at(-1)!);
    const stations = [
      start,
      ...distances.filter((s) => s > start && s < finish),
      finish,
    ];
    const points = stations.map(pointAt),
      bottom = points.at(-1)!;
    const stairs = descendingPath(points, y, groundHeightAt(...bottom) + 0.08);
    const exitEdge =
      Math.abs(along) / length > Math.abs(across) / width
        ? 2
        : across > 0
          ? 1
          : 3;
    const corners = [
      [-1, -1],
      [-1, 1],
      [1, 1],
      [1, -1],
    ].map(([a, b]) =>
      center
        .clone()
        .add(
          new T.Vector3(
            ((direction.x * length) / 2) * a - ((direction.y * width) / 2) * b,
            0,
            ((direction.y * length) / 2) * a + ((direction.x * width) / 2) * b,
          ),
        ),
    );
    const barriers = corners.flatMap((p, i) =>
      i === 0 || i === exitEdge ? [] : [[p, corners[(i + 1) % 4]]],
    );
    return {
      center,
      direction,
      width,
      length,
      depth: 0.65,
      stairs,
      corners,
      barriers,
    };
  });
}
export function bridgeAccessBounds(bridge: CampusBridge) {
  if (bridge.id === "w624135494") {
    const { outline, stairs } = studentCenterAccess(bridge);
    return [...outline, ...stairs];
  }
  if (bridge.id === "w155705065") return parkingArtsLanding(bridge);
  if (bridge.id === "w171194239") {
    const { ramp, stairs } = watsonAccess(bridge);
    return [...ramp, ...stairs.flatMap((s) => s.points)];
  }
  return exteriorBridgeAccess(bridge).flatMap((p) => [
    ...p.corners,
    ...p.stairs,
  ]);
}
