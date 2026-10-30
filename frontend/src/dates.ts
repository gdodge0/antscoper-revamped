export const CAMPUS_ZONE = "America/Los_Angeles";
export function validDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function addDays(value: string, days: number) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const weekday = (value: string) =>
  new Date(`${value}T12:00:00Z`).getUTCDay();
export const startOfWeek = (value: string) => addDays(value, -weekday(value));
export function campusClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return {
    date,
    day: weekday(date),
    time: Number(part("hour")) * 60 + Number(part("minute")),
  };
}
export function dateLabel(date: string, full = false) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...(full ? { weekday: "long", year: "numeric" } : {}),
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function weekLabel(start: string) {
  const end = addDays(start, 6);
  const a = new Date(`${start}T12:00:00Z`),
    b = new Date(`${end}T12:00:00Z`);
  if (a.getUTCFullYear() !== b.getUTCFullYear())
    return `${dateLabel(start)}, ${a.getUTCFullYear()} – ${dateLabel(end)}, ${b.getUTCFullYear()}`;
  if (a.getUTCMonth() !== b.getUTCMonth())
    return `${dateLabel(start)} – ${dateLabel(end)}, ${b.getUTCFullYear()}`;
  return `${dateLabel(start)}–${b.getUTCDate()}, ${b.getUTCFullYear()}`;
}
export function urlTime(time: number) {
  return `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
}
export function parseTime(value: string | null) {
  return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    : null;
}
