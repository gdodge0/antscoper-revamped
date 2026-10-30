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
import {
  modeledBridgeIds,
  modeledAccessPathIds,
  modeledAccessSurfaceIds,
} from "./bridgeProfiles";
import { pointInPolygon } from "./geography";
import { shadeTerrain } from "./terrainShading";
import { terrainLightingAt } from "./terrainLighting";
import {
  buildingElevation,
  groundHeightAt,
  terrainBounds,
  terrainCellDivisions,
  terrainVertex,
  gradedHeightAt,
} from "./terrain";

export const campusPalette = {
  ...palette,
  ground: 0xd6d9d0,
  foundation: palette.wall,
  road: 0xd1d2cc,
  lawn: 0xcbd0bf,
  water: 0xb7c7c5,
  bridgeSteel: palette.trim,
  bridgeBronze: palette.trim,
  bridgeRail: palette.trim,
  bridgeRailBronze: palette.trim,
  bridgeBrick: palette.wall,
  bridgeMortar: palette.lightTrim,
  bridgeDeck: palette.paving,
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
  elevation = 0;
  add(geometry: T.BufferGeometry, finish: Finish, id = 0, matrix?: T.Matrix4) {
    let g = geometry;
    if (g.index) {
      g = g.toNonIndexed();
      geometry.dispose();
    }
    if (matrix) g.applyMatrix4(matrix);
    if (this.elevation) g.translate(0, this.elevation, 0);
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
    const key = `${["wall", "roof", "bridgeSteel", "bridgeBronze", "bridgeBrick", "bridgeDeck"].includes(finish) ? 1 : 0}:${this.tile}`;
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

export function addFoundation(
  b: CampusBuilder,
  f: (typeof campusFeatures)[number],
) {
  const { base, low } = buildingElevation(f);
  // The building already supplies its cap and shadow silhouette. Only the
  // exposed retaining walls need additional faces below its level floor.
  const positions: number[] = [];
  for (const polygon of f.polygons)
    polygon.forEach((ring, ri) => {
      const area = ring
        .slice(1)
        .reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0);
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          c = ring[i];
        const corners = [
          [a[0], 0, a[1]],
          [c[0], 0, c[1]],
          [c[0], low - base - 0.25, c[1]],
          [a[0], low - base - 0.25, a[1]],
        ];
        if (area > 0 !== (ri === 0)) corners.reverse();
        positions.push(
          ...corners[0],
          ...corners[1],
          ...corners[2],
          ...corners[0],
          ...corners[2],
          ...corners[3],
        );
      }
    });
  if (positions.length)
    b.add(triangleGeometry(positions), "foundation", f.renderId);
}

