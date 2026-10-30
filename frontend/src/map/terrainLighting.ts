import { gradedHeightAt } from "./terrain";

export type ElevationSampler = (x: number, z: number) => number;
// Lighting follows the continuous elevation field, not the triangles used to
// approximate it. Differentiating the triangle mesh bakes its grid into shading.
export function terrainLightingAt(
  x: number,
  z: number,
  elevation: ElevationSampler = gradedHeightAt,
) {
  const center = elevation(x, z);
  const dx = (elevation(x - 5, z) - elevation(x + 5, z)) / 10;
  const dz = (elevation(x, z - 5) - elevation(x, z + 5)) / 10;
  const length = Math.hypot(dx, 1, dz);
  const normal: [number, number, number] = [
    dx / length,
    1 / length,
    dz / length,
  ];
  const light = normal[0] * -0.55 + normal[1] * 0.72 + normal[2] * -0.42;
  const hollow = Math.max(
    0,
    (elevation(x - 15, z) +
      elevation(x + 15, z) +
      elevation(x, z - 15) +
      elevation(x, z + 15)) /
      4 -
      center,
  );
  const shade = Math.max(
    0.65,
    Math.min(1, 0.91 + (light - 0.72) * 1.1 - Math.min(0.16, hollow * 0.025)),
  );
  return { normal, shade };
}
