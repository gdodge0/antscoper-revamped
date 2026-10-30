import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { palette } from "./architecture";
import {
  campusFeatures,
  campusPaths,
  campusSurfaces,
  project,
  type Polygon,
  type Point,
} from "./campusGeography";
import { campusBounds, districts } from "../locations";
import { pointInPolygon } from "./geography";

export const campusPalette = {
  ...palette,
  road: 0xd1d2cc,
  lawn: 0xcbd0bf,
  water: 0xb7c7c5,
};
export type Finish = keyof typeof campusPalette;
const finishColors = Object.fromEntries(
  Object.entries(campusPalette).map(([name, value]) => [
    name,
    new T.Color(value),
  ]),
) as Record<Finish, T.Color>;

// Every triangle retains its physical building ID, even inside a district batch.
// This attribute is shared by picking and the depth-tested silhouette shader.
export class CampusBuilder {
  buckets = new Map<string, T.BufferGeometry[]>();
  tile = "";
  add(geometry: T.BufferGeometry, finish: Finish, id = 0, matrix?: T.Matrix4) {
    let g = geometry;
    if (g.index) {
      g = g.toNonIndexed();
      geometry.dispose();
    }
    if (matrix) g.applyMatrix4(matrix);
    const count = g.getAttribute("position").count;
    g.setAttribute(
      "buildingId",
      new T.Float32BufferAttribute(new Float32Array(count).fill(id), 1),
    );
    const color = finishColors[finish],
      colors = new Float32Array(count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    if (!g.getAttribute("uv"))
      g.setAttribute(
        "uv",
        new T.Float32BufferAttribute(new Float32Array(count * 2), 2),
      );
    // Vertex colors preserve each finish while sharing two material batches per
    // cell: solid shadow casters and the thin glazing/trim/landscape surfaces.
    const key = `${finish === "wall" || finish === "roof" ? 1 : 0}:${this.tile}`;
    const bucket = this.buckets.get(key) || [];
    bucket.push(g);
    this.buckets.set(key, bucket);
  }
  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    finish: Finish,
    id = 0,
    rotation = 0,
  ) {
    const g = new T.BoxGeometry(w, h, d);
    g.rotateY(rotation);
    g.translate(x, y, z);
    this.add(g, finish, id);
  }
  finish() {
    const group = new T.Group();
    for (const [key, geometries] of this.buckets) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (!geometry) throw new Error("Incompatible campus geometry attributes");
      geometry.computeBoundingSphere();
      const mesh = new T.Mesh(
        geometry,
        new T.MeshLambertMaterial({ vertexColors: true }),
      );
      // The building volumes cast the shadows; thin glazing and mullions only
      // receive them. Avoid a second render of every pane and tiny trim piece.
      mesh.castShadow = key.startsWith("1:");
      mesh.receiveShadow = true;
      mesh.userData.buildingBatch = true;
      group.add(mesh);
    }
    return group;
  }
}

export function polygonGeometry(polygon: Polygon, height: number, base = 0) {
  const shape = new T.Shape(polygon[0].map(([x, z]) => new T.Vector2(x, -z)));
  shape.holes = polygon
    .slice(1)
    .map((ring) => new T.Path(ring.map(([x, z]) => new T.Vector2(x, -z))));
  const geometry =
    height > 0
      ? new T.ExtrudeGeometry(shape, {
          depth: height,
          bevelEnabled: false,
          steps: 1,
          curveSegments: 1,
        })
      : new T.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, base, 0);
  return geometry;
}

