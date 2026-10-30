import grid from "../../public/data/campus-terrain.json";
import {
  campusFeatures,
  type CampusFeature,
  type Point,
} from "./campusGeography";
import { measureFootprint, siteBuildingBase } from "./buildingPlacement";
import { createBridgeAlignments, distanceToRoad } from "./bridgeAlignment";
import {
  defaultMapSettings,
  normalizeMapSettings,
  type MapSettings,
} from "./mapSettings";

export interface HeightGrid {
  x0: number;
  z0: number;
  spacing: number;
  columns: number;
  rows: number;
  samples: ArrayLike<number>;
  sampleScale: number;
  referenceElevation: number;
}
export let terrainRelief = defaultMapSettings.relief;
export let terrainEnabled = defaultMapSettings.heightmap;
export function sampleElevation(data: HeightGrid, x: number, z: number) {
  const gx = Math.max(
    0,
    Math.min(data.columns - 1, (x - data.x0) / data.spacing),
  );
  const gz = Math.max(0, Math.min(data.rows - 1, (z - data.z0) / data.spacing));
  const ix = Math.min(data.columns - 2, Math.floor(gx)),
    iz = Math.min(data.rows - 2, Math.floor(gz));
  const tx = gx - ix,
    tz = gz - iz;
  const at = (dx: number, dz: number) =>
    data.samples[(iz + dz) * data.columns + ix + dx] * data.sampleScale;
  return (
    (at(0, 0) * (1 - tx) + at(1, 0) * tx) * (1 - tz) +
    (at(0, 1) * (1 - tx) + at(1, 1) * tx) * tz
  );
}
export function heightAt(x: number, z: number) {
  if (!terrainEnabled) return 0;
  return (
    (sampleElevation(grid, x, z) - grid.referenceElevation) * terrainRelief
  );
}
// A 10-meter low-pass removes small DEM interpolation artifacts around building
// footprints while retaining the campus hills. Engineered cuts stay crisp below.
const kernel = [1, 4, 6, 4, 1],
  horizontal = new Float64Array(grid.samples.length),
  filtered = new Float64Array(grid.samples.length);
for (let row = 0; row < grid.rows; row++)
  for (let col = 0; col < grid.columns; col++) {
    let value = 0;
    for (let k = -2; k <= 2; k++)
      value +=
        grid.samples[
          row * grid.columns + Math.max(0, Math.min(grid.columns - 1, col + k))
        ] * kernel[k + 2];
    horizontal[row * grid.columns + col] = value / 16;
  }
for (let row = 0; row < grid.rows; row++)
  for (let col = 0; col < grid.columns; col++) {
    let value = 0;
    for (let k = -2; k <= 2; k++)
      value +=
        horizontal[
          Math.max(0, Math.min(grid.rows - 1, row + k)) * grid.columns + col
        ] * kernel[k + 2];
    filtered[row * grid.columns + col] = value / 16;
  }
