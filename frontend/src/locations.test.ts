import { describe, expect, it } from "vitest";
import snapshot from "../fixtures/demo.json";
import data from "../public/data/campus.json";
import {
  campusLocations,
  locationForCode,
  locationOfRoom,
  roomAtLocation,
  metersFromALP,
  campusOrigin,
} from "./locations";
import { buildingOf, orderRooms, walkMinutes, type Room } from "./model";

describe("campus location audit", () => {
  it("accounts for every scheduled room without changing stable room IDs", () => {
    const rooms = snapshot.rooms as Room[];
    expect(new Set(rooms.map((r) => r.building)).size).toBe(67);
    expect(rooms.every((r) => !!locationOfRoom(r))).toBe(true);
    expect(
      rooms.filter((r) => locationOfRoom(r)?.status === "verified"),
    ).toHaveLength(352);
    expect(
      rooms
        .filter((r) => locationOfRoom(r)?.status === "outside")
        .map((r) => r.id)
        .sort(),
    ).toEqual(["uci-barn", "uci-mc"]);
    for (const loc of campusLocations.filter((l) => l.status === "verified")) {
      expect(loc.coordinate).toHaveLength(2);
      expect(
        loc.geometryIds!.every((id) => data.buildings.some((f) => f.id === id)),
      ).toBe(true);
    }
  });
  it("separates UCI BARN and MC and never invents a shared UCI coordinate", () => {
    const barn = snapshot.rooms.find((r) => r.id === "uci-barn")! as Room;
    const medical = snapshot.rooms.find((r) => r.id === "uci-mc")! as Room;
    expect(locationOfRoom(barn)?.id).toBe("uci-barn");
    expect(locationOfRoom(medical)?.id).toBe("uci-mc");
    expect(walkMinutes(buildingOf(barn))).toBeNull();
    expect(walkMinutes(buildingOf(medical))).toBeNull();
    expect(locationForCode("uci")?.coordinate).toBeUndefined();
    expect(roomAtLocation(barn, "uci-mc")).toBe(false);
  });
  it("maps historical aliases while keeping connected Arts schedules separate", () => {
    expect(locationForCode("HHCR")?.id).toBe("hrh");
    expect(locationForCode("unexa")?.id).toBe("uea");
    expect(locationForCode("act")?.name).toBe("Art, Culture & Technology");
    const hrh = snapshot.rooms.find((r) => r.building === "hhcr")!;
    expect(roomAtLocation(hrh, "hrh")).toBe(true);
    const wsh = snapshot.rooms.find((r) => r.building === "wsh")!;
    expect(roomAtLocation(wsh, "mm")).toBe(false);
    expect(roomAtLocation(wsh, "wsh")).toBe(true);
    expect(locationForCode("wsh")?.geometryIds).toEqual(
      locationForCode("mm")?.geometryIds,
    );
  });
  it("uses physical distance from ALP and sorts unplaced rooms last", () => {
    expect(metersFromALP(campusOrigin)).toBe(0);
    expect(
      metersFromALP([campusOrigin[0], campusOrigin[1] + 0.001]),
    ).toBeCloseTo(111.32, 2);
    expect(walkMinutes({ code: "alp", name: "ALP" })).toBe(1);
    expect(walkMinutes({ code: "cohs", name: "COHS" })).toBeGreaterThan(10);
    expect(
      walkMinutes({ code: "unknown", name: "Unknown", angle: 10, radius: 30 }),
    ).toBeNull();
    const rooms = snapshot.rooms as Room[];
    const input = [
      rooms.find((r) => r.id === "uci-mc")!,
      rooms.find((r) => r.building === "ssl")!,
      rooms.find((r) => r.building === "alp")!,
    ];
    expect(orderRooms(input, true).map((r) => r.building)).toEqual([
      "alp",
      "ssl",
      "uci",
    ]);
  });
  it("preserves courtyard holes, multipart complexes, and reviewed height overrides", () => {
    expect(new Set(data.buildings.map((f) => f.id)).size).toBe(
      data.buildings.length,
    );
    const library = data.buildings.find((f) => f.profile === "slib")!;
    expect(library.polygons[0].length).toBeGreaterThan(1);
    expect(data.buildings.filter((f) => f.profile === "llib")).toHaveLength(1);
    expect(data.buildings.filter((f) => f.profile === "sstr")).toHaveLength(2);
    expect(
      data.buildings.find((f) => f.profile === "frh")!.height,
    ).toBeGreaterThan(20);
    for (const b of data.buildings)
      for (const p of b.polygons)
        for (const ring of p) {
          expect(ring[0]).toEqual(ring.at(-1));
          expect(ring.flat().every(Number.isFinite)).toBe(true);
        }
  });
});
