import data from "../../public/data/campus.json";
import { campusOrigin, campusLocations } from "../locations";
export type Point = [number, number];
export type Polygon = Point[][];
export function project(p: number[]): Point {
  return [
    (p[0] - campusOrigin[0]) *
      111320 *
      Math.cos((campusOrigin[1] * Math.PI) / 180),
    (campusOrigin[1] - p[1]) * 111320,
  ];
}
export interface CampusFeature {
  id: string;
  name: string;
  polygons: Polygon[];
  anchor: Point;
  height: number;
  levels: number;
  district: string;
  locations: string[];
  profile: string | null;
  renderId: number;
}
const renderIds = new Map(campusLocations.map((l, i) => [l.id, i + 1]));
export const campusFeatures: CampusFeature[] = data.buildings.map((b) => ({
  ...b,
  anchor: project(b.anchor),
  polygons: b.polygons.map((polygon) =>
    polygon.map((ring) => ring.map(project)),
  ),
  renderId: renderIds.get(b.profile || "") || 0,
}));
export const campusPaths = data.paths.map((p) => ({
  ...p,
  points: p.points.map(project),
}));
export const campusSurfaces = data.surfaces.map((s) => ({
  ...s,
  polygons: s.polygons.map((p) => p.map((r) => r.map(project))),
}));
export function renderIdForLocation(id: string | null) {
  return (
    campusFeatures.find((f) => id && f.locations.includes(id))?.renderId ?? 0
  );
}
export function locationForHit(renderId: number, x: number, z: number) {
  const ids = new Set(
    campusFeatures
      .filter((f) => f.renderId === renderId)
      .flatMap((f) => f.locations),
  );
  return campusLocations
    .filter((l) => ids.has(l.id))
    .sort((a, b) => {
      const p = project(a.coordinate!),
        q = project(b.coordinate!);
      return Math.hypot(p[0] - x, p[1] - z) - Math.hypot(q[0] - x, q[1] - z);
    })[0];
}