const landscapeGrid = { ...grid, samples: filtered };
export function landscapeHeightAt(x: number, z: number) {
  if (!terrainEnabled) return 0;
  return (
    (sampleElevation(landscapeGrid, x, z) - grid.referenceElevation) *
    terrainRelief
  );
}
// Engineering grades supplement the bare-earth DEM at elevated walkways: the
// street occupies the cut, while bridge decks and classroom terraces stay level.
export let bridgeAlignments = createBridgeAlignments(landscapeHeightAt);
const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const gradeTiles = new Map<string, (typeof bridgeAlignments)[number][]>();
function indexBridgeGrades() {
  gradeTiles.clear();
  for (const bridge of bridgeAlignments) {
    const points = [
      ...bridge.path.points,
      ...bridge.crossings.map((c) => c.point),
    ];
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[1]);
    for (
      let x = Math.floor((Math.min(...xs) - 70) / 100);
      x <= Math.floor((Math.max(...xs) + 70) / 100);
      x++
    )
      for (
        let z = Math.floor((Math.min(...zs) - 70) / 100);
        z <= Math.floor((Math.max(...zs) + 70) / 100);
        z++
      ) {
        const key = `${x},${z}`,
          entries = gradeTiles.get(key) || [];
        entries.push(bridge);
        gradeTiles.set(key, entries);
      }
  }
}
indexBridgeGrades();
const gradeCache = new Float64Array(grid.columns * grid.rows).fill(NaN);
function gradeElevation(x: number, z: number) {
  let h = landscapeHeightAt(x, z);
  const nearby =
    gradeTiles.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) || [];
  for (const bridge of nearby.filter((b) => !b.preserveGround))
    for (const cut of bridge.crossings) {
      const dx = x - cut.point[0],
        dz = z - cut.point[1];
      const along = dx * cut.tangent[0] + dz * cut.tangent[1];
      const across = Math.abs(dx * cut.tangent[1] - dz * cut.tangent[0]);
      const side = 1 - smooth((across - cut.width / 2 - 4) / 8);
      const run = 1 - smooth((Math.abs(along) - bridge.width / 2 - 8) / 35);
      const bed = cut.bed + cut.slope * along;
      h += (Math.min(h, bed) - h) * side * run;
    }
  // Preserve level terraces above the cut. The actual traffic lanes are excluded
  // from these landing pads, so an abutment never fills in the road below it.
  for (const bridge of nearby.filter((b) => !b.preserveGround))
    for (const [end, s] of [0, bridge.length].entries()) {
      if (bridge.elevatedLandings?.includes(end)) continue;
      const p = bridge.pointAt(s),
        distance = Math.hypot(x - p[0], z - p[1]);
      if (distance >= 24) continue;
      const pavementDistance = Math.min(
        ...bridge.nearRoads.flatMap((r) =>
          r.points
            .slice(1)
            .map((v, i) => distanceToRoad(x, z, r.points[i], v) - r.width / 2),
        ),
      );
      const weight =
        (1 - smooth((distance - 8) / 16)) *
        smooth((pavementDistance - 0.5) / 2.5);
      h += (bridge.deckAt(s) - 0.08 - h) * weight;
    }
  return h;
}
export function gradedHeightAt(x: number, z: number) {
  const column = (x - grid.x0) / 5,
    row = (z - grid.z0) / 5;
  if (
    Number.isInteger(column) &&
    Number.isInteger(row) &&
    column >= 0 &&
    row >= 0 &&
    column < grid.columns &&
    row < grid.rows
  ) {
    const index = row * grid.columns + column;
    if (Number.isNaN(gradeCache[index]))
      gradeCache[index] = gradeElevation(x, z);
    return gradeCache[index];
  }
  return gradeElevation(x, z);
}
export const terrainStep = 15;
export const terrainBounds = {
  left: grid.x0,
  north: grid.z0,
  right: grid.x0 + Math.ceil((grid.columns - 1) / 3) * terrainStep,
  south: grid.z0 + Math.ceil((grid.rows - 1) / 3) * terrainStep,
};
// Road crossings retain the finer DEM detail, especially the embankments and
// road cuts under the bridges. Coarse/fine edges use the same linear heights.
const refined = new Set<string>();
for (const path of bridgeAlignments
  .filter((b) => !b.preserveGround)
  .map((b) => b.path)) {
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1],
      b = path.points[i];
    const count = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5),
    );
    for (let j = 0; j <= count; j++) {
      const x = a[0] + ((b[0] - a[0]) * j) / count,
        z = a[1] + ((b[1] - a[1]) * j) / count;
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          refined.add(
            `${Math.floor((x - grid.x0) / terrainStep) + dx},${Math.floor((z - grid.z0) / terrainStep) + dz}`,
          );
    }
  }
}
// Refine the road cuts as well as the spans, keeping their banks visible.
for (const bridge of bridgeAlignments.filter((b) => !b.preserveGround))
  for (const cut of bridge.crossings) {
    for (let along = -45; along <= 45; along += 5)
      for (let side = -15; side <= 15; side += 5) {
        const x = cut.point[0] + cut.tangent[0] * along - cut.tangent[1] * side;
        const z = cut.point[1] + cut.tangent[1] * along + cut.tangent[0] * side;
        refined.add(
          `${Math.floor((x - grid.x0) / terrainStep)},${Math.floor((z - grid.z0) / terrainStep)}`,
        );
      }
  }
