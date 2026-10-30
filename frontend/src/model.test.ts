import { describe, it, expect } from "vitest";
import {
  availability,
  matches,
  orderRooms,
  formatTime,
  websocLink,
  type Room,
  type WeeklySchedule,
} from "./model";
const schedule: WeeklySchedule = [
  [],
  [
    [540, 600],
    [660, 750],
  ],
  [],
  [],
  [[840, 930]],
  [],
  [],
];
const room: Room = { id: "ssl-290", building: "ssl", number: "290", schedule };
describe("snapshot availability", () => {
  it("uses start-inclusive, end-exclusive occupancy", () => {
    expect(availability(room, 1, 540).state).toBe("busy");
    expect(availability(room, 1, 599).state).toBe("busy");
    expect(availability(room, 1, 600)).toEqual({ state: "free", until: 660 });
  });
  it("finds the next class and closes at 10 pm", () => {
    expect(availability(room, 1, 420)).toEqual({ state: "free", until: 540 });
    expect(availability(room, 1, 800)).toEqual({ state: "free", until: 1320 });
    expect(availability(room, 1, 1320).state).toBe("closed");
    expect(availability(room, 1, 419).state).toBe("closed");
  });
  it("never treats weekends as guaranteed access", () => {
    expect(availability(room, 0, 855).state).toBe("closed");
    expect(availability(room, 6, 855).state).toBe("closed");
  });
  it("returns unknown for missing schedule data", () => {
    expect(
      availability(
        { ...room, schedule: [] as unknown as WeeklySchedule },
        4,
        855,
      ).state,
    ).toBe("unknown");
  });
});
describe("search and navigation", () => {
  it("matches word prefixes, codes, and room numbers independent of case", () => {
    expect(matches("soc sci", "SSL Social Science Lab 290")).toBe(true);
    expect(matches("SSL 290", "ssl Social Science Lab 290")).toBe(true);
    expect(matches("soc sci", "Social & Behavioral Sciences Gateway")).toBe(
      true,
    );
    expect(matches("soc eng", "Social Science Lab")).toBe(false);
  });
  it("sorts numbered rooms naturally and keeps unmapped locations last", () => {
    const r2 = { ...room, id: "ssl-20", number: "20" };
    expect(orderRooms([room, r2], false)[0].number).toBe("20");
    expect(
      orderRooms([{ ...room, building: "unknown" }, room], true)[0].building,
    ).toBe("ssl");
  });
  it("formats noon, midnight, and quarter-hour values", () => {
    expect(formatTime(720)).toBe("12 pm");
    expect(formatTime(0)).toBe("12 am");
    expect(formatTime(855)).toBe("2:15 pm");
  });
  it("includes the snapshot term in the WebSOC link", () => {
    const url = new URL(websocLink(room, "2026-92"));
    expect(url.searchParams.get("Bldg")).toBe("SSL");
    expect(url.searchParams.get("YearTerm")).toBe("2026-92");
    expect(url.searchParams.get("Room")).toBe("290");
  });
});
