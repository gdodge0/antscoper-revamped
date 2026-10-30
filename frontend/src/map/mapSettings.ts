export interface MapSettings {
  heightmap: boolean;
  relief: number;
  terrainShadows: boolean;
  buildingShadows: boolean;
}
export const defaultMapSettings: MapSettings = {
  heightmap: true,
  relief: 1.5,
  terrainShadows: false,
  buildingShadows: true,
};
export const mapSettingsKey = "antscoper.map-settings.v1";
export function normalizeMapSettings(value: unknown): MapSettings {
  const settings =
    value && typeof value === "object" ? (value as Partial<MapSettings>) : {};
  return {
    heightmap:
      typeof settings.heightmap === "boolean"
        ? settings.heightmap
        : defaultMapSettings.heightmap,
    relief:
      typeof settings.relief === "number" && Number.isFinite(settings.relief)
        ? Math.round(Math.max(0.5, Math.min(3, settings.relief)) * 10) / 10
        : defaultMapSettings.relief,
    terrainShadows:
      typeof settings.terrainShadows === "boolean"
        ? settings.terrainShadows
        : defaultMapSettings.terrainShadows,
    buildingShadows:
      typeof settings.buildingShadows === "boolean"
        ? settings.buildingShadows
        : defaultMapSettings.buildingShadows,
  };
}
export function readMapSettings(): MapSettings {
  try {
    return normalizeMapSettings(
      JSON.parse(localStorage.getItem(mapSettingsKey) || "null"),
    );
  } catch {
    return { ...defaultMapSettings };
  }
}
export function saveMapSettings(settings: MapSettings) {
  try {
    localStorage.setItem(mapSettingsKey, JSON.stringify(settings));
  } catch {
    /* Settings still work when browser storage is unavailable. */
  }
}
