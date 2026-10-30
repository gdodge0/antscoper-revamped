import * as T from "three";
import { alp } from "../architecture";
import { buildingElevation } from "../terrain";
import {
  CampusBuilder,
  addFoundation,
  polygonGeometry,
  disposeGroup,
  type Finish,
} from "../campusGeometry";
import {
  campusFeatures,
  type CampusFeature,
  type Point,
} from "../campusGeography";

export interface ArchitectureProfile {
  id: string;
  floors: number;
  height: number;
  facade: string;
  bay: number;
}
interface Edge {
  a: Point;
  b: Point;
  length: number;
  angle: number;
  nx: number;
  nz: number;
}
function edges(ring: Point[]): Edge[] {
  const area = ring
    .slice(1)
    .reduce((s, p, i) => s + ring[i][0] * p[1] - p[0] * ring[i][1], 0);
  return ring
    .slice(1)
    .map((p, i) => {
      const a = ring[i],
        dx = p[0] - a[0],
        dz = p[1] - a[1],
        length = Math.hypot(dx, dz);
      return {
        a,
        b: p,
        length,
        angle: -Math.atan2(dz, dx),
        nx: (area > 0 ? dz : -dz) / length,
        nz: (area > 0 ? -dx : dx) / length,
      };
    })
    .filter((e) => e.length > 0.2);
}
function at(e: Edge, d: number, offset = 0): Point {
  return [
    e.a[0] + ((e.b[0] - e.a[0]) * d) / e.length + e.nx * offset,
    e.a[1] + ((e.b[1] - e.a[1]) * d) / e.length + e.nz * offset,
  ];
}
function bar(
  b: CampusBuilder,
  f: CampusFeature,
  e: Edge,
  d: number,
  width: number,
  y: number,
  height: number,
  depth: number,
  offset: number,
  finish: Finish,
  fine = false,
) {
  if (finish === "glass" || (finish === "lightTrim" && fine && depth <= 0.35)) {
    // These thin surfaces sit against opaque walls. Keep their visible fronts
    // at the same depth without six box faces for every pane/sill/mullion.
    const p = at(e, d, offset + depth / 2);
    const plane = new T.PlaneGeometry(width, height);
    plane.rotateY(Math.atan2(e.nx, e.nz));
    plane.translate(p[0], y, p[1]);
    b.add(plane, finish, f.renderId);
    return;
  }
  const p = at(e, d, offset);
  b.box(width, height, depth, p[0], y, p[1], finish, f.renderId, e.angle);
}

function arch(
  b: CampusBuilder,
  f: CampusFeature,
  e: Edge,
  d: number,
  width: number,
  y: number,
) {
  // Pereira's recessed arcade: a light arch around a dark opening.
  const radius = width / 2,
    shape = new T.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI, false);
  shape.lineTo(-radius + 0.22, 0);
  shape.absarc(0, 0, radius - 0.22, Math.PI, 0, true);
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, {
    depth: 0.45,
    bevelEnabled: false,
    curveSegments: 5,
  });
  g.rotateY(e.angle);
  const p = at(e, d, 0.3);
  g.translate(p[0], y, p[1]);
  b.add(g, "roof", f.renderId);
}

