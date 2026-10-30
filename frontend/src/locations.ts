import manifest from "./data/campus-manifest.json";

export type Coordinate = [number, number];
export interface CampusLocation {
  id: string;
  name: string;
  codes: string[];
  status: "verified" | "outside" | "unresolved";
  coordinate?: number[];
  geometryIds?: string[];
  district?: string;
  height?: number;
  references?: string[];
  note?: string;
}
export const campusLocations = manifest.locations as CampusLocation[];
export const districts = manifest.districts;
export const campusOrigin = manifest.origin;
export const campusBounds = manifest.bounds;
const byId = new Map(campusLocations.map((l) => [l.id, l]));
const aliases: Record<string, string> = manifest.codes;
const roomOverrides: Record<string, string> = manifest.roomOverrides;

export function locationForCode(code: string | null | undefined) {
  return code
    ? byId.get(aliases[code.toLowerCase()] ?? code.toLowerCase())
    : undefined;
}
export function locationOfRoom(room: { id: string; building: string }) {
  return locationForCode(roomOverrides[room.id] ?? room.building);
}
export function roomAtLocation(
  room: { id: string; building: string },
  code: string,
) {
  // Keep old /?building=uci links useful without conflating their physical pins.
  if (code === "uci") return room.building === "uci";
  return (
    (locationOfRoom(room)?.id ?? room.building) ===
    (locationForCode(code)?.id ?? code)
  );
}
export function locationStatus(location?: CampusLocation) {
  return location?.status === "outside"
    ? location.note || "Outside the academic campus map"
    : "Location not yet verified";
}
export function metersFromALP(coordinate: number[]) {
  const latitude = (campusOrigin[1] * Math.PI) / 180;
  return Math.hypot(
    (coordinate[0] - campusOrigin[0]) * 111320 * Math.cos(latitude),
    (coordinate[1] - campusOrigin[1]) * 111320,
  );
}
