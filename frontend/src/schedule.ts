import type { Room, Snapshot, Interval, WeeklySchedule } from "./model";
import { addDays, startOfWeek, validDate } from "./dates";

export interface Term {
  id: string;
  year: string;
  quarter: string;
  instructionStart: string;
  instructionEnd: string;
  finalsStart: string;
  finalsEnd: string;
  socAvailable: string;
}
export interface MeetingRule {
  term: string;
  days: number[];
  start: number;
  end: number;
}
export interface Exam {
  term: string;
  date: string;
  start: number;
  end: number;
}
export type Coverage = "known" | "unknown" | "closed";
const between = (date: string, start: string, end: string) =>
  date >= start && date <= end;
function merge(spans: Interval[]) {
  const result: Interval[] = [];
  for (const [start, end] of spans.sort((a, b) => a[0] - b[0])) {
    const previous = result.at(-1);
    if (previous && start <= previous[1])
      previous[1] = Math.max(previous[1], end);
    else result.push([start, end]);
  }
  return result;
}
export function projectWeek(
  data: Snapshot,
  selectedDate: string,
  now = Date.now(),
): Snapshot {
  if (data.schemaVersion !== 2) return data;
  const weekStart = startOfWeek(selectedDate),
    terms = new Map(data.terms!.map((t) => [t.id, t]));
  const stale =
    data.metadata.mode === "live" &&
    now - Date.parse(data.metadata.fetchedAt) > 48 * 3600000;
  const rooms = data.rooms.map((room) => {
    const schedule: Interval[][] = [],
      coverage: Coverage[] = [];
    for (let day = 0; day < 7; day++) {
      const date = addDays(weekStart, day),
        spans: Interval[] = [];
      const inRange = between(
        date,
        data.metadata.dateRange!.start,
        data.metadata.dateRange!.end,
      );
      let known = false,
        uncertain = !inRange;
      for (const id of room.terms || []) {
        const term = terms.get(id)!;
        if (between(date, term.instructionStart, term.instructionEnd)) {
          known = true;
          for (const rule of room.meetings || [])
            if (rule.term === id && rule.days.includes(day))
              spans.push([rule.start, rule.end]);
        } else if (between(date, term.finalsStart, term.finalsEnd)) {
          known = true;
          if (room.uncertainFinals?.includes(id)) uncertain = true;
        }
        // Some exams occur on the final instructional day (notably summer).
        for (const exam of room.exams || [])
          if (exam.term === id && exam.date === date) {
            spans.push([exam.start, exam.end]);
            known = true;
          }
      }
      schedule.push(inRange ? merge(spans) : []);
      coverage.push(
        stale || uncertain || !known
          ? "unknown"
          : day === 0 || day === 6
            ? "closed"
            : "known",
      );
    }
    return { ...room, schedule: schedule as WeeklySchedule, coverage, stale };
  });
  return { ...data, rooms, metadata: { ...data.metadata, weekStart } };
}
export function roomTerm(room: Room, data: Snapshot, selectedDate: string) {
  return (
    data.terms?.find(
      (t) =>
        room.terms?.includes(t.id) &&
        between(selectedDate, t.instructionStart, t.finalsEnd),
    )?.id ||
    room.terms?.[0] ||
    data.metadata.term
  );
}
export function dataNotice(data: Snapshot, date: string, now = Date.now()) {
  if (data.metadata.mode !== "live") return "";
  if (now - Date.parse(data.metadata.fetchedAt) > 48 * 3600000)
    return "Schedules are more than two days old. Availability is unknown until the next successful update.";
  if (
    data.metadata.dateRange &&
    !between(date, data.metadata.dateRange.start, data.metadata.dateRange.end)
  )
    return "Schedules have not been published for this date. Availability is unknown.";
  if (
    data.terms &&
    !data.terms.some(
      (t) =>
        between(date, t.instructionStart, t.instructionEnd) ||
        between(date, t.finalsStart, t.finalsEnd),
    )
  )
    return "Academic break: room availability is unknown. Room browsing remains available.";
  if (now - Date.parse(data.metadata.fetchedAt) > 26 * 3600000)
    return "The daily schedule update is overdue. Showing the last successful publication.";
  return "";
}

export function validateSnapshot(input: unknown): Snapshot {
  if (!input || typeof input !== "object")
    throw new Error("The schedule snapshot is incomplete.");
  const data = input as Snapshot;
  if (
    !data.metadata?.term ||
    !Number.isFinite(Date.parse(data.metadata.fetchedAt)) ||
    !Array.isArray(data.rooms) ||
    !data.rooms.length
  )
    throw new Error("The schedule snapshot is incomplete.");
  const interval = (start: number, end: number) =>
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start < end &&
    end <= 1440;
  const ids = new Set<string>();
  if (data.schemaVersion === 2) {
    if (
      !data.terms?.length ||
      !validDate(data.metadata.dateRange?.start) ||
      !validDate(data.metadata.dateRange?.end) ||
      data.metadata.dateRange!.start > data.metadata.dateRange!.end ||
      !["live", "demo"].includes(data.metadata.mode || "")
    )
      throw new Error("Invalid dated schedule metadata.");
    const terms = new Set(data.terms.map((t) => t.id));
    if (terms.size !== data.terms.length)
      throw new Error("Duplicate schedule term.");
    for (const t of data.terms)
      if (
        ![
          t.instructionStart,
          t.instructionEnd,
          t.finalsStart,
          t.finalsEnd,
        ].every(validDate) ||
        t.instructionStart > t.instructionEnd ||
        t.finalsStart > t.finalsEnd
      )
        throw new Error("Invalid term dates.");
    for (const room of data.rooms) {
      if (
        !Array.isArray(room.meetings) ||
        !Array.isArray(room.exams) ||
        !Array.isArray(room.terms) ||
        !room.terms.length ||
        room.terms.some((id) => !terms.has(id)) ||
        !Array.isArray(room.uncertainFinals) ||
        room.uncertainFinals.some((id) => !room.terms!.includes(id))
      )
        throw new Error("Invalid dated room schedule.");
      for (const rule of room.meetings)
        if (
          !room.terms.includes(rule.term) ||
          !Array.isArray(rule.days) ||
          !rule.days.length ||
          rule.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
          !interval(rule.start, rule.end)
        )
          throw new Error("Invalid meeting rule.");
      for (const exam of room.exams)
        if (
          !room.terms.includes(exam.term) ||
          !validDate(exam.date) ||
          !interval(exam.start, exam.end)
        )
          throw new Error("Invalid exam.");
      room.schedule = [[], [], [], [], [], [], []];
    }
  }
  for (const room of data.rooms) {
    if (
      typeof room.id !== "string" ||
      ids.has(room.id) ||
      typeof room.building !== "string" ||
      typeof room.number !== "string" ||
      !Array.isArray(room.schedule) ||
      room.schedule.length !== 7
    )
      throw new Error("Invalid room record in the snapshot.");
    ids.add(room.id);
    for (const day of room.schedule) {
      let previous = -1;
      if (!Array.isArray(day)) throw new Error("Invalid daily schedule.");
      for (const span of day) {
        if (
          !Array.isArray(span) ||
          span.length !== 2 ||
          !interval(span[0], span[1]) ||
          span[0] < previous
        )
          throw new Error("Invalid schedule interval.");
        previous = span[1];
      }
    }
  }
  return data;
}