export function createCampusOverview() {
  const groups = new Map<string, T.Group>();
  for (const district of districts) {
    const b = new CampusBuilder();
    for (const f of campusFeatures.filter((f) => f.district === district.id)) {
      b.tile = `${Math.floor(f.anchor[0] / 400)},${Math.floor(f.anchor[1] / 400)}`;
      for (const polygon of f.polygons) {
        b.add(polygonGeometry(polygon, f.height), "wall", f.renderId);
        b.add(polygonGeometry(polygon, 0, f.height + 0.25), "roof", f.renderId);
      }
    }
    const group = b.finish();
    group.name = `overview:${district.id}`;
    groups.set(district.id, group);
  }
  return groups;
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

export function createCampusLandscape() {
  const b = new CampusBuilder();
  const [left, south] = project([campusBounds[0], campusBounds[1]]),
    [right, north] = project([campusBounds[2], campusBounds[3]]);
  b.box(
    10000,
    0.5,
    10000,
    (right + left) / 2,
    -0.4,
    (south + north) / 2,
    "ground",
  );
  for (const s of campusSurfaces)
    for (const p of s.polygons)
      b.add(
        polygonGeometry(p, 0, s.kind === "paving" ? 0.06 : -0.08),
        s.kind === "paving" ? "paving" : s.kind === "water" ? "water" : "lawn",
      );
  for (const path of campusPaths)
    for (let i = 1; i < path.points.length; i++) {
      const [x, z] = path.points[i - 1],
        [xx, zz] = path.points[i],
        len = Math.hypot(xx - x, zz - z);
      if (len < 0.1) continue;
      const plane = new T.PlaneGeometry(len + 0.2, path.width);
      plane.rotateX(-Math.PI / 2);
      plane.rotateY(-Math.atan2(zz - z, xx - x));
      plane.translate(
        (x + xx) / 2,
        path.kind === "road" ? -0.01 : 0.12,
        (z + zz) / 2,
      );
      b.add(plane, path.kind === "road" ? "road" : "paving");
    }
  // Keep the approved ALP plaza and gathering space anchored to its model.
  b.box(68, 0.05, 100, -6, 0.02, 8, "paving", 0, 0.46);
  const group = b.finish();
  // Repeatable, illustrative planting inside mapped green areas, with paths and
  // footprint buffers excluded. Sparse enough that classroom volumes stay clear.
  let seed = 8321;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const green = campusSurfaces
    .filter((s) => s.kind === "park" || s.kind === "green")
    .flatMap((s) => s.polygons);
  const rings = campusFeatures.flatMap((f) => f.polygons.map((p) => p[0]));
  const trees: [number, number, number][] = [];
  for (let attempt = 0; attempt < 7500 && trees.length < 380; attempt++) {
    const x = left + random() * (right - left),
      z = north + random() * (south - north);
    if (
      !green.some(
        (p) =>
          pointInPolygon(x, z, p[0]) &&
          !p.slice(1).some((h) => pointInPolygon(x, z, h)),
      )
    )
      continue;
    if (
      rings.some(
        (r) =>
          pointInPolygon(x, z, r) ||
          r.some((p, i) => i > 0 && distanceToSegment([x, z], r[i - 1], p) < 5),
      )
    )
      continue;
    if (
      campusPaths.some((p) =>
        p.points.some(
          (v, i) =>
            i > 0 &&
            distanceToSegment([x, z], p.points[i - 1], v) < p.width / 2 + 3,
        ),
      )
    )
      continue;
    if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 12)) continue;
    trees.push([x, z, 3 + random() * 3]);
  }
  const leaves = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 0),
    new T.MeshLambertMaterial({ color: campusPalette.foliage }),
    trees.length,
  );
  const trunks = new T.InstancedMesh(
    new T.CylinderGeometry(0.22, 0.35, 3.5, 5),
    new T.MeshLambertMaterial({ color: campusPalette.bark }),
    trees.length,
  );
  const dummy = new T.Object3D();
  trees.forEach(([x, z, r], i) => {
    dummy.position.set(x, r + 2, z);
    dummy.scale.set(r, r, r);
    dummy.rotation.y = i;
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 1.75, z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  group.add(leaves, trunks);
  return group;
}

export function disposeGroup(group: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>();
  group.traverse((o) => {
    const mesh = o as T.Mesh;
    if ((o as T.InstancedMesh).isInstancedMesh)
      (o as T.InstancedMesh).dispose();
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material)
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(
        (m) => materials.add(m),
      );
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
