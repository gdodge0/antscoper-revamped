import { describe, expect, it } from "vitest";
import { features, localPoint, ORIGIN, pointInPolygon } from "./geography";
describe("ALP geographic data", () => {
  it("projects longitude east and latitude north into meters without swapping axes", () => {
    expect(localPoint(ORIGIN)).toEqual([0, 0]);
    const east = localPoint([ORIGIN[0] + 0.001, ORIGIN[1]]);
    const north = localPoint([ORIGIN[0], ORIGIN[1] + 0.001]);
    expect(east[0]).toBeCloseTo(92.7, 0);
    expect(east[1]).toBe(0);
    expect(north[0]).toBe(0);
    expect(north[1]).toBeCloseTo(-111.32, 1);
  });
  it("has unique, closed geographic footprints for the six agreed buildings", () => {
    expect(features.map((f) => f.code).sort()).toEqual([
      "alp",
      "hg",
      "hh",
      "hib",
      "kh",
      "sh",
    ]);
    expect(new Set(features.map((f) => f.id)).size).toBe(6);
    for (const f of features) {
      expect(f.footprint[0]).toEqual(f.footprint.at(-1));
      expect(f.footprint.every((p) => p.every(Number.isFinite))).toBe(true);
      expect(f.height).toBeGreaterThan(0);
      expect(f.source).toContain("openstreetmap.org/way/");
    }
    expect(features.find((f) => f.code === "alp")?.heightSource).toContain(
      "two-/three-story",
    );
  });
  it("keeps illustrative planting outside actual building footprints", () => {
    const hh = features.find((f) => f.code === "hh")!;
    expect(pointInPolygon(hh.anchor[0], hh.anchor[1], hh.footprint)).toBe(true);
    expect(pointInPolygon(-100, 100, hh.footprint)).toBe(false);
  });
});
