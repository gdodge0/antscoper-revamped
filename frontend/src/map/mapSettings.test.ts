import { describe, expect, it } from "vitest";
import { defaultMapSettings, normalizeMapSettings } from "./mapSettings";

describe("saved map settings", () => {
  it("defaults to heightmap on and 1.5 times relief", () => {
    expect(defaultMapSettings).toEqual({
      heightmap: true,
      relief: 1.5,
      terrainShadows: false,
      buildingShadows: true,
    });
    for (const value of [
      null,
      "bad",
      {},
      { heightmap: "true", relief: "2" },
      { relief: NaN },
    ])
      expect(normalizeMapSettings(value)).toEqual(defaultMapSettings);
  });
  it("keeps saved choices within the slider's supported range", () => {
    expect(normalizeMapSettings({ heightmap: true, relief: 9 })).toEqual({
      ...defaultMapSettings,
      heightmap: true,
      relief: 3,
    });
    expect(normalizeMapSettings({ heightmap: false, relief: -2 })).toEqual({
      ...defaultMapSettings,
      heightmap: false,
      relief: 0.5,
    });
    expect(normalizeMapSettings({ heightmap: true, relief: 1.79 })).toEqual({
      ...defaultMapSettings,
      heightmap: true,
      relief: 1.8,
    });
  });
  it("migrates older preferences and validates independent shadow choices", () => {
    expect(normalizeMapSettings({ heightmap: true, relief: 2 })).toEqual({
      ...defaultMapSettings,
      heightmap: true,
      relief: 2,
    });
    expect(
      normalizeMapSettings({ terrainShadows: true, buildingShadows: false }),
    ).toEqual({
      ...defaultMapSettings,
      terrainShadows: true,
      buildingShadows: false,
    });
    expect(
      normalizeMapSettings({ terrainShadows: "yes", buildingShadows: null }),
    ).toEqual(defaultMapSettings);
  });
});
