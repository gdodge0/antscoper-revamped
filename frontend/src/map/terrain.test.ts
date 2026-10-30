import { beforeEach, describe, expect, it } from "vitest";
import * as T from "three";
import {
  sampleElevation,
  heightAt,
  groundHeightAt,
  terrainBounds,
  terrainCellDivisions,
  buildingElevation,
  gradedHeightAt,
  landscapeHeightAt,
  configureTerrain,
} from "./terrain";
import { campusFeatures, campusPaths } from "./campusGeography";
import { pointInPolygon } from "./geography";
import { campusBridges, createCampusBridges, distanceToRoad } from "./bridges";
import { disposeGroup } from "./campusGeometry";
import { terrainLightingAt } from "./terrainLighting";
import {
  watsonAccess,
  studentCenterTerrace,
  studentCenterAccess,
  exteriorBridgeAccess,
} from "./bridgeAccess";
import { modeledAccessPathIds } from "./bridgeProfiles";

beforeEach(() => configureTerrain({ heightmap: true, relief: 1.5 }));

describe("heightmap settings", () => {
  it("rescales measured elevation, invalidates placement caches and restores the same terrain", () => {
    const point: [number, number] = [800, 650];
    const initial = heightAt(...point),
      ground = groundHeightAt(...point);
    const bases = campusFeatures.map((f) => buildingElevation(f).base);
    expect(Math.abs(initial)).toBeGreaterThan(1);
    configureTerrain({ heightmap: true, relief: 3 });
    expect(heightAt(...point)).toBeCloseTo(initial * 2, 8);
    configureTerrain({ heightmap: false, relief: 3 });
    expect(heightAt(...point)).toBe(0);
    expect(landscapeHeightAt(...point)).toBe(0);
    expect(
      campusFeatures.some(
        (f, i) => Math.abs(buildingElevation(f).base - bases[i]) > 1,
      ),
    ).toBe(true);
    configureTerrain({ heightmap: true, relief: 1.5 });
    expect(groundHeightAt(...point)).toBeCloseTo(ground, 8);
    expect(campusFeatures.map((f) => buildingElevation(f).base)).toEqual(bases);
  });
  it("retains level decks and floor attachments with the heightmap off or rescaled", () => {
    for (const settings of [
      { heightmap: false, relief: 1.5 },
      { heightmap: true, relief: 0.5 },
      { heightmap: true, relief: 3 },
    ]) {
      configureTerrain(settings);
      for (const building of campusFeatures)
        for (const polygon of building.polygons)
          for (const [x, z] of polygon[0])
            expect(
              groundHeightAt(x, z),
              `${building.id} at relief ${settings.relief}`,
            ).toBeLessThan(buildingElevation(building).base + building.height);
      for (const bridge of campusBridges) {
        if (bridge.level)
          expect(bridge.deckAt(0)).toBe(bridge.deckAt(bridge.length));
        if (!bridge.attachment) continue;
        const building = campusFeatures.find(
          (f) => f.id === bridge.attachment!.buildingId,
        )!;
        expect(bridge.deckAt(0)).toBeCloseTo(
          buildingElevation(building).base +
            ((bridge.attachment.floor - 1) * building.height) / building.levels,
          8,
        );
      }
    }
  });
});

