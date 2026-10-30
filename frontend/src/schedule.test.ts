import { describe, expect, it } from "vitest";
import {
  addDays,
  campusClock,
  startOfWeek,
  validDate,
  weekLabel,
} from "./dates";
import { dataNotice, projectWeek, validateSnapshot } from "./schedule";
import { availability, type Snapshot } from "./model";
export const datedFixture = (): Snapshot =>
  validateSnapshot({
    schemaVersion: 2,
    metadata: {
      term: "2026-92",
      terms: ["2026-92"],
      fetchedAt: "2026-10-29T13:00:00Z",
      source: "https://anteaterapi.com",
      bufferMinutes: 10,
      sections: 1,
      batches: 1,
      mode: "demo",
      publicationId: "test",
      dateRange: { start: "2026-09-20", end: "2027-01-09" },
    },
    terms: [
      {
        id: "2026-92",
        year: "2026",
        quarter: "Fall",
        instructionStart: "2026-09-24",
        instructionEnd: "2026-12-04",
        finalsStart: "2026-12-05",
        finalsEnd: "2026-12-11",
        socAvailable: "2026-05-02",
      },
    ],
    rooms: [
      {
        id: "alp-1100",
        building: "alp",
        number: "1100",
        terms: ["2026-92"],
        uncertainFinals: [],
        meetings: [{ term: "2026-92", days: [1, 4], start: 840, end: 930 }],
        exams: [
          { term: "2026-92", date: "2026-12-05", start: 480, end: 610 },
          { term: "2026-92", date: "2026-12-08", start: 780, end: 910 },
        ],
      },
    ],
  });
describe("dated schedules", () => {
  it("uses instruction dates, not endlessly repeating weekly meetings", () => {
    const source = datedFixture();
    expect(
      availability(projectWeek(source, "2026-10-29").rooms[0], 4, 855).state,
    ).toBe("busy");
    const finals = projectWeek(source, "2026-12-08").rooms[0];
    expect(finals.schedule[4]).toEqual([]);
    expect(availability(finals, 2, 800).state).toBe("busy");
    expect(
      availability(projectWeek(source, "2026-12-15").rooms[0], 2, 800).state,
    ).toBe("unknown");
  });
  it("shows known Saturday exams, but never claims weekend room access", () => {
    const room = projectWeek(datedFixture(), "2026-12-05").rooms[0];
    expect(availability(room, 6, 500).state).toBe("busy");
    expect(availability(room, 6, 700).state).toBe("closed");
  });
  it("retains known conflicts but suppresses free claims for TBA finals", () => {
    const source = datedFixture();
    source.rooms[0].uncertainFinals = ["2026-92"];
    const room = projectWeek(source, "2026-12-08").rooms[0];
    expect(availability(room, 2, 800).state).toBe("busy");
    expect(availability(room, 2, 950).state).toBe("unknown");
  });
  it("rejects broken dates and marks stale or unpublished schedules unknown", () => {
    const source = datedFixture();
    source.metadata.mode = "live";
    expect(
      availability(
        projectWeek(source, "2026-10-29", Date.parse("2026-11-01T14:00:00Z"))
          .rooms[0],
        4,
        855,
      ).state,
    ).toBe("unknown");
    expect(
      dataNotice(source, "2026-10-29", Date.parse("2026-11-01T14:00:00Z")),
    ).toMatch(/two days old/);
    const broken = datedFixture();
    broken.terms![0].finalsEnd = "2026-02-30";
    expect(() => validateSnapshot(broken)).toThrow();
  });
  it("advances civil dates correctly across years, leap days and DST", () => {
    expect(addDays("2027-03-07", 7)).toBe("2027-03-14");
    expect(addDays("2027-10-31", 7)).toBe("2027-11-07");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(startOfWeek("2027-01-01")).toBe("2026-12-27");
    expect(weekLabel("2026-12-27")).toMatch(/2026.*2027/);
    expect(validDate("2027-02-29")).toBe(false);
    expect(campusClock(new Date("2027-03-14T13:00:00Z"))).toMatchObject({
      date: "2027-03-14",
      time: 360,
    });
    expect(campusClock(new Date("2027-11-07T14:00:00Z"))).toMatchObject({
      date: "2027-11-07",
      time: 360,
    });
  });
});