function aldrichHall(b: CampusBuilder, f: CampusFeature) {
  // Pereira's raised administrative block over a low, spreading podium.
  // Ground footprint is geographic; upper dimensions estimated from UCI photo.
  const id = f.renderId;
  for (const polygon of f.polygons) {
    b.add(polygonGeometry(polygon, 4.2), "wall", id);
    b.add(polygonGeometry(polygon, 0.35, 4.2), "roof", id);
  }
  const cx = 296,
    cz = -137,
    rotation = -2.218;
  const transform = (x: number, z: number): Point => [
    cx + x * Math.cos(rotation) + z * Math.sin(rotation),
    cz - x * Math.sin(rotation) + z * Math.cos(rotation),
  ];
  const ring = [
    [-27, -10],
    [27, -10],
    [27, 10],
    [-27, 10],
    [-27, -10],
  ].map(([x, z]) => transform(x, z));
  b.add(polygonGeometry([ring], 18, 6), "wall", id);
  b.add(polygonGeometry([ring], 0.45, 24), "roof", id);
  const eaves = edges(ring);
  for (const e of eaves) {
    bar(b, f, e, e.length / 2, e.length - 0.5, 15, 16.6, 0.15, 0.15, "glass");
    const count = Math.round(e.length / 2.5);
    for (let i = 0; i <= count; i++)
      bar(
        b,
        f,
        e,
        (i * e.length) / count,
        0.38,
        15.3,
        18.5,
        0.85,
        0.45,
        "roof",
      );
    for (let floor = 0; floor <= 4; floor++)
      bar(
        b,
        f,
        e,
        e.length / 2,
        e.length,
        6 + floor * 4.5,
        0.38,
        0.5,
        0.55,
        "lightTrim",
      );
  }
  for (let x = -24; x <= 24; x += 8)
    for (const z of [-8, 8]) {
      const p = transform(x, z);
      b.box(0.7, 6, 0.7, p[0], 3, p[1], "wall", id);
    }
  const p = transform(-12, 0);
  b.box(4, 2.8, 4, p[0], 25.7, p[1], "wall", id, rotation);
}