export function createCampusOverview() {
  const groups = new Map<string, T.Group>();
  for (const district of districts) {
    const b = new CampusBuilder();
    for (const f of campusFeatures.filter((f) => f.district === district.id)) {
      b.tile = `${Math.floor(f.anchor[0] / 400)},${Math.floor(f.anchor[1] / 400)}`;
      b.elevation = buildingElevation(f).base;
      addFoundation(b, f);
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

function triangleGeometry(positions: number[]) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
function groundNormals(g: T.BufferGeometry, shaded: boolean) {
  const p = g.getAttribute("position"),
    normals = g.getAttribute("normal");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    const normal = shaded ? terrainLightingAt(x, z).normal : [0, 1, 0];
    normals.setXYZ(i, normal[0], normal[1], normal[2]);
  }
  normals.needsUpdate = true;
}
// Rasterize the existing geographic surfaces onto the height mesh. Their real
// boundaries are preserved without a second, overlapping mesh for every lawn,
// plaza and road. Everything is local; this is not a downloaded map texture.
function paintTerrain(group: T.Group, terrainShadows: boolean) {
  const { left, right, north, south } = terrainBounds;
  const canvas = document.createElement("canvas");
  const resolution = innerWidth < 1024 ? 2048 : 4096;
  canvas.width = canvas.height = resolution;
  const context = canvas.getContext("2d")!;
  const color = (finish: Finish) =>
    `#${campusPalette[finish].toString(16).padStart(6, "0")}`;
  context.fillStyle = color("ground");
  context.fillRect(0, 0, resolution, resolution);
  const xPixel = (x: number) => ((x - left) / (right - left)) * resolution;
  const zPixel = (z: number) => ((z - north) / (south - north)) * resolution;
  for (const surface of campusSurfaces) {
    if (modeledAccessSurfaceIds.has(surface.id)) continue;
    context.fillStyle = color(
      surface.kind === "paving"
        ? "paving"
        : surface.kind === "water"
          ? "water"
          : "lawn",
    );
    for (const polygon of surface.polygons) {
      context.beginPath();
      for (const ring of polygon) {
        ring.forEach(([x, z], i) =>
          i
            ? context.lineTo(xPixel(x), zPixel(z))
            : context.moveTo(xPixel(x), zPixel(z)),
        );
        context.closePath();
      }
      context.fill("evenodd");
    }
  }
  // Apply a uniform local-meter transform so stroke widths remain correct on
  // both axes of the rectangular campus extent.
  context.setTransform(
    resolution / (right - left),
    0,
    0,
    resolution / (south - north),
    (-left * resolution) / (right - left),
    (-north * resolution) / (south - north),
  );
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const kind of ["road", "path", "steps"])
    for (const path of campusPaths) {
      if (
        path.kind !== kind ||
        modeledBridgeIds.has(path.sourceId) ||
        modeledAccessPathIds.has(path.sourceId)
      )
        continue;
      context.strokeStyle = color(kind === "road" ? "road" : "paving");
      context.lineWidth = path.width;
      context.beginPath();
      path.points.forEach(([x, z], i) =>
        i ? context.lineTo(x, z) : context.moveTo(x, z),
      );
      context.stroke();
    }
  if (terrainShadows) shadeTerrain(context, resolution);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.strokeStyle = color("ground");
  context.lineWidth = 4;
  context.strokeRect(0, 0, resolution, resolution);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  const previousTextures = new Set<T.Texture>();
  for (const object of group.children.filter((o) => o.userData.terrain)) {
    const mesh = object as T.Mesh<T.BufferGeometry, T.MeshLambertMaterial>;
    if (mesh.material.map) previousTextures.add(mesh.material.map);
    if (!mesh.userData.terrainPainted) {
      const p = mesh.geometry.getAttribute("position"),
        colors = mesh.geometry.getAttribute("color"),
        uv: number[] = [];
      for (let i = 0; i < p.count; i++) {
        uv.push(
          (p.getX(i) - left) / (right - left),
          1 - (p.getZ(i) - north) / (south - north),
        );
        colors.setXYZ(i, 1, 1, 1);
      }
      mesh.geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      mesh.userData.terrainPainted = true;
    }
    if (!mesh.material.map) mesh.material.needsUpdate = true;
    mesh.material.map = texture;
  }
  previousTextures.forEach((t) => t.dispose());
}
function addTerrain(b: CampusBuilder, terrainShadows: boolean) {
  const tiles = new Map<string, number[]>();
  const { left, right, north, south } = terrainBounds;
  const axis = (low: number, high: number) => [
    low - 5000,
    low - 1000,
    low - 200,
    ...Array.from(
      { length: Math.round((high - low) / 15) + 1 },
      (_, i) => low + i * 15,
    ),
    high + 200,
    high + 1000,
    high + 5000,
  ];
  const xs = axis(left, right),
    zs = axis(north, south);
  for (let xi = 1; xi < xs.length; xi++)
    for (let zi = 1; zi < zs.length; zi++) {
      const x = xs[xi - 1],
        z = zs[zi - 1],
        w = xs[xi] - x,
        d = zs[zi] - z;
      const count =
        w === 15 && d === 15 ? terrainCellDivisions(x + 0.01, z + 0.01) : 1;
      const fine = count > 1;
      const key = `${Math.floor((x + w / 2) / 400)},${Math.floor((z + d / 2) / 400)}`;
      const vertices = tiles.get(key) || [];
      const at = (i: number, j: number) => {
        const xx = x + (w * i) / count,
          zz = z + (d * j) / count;
        return [
          xx,
          fine ? terrainVertex(xx, zz, x, z) : gradedHeightAt(xx, zz),
          zz,
        ];
      };
      for (let i = 0; i < count; i++)
        for (let j = 0; j < count; j++)
          vertices.push(
            ...at(i, j),
            ...at(i, j + 1),
            ...at(i + 1, j),
            ...at(i + 1, j),
            ...at(i, j + 1),
            ...at(i + 1, j + 1),
          );
      tiles.set(key, vertices);
    }
  for (const [tile, vertices] of tiles) {
    b.tile = tile;
    const geometry = triangleGeometry(vertices);
    groundNormals(geometry, terrainShadows);
    b.add(geometry, "ground");
  }
}

export function setCampusTerrainShadows(group: T.Group, enabled: boolean) {
  if (group.userData.terrainShadows === enabled) return;
  for (const object of group.children.filter((o) => o.userData.terrain))
    groundNormals((object as T.Mesh).geometry, enabled);
  paintTerrain(group, enabled);
  group.userData.terrainShadows = enabled;
}

export function createCampusLandscape(terrainShadows = false) {
  const b = new CampusBuilder();
  const [left, south] = project([campusBounds[0], campusBounds[1]]),
    [right, north] = project([campusBounds[2], campusBounds[3]]);
  addTerrain(b, terrainShadows);
  const group = b.finish();
  group.children.forEach((mesh) => {
    mesh.userData.terrain = true;
  });
  paintTerrain(group, terrainShadows);
  group.userData.terrainShadows = terrainShadows;
  const plaza = new CampusBuilder();
  // The original ALP plaza stays level with its translated architectural model.
  const alp = campusFeatures.find((f) => f.profile === "alp")!;
  plaza.box(
    68,
    0.06,
    100,
    -6,
    buildingElevation(alp).base + 0.03,
    8,
    "paving",
    0,
    0.46,
  );
  group.add(plaza.finish());
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
    dummy.position.set(x, groundHeightAt(x, z) + r + 2, z);
    dummy.scale.set(r, r, r);
    dummy.rotation.y = i;
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, groundHeightAt(x, z) + 1.75, z);
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
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  group.traverse((o) => {
    const mesh = o as T.Mesh;
    if ((o as T.InstancedMesh).isInstancedMesh)
      (o as T.InstancedMesh).dispose();
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material)
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(
        (m) => {
          materials.add(m);
          for (const value of Object.values(m))
            if (value instanceof T.Texture) textures.add(value);
        },
      );
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
