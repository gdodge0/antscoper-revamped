import { campusClock } from "./dates";
import { validateSnapshot } from "./schedule";
import type { Term, MeetingRule, Exam, Coverage } from "./schedule";
import catalog from "./data/buildings.json";
import {
  campusLocations,
  locationForCode,
  locationOfRoom,
  metersFromALP,
} from "./locations";
export type Interval = [number, number];
export type WeeklySchedule = [
  Interval[],
  Interval[],
  Interval[],
  Interval[],
  Interval[],
  Interval[],
  Interval[],
];
export interface Building {
  code: string;
  name: string;
  angle?: number;
  radius?: number;
}
export interface Room {
  id: string;
  building: string;
  number: string;
  schedule: WeeklySchedule;
  terms?: string[];
  meetings?: MeetingRule[];
  exams?: Exam[];
  uncertainFinals?: string[];
  coverage?: Coverage[];
  stale?: boolean;
}
export interface SnapshotMetadata {
  term: string;
  fetchedAt: string;
  source: string;
  bufferMinutes: number;
  sections: number;
  batches: number;
  mode?: "live" | "demo";
  terms?: string[];
  publicationId?: string;
  dateRange?: { start: string; end: string };
  weekStart?: string;
  demoDate?: string;
}
export interface Snapshot {
  schemaVersion?: number;
  terms?: Term[];
  metadata: SnapshotMetadata;
  rooms: Room[];
}
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const FULL_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const OPEN = 420,
  CLOSE = 1320;
export const buildings: Record<string, Building> = { ...catalog };
for (const location of campusLocations) {
  for (const code of new Set([location.id, ...location.codes]))
    buildings[code] = { ...buildings[code], code, name: location.name };
}
export const buildingOf = (room: Room): Building =>
  buildings[locationOfRoom(room)?.id ?? room.building] ?? {
    code: room.building,
    name: room.building.toUpperCase(),
  };
export const codeOf = (room: Room) =>
  `${room.building.toUpperCase()} ${room.number}`;
export const position = (angle: number, radius: number) => ({
  x: 50 + radius * Math.sin((angle * Math.PI) / 180),
  y: 50 - radius * Math.cos((angle * Math.PI) / 180),
});
export const origin = position(342, 33);
export function walkMinutes(building: Building) {
  const location = locationForCode(building.code);
  if (location?.status !== "verified" || !location.coordinate) return null;
  return Math.max(
    1,
    Math.round((metersFromALP(location.coordinate) * 1.3) / 80),
  );
}
export function availability(
  room: Room,
  day: number,
  time: number,
): { state: "free" | "busy" | "closed" | "unknown"; until: number } {
  if (!room.schedule || room.schedule.length !== 7)
    return { state: "unknown", until: time };
  if (room.stale) return { state: "unknown", until: time };
  if (
    !room.coverage &&
    (day === 0 || day === 6 || time < OPEN || time >= CLOSE)
  )
    return { state: "closed", until: CLOSE };
  const busy = room.schedule[day].find(([a, b]) => time >= a && time < b);
  if (busy) return { state: "busy", until: busy[1] };
  if (room.coverage?.[day] === "unknown")
    return { state: "unknown", until: time };
  if (day === 0 || day === 6 || time < OPEN || time >= CLOSE)
    return { state: "closed", until: CLOSE };
  const next = room.schedule[day].find(([a]) => a > time);
  return { state: "free", until: Math.min(CLOSE, next?.[0] ?? CLOSE) };
}
export function formatTime(minutes: number, suffix = true) {
  const h = Math.floor(minutes / 60),
    m = Math.round(minutes % 60);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${suffix ? (h < 12 ? " am" : " pm") : ""}`;
}
export function duration(minutes: number) {
  const h = Math.floor(minutes / 60),
    m = Math.floor(minutes % 60);
  return (
    [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") ||
    "0 min"
  );
}
export const percent = (minutes: number) =>
  Math.max(0, Math.min(100, ((minutes - OPEN) / (CLOSE - OPEN)) * 100));
const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
export function matches(query: string, value: string) {
  const parts = words(value);
  return words(query).every((token) =>
    parts.some((part) => part.startsWith(token)),
  );
}
export function orderRooms(rooms: Room[], nearest: boolean) {
  return [...rooms].sort(
    (a, b) =>
      (nearest
        ? (walkMinutes(buildingOf(a)) ?? 999) -
          (walkMinutes(buildingOf(b)) ?? 999)
        : 0) ||
      codeOf(a).localeCompare(codeOf(b), undefined, { numeric: true }),
  );
}
export const campusNow = campusClock;
export function websocLink(room: Room, term: string) {
  return `https://www.reg.uci.edu/perl/WebSoc?${new URLSearchParams({ YearTerm: term, Bldg: room.building.toUpperCase(), Room: room.number, ShowFinals: "1" })}`;
}
export async function loadSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch("/data/snapshot.json", { signal });
  if (!response.ok)
    throw new Error("The schedule snapshot could not be loaded.");
  return validateSnapshot(await response.json());
}