function model(b: CampusBuilder, f: CampusFeature, p: ArchitectureProfile) {
  if (p.id === "alh") {
    aldrichHall(b, f);
    return;
  }
  const id = f.renderId,
    h = f.height,
    storey = h / p.floors;
  const allEdges = f.polygons.flatMap((polygon) => polygon.flatMap(edges));
  for (const polygon of f.polygons) {
    b.add(polygonGeometry(polygon, h), "wall", id);
    b.add(polygonGeometry(polygon, 0.32, h), "roof", id);
    // A low foundation and cornice establish scale around the facade.
    for (const e of edges(polygon[0])) {
      bar(b, f, e, e.length / 2, e.length, 0.28, 0.5, 0.22, 0.08, "lightTrim");
      bar(b, f, e, e.length / 2, e.length, h + 0.45, 0.5, 0.32, 0.1, "roof");
    }
  }
  const styles = p.facade;
  const vertical = ["fins", "library", "screens"].includes(styles);
  const ribbon = ["bands", "ribbons"].includes(styles);
  const low = [
    "modular",
    "workshop",
    "lecture",
    "theatre",
    "pitched",
    "folded",
  ].includes(styles);
  for (const e of allEdges) {
    if (e.length < 2) continue;
    // The concrete stair/end walls of the two signature towers are solid.
    if (
      ["sst", "et"].includes(p.id) &&
      e.length < Math.max(...allEdges.map((v) => v.length)) * 0.45
    )
      continue;
    const bays = Math.max(1, Math.floor(e.length / p.bay)),
      bay = e.length / bays;
    if (vertical) {
      // Deep vertical frames give the 1960s towers and libraries their silhouette.
      bar(
        b,
        f,
        e,
        e.length / 2,
        Math.max(0.5, e.length - 0.8),
        h * 0.53,
        h * 0.81,
        0.13,
        0.12,
        "glass",
      );
      for (let i = 0; i <= bays; i++) {
        bar(
          b,
          f,
          e,
          Math.min(e.length - 0.15, Math.max(0.15, i * bay)),
          styles === "screens" ? 0.18 : 0.42,
          h * 0.55,
          h * 0.89,
          styles === "screens" ? 0.9 : 0.65,
          0.42,
          "wall",
        );
        if (styles === "screens")
          bar(
            b,
            f,
            e,
            i * bay + bay * 0.5,
            0.12,
            h * 0.55,
            h * 0.87,
            0.8,
            0.45,
            "lightTrim",
            true,
          );
      }
    }
    for (let floor = 0; floor < p.floors; floor++) {
      const y = (floor + 0.54) * storey;
      if (ribbon) {
        bar(
          b,
          f,
          e,
          e.length / 2,
          Math.max(0.5, e.length - 1),
          y,
          storey * 0.56,
          0.12,
          0.12,
          "glass",
        );
        bar(
          b,
          f,
          e,
          e.length / 2,
          e.length,
          y - storey * 0.31,
          0.3,
          0.55,
          0.22,
          "lightTrim",
        );
      } else if (!vertical) {
        for (let i = 0; i < bays; i++) {
          // Performance halls have predominantly solid walls; trailers stay low.
          if (low && styles !== "modular" && i % 3 !== 0) continue;
          const width = low ? Math.min(1.3, bay * 0.45) : bay * 0.58;
          bar(
            b,
            f,
            e,
            (i + 0.5) * bay,
            width,
            y,
            storey * (low ? 0.37 : 0.55),
            0.14,
            0.12,
            "glass",
          );
          bar(
            b,
            f,
            e,
            (i + 0.5) * bay,
            width + 0.22,
            y - storey * 0.29,
            0.16,
            0.35,
            0.22,
            "lightTrim",
            true,
          );
        }
      }
      if (vertical && (p.id !== "llib" || floor < 2))
        bar(
          b,
          f,
          e,
          e.length / 2,
          e.length,
          floor * storey + 0.5,
          0.22,
          0.35,
          0.55,
          "lightTrim",
        );
      if (ribbon || vertical) {
        for (let i = 1; i < bays; i++)
          bar(
            b,
            f,
            e,
            i * bay,
            0.09,
            y,
            storey * 0.6,
            0.22,
            0.25,
            "lightTrim",
            true,
          );
      }
      if (styles === "balconies" && floor > 0 && e.length > 18) {
        bar(
          b,
          f,
          e,
          e.length / 2,
          e.length - 2,
          floor * storey,
          0.22,
          1.5,
          0.7,
          "roof",
        );
        bar(
          b,
          f,
          e,
          e.length / 2,
          e.length - 2,
          floor * storey + 1,
          0.1,
          0.1,
          1.4,
          "trim",
          true,
        );
        for (let d = 1; d < e.length - 1; d += 2)
          bar(
            b,
            f,
            e,
            d,
            0.07,
            floor * storey + 0.5,
            1,
            0.07,
            1.4,
            "trim",
            true,
          );
      }
    }
    if (
      ["library", "arcade", "courtyard", "folded"].includes(styles) &&
      e.length > 9
    ) {
      const columns = Math.max(2, Math.floor(e.length / 5));
      bar(b, f, e, e.length / 2, e.length, storey * 0.87, 0.38, 2.4, 1, "roof");
      for (let i = 0; i <= columns; i++) {
        const d = Math.max(
          0.3,
          Math.min(e.length - 0.3, (i * e.length) / columns),
        );
        bar(b, f, e, d, 0.35, storey * 0.43, storey * 0.86, 0.35, 2, "wall");
        if (styles === "library" && i < columns)
          arch(
            b,
            f,
            e,
            ((i + 0.5) * e.length) / columns,
            e.length / columns - 0.45,
            storey * 0.55,
          );
      }
    }
    if (styles === "ribbons") {
      for (let floor = 1; floor <= p.floors; floor++)
        bar(
          b,
          f,
          e,
          e.length / 2,
          e.length,
          floor * storey,
          0.4,
          1,
          0.4,
          "roof",
        );
    }
  }

  // An entrance on the park-facing long edge, using a single explicit treatment
  // for each authored family. Dimensions are illustrative, not access routing.
  const front = allEdges
    .filter((e) => e.length > 12)
    .sort((a, c) => {
      const pa = at(a, a.length / 2),
        pc = at(c, c.length / 2);
      return (
        Math.hypot(pa[0] - 180, pa[1] - 150) -
        Math.hypot(pc[0] - 180, pc[1] - 150)
      );
    })[0];
  if (front) {
    const width = Math.min(front.length * 0.38, styles === "atrium" ? 10 : 7);
    bar(b, f, front, front.length / 2, width, 1.7, 3.4, 0.2, 0.2, "glass");
    bar(b, f, front, front.length / 2, width + 1.6, 3.5, 0.25, 3, 1.3, "roof");
    for (const side of [-1, 1])
      bar(
        b,
        f,
        front,
        front.length / 2 + side * (width / 2),
        0.17,
        1.7,
        3.4,
        0.17,
        2.5,
        "trim",
        true,
      );
    if (styles === "atrium") {
      bar(
        b,
        f,
        front,
        front.length / 2,
        width,
        h / 2,
        h - 1,
        0.25,
        0.3,
        "glass",
      );
      for (let y = 3.5; y < h; y += storey / 2)
        bar(
          b,
          f,
          front,
          front.length / 2,
          width,
          y,
          0.1,
          0.2,
          0.5,
          "lightTrim",
          true,
        );
    }
    if (["fins", "balconies", "arcade", "courtyard"].includes(styles)) {
      for (let i = 0; i < 7; i++)
        bar(
          b,
          f,
          front,
          front.length / 2,
          width + 2,
          0.12 + i * 0.12,
          0.16,
          0.45,
          2.8 + (6 - i) * 0.4,
          "lightTrim",
          true,
        );
    }
    if (p.id === "mde") {
      for (let i = 0; i < 12; i++) {
        const theta = (i / 11) * Math.PI;
        bar(
          b,
          f,
          front,
          front.length / 2 + (i / 11 - 0.5) * 11,
          1,
          4.2 + Math.sin(theta) * 2,
          0.2,
          5,
          2.2,
          "trim",
        );
      }
    }
    if (["hib", "hrh", "hg"].includes(p.id)) {
      bar(
        b,
        f,
        front,
        front.length / 2,
        Math.min(20, front.length),
        h + 0.85,
        0.22,
        3.5,
        1.3,
        "lightTrim",
      );
      for (let d = front.length * 0.2; d < front.length * 0.8; d += 2)
        bar(b, f, front, d, 0.13, h + 0.55, 0.7, 3.3, 1.3, "trim", true);
    }
  }

  const ring = f.polygons[0][0],
    xs = ring.map((v) => v[0]),
    zs = ring.map((v) => v[1]);
  const x = (Math.max(...xs) + Math.min(...xs)) / 2,
    z = (Math.max(...zs) + Math.min(...zs)) / 2;
  // Small roof details follow the reference vocabulary, not random ornaments.
  if (["lab", "screens", "ribbons"].includes(styles)) {
    const length = Math.min(14, Math.max(...xs) - Math.min(...xs));
    b.box(length, 1.1, 4.5, x, h + 0.85, z, "lightTrim", id);
    for (let i = -length / 2 + 1; i < length / 2; i += 1.4)
      b.box(0.12, 0.6, 4.1, x + i, h + 1.6, z, "trim", id);
  }
  if (p.id === "sc") {
    b.box(6, 19, 6, x, h / 2 + 2, z, "wall", id);
    for (let y = 18; y < 25; y += 1.2) b.box(7, 0.25, 7, x, y, z, "trim", id);
  }
  if (p.id === "gnrf") {
    const edge = front || allEdges[0],
      atFront = at(edge, edge.length * 0.27, -2.8);
    const glass = new T.CylinderGeometry(3.8, 3.8, h, 24);
    glass.translate(atFront[0], h / 2, atFront[1]);
    b.add(glass, "glass", id);
    for (let i = 0; i <= p.floors; i++) {
      const trim = new T.CylinderGeometry(3.95, 3.95, 0.22, 24);
      trim.translate(atFront[0], i * storey, atFront[1]);
      b.add(trim, "roof", id);
    }
  }
  if (styles === "pitched") {
    const edge = allEdges.sort((a, c) => c.length - a.length)[0];
    const center = at(edge, edge.length / 2, -4),
      roof = new T.CylinderGeometry(0, 1, 2.6, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.scale(edge.length * 0.72, 1, 7);
    roof.rotateY(edge.angle);
    roof.translate(center[0], h + 1.25, center[1]);
    b.add(roof, "roof", id);
  }
}

function mesaParking(b: CampusBuilder, f: CampusFeature) {
  const spacing = f.height / f.levels;
  const entrance: Point = [-178.18594319672087, -361.44490800006764];
  for (const polygon of f.polygons) {
    const perimeter = edges(polygon[0]);
    for (let floor = 0; floor <= f.levels; floor++)
      b.add(
        polygonGeometry(polygon, 0.22, floor * spacing - 0.22),
        "roof",
        f.renderId,
      );
    for (const e of perimeter) {
      const bays = Math.max(1, Math.ceil(e.length / 8)),
        bay = e.length / bays;
      for (let i = 0; i < bays; i++) {
        const d = (i + 0.5) * bay,
          p = at(e, d);
        // Columns span the building; open parking bays remain actual openings.
        const column = at(e, i * bay);
        if (Math.hypot(column[0] - entrance[0], column[1] - entrance[1]) > 2.3)
          bar(
            b,
            f,
            e,
            i * bay,
            0.55,
            f.height / 2,
            f.height,
            0.6,
            -0.1,
            "wall",
          );
        for (let floor = 0; floor < f.levels; floor++) {
          if (
            floor === 2 &&
            Math.hypot(p[0] - entrance[0], p[1] - entrance[1]) < 5.5
          )
            continue;
          bar(
            b,
            f,
            e,
            d,
            bay - 0.65,
            floor * spacing + 0.6,
            0.85,
            0.18,
            0.1,
            "lightTrim",
            true,
          );
        }
      }
    }
  }
}

export function defineDistrict(
  district: string,
  profiles: ArchitectureProfile[],
) {
  const b = new CampusBuilder(),
    byId = new Map(profiles.map((p) => [p.id, p]));
  for (const f of campusFeatures.filter((f) => f.district === district)) {
    b.tile = `${Math.floor(f.anchor[0] / 400)},${Math.floor(f.anchor[1] / 400)}`;
    b.elevation = buildingElevation(f).base;
    addFoundation(b, f);
    if (f.id === "w171169301") {
      mesaParking(b, f);
    } else if (f.profile === "alp") {
      const original = alp();
      original.updateMatrixWorld(true);
      original.traverse((o) => {
        const mesh = o as T.Mesh;
        if (!mesh.isMesh) return;
        const color = (mesh.material as T.MeshLambertMaterial).color;
        const finishes: Finish[] = [
          "wall",
          "roof",
          "glass",
          "trim",
          "lightTrim",
          "paving",
        ];
        // Preserve the approved ALP exactly; combine its meshes into the district.
        const paletteValues = [
          0xe2dfd6, 0xf5f1e8, 0x68716f, 0x777b77, 0xc0c1b8, 0xeeeae3,
        ];
        const index = paletteValues.findIndex((v) =>
          new T.Color(v).equals(color),
        );
        b.add(
          mesh.geometry.clone(),
          finishes[Math.max(0, index)],
          mesh.userData.selectionSurface ? f.renderId : 0,
          mesh.matrixWorld,
        );
      });
      disposeGroup(original);
    } else {
      const profile = f.profile && byId.get(f.profile);
      if (profile) model(b, f, profile);
      else
        for (const polygon of f.polygons) {
          b.add(polygonGeometry(polygon, f.height), "wall", f.renderId);
          // Background roofs only need their visible cap, not an extruded slab
          // with a hidden underside and hundreds of quarter-meter side faces.
          b.add(
            polygonGeometry(polygon, 0, f.height + 0.25),
            "roof",
            f.renderId,
          );
        }
    }
  }
  const group = b.finish();
  group.name = `detail:${district}`;
  return group;
}