describe("measured campus terrain", () => {
  it("uses north-to-south rows, interpolates in meters and clamps outside its bounds", () => {
    const grid = {
      x0: -5,
      z0: -10,
      spacing: 5,
      columns: 2,
      rows: 2,
      samples: [100, 200, 300, 400],
      sampleScale: 0.1,
      referenceElevation: 10,
    };
    expect(sampleElevation(grid, -5, -10)).toBe(10);
    expect(sampleElevation(grid, 0, -10)).toBe(20);
    expect(sampleElevation(grid, -5, -5)).toBe(30);
    expect(sampleElevation(grid, -2.5, -7.5)).toBe(25);
    expect(sampleElevation(grid, -500, 500)).toBe(30);
    expect(heightAt(0, 0)).toBeCloseTo(0, 8);
  });
  it("joins coarse and fine terrain cells without cracks", () => {
    for (let x = terrainBounds.left + 15; x < terrainBounds.right; x += 15)
      for (
        let z = terrainBounds.north + 2.5;
        z < terrainBounds.south;
        z += 15
      ) {
        expect(
          Math.abs(
            groundHeightAt(x - 0.00001, z) - groundHeightAt(x + 0.00001, z),
          ),
        ).toBeLessThan(0.001);
        expect(
          Math.abs(
            groundHeightAt(x, z - 2.50001) - groundHeightAt(x, z - 2.49999),
          ),
        ).toBeLessThan(0.001);
      }
  });
  it("preserves road-cut samples where fine terrain cells share an edge", () => {
    let checks = 0;
    for (let x = terrainBounds.left + 15; x < terrainBounds.right; x += 15)
      for (let z = terrainBounds.north + 5; z < terrainBounds.south; z += 5) {
        if (
          terrainCellDivisions(x - 0.001, z) === 1 ||
          terrainCellDivisions(x + 0.001, z) === 1
        )
          continue;
        expect(groundHeightAt(x, z)).toBeCloseTo(gradedHeightAt(x, z), 7);
        checks++;
      }
    expect(checks).toBeGreaterThan(20);
  });
  it("lights a smooth curved hillside without a triangle-grid pattern", () => {
    const surface = (x: number, z: number) =>
      0.001 * x * x + 0.002 * z * z + 0.06 * x;
    for (let x = -32; x <= 32; x += 0.5) {
      const z = 17.5,
        expected = new T.Vector3(-0.002 * x - 0.06, 1, -0.004 * z).normalize();
      const { normal } = terrainLightingAt(x, z, surface);
      expect(normal[0]).toBeCloseTo(expected.x, 10);
      expect(normal[1]).toBeCloseTo(expected.y, 10);
      expect(normal[2]).toBeCloseTo(expected.z, 10);
    }
  });
  it("keeps level building bases above their footprint terrain", () => {
    for (const f of campusFeatures) {
      const { base, low } = buildingElevation(f);
      expect(base).toBeGreaterThan(low);
      for (const polygon of f.polygons) {
        for (const [x, z] of polygon[0])
          expect(groundHeightAt(x, z)).toBeLessThanOrEqual(
            f.profile === "sc" ? base + f.height : base,
          );
        const xs = polygon[0].map((p) => p[0]),
          zs = polygon[0].map((p) => p[1]);
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
              pointInPolygon(x, z, polygon[0]) &&
              !polygon.slice(1).some((h) => pointInPolygon(x, z, h))
            )
              expect(groundHeightAt(x, z), f.id).toBeLessThanOrEqual(
                f.profile === "sc" ? base + f.height : base,
              );
      }
    }
  });
});
describe("road-crossing bridges", () => {
  it("uses straight walking decks, with level Arts and Student Center spans", () => {
    expect(campusBridges).toHaveLength(10);
    for (const bridge of campusBridges) {
      expect(bridge.nearRoads.length, bridge.name).toBeGreaterThan(0);
      const a = bridge.deckAt(0),
        b = bridge.deckAt(bridge.length);
      for (let i = 0; i <= 20; i++)
        expect(bridge.deckAt((bridge.length * i) / 20)).toBeCloseTo(
          a + ((b - a) * i) / 20,
          10,
        );
      if (bridge.level) expect(a).toBe(b);
    }
  });
  it("puts road clearance into recessed road beds rather than bridge camber", () => {
    const arts = campusBridges.find((b) => b.style === "arts")!;
    const crossing = arts.crossings[0];
    expect(gradedHeightAt(...crossing.point)).toBeLessThan(
      landscapeHeightAt(...crossing.point),
    );
    expect(arts.deckAt(0) - groundHeightAt(...crossing.point)).toBeGreaterThan(
      arts.clearance,
    );
    for (const b of campusBridges.filter((b) => b.level))
      for (const [end, s] of [0, b.length].entries()) {
        if (b.elevatedLandings?.includes(end)) continue;
        expect(
          Math.abs(b.deckAt(s) - groundHeightAt(...b.pointAt(s))),
        ).toBeLessThan(0.3);
      }
  });
  it("preserves published underside clearance across the roadway and deck width", () => {
    for (const b of campusBridges) {
      let checks = 0;
      for (let s = 0.13; s < b.length; s += 0.4) {
        const p = b.pointAt(s),
          a = b.pointAt(s - 0.1),
          c = b.pointAt(s + 0.1),
          angle = Math.atan2(c[1] - a[1], c[0] - a[0]);
        for (const side of [-1, -0.5, 0, 0.5, 1]) {
          const x = p[0] - ((Math.sin(angle) * b.width) / 2) * side,
            z = p[1] + ((Math.cos(angle) * b.width) / 2) * side;
          if (
            !b.nearRoads.some((r) =>
              r.points.some(
                (v, i) =>
                  i > 0 &&
                  distanceToRoad(x, z, r.points[i - 1], v) <= r.width / 2,
              ),
            )
          )
            continue;
          expect(
            b.deckAt(s) - b.thickness - groundHeightAt(x, z),
            `${b.name} @ ${s}`,
          ).toBeGreaterThanOrEqual(b.clearance);
          checks++;
        }
      }
      expect(checks).toBeGreaterThan(0);
    }
  });
  it("connects Mesa Parking's third floor without excavating Mesa Road", () => {
    const bridge = campusBridges.find((b) => b.id === "w155705065")!;
    const garage = campusFeatures.find((f) => f.id === "w171169301")!;
    expect(bridge.deckAt(0)).toBeCloseTo(
      buildingElevation(garage).base + (2 * garage.height) / garage.levels,
      8,
    );
    expect(bridge.deckAt(bridge.length)).toBe(bridge.deckAt(0));
    for (const crossing of bridge.crossings)
      for (const along of [-20, -10, 0, 10, 20]) {
        const x = crossing.point[0] + crossing.tangent[0] * along,
          z = crossing.point[1] + crossing.tangent[1] * along;
        expect(gradedHeightAt(x, z)).toBeCloseTo(landscapeHeightAt(x, z), 8);
      }
  });
  it("retains the lower Student Center plaza below its second-floor terrace", () => {
    const bridge = campusBridges.find((b) => b.id === "w624135494")!;
    const building = campusFeatures.find(
      (f) => f.id === bridge.attachment!.buildingId,
    )!;
    expect(bridge.deckAt(bridge.length)).toBeCloseTo(
      buildingElevation(building).base + building.height / building.levels,
      8,
    );
    expect(bridge.elevatedLandings).toContain(1);
    const platform = studentCenterTerrace(bridge);
    expect(
      platform[0].y - groundHeightAt(platform[0].x, platform[0].z),
    ).toBeGreaterThan(2);
    expect(platform.every((p) => p.y === bridge.deckAt(bridge.length))).toBe(
      true,
    );
    const access = studentCenterAccess(bridge);
    const area =
      Math.abs(
        platform.reduce((sum, p, i) => {
          const next = platform[(i + 1) % platform.length];
          return sum + p.x * next.z - next.x * p.z;
        }, 0),
      ) / 2;
    expect(area).toBeGreaterThan(400);
    expect(access.depth).toBeGreaterThanOrEqual(0.9);
    expect(access.stairWidth).toBeGreaterThanOrEqual(8);
    const foot = access.stairs.at(-1)!;
    expect(foot.y).toBeCloseTo(groundHeightAt(foot.x, foot.z) + 0.08, 7);
    expect(access.stairs[0].y - foot.y).toBeGreaterThan(2);
  });
  it("models the Humanities–Student Center underpass as a flat bridge", () => {
    const b = campusBridges.find((b) => b.id === "w171169276")!;
    expect(b.underpass).toBe("w1195385844");
    expect(b.deckAt(0)).toBe(b.deckAt(b.length));
  });
  it("gives Watson a slight rise, a continuous spiral ramp and separate stairs", () => {
    const bridge = campusBridges.find((b) => b.id === "w171194239")!,
      access = watsonAccess(bridge);
    expect(bridge.deckAt(bridge.length) - bridge.deckAt(0)).toBeCloseTo(
      0.75,
      8,
    );
    expect(access.ramp[0].y).toBe(bridge.deckAt(bridge.length));
    const exit = campusPaths.find((p) => p.sourceId === "w171194224")!
        .points[0],
      end = access.ramp.at(-1)!;
    expect(end.x).toBeCloseTo(exit[0], 6);
    expect(end.z).toBeCloseTo(exit[1], 6);
    expect(end.y).toBeCloseTo(groundHeightAt(...exit) + 0.08, 6);
    for (let i = 1; i < access.ramp.length; i++)
      expect(access.ramp[i].y).toBeLessThanOrEqual(access.ramp[i - 1].y);
    expect(access.stairs).toHaveLength(2);
    const sourceSpiral = campusPaths.find((p) => p.sourceId === "w171194224")!;
    for (const [x, z] of sourceSpiral.points)
      expect(
        access.ramp.some((p) => Math.hypot(p.x - x, p.z - z) < 0.001),
      ).toBe(true);
    expect(modeledAccessPathIds.has(sourceSpiral.sourceId)).toBe(true);
    for (const stair of access.stairs) {
      expect(stair.points.length).toBeGreaterThan(3);
      expect(stair.width).toBeGreaterThanOrEqual(3.5);
      expect(stair.top.y - stair.bottom.y).toBeGreaterThan(2);
    }
  });
  it("raises both exterior bridges onto four platforms while preserving the road grade", () => {
    for (const id of ["w171169265", "w1196280279"]) {
      const bridge = campusBridges.find((b) => b.id === id)!;
      expect(bridge.deckAt(0)).toBe(bridge.deckAt(bridge.length));
      const platforms = exteriorBridgeAccess(bridge);
      expect(platforms).toHaveLength(2);
      for (const platform of platforms) {
        const p = platform.center,
          foot = platform.stairs.at(-1)!;
        expect(p.y - groundHeightAt(p.x, p.z)).toBeGreaterThan(1);
        expect(platform.width).toBeGreaterThan(bridge.width);
        expect(platform.stairs[0].y).toBe(p.y);
        expect(foot.y).toBeCloseTo(groundHeightAt(foot.x, foot.z) + 0.08, 7);
      }
      for (const crossing of bridge.crossings)
        expect(gradedHeightAt(...crossing.point)).toBeCloseTo(
          landscapeHeightAt(...crossing.point),
          8,
        );
    }
  });
  it("creates finite, unselectable geometry with upward facing deck surfaces", () => {
    const group = createCampusBridges();
    let upward = 0;
    group.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      const positions = o.geometry.getAttribute("position"),
        normals = o.geometry.getAttribute("normal"),
        ids = o.geometry.getAttribute("buildingId");
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getY(i))).toBe(true);
        expect(ids.getX(i)).toBe(0);
        if (normals.getY(i) > 0.95) upward++;
      }
    });
    expect(upward).toBeGreaterThan(500);
    disposeGroup(group);
  });
});
