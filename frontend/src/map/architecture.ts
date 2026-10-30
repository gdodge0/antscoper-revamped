import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { features, paths, pointInPolygon, type MapFeature } from "./geography";

// Original model geometry. Dimensions are meters, with Y up and Z south.
// ALP proportions: UCI building description + LMN exterior photographs;
// details are visual estimates, not construction/survey measurements.
export const palette = {
  wall: 0xe2dfd6,
  roof: 0xf5f1e8,
  glass: 0x68716f,
  trim: 0x777b77,
  lightTrim: 0xc0c1b8,
  paving: 0xeeeae3,
  ground: 0xdedfd9,
  foliage: 0xaeb4a5,
  bark: 0x939585,
  ink: 0x545b55,
};
type MaterialName = keyof typeof palette;
export class ModelBuilder {
  buckets = new Map<MaterialName, T.BufferGeometry[]>();
  add(
    geometry: T.BufferGeometry,
    material: MaterialName,
    x = 0,
    y = 0,
    z = 0,
    rotation = 0,
  ) {
    geometry.rotateY(rotation);
    geometry.translate(x, y, z);
    const bucket = this.buckets.get(material) || [];
    bucket.push(geometry);
    this.buckets.set(material, bucket);
  }
  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m: MaterialName,
    rotation = 0,
  ) {
    this.add(new T.BoxGeometry(w, h, d), m, x, y, z, rotation);
  }
  finish(code?: string) {
    const group = new T.Group();
    group.userData.code = code;
    for (const [name, geometries] of this.buckets) {
      const merged = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      const mesh = new T.Mesh(
        merged,
        new T.MeshLambertMaterial({ color: palette[name] }),
      );
      mesh.castShadow = name !== "paving";
      mesh.receiveShadow = true;
      mesh.userData.code = code;
      mesh.userData.selectionSurface = !!code && name !== "paving";
      group.add(mesh);
    }
    return group;
  }
}
function ellipse(
  b: ModelBuilder,
  rx: number,
  rz: number,
  height: number,
  x: number,
  y: number,
  z: number,
  m: MaterialName,
) {
  const g = new T.CylinderGeometry(1, 1, height, 64);
  g.scale(rx, 1, rz);
  b.add(g, m, x, y, z, 0.46);
}
export function alp() {
  const outer = new T.Group();
  outer.userData.code = "alp";
  const b = new ModelBuilder();
  // Three-story classroom wing, in its own surveyed geographic orientation.
  b.box(16, 13.8, 68, 0, 6.9, 0, "wall");
  b.box(17.4, 0.5, 69.4, 0, 14.05, 0, "roof");
  b.box(14.5, 0.35, 66, 0, 14.43, 0, "lightTrim");
  // Clerestories, parapets, and rooftop service elements.
  for (const x of [-8.35, 8.35]) b.box(0.22, 0.65, 69, x, 14.45, 0, "wall");
  for (const z of [-34.4, 34.4]) b.box(16.8, 0.65, 0.22, 0, 14.45, z, "wall");
  for (const z of [-16, 3, 17]) {
    b.box(3.7, 1.2, 5.6, 2, 14.8, z, "lightTrim");
    b.box(3.4, 0.15, 5.3, 2, 15.46, z, "trim");
  }
  // Glazing bays: individually divided glass, recessed against the concrete frame.
  for (let floor = 0; floor < 3; floor++) {
    const y = floor * 4.4 + 2.5;
    for (const side of [-1, 1]) {
      for (let z = -31.5; z < 33; z += 3.1) {
        b.box(0.12, 3.25, 2.75, side * 8.04, y, z, "glass");
        b.box(0.25, 3.4, 0.09, side * 8.16, y, z, "lightTrim");
        b.box(0.24, 0.08, 2.8, side * 8.17, y + 0.65, z, "lightTrim");
      }
      b.box(0.55, 0.32, 68.4, side * 8.15, floor * 4.4 + 0.45, 0, "lightTrim");
    }
    for (const z of [-34.05, 34.05]) {
      b.box(14, 3.3, 0.12, 0, y, z, "glass");
      for (let x = -7; x <= 7; x += 2.3)
        b.box(0.12, 3.5, 0.3, x, y, z, "lightTrim");
      for (let yy = y - 1.3; yy < y + 1.8; yy += 0.72)
        b.box(16, 0.12, 0.8, 0, yy, z + 0.3, "lightTrim");
    }
  }
  // West-facing outdoor galleries, slender columns, railings, and stair flights.
  for (const level of [4.5, 8.9]) {
    b.box(3.1, 0.25, 60, -9.3, level, 0, "roof");
    for (const y of [level + 0.35, level + 1.1])
      b.box(0.08, 0.08, 59, -10.8, y, 0, "trim");
    for (let z = -29; z <= 29; z += 1.6)
      b.box(0.07, 1.1, 0.07, -10.8, level + 0.55, z, "trim");
  }
  b.box(4.2, 0.3, 69, -9.3, 13.7, 0, "roof");
  for (let z = -32; z <= 32; z += 8)
    b.box(0.24, 13.8, 0.24, -10.9, 6.9, z, "trim");
  for (let floor = 0; floor < 2; floor++) {
    const base = floor * 4.4;
    for (let step = 0; step < 22; step++) {
      const z = (floor === 0 ? step : 21 - step) * 0.39 - 12;
      b.box(2.5, 0.18, 0.42, -12.7, base + step * 0.2 + 0.15, z, "lightTrim");
      if (step % 2 === 0)
        b.box(0.06, 1, 0.06, -14, base + step * 0.2 + 0.7, z, "trim");
    }
    b.box(5, 0.2, 2.5, -12, base + 4.4, -3.2, "roof");
  }
  const wing = b.finish("alp");
  wing.rotation.y = 0.46;
  wing.position.set(5, 0, -1);
  outer.add(wing);
  const p = new ModelBuilder();
  ellipse(p, 16.2, 19, 10.8, -27, 5.4, 15, "wall");
  ellipse(p, 17.4, 20.2, 0.3, -27, 10.95, 15, "roof");
  ellipse(p, 12.6, 14.7, 2.2, -27, 12.2, 15, "wall");
  ellipse(p, 12.9, 15, 0.25, -27, 13.42, 15, "roof");
  ellipse(p, 17.5, 20.4, 0.24, -27, 6.05, 15, "lightTrim");
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2,
      c = Math.cos(0.46),
      s = Math.sin(0.46);
    const x = -27 + 17.3 * Math.cos(a) * c + 20 * Math.sin(a) * s,
      z = 15 - 17.3 * Math.cos(a) * s + 20 * Math.sin(a) * c;
    p.box(0.2, 10.8, 0.2, x, 5.4, z, "trim");
    if (i % 2 === 0) {
      const wx = -27 + 16.3 * Math.cos(a) * c + 19.1 * Math.sin(a) * s,
        wz = 15 - 16.3 * Math.cos(a) * s + 19.1 * Math.sin(a) * c;
      p.box(0.95, 2.8, 0.14, wx, 8, wz, "trim", Math.PI / 2 - a + 0.46);
      p.box(0.7, 2.5, 0.2, wx, 8, wz, "glass", Math.PI / 2 - a + 0.46);
    }
  }
  // Pavilion entry and sheltered connection to the classroom wing.
  p.box(12, 4.5, 8, -9, 2.25, 9, "glass", 0.46);
  p.box(13, 0.3, 9, -9, 4.65, 9, "roof", 0.46);
  for (const x of [-14, -7]) p.box(0.22, 4.7, 0.22, x, 2.35, 13, "trim");
  p.box(17, 0.16, 12, -12, 0.1, 31, "paving", 0.46);
  // Doors and benches at the outdoor gathering area.
  p.box(3.2, 3.4, 0.2, -24, 1.7, 34.2, "glass");
  p.box(0.1, 3.5, 0.3, -24, 1.75, 34.3, "lightTrim");
  const furniture = new ModelBuilder();
  for (const x of [-42, -34, -15]) {
    furniture.box(4, 0.25, 1.1, x, 0.65, 39, "lightTrim");
    for (const dx of [-1.5, 1.5])
      furniture.box(0.2, 0.6, 0.7, x + dx, 0.3, 39, "trim");
  }
  outer.add(p.finish("alp"), furniture.finish());
  return outer;
}
function footprintGeometry(points: [number, number][], height: number) {
  const shape = new T.Shape(points.map(([x, z]) => new T.Vector2(x, -z)));
  const g = new T.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}