const detailed = new Set<string>();
for (const bridge of bridgeAlignments.filter(
  (b) => b.style === "arts" || b.style === "truss",
)) {
  for (const p of [
    bridge.pointAt(0),
    bridge.pointAt(bridge.length),
    ...bridge.crossings.map((c) => c.point),
  ])
    for (let dx = -15; dx <= 15; dx += 5)
      for (let dz = -15; dz <= 15; dz += 5)
        detailed.add(
          `${Math.floor((p[0] + dx - grid.x0) / 15)},${Math.floor((p[1] + dz - grid.z0) / 15)}`,
        );
}
export function terrainCellDivisions(x: number, z: number) {
  const key = `${Math.floor((x - grid.x0) / 15)},${Math.floor((z - grid.z0) / 15)}`;
  return detailed.has(key) ? 6 : refined.has(key) ? 3 : 1;
}
export function refinedTerrainCell(x: number, z: number) {
  return refined.has(
    `${Math.floor((x - grid.x0) / terrainStep)},${Math.floor((z - grid.z0) / terrainStep)}`,
  );
}
function triangleHeight(
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  tz: number,
) {
  return tx + tz <= 1
    ? a + (b - a) * tx + (c - a) * tz
    : d + (b - d) * (1 - tz) + (c - d) * (1 - tx);
}
export function terrainVertex(x: number, z: number, cx: number, cz: number) {
  const tx = (x - cx) / 15,
    tz = (z - cz) / 15;
  const edgeX = tx < 0.001 || tx > 0.999,
    edgeZ = tz < 0.001 || tz > 0.999;
  if ((!edgeX && !edgeZ) || (edgeX && edgeZ)) return gradedHeightAt(x, z);
  const own = terrainCellDivisions(cx + 7.5, cz + 7.5);
  // Adjacent fine cells share their fine edge samples. Only transitions to a
  // coarser cell interpolate coarse endpoints; otherwise cuts would acquire a
  // false ridge at every 15-meter cell boundary.
  if (edgeX) {
    const neighbor = terrainCellDivisions(
      cx + (tx < 0.5 ? -7.5 : 22.5),
      cz + 7.5,
    );
    const step = 15 / Math.min(own, neighbor),
      start = cz + Math.floor((z - cz) / step) * step;
    const t = (z - start) / step;
    return (
      gradedHeightAt(x, start) * (1 - t) + gradedHeightAt(x, start + step) * t
    );
  }
  const neighbor = terrainCellDivisions(
    cx + 7.5,
    cz + (tz < 0.5 ? -7.5 : 22.5),
  );
  const step = 15 / Math.min(own, neighbor),
    start = cx + Math.floor((x - cx) / step) * step;
  const t = (x - start) / step;
  return (
    gradedHeightAt(start, z) * (1 - t) + gradedHeightAt(start + step, z) * t
  );
}
// The same triangle interpolation as the visible mesh. Draped paths/surfaces
// cannot cut through a differently interpolated ground surface.
export function groundHeightAt(x: number, z: number) {
  const cx = grid.x0 + Math.floor((x - grid.x0) / 15) * 15;
  const cz = grid.z0 + Math.floor((z - grid.z0) / 15) * 15;
  if (terrainCellDivisions(x, z) === 1)
    return triangleHeight(
      gradedHeightAt(cx, cz),
      gradedHeightAt(cx + 15, cz),
      gradedHeightAt(cx, cz + 15),
      gradedHeightAt(cx + 15, cz + 15),
      (x - cx) / 15,
      (z - cz) / 15,
    );
  const divisions = terrainCellDivisions(x, z),
    step = 15 / divisions;
  const sx = cx + Math.min(divisions - 1, Math.floor((x - cx) / step)) * step;
  const sz = cz + Math.min(divisions - 1, Math.floor((z - cz) / step)) * step;
  const at = (dx: number, dz: number) =>
    terrainVertex(sx + dx, sz + dz, cx, cz);
  return triangleHeight(
    at(0, 0),
    at(step, 0),
    at(0, step),
    at(step, step),
    (x - sx) / step,
    (z - sz) / step,
  );
}
// Resolve residual interpolation error at road edges by lowering the road bed.
// Deck elevations never move. This runs once, before foundations or meshes build.
function calibrateRoadBeds() {
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const bridge of bridgeAlignments.filter((b) => !b.preserveGround)) {
      let shortfall = 0;
      for (let s = 0.25; s < bridge.length; s += 0.25) {
        const p = bridge.pointAt(s),
          a = bridge.pointAt(s - 0.1),
          b = bridge.pointAt(s + 0.1);
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (const side of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
          const x = p[0] - ((Math.sin(angle) * bridge.width) / 2) * side,
            z = p[1] + ((Math.cos(angle) * bridge.width) / 2) * side;
          if (bridge.roadAt(x, z))
            shortfall = Math.max(
              shortfall,
              bridge.clearance -
                (bridge.deckAt(s) - bridge.thickness - groundHeightAt(x, z)),
            );
        }
      }
      if (shortfall > 0) {
        for (const cut of bridge.crossings) cut.bed -= (shortfall + 0.2) * 2;
        gradeCache.fill(NaN);
        changed = true;
      }
    }
    if (!changed) break;
  }
}
calibrateRoadBeds();
export function footprintElevations(f: CampusFeature) {
  return measureFootprint(f, groundHeightAt);
}
function measureBuildingBases() {
  return new Map(
    campusFeatures.map((f) => {
      const measured = footprintElevations(f);
      const attachment = bridgeAlignments.find(
        (b) => b.attachment?.buildingId === f.id,
      );
      const base =
        f.profile === "sc"
          ? siteBuildingBase(f, landscapeHeightAt)
          : (attachment?.attachmentBase ?? measured.base);
      return [f.id, { low: Math.min(measured.low, base - 0.12), base }];
    }),
  );
}
let bases = measureBuildingBases();
// Settings change the elevation field, not the dimensions of the architecture.
// Rebuild dependent grades and datums together before generating scene meshes.
export function configureTerrain(
  settings: Pick<MapSettings, "heightmap" | "relief">,
) {
  const next = normalizeMapSettings(settings);
  if (next.heightmap === terrainEnabled && next.relief === terrainRelief)
    return;
  terrainEnabled = next.heightmap;
  terrainRelief = next.relief;
  bridgeAlignments = createBridgeAlignments(landscapeHeightAt);
  indexBridgeGrades();
  gradeCache.fill(NaN);
  calibrateRoadBeds();
  bases = measureBuildingBases();
}
export function buildingElevation(f: CampusFeature) {
  return bases.get(f.id)!;
}
export function locationElevation(id: string, coordinate: Point) {
  const matches = campusFeatures.filter((f) => f.locations.includes(id));
  return matches.length
    ? Math.max(...matches.map((f) => buildingElevation(f).base))
    : groundHeightAt(...coordinate);
}
