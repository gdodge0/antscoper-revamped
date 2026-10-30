import * as T from "three";
import { CampusBuilder, type Finish } from "./campusGeometry";
import { groundHeightAt, bridgeAlignments as campusBridges } from "./terrain";
import {
  studentCenterAccess,
  parkingArtsLanding,
  watsonAccess,
  exteriorBridgeAccess,
} from "./bridgeAccess";

export { distanceToRoad } from "./bridgeAlignment";
export { campusBridges };
export type CampusBridge = (typeof campusBridges)[number];
function beam(
  b: CampusBuilder,
  a: T.Vector3,
  c: T.Vector3,
  width: number,
  depth: number,
  finish: Finish,
) {
  const delta = c.clone().sub(a),
    g = new T.BoxGeometry(width, delta.length(), depth);
  // Chords join other members at their ends. Those concealed caps add up
  // across hundreds of railing segments without contributing visible detail.
  const indices = Array.from(g.getIndex()!.array);
  g.setIndex([...indices.slice(0, 12), ...indices.slice(24)]);
  g.applyQuaternion(
    new T.Quaternion().setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      delta.normalize(),
    ),
  );
  g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
  b.add(g, finish);
}
export function createCampusBridges() {
  const builder = new CampusBuilder();
  for (const bridge of campusBridges) {
    const b = builder,
      { width, length, thickness, style } = bridge;
    const mainSpanEnd = Math.min(
      length,
      Math.max(...bridge.crossings.map((c) => c.station)) + 15,
    );
    const trussTop = (s: number) =>
      1.8 + 0.45 * Math.sin(Math.PI * Math.min(1, s / mainSpanEnd));
    const midpoint = bridge.pointAt(length / 2);
    b.tile = `${Math.floor(midpoint[0] / 400)},${Math.floor(midpoint[1] / 400)}`;
    const steel: Finish = style === "truss" ? "bridgeBronze" : "bridgeSteel";
    const rail: Finish = style === "truss" ? "bridgeRailBronze" : "bridgeRail";
    const at = (s: number, offset = 0, y = 0) => {
      const p = bridge.pointAt(s),
        before = bridge.pointAt(s - 0.1),
        after = bridge.pointAt(s + 0.1);
      const angle = Math.atan2(after[1] - before[1], after[0] - before[0]);
      return new T.Vector3(
        p[0] - Math.sin(angle) * offset,
        bridge.deckAt(s) + y,
        p[1] + Math.cos(angle) * offset,
      );
    };
    const quad = (
      a: T.Vector3,
      c: T.Vector3,
      d: T.Vector3,
      e: T.Vector3,
      finish: Finish,
    ) => {
      const g = new T.BufferGeometry();
      g.setAttribute(
        "position",
        new T.Float32BufferAttribute(
          [
            ...a.toArray(),
            ...c.toArray(),
            ...d.toArray(),
            ...a.toArray(),
            ...d.toArray(),
            ...e.toArray(),
          ],
          3,
        ),
      );
      g.computeVertexNormals();
      b.add(g, finish);
    };
    for (let i = 1; i < bridge.samples.length; i++) {
      const a = bridge.samples[i - 1],
        c = bridge.samples[i];
      quad(
        at(a, -width / 2),
        at(a, width / 2),
        at(c, width / 2),
        at(c, -width / 2),
        style === "arts" ? "bridgeDeck" : "paving",
      );
      quad(
        at(a, width / 2, -thickness),
        at(a, -width / 2, -thickness),
        at(c, -width / 2, -thickness),
        at(c, width / 2, -thickness),
        steel,
      );
      for (const side of [-1, 1]) {
        const offset = (side * width) / 2;
        const corners = [
          at(a, offset),
          at(a, offset, -thickness),
          at(c, offset, -thickness),
          at(c, offset),
        ];
        if (side < 0) corners.reverse();
        quad(corners[0], corners[1], corners[2], corners[3], steel);
        if (style !== "concrete") {
          beam(b, at(a, offset, 1.15), at(c, offset, 1.15), 0.075, 0.075, rail);
          beam(b, at(a, offset, 0.18), at(c, offset, 0.18), 0.07, 0.07, rail);
        }
        if (style === "arts") {
          const arch = (s: number) =>
            0.3 + Math.sin((Math.PI * s) / length) * 2.5;
          beam(
            b,
            at(a, offset, arch(a)),
            at(c, offset, arch(c)),
            0.24,
            0.24,
            steel,
          );
        }
      }
    }
    // Thin double-sided picket faces retain the silhouette without six hidden
    // box faces per bar. Heavy posts and chords remain solid geometry.
    if (style === "concrete") {
      const deck = bridge.samples.map((s) => {
        const p = bridge.pointAt(s);
        return new T.Vector3(p[0], bridge.deckAt(s), p[1]);
      });
      if (bridge.id === "w171194239") {
        const stair = watsonAccess(bridge).stairs[1];
        const station = bridge.samples.reduce((best, s) => {
          const p = bridge.pointAt(s),
            q = bridge.pointAt(best);
          return Math.hypot(p[0] - stair.top.x, p[1] - stair.top.z) <
            Math.hypot(q[0] - stair.top.x, q[1] - stair.top.z)
            ? s
            : best;
        }, 0);
        const before = bridge.pointAt(station - 0.1),
          after = bridge.pointAt(station + 0.1);
        const branch = stair.points[1].clone().sub(stair.top);
        const sideWithStairs = Math.sign(
          (after[0] - before[0]) * branch.z - (after[1] - before[1]) * branch.x,
        );
        for (const side of [-1, 1]) {
          const ranges =
            side === sideWithStairs
              ? [
                  [0, station - stair.width / 2 - 0.3],
                  [station + stair.width / 2 + 0.3, length],
                ]
              : [[0, length]];
          for (const [start, end] of ranges) {
            const points = [
              start,
              ...bridge.samples.filter((s) => s > start && s < end),
              end,
            ].map((s) => at(s, side * (width / 2 - 0.1), 1.05));
            strip(b, points, 0.24, 1.05, "roof");
          }
        }
      } else concreteParapets(b, deck, width);
    }
    const pickets: number[] = [];
    for (let s = 0; style !== "concrete" && s <= length; s += 0.32) {
      for (const side of [-1, 1]) {
        const offset = (side * width) / 2;
        const a = at(s - 0.025, offset, 0.2),
          c = at(s + 0.025, offset, 0.2),
          d = at(s + 0.025, offset, 1.12),
          e = at(s - 0.025, offset, 1.12);
        pickets.push(
          ...a.toArray(),
          ...c.toArray(),
          ...d.toArray(),
          ...a.toArray(),
          ...d.toArray(),
          ...e.toArray(),
          ...d.toArray(),
          ...c.toArray(),
          ...a.toArray(),
          ...e.toArray(),
          ...d.toArray(),
          ...a.toArray(),
        );
      }
    }
    if (pickets.length) {
      const picketGeometry = new T.BufferGeometry();
      picketGeometry.setAttribute(
        "position",
        new T.Float32BufferAttribute(pickets, 3),
      );
      picketGeometry.computeVertexNormals();
      b.add(
        picketGeometry,
        style === "truss" ? "bridgeRailBronze" : "bridgeRail",
      );
    }
    const bays = style === "concrete" ? -1 : Math.ceil(length / 4.5);
    for (let i = 0; i <= bays; i++) {
      const s = (i * length) / bays;
      for (const side of [-1, 1]) {
        beam(
          b,
          at(s, (side * width) / 2, 0.1),
          at(
            s,
            (side * width) / 2,
            style === "truss"
              ? trussTop(s)
              : style === "arts"
                ? Math.max(1.15, 0.3 + Math.sin((Math.PI * s) / length) * 2.5)
                : 1.25,
          ),
          0.1,
          0.1,
          style === "truss" || style === "arts" ? steel : rail,
        );
        if (style === "arts" && i < bays) {
          const next = ((i + 1) * length) / bays;
          const top = (d: number) =>
            Math.max(1.15, 0.3 + Math.sin((Math.PI * d) / length) * 2.5);
          beam(
            b,
            at(s, (side * width) / 2, i % 2 ? 0.15 : top(s)),
            at(next, (side * width) / 2, i % 2 ? top(next) : 0.15),
            0.1,
            0.1,
            steel,
          );
        }
        if (style === "truss" && i < bays) {
          const next = ((i + 1) * length) / bays;
          beam(
            b,
            at(s, (side * width) / 2, trussTop(s)),
            at(next, (side * width) / 2, trussTop(next)),
            0.14,
            0.14,
            steel,
          );
          beam(
            b,
            at(s, (side * width) / 2, i % 2 ? 0.12 : trussTop(s)),
            at(next, (side * width) / 2, i % 2 ? trussTop(next) : 0.12),
            0.12,
            0.12,
            steel,
          );
        }
      }
    }
    // Watson's divided roadway has a median pier between its two carriageways.
    const median =
      bridge.id === "w171194239" && bridge.crossings.length === 2
        ? (bridge.crossings[0].station + bridge.crossings[1].station) / 2
        : null;
    // Abutments and intermediate piers never occupy a roadway corridor.
    for (const s of [
      0.8,
      ...(median === null ? [] : [median]),
      ...Array.from(
        { length: style === "arts" ? 0 : Math.floor(length / 22) },
        (_, i) => (i + 1) * 22,
      ),
      length - 0.8,
    ]) {
      const p = at(s),
        ground = groundHeightAt(p.x, p.z),
        h = p.y - thickness - ground;
      if (
        bridge.roadAt(p.x, p.z, s === median ? 0.9 : width / 2 + 2) ||
        h < 0.4
      )
        continue;
      const before = at(Math.max(0, s - 0.1)),
        after = at(Math.min(length, s + 0.1));
      const rotation = -Math.atan2(after.z - before.z, after.x - before.x);
      b.box(
        1.1,
        h,
        width * 0.72,
        p.x,
        ground + h / 2,
        p.z,
        "wall",
        0,
        rotation,
      );
      b.box(
        1.6,
        0.28,
        width + 0.3,
        p.x,
        p.y - thickness - 0.14,
        p.z,
        "roof",
        0,
        rotation,
      );
    }
    if (style === "arts") {
      for (const s of [1.5, length - 1.5]) {
        const before = at(s - 0.1),
          after = at(s + 0.1),
          rotation = -Math.atan2(after.z - before.z, after.x - before.x);
        for (const side of [-1, 1]) {
          const p = at(s, side * (width / 2 + 0.55));
          b.box(
            1.05,
            4.3,
            1.05,
            p.x,
            p.y + 2.15,
            p.z,
            "bridgeBrick",
            0,
            rotation,
          );
          b.box(1.12, 0.6, 1.12, p.x, p.y + 4.6, p.z, "lightTrim", 0, rotation);
          for (let y = 0.25; y < 4.3; y += 0.28)
            b.box(
              1.065,
              0.035,
              1.065,
              p.x,
              p.y + y,
              p.z,
              "bridgeMortar",
              0,
              rotation,
            );
        }
        // Open steel lattice entrance canopy; the span itself stays uncovered.
        for (let ds = -1.5; ds <= 1.5; ds += 0.45)
          beam(
            b,
            at(s + ds, -width / 2 - 0.55, 4.3),
            at(s + ds, width / 2 + 0.55, 4.3),
            0.07,
            0.09,
            steel,
          );
        for (
          let offset = -width / 2 - 0.55;
          offset <= width / 2 + 0.55;
          offset += 0.45
        )
          beam(
            b,
            at(s - 1.5, offset, 4.3),
            at(s + 1.5, offset, 4.3),
            0.075,
            0.09,
            steel,
          );
        for (const ds of [-1.5, 1.5])
          beam(
            b,
            at(s + ds, -width / 2 - 0.65, 4.3),
            at(s + ds, width / 2 + 0.65, 4.3),
            0.2,
            0.2,
            steel,
          );
      }
      // Brick deck courses are drawn geometry, not a remotely loaded texture.
      for (let s = 0.75; s < length; s += 1.2)
        beam(
          b,
          at(s, -width / 2 + 0.12, 0.01),
          at(s, width / 2 - 0.12, 0.01),
          0.022,
          0.022,
          "bridgeMortar",
        );
    }
    addElevatedAccess(builder, bridge);
  }
  const group = builder.finish();
  group.name = "campus-bridges";
  return group;
}

