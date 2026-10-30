import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const dataset = JSON.parse(
  readFileSync(new URL("../../fixtures/dated.json", import.meta.url), "utf8"),
);
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-29T21:15:00Z"));
  await page.route("**/data/snapshot.json", (route) =>
    route.fulfill({ json: structuredClone(dataset) }),
  );
});

test("dated weeks navigate, preserve context, restore history and return to Now", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator('.iso-stage[data-ready="true"]').waitFor();
  const nav = page.locator(".results-panel .week-navigation"),
    picker = page.locator(".results-panel .day-picker");
  await expect(nav).toContainText("Oct 25–31, 2026");
  await expect(
    picker.getByRole("button", { name: "Thursday, Oct 29, 2026" }),
  ).toHaveAttribute("aria-pressed", "true");
  await nav.getByRole("button", { name: "Next week" }).click();
  await expect(nav).toContainText("Nov 1–7, 2026");
  await expect(page).toHaveURL(/date=2026-11-05/);
  await expect(page).toHaveURL(/time=14%3A15/);
  await picker.getByRole("button", { name: "Monday, Nov 2, 2026" }).click();
  await expect(page).toHaveURL(/date=2026-11-02/);
  await page.goBack();
  await expect(
    picker.getByRole("button", { name: "Thursday, Nov 5, 2026" }),
  ).toHaveAttribute("aria-pressed", "true");
  await nav.getByRole("button", { name: "Now", exact: true }).click();
  await expect(nav).toContainText("Oct 25–31, 2026");
  await expect(page).not.toHaveURL(/date=/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("dated-week.png") });
  if (page.viewportSize()!.width < 1024) {
    await expect(page.locator(".full-campus-map .iso-heading")).toBeHidden();
    await expect(page.locator(".campus-district-menu")).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test("room finals use actual dates, never repeat, and share the selected context", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        (window as any).sharedRoom = data;
      },
    });
  });
  await page.goto("/?room=alp-1100&date=2026-12-08&time=13:30");
  const room = page.locator(".room-detail"),
    nav = room.locator(".week-navigation");
  await expect(room.locator(".detail-status")).toContainText("In use");
  await expect(nav).toContainText("Dec 6–12, 2026");
  await expect(
    room.getByRole("button", { name: "Tuesday, Dec 8, 2026" }),
  ).toHaveAttribute("aria-pressed", "true");
  await room.getByRole("button", { name: "Share room", exact: true }).click();
  const shared = await page.evaluate(() => (window as any).sharedRoom.url);
  expect(new URL(shared).searchParams.get("date")).toBe("2026-12-08");
  expect(new URL(shared).searchParams.get("time")).toBe("13:30");
  await page.screenshot({ path: info.outputPath("finals-week.png") });
  await nav.getByRole("button", { name: "Next week" }).click();
  await expect(nav).toContainText("Dec 13–19, 2026");
  await expect(room.locator(".detail-status")).toContainText(
    "Schedule unavailable",
  );
  await expect(room.locator(".busy-segment")).toHaveCount(0);
  await nav.getByRole("button", { name: "Previous week" }).click();
  await expect(room.locator(".detail-status")).toContainText("In use");
  await page.goto("/?room=alp-1100&date=2026-12-05&time=08:30");
  await expect(room.locator(".detail-status")).toContainText("In use");
  await page.goto("/?room=alp-1100&date=2027-01-04&time=10:30");
  await expect(room.locator(".detail-status")).toContainText("In use");
  await expect(nav).toContainText("Jan 3–9, 2027");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("range boundaries and unknown finals do not claim free rooms", async ({
  page,
}) => {
  await page.goto("/?date=2026-09-20&time=14:15");
  const panel = page.locator(".results-panel");
  await expect(
    panel.getByRole("button", { name: "Previous week" }),
  ).toBeDisabled();
  await page.goto("/?date=2027-03-20&time=14:15");
  await expect(panel.getByRole("button", { name: "Next week" })).toBeDisabled();
  await page.goto("/?room=ssl-290&date=2026-12-08&time=14:15");
  await expect(page.locator(".detail-status")).toContainText(
    "Schedule unavailable",
  );
});
