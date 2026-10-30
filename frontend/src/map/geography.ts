import data from "../../public/data/alp-neighborhood.json";
export const ORIGIN = data.metadata.origin;
export function localPoint(coordinate: number[]): [number, number] {
  return [
    (coordinate[0] - ORIGIN[0]) *
      111320 *
      Math.cos((ORIGIN[1] * Math.PI) / 180),
    (ORIGIN[1] - coordinate[1]) * 111320,
  ];
}
export interface MapFeature {
  id: string;
  code: string;
  name: string;
  footprint: [number, number][];
  anchor: [number, number];
  height: number;
  modelId: string;
  heightSource: string;
  source: string;
}
export const features: MapFeature[] = data.features
  .filter((f) => f.properties.kind === "building")
  .map((f) => {
    const points = (f.geometry.coordinates as number[][][])[0].map(localPoint);
    const ring = points.slice(0, -1);
    return {
      id: f.properties.id,
      code: f.properties.buildingCode!,
      name: f.properties.name,
      footprint: points,
      anchor: [
        ring.reduce((s, p) => s + p[0], 0) / ring.length,
        ring.reduce((s, p) => s + p[1], 0) / ring.length,
      ],
      height: f.properties.buildingCode === "alp" ? 14.4 : f.properties.height!,
      modelId:
        f.properties.buildingCode === "alp" ? "alp-authored-v1" : "context-v1",
      heightSource:
        f.properties.buildingCode === "alp"
          ? "Estimated from UCI two-/three-story description and LMN photographs"
          : f.properties.heightSource!,
      source: f.properties.source!,
    };
  });
export const paths = data.features
  .filter((f) => f.properties.kind === "path")
  .map((f) => ({
    points: (f.geometry.coordinates as number[][]).map(localPoint),
    width: Math.min(5, f.properties.width || 3),
    steps: f.properties.steps,
  }));
export const pointInPolygon = (
  x: number,
  z: number,
  ring: [number, number][],
) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
};
