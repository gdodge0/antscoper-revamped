import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page, path = "/") {
  const url = new URL(path, "http://127.0.0.1:5173");
  url.searchParams.set("map", "schematic");
  await page.goto(url.href);
  await page.locator(".app").waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (page.viewportSize()!.width >= 1024 && path === "/")
    await expect(page.locator(".room-detail")).toBeVisible();
}
async function noOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(result.scroll).toBeLessThanOrEqual(result.viewport);
  for (const selector of [".topbar", ".results-panel", ".room-detail"]) {
    const element = page.locator(selector);
    if (!(await element.isVisible())) continue;
    const rect = await element.boundingBox();
    expect(rect!.x, `${selector} left edge`).toBeGreaterThanOrEqual(-1);
    expect(rect!.x + rect!.width, `${selector} right edge`).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    );
  }
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-29T21:15:00Z") });
});

test("render all mockup states without overflow or browser errors", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const shot = async (name: string) => {
    await noOverflow(page);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: info.outputPath(`${name}.png`),
      animations: "disabled",
    });
  };
  await ready(page);
  await expect(page.locator(".topbar .mobile-back")).toBeHidden();
  const outlines = await page
    .locator("button")
    .evaluateAll(
      (buttons) =>
        buttons.filter(
          (b) =>
            !b.matches(":focus-visible") &&
            getComputedStyle(b).outlineStyle !== "none",
        ).length,
    );
  expect(outlines, "unfocused buttons must not have focus outlines").toBe(0);
  await shot("home");
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: "Collapse room list" }).tap();
    await expect(page.locator(".app")).toHaveClass(/sheet-collapsed/);
    await expect(page.locator(".panel-content")).toBeHidden();
    await expect
      .poll(async () => (await page.locator(".results-panel").boundingBox())!.y)
      .toBeGreaterThan(page.viewportSize()!.height - 120);
    const ring = await page.locator(".outer-ring").boundingBox();
    expect(
      ring!.width,
      "folded map should show most of the campus ring",
    ).toBeLessThan(page.viewportSize()!.width * 1.5);
    await shot("map-expanded");
    await page.getByRole("button", { name: "Expand room list" }).tap();
    await expect(page.locator(".panel-content")).toBeVisible();
  }
  await ready(page, "/?building=ssl");
  await expect(page.locator(".building-heading h2")).toContainText(
    "Social Science Lab",
  );
  if (page.viewportSize()!.width < 1024) {
    await expect(page.getByRole("slider")).toBeHidden();
    const row = await page.locator(".room-select").first().boundingBox();
    expect(row!.height).toBeLessThanOrEqual(44);
  }
  await shot("building");
  await ready(page, "/?q=soc+sci");
  await expect(page.locator(".building-results mark").first()).toHaveText(
    "Soc",
  );
  await shot("search");
  await ready(page, "/?room=ssl-122");
  await expect(page.locator(".detail-heading h1")).toHaveText("SSL 122");
  await expect(page.locator(".week")).toBeVisible();
  const week = await page.locator(".week").boundingBox();
  expect(week!.height).toBeGreaterThan(
    page.viewportSize()!.width < 1024 ? 300 : 150,
  );
  await shot("room");
  expect(errors).toEqual([]);
});

test("search, building selection, room navigation, and saved persistence", async ({
  page,
}) => {
  await ready(page);
  const input = page.getByRole("textbox", {
    name: "Search rooms or buildings",
  });
  await input.fill("soc sci");
  await page
    .getByRole("button", { name: "Open SSL: Social Science Lab", exact: true })
    .click();
  await expect(input).toHaveValue("Social Science Lab");
  await page.locator("#room-ssl-122").click();
  await expect(page.locator(".detail-heading h1")).toHaveText("SSL 122");
  await page.getByRole("button", { name: "Save room", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unsave room", exact: true }),
  ).toBeVisible();
  const close =
    page.viewportSize()!.width < 1024
      ? page.getByRole("button", { name: "Free rooms", exact: true })
      : page.getByRole("button", { name: "Close room details" });
  await close.click();
  await expect(page.locator(".room-detail")).toHaveCount(0);
  await page.goto("/?map=schematic");
  await page.getByRole("button", { name: "Saved rooms (1)" }).click();
  await expect(
    page.getByRole("heading", { name: "Your saved rooms" }),
  ).toBeVisible();
  await expect(page.locator(".room-select")).toHaveCount(1);
  await expect(page.locator("#room-ssl-122")).toBeVisible();
  await page.getByRole("button", { name: "Unsave SSL 122" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep a few favorites." }),
  ).toBeVisible();
});

test("weekday, duration, clock, and keyboard time controls", async ({
  page,
}) => {
  await ready(page);
  const initial = await page.locator(".room-select").count();
  await page.getByRole("button", { name: "Free 1 hr+" }).click();
  await expect(
    page.getByRole("button", { name: "Free 1 hr+" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(".room-select").count()).toBeLessThan(initial);
  const slider = page.getByRole("slider");
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "420");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "435");
  await page.keyboard.press("End");
  await expect(page.locator(".notice")).toContainText(
    "Outside usual building hours",
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".time-heading h2")).toHaveText("Oct 29, 2:15 pm");
  await page
    .locator(".results-panel .day-picker")
    .getByRole("button", { name: /^Saturday,/ })
    .click();
  await expect(page.locator(".notice")).toContainText("weekend");
});

test("map selection, keyboard focus, and about dialog", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to rooms" })).toBeFocused();
  expect(
    await page
      .getByRole("link", { name: "Skip to rooms" })
      .evaluate((e) => getComputedStyle(e).outlineWidth),
  ).toBe("2px");
  await page.locator(".map-marker").filter({ hasText: "SSL" }).first().click();
  await expect(page.locator(".building-heading h2")).toContainText(
    "Social Science Lab",
  );
  await page.goto("/?map=schematic");
  await page
    .getByRole("button", { name: "About the schedule snapshot", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
