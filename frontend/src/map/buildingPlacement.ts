import { campusFeatures, type CampusFeature } from "./campusGeography";
import { pointInPolygon } from "./geography";

export function measureFootprint(
  f: CampusFeature,
  sample: (x: number, z: number) => number,
) {
  const samples = [sample(...f.anchor)];
  for (const polygon of f.polygons) {
    const ring = polygon[0];
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i],
        count = Math.max(
          1,
          Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5),
        );
      for (let j = 0; j <= count; j++)
        samples.push(
          sample(
            a[0] + ((b[0] - a[0]) * j) / count,
            a[1] + ((b[1] - a[1]) * j) / count,
          ),
        );
    }
    const xs = ring.map((p) => p[0]),
      zs = ring.map((p) => p[1]);
    for (
      let x = Math.ceil(Math.min(...xs) / 5) * 5;
      x <= Math.max(...xs);
      x += 5
    )
      for (
        let z = Math.ceil(Math.min(...zs) / 5) * 5;
        z <= Math.max(...zs);
        z += 5
      )
        if (
          pointInPolygon(x, z, ring) &&
          !polygon.slice(1).some((h) => pointInPolygon(x, z, h))
        )
          samples.push(sample(x, z));
  }
  return { low: Math.min(...samples), base: Math.max(...samples) + 0.12 };
}
export function siteBuildingBase(
  f: CampusFeature,
  sample: (x: number, z: number) => number,
) {
  if (f.profile === "sc") {
    const sites = campusFeatures
      .filter((b) => b.profile === "sc")
      .map((b) => ({ ...measureFootprint(b, sample), height: b.height }));
    // Retain the shared lower-plaza datum at normal relief. Exaggerated relief
    // must also keep the hillside below the roof, without stretching buildings.
    return Math.max(
      Math.min(...sites.map((b) => b.low)) + 0.12,
      ...sites.map((b) => b.base - b.height + 0.5),
    );
  }
  return measureFootprint(f, sample).base;
}