function appendQuad(
  target: number[],
  a: T.Vector3,
  b: T.Vector3,
  c: T.Vector3,
  d: T.Vector3,
) {
  target.push(
    ...a.toArray(),
    ...b.toArray(),
    ...c.toArray(),
    ...a.toArray(),
    ...c.toArray(),
    ...d.toArray(),
  );
}
function addFaces(builder: CampusBuilder, positions: number[], finish: Finish) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  builder.add(geometry, finish);
}
function offsetPath(points: T.Vector3[], offset: number) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    return new T.Vector3(
      p.x - ((b.z - a.z) / length) * offset,
      p.y,
      p.z + ((b.x - a.x) / length) * offset,
    );
  });
}
function strip(
  builder: CampusBuilder,
  points: T.Vector3[],
  width: number,
  depth: number,
  top: Finish = "paving",
) {
  const left = offsetPath(points, -width / 2),
    right = offsetPath(points, width / 2);
  const cap: number[] = [],
    solid: number[] = [];
  const lower = (p: T.Vector3) => p.clone().add(new T.Vector3(0, -depth, 0));
  for (let i = 1; i < points.length; i++) {
    const a = left[i - 1],
      b = right[i - 1],
      c = right[i],
      d = left[i];
    appendQuad(cap, a, b, c, d);
    appendQuad(solid, lower(b), lower(a), lower(d), lower(c));
    appendQuad(solid, a, d, lower(d), lower(a));
    appendQuad(solid, b, lower(b), lower(c), c);
  }
  appendQuad(solid, left[0], lower(left[0]), lower(right[0]), right[0]);
  const last = points.length - 1;
  appendQuad(
    solid,
    left[last],
    right[last],
    lower(right[last]),
    lower(left[last]),
  );
  addFaces(builder, cap, top);
  addFaces(builder, solid, "wall");
}
function concreteParapets(
  builder: CampusBuilder,
  points: T.Vector3[],
  width: number,
) {
  for (const side of [-1, 1]) {
    const path = offsetPath(points, side * (width / 2 - 0.1)).map((p) =>
      p.add(new T.Vector3(0, 1.05, 0)),
    );
    strip(builder, path, 0.24, 1.05, "roof");
  }
}
function concreteBarrier(builder: CampusBuilder, points: T.Vector3[]) {
  strip(
    builder,
    points.map((p) => p.clone().add(new T.Vector3(0, 1.05, 0))),
    0.4,
    1.05,
    "roof",
  );
}
function staircase(builder: CampusBuilder, points: T.Vector3[], width: number) {
  // A continuous concrete waist and solid risers make each flight read as a
  // staircase, including its turns, rather than disconnected floating treads.
  for (let segment = 1; segment < points.length; segment++) {
    const top = points[segment - 1],
      bottom = points[segment];
    const height = top.y - bottom.y;
    if (height <= 0.01) continue;
    const count = Math.ceil(height / 0.17),
      run = Math.hypot(bottom.x - top.x, bottom.z - top.z);
    const along = new T.Vector3(
      bottom.x - top.x,
      0,
      bottom.z - top.z,
    ).normalize();
    const across = new T.Vector3(-along.z, 0, along.x).multiplyScalar(
      width / 2,
    );
    const positions: number[] = [];
    strip(
      builder,
      [
        top.clone().add(new T.Vector3(0, -0.17, 0)),
        bottom.clone().add(new T.Vector3(0, -0.17, 0)),
      ],
      width,
      0.35,
      "wall",
    );
    for (let i = 0; i < count; i++) {
      const a = top.clone().addScaledVector(along, (run * i) / count),
        b = top.clone().addScaledVector(along, (run * (i + 1)) / count);
      a.y = b.y = top.y - (height * (i + 1)) / count;
      appendQuad(
        positions,
        a.clone().sub(across),
        a.clone().add(across),
        b.clone().add(across),
        b.clone().sub(across),
      );
      const upper = a.clone().add(new T.Vector3(0, height / count, 0));
      appendQuad(
        positions,
        a.clone().add(across),
        a.clone().sub(across),
        upper.clone().sub(across),
        upper.clone().add(across),
      );
    }
    addFaces(builder, positions, "roof");
  }
  concreteParapets(builder, points, width);
}
function supportArcade(
  builder: CampusBuilder,
  points: T.Vector3[],
  width: number,
  slabDepth = 0.28,
  pierWidth = 0.7,
) {
  const front = offsetPath(points, width / 2 - 0.4);
  for (let segment = 1; segment < front.length; segment++) {
    const a = front[segment - 1],
      b = front[segment],
      distance = a.distanceTo(b),
      bays = Math.max(1, Math.ceil(distance / 6));
    for (let i = 0; i <= bays; i++) {
      const p = a.clone().lerp(b, i / bays),
        ground = groundHeightAt(p.x, p.z),
        h = p.y - slabDepth - ground;
      if (h > 0.2)
        builder.box(pierWidth, h, pierWidth, p.x, ground + h / 2, p.z, "wall");
      if (i === bays) continue;
      const next = a.clone().lerp(b, (i + 1) / bays),
        radius = Math.min((distance / bays - 0.6) / 2, h - 0.6);
      if (radius < 0.5) continue;
      const arch = new T.Shape();
      arch.absarc(0, 0, radius, 0, Math.PI, false);
      arch.lineTo(-radius + 0.22, 0);
      arch.absarc(0, 0, radius - 0.22, Math.PI, 0, true);
      arch.closePath();
      const g = new T.ExtrudeGeometry(arch, {
        depth: 0.35,
        bevelEnabled: false,
        curveSegments: 6,
      });
      g.rotateY(-Math.atan2(next.z - p.z, next.x - p.x));
      g.translate(
        (p.x + next.x) / 2,
        p.y - slabDepth - radius,
        (p.z + next.z) / 2,
      );
      builder.add(g, "wall");
    }
  }
}
function addElevatedAccess(builder: CampusBuilder, bridge: CampusBridge) {
  if (bridge.id === "w624135494") {
    const access = studentCenterAccess(bridge);
    const shape = new T.Shape(
      access.outline.map((p) => new T.Vector2(p.x, -p.z)),
    );
    const slab = new T.ExtrudeGeometry(shape, {
      depth: access.depth,
      bevelEnabled: false,
    });
    slab.rotateX(-Math.PI / 2);
    slab.translate(0, bridge.deckAt(bridge.length) - access.depth, 0);
    builder.add(slab, "wall");
    const top = new T.ShapeGeometry(shape);
    top.rotateX(-Math.PI / 2);
    top.translate(0, bridge.deckAt(bridge.length) + 0.005, 0);
    builder.add(top, "paving");
    // Leave the stair mouth open in the terrace parapet.
    concreteBarrier(builder, access.edge.slice(0, 3));
    concreteBarrier(builder, access.edge.slice(6));
    supportArcade(builder, access.edge.slice(0, 3), 0.8, access.depth, 1.1);
    supportArcade(builder, access.edge.slice(6), 0.8, access.depth, 1.1);
    staircase(builder, access.stairs, access.stairWidth);
  }
  if (bridge.id === "w155705065") {
    const path = parkingArtsLanding(bridge);
    strip(builder, path, 5, 0.28);
    concreteParapets(builder, path, 5);
    supportArcade(builder, path, 5);
    const top = path.at(-1)!,
      x = top.x + 10,
      z = top.z;
    staircase(
      builder,
      [top, new T.Vector3(x, groundHeightAt(x, z) + 0.08, z)],
      3.2,
    );
  }
  if (bridge.id === "w171194239") {
    const access = watsonAccess(bridge);
    strip(builder, access.ramp, 3.1, 0.25);
    concreteParapets(builder, access.ramp, 3.1);
    // Piers sit inside the spiral's open core. A column under an upper tread
    // centerline would otherwise pass through the lower turn of the ramp.
    const { core, coreRadius } = access;
    for (const i of [4, 16, 28, 40]) {
      const deck = access.spiral[i],
        direction = new T.Vector2(deck.x - core.x, deck.z - core.y).normalize(),
        p = new T.Vector3(
          core.x + direction.x * coreRadius,
          deck.y - 0.45,
          core.y + direction.y * coreRadius,
        ),
        ground = groundHeightAt(p.x, p.z),
        height = p.y - ground;
      if (height > 0.2) {
        builder.box(0.75, height, 0.75, p.x, ground + height / 2, p.z, "wall");
        builder.box(1.25, 0.35, 1.25, p.x, deck.y - 0.425, p.z, "wall");
      }
    }
    for (const stairs of access.stairs)
      staircase(builder, stairs.points, stairs.width);
    const start = bridge.pointAt(0),
      next = bridge.pointAt(5),
      dx = start[0] - next[0],
      dz = start[1] - next[1],
      length = Math.hypot(dx, dz);
    const x = start[0] + (dx / length) * 18,
      z = start[1] + (dz / length) * 18;
    strip(
      builder,
      [
        new T.Vector3(x, groundHeightAt(x, z) + 0.08, z),
        new T.Vector3(start[0], bridge.deckAt(0), start[1]),
      ],
      bridge.width,
      0.25,
    );
  }
  for (const platform of exteriorBridgeAccess(bridge)) {
    const { center, direction, width, length, depth } = platform;
    const ends = [-1, 1].map((side) =>
      center
        .clone()
        .add(
          new T.Vector3(
            ((direction.x * length) / 2) * side,
            0,
            ((direction.y * length) / 2) * side,
          ),
        ),
    );
    strip(builder, ends, width, depth);
    for (const edge of platform.barriers) concreteBarrier(builder, edge);
    for (const edge of offsetPath(ends, width / 2 - 0.6).concat(
      offsetPath(ends, -width / 2 + 0.6),
    )) {
      const ground = groundHeightAt(edge.x, edge.z),
        h = edge.y - depth - ground;
      if (h > 0.2 && !bridge.roadAt(edge.x, edge.z, 1))
        builder.box(0.9, h, 0.9, edge.x, ground + h / 2, edge.z, "wall");
    }
    staircase(builder, platform.stairs, bridge.width);
  }
}