function contextBuilding(f: MapFeature) {
  const b = new ModelBuilder(),
    points = f.footprint;
  b.add(footprintGeometry(points, f.height), "wall");
  b.add(footprintGeometry(points, 0.28), "roof", 0, f.height, 0);
  // Facade rhythm follows every actual footprint edge, including curved HG/HIB wings.
  for (let i = 0; i < points.length - 1; i++) {
    const [x, z] = points[i],
      [xx, zz] = points[i + 1],
      length = Math.hypot(xx - x, zz - z);
    if (length < 4) continue;
    const angle = -Math.atan2(zz - z, xx - x);
    const floors = Math.max(1, Math.round(f.height / 4));
    for (let floor = 0; floor < floors; floor++) {
      for (let d = 2; d < length - 1; d += 3.5) {
        b.box(
          2.3,
          Math.min(2.4, f.height / floors - 1),
          0.16,
          x + ((xx - x) * d) / length,
          ((floor + 0.5) * f.height) / floors,
          z + ((zz - z) * d) / length,
          "glass",
          angle,
        );
      }
    }
    b.box(
      length,
      0.2,
      0.35,
      (x + xx) / 2,
      f.height + 0.4,
      (z + zz) / 2,
      "lightTrim",
      angle,
    );
  }
  return b.finish(f.code);
}
export function createArchitecture() {
  const group = new T.Group();
  features.forEach((f) =>
    group.add(f.code === "alp" ? alp() : contextBuilding(f)),
  );
  return group;
}
export function createLandscape() {
  const b = new ModelBuilder();
  b.box(340, 0.5, 340, 20, -0.35, -25, "ground");
  // Ground-plane plaza under ALP's galleries and outdoor mixing spaces.
  b.box(68, 0.05, 100, -6, -0.025, 8, "paving", 0.46);
  for (const path of paths)
    for (let i = 1; i < path.points.length; i++) {
      const [x, z] = path.points[i - 1],
        [xx, zz] = path.points[i];
      if (
        Math.max(
          Math.abs(x - 20),
          Math.abs(z + 25),
          Math.abs(xx - 20),
          Math.abs(zz + 25),
        ) > 170
      )
        continue;
      const len = Math.hypot(xx - x, zz - z);
      if (len < 0.1) continue;
      b.box(
        len,
        0.06,
        path.width,
        (x + xx) / 2,
        0.015,
        (z + zz) / 2,
        "paving",
        -Math.atan2(zz - z, xx - x),
      );
    }
  // Deliberately sparse, repeatable landscape treatment; positions are illustrative.
  let seed = 605;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const trees: [number, number, number][] = [];
  const pathDistance = (x: number, z: number) =>
    paths.some((p) =>
      p.points.some((a, i) => {
        if (!i) return false;
        const v = p.points[i - 1],
          dx = a[0] - v[0],
          dz = a[1] - v[1];
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - v[0]) * dx + (z - v[1]) * dz) / (dx * dx + dz * dz || 1),
          ),
        );
        return (
          Math.hypot(x - v[0] - t * dx, z - v[1] - t * dz) < p.width / 2 + 3
        );
      }),
    );
  for (let i = 0; i < 230; i++) {
    const x = -100 + random() * 240,
      z = -165 + random() * 280;
    if (
      features.some((f) => pointInPolygon(x, z, f.footprint)) ||
      Math.hypot(x + 8, z - 5) < 52 ||
      pathDistance(x, z)
    )
      continue;
    if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 9)) continue;
    trees.push([x, z, 3 + random() * 2]);
  }
  const ground = b.finish();
  const leaves = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    new T.MeshLambertMaterial({ color: palette.foliage }),
    trees.length,
  );
  const trunks = new T.InstancedMesh(
    new T.CylinderGeometry(0.16, 0.25, 3, 6),
    new T.MeshLambertMaterial({ color: palette.bark }),
    trees.length,
  );
  const dummy = new T.Object3D();
  trees.forEach(([x, z, r], i) => {
    dummy.position.set(x, r + 2, z);
    dummy.scale.set(r, r * 0.95, r);
    dummy.rotation.y = i;
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 1.5, z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  ground.add(leaves, trunks);
  return ground;
}
