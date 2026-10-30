// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "./App";
vi.mock("./map/FullCampusMap", () => ({ default: () => null }));
const data = {
  metadata: {
    term: "2026-92",
    fetchedAt: "2026-10-29T20:00:00Z",
    bufferMinutes: 10,
  },
  rooms: [
    {
      id: "ssl-290",
      building: "ssl",
      number: "290",
      schedule: [[], [], [], [], [[930, 1020]], [], []],
    },
    {
      id: "alp-1100",
      building: "alp",
      number: "1100",
      schedule: [[], [], [], [], [[840, 930]], [], []],
    },
    {
      id: "ssl-105",
      building: "ssl",
      number: "105",
      schedule: [[], [], [], [], [[870, 930]], [], []],
    },
  ],
};
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", {
    value: 390,
    configurable: true,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => data }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function setup(entry = "/") {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "2 rooms free" });
  return user;
}
describe("room finder interactions", () => {
  it("filters by duration and updates for weekends", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Free 1 hr+" }));
    expect(
      screen.getByRole("heading", { name: "1 room free for an hour or more" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Saturday,/ }));
    expect(screen.getByText(/It’s the weekend/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /SSL 290, free/ })).toBeNull();
  });
  it("searches by word start and opens a building and room", async () => {
    const user = await setup();
    await user.type(
      screen.getByRole("textbox", { name: "Search rooms or buildings" }),
      "soc sci",
    );
    await user.click(
      screen.getByRole("button", { name: /Open SSL: Social Science Lab/ }),
    );
    expect(screen.getByText("2 of 2 rooms free")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "SSL 290, free until 3:30 pm" }),
    );
    expect(screen.getByRole("heading", { name: "SSL 290" })).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "This room on WebSOC" })[0]
        .getAttribute("href"),
    ).toContain("YearTerm=2026-92");
  });
  it("saves a room and shows it in saved-only results", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Save SSL 290" }));
    expect(JSON.parse(localStorage.getItem("antscoper.saved.v1")!)).toEqual([
      "ssl-290",
    ]);
    await user.click(screen.getByRole("button", { name: "Saved" }));
    expect(
      screen.getByRole("heading", { name: "Your saved rooms" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /SSL 105, free/ })).toBeNull();
  });
  it("supports keyboard time scrubbing and URL room links", async () => {
    const user = await setup("/?room=alp-1100");
    const detail = screen.getByRole("region", { name: "ALP 1100 details" });
    expect(within(detail).getByText("In use")).toBeTruthy();
    const slider = screen.getByRole("slider");
    slider.focus();
    await user.keyboard("{End}");
    expect(slider.getAttribute("aria-valuenow")).toBe("1320");
    expect(within(detail).getByText("Building usually locked")).toBeTruthy();
  });
  it("reports fetch failures and retries", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network unavailable"));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Network unavailable");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "2 rooms free" }),
      ).toBeTruthy(),
    );
  });
});
