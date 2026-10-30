import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/?map=alp");
  await page.locator('.iso-stage[data-ready="true"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
test("ALP architecture renders within budgets across responsive views", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  const stage = page.locator(".iso-stage");
  expect(Number(await stage.getAttribute("data-triangles"))).toBeLessThan(
    150000,
  );
  expect(Number(await stage.getAttribute("data-draw-calls"))).toBeLessThan(150);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("alp-home.png") });
  const before = Number(await stage.getAttribute("data-frames"));
  await page.waitForTimeout(200);
  expect(Number(await stage.getAttribute("data-frames"))).toBe(before);
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: "Collapse room list" }).click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: info.outputPath("alp-expanded.png") });
  }
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () => Number(await stage.getAttribute("data-frames")))
    .toBeGreaterThan(before);
  await page.screenshot({ path: info.outputPath("alp-close.png") });
  expect(errors).toEqual([]);
});
test("availability badges and building selection use the existing schedule", async ({
  page,
}, info) => {
  await ready(page);
  const alp = page.getByRole("button", {
    name: "Anteater Learning Pavilion: 2 rooms free",
    exact: true,
  });
  await expect(alp).toBeVisible();
  await alp.click();
  await expect(page).toHaveURL(/map=alp/);
  await expect(page).toHaveURL(/building=alp/);
  await expect(page.locator(".building-heading")).toContainText(
    "Anteater Learning Pavilion",
  );
  await expect(page.locator(".room-select").first()).toBeVisible();
  // Selection adds a depth-tested silhouette pass; keep its total GPU work
  // inside the same budget and capture it for visual inspection.
  await expect
    .poll(async () =>
      Number(await page.locator(".iso-stage").getAttribute("data-draw-calls")),
    )
    .toBeGreaterThan(60);
  expect(
    Number(await page.locator(".iso-stage").getAttribute("data-draw-calls")),
  ).toBeLessThan(150);
  expect(
    Number(await page.locator(".iso-stage").getAttribute("data-triangles")),
  ).toBeLessThan(150000);
  if (page.viewportSize()!.width >= 1024)
    await page.screenshot({ path: info.outputPath("alp-selected.png") });
  await page.goto("/?map=alp");
  await page.locator(".iso-stage[data-ready]").waitFor();
  await page.getByRole("slider").focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("button", {
      name: "Anteater Learning Pavilion: 0 rooms free",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/?map=alp&room=ssl-122");
  await page.locator(".iso-stage[data-ready]").waitFor({ state: "attached" });
  if (page.viewportSize()!.width >= 1024)
    await expect(page.locator(".iso-footer")).toContainText(
      "Outside ALP preview",
    );
  await expect(page.locator(".detail-heading h1")).toHaveText("SSL 122");
});
test("keyboard navigation pans, zooms, and resets the fixed camera", async ({
  page,
}) => {
  await ready(page);
  const stage = page.locator(".iso-stage"),
    alp = page.locator(".iso-label").filter({ hasText: "ALP" });
  const initial = await alp.getAttribute("style");
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => alp.getAttribute("style")).not.toBe(initial);
  await page.keyboard.press("+");
  await page.keyboard.press("Home");
  await expect.poll(() => alp.getAttribute("style")).toBe(initial);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect.poll(() => alp.getAttribute("style")).not.toBe(initial);
  await page.getByRole("button", { name: "Reset ALP view" }).click();
  await expect.poll(() => alp.getAttribute("style")).toBe(initial);
});
test("context loss leaves a readable fallback and usable room search", async ({
  page,
}) => {
  await ready(page);
  await page.locator(".iso-stage canvas").evaluate((el) => {
    (el as HTMLCanvasElement)
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!
      .loseContext();
  });
  await expect(
    page.getByText("3D view unavailable.", { exact: false }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".iso-fallback img")
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Retry map" }).click();
  await expect(page.locator(".iso-stage canvas")).toBeVisible();
  await page.getByPlaceholder("Search rooms, buildings or codes").fill("ALP");
  await expect(page).toHaveURL(/q=ALP/);
});

test("drag and pinch navigate without selecting a building", async ({
  page,
}, info) => {
  await ready(page);
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: "Collapse room list" }).click();
    await page.waitForTimeout(350);
  }
  const stage = page.locator(".iso-stage"),
    box = (await stage.boundingBox())!;
  const x = box.x + box.width * 0.4,
    y = box.y + box.height * 0.65;
  const before = await page
    .locator(".iso-label")
    .filter({ hasText: "ALP" })
    .getAttribute("style");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/building=/);
  await expect
    .poll(() =>
      page
        .locator(".iso-label")
        .filter({ hasText: "ALP" })
        .getAttribute("style"),
    )
    .not.toBe(before);
  if (info.project.use.isMobile) {
    const frames = Number(await stage.getAttribute("data-frames"));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: x - 25, y, id: 0 },
        { x: x + 25, y, id: 1 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x - 55, y, id: 0 },
        { x: x + 55, y, id: 1 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
    await expect
      .poll(async () => Number(await stage.getAttribute("data-frames")))
      .toBeGreaterThan(frames);
    await expect(page).not.toHaveURL(/building=/);
  }
});

test("unavailable WebGL keeps the preview recoverable", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl2") return null;
      return (original as Function).apply(this, [type, ...args]);
    } as typeof original;
  });
  await page.goto("/?map=alp");
  await expect(page.getByRole("button", { name: "Retry map" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "155 rooms free", exact: true }),
  ).toBeVisible();
});
