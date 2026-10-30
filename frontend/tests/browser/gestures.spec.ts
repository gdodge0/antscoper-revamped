import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-29T21:15:00Z"));
  await page.addInitScript(() => {
    const original = history.replaceState.bind(history);
    (window as any).historyWrites = 0;
    history.replaceState = (...args) => {
      (window as any).historyWrites++;
      original(...args);
    };
  });
});

async function openDial(page: Page, time = "14:15") {
  await page.goto(`/?map=schematic&date=2026-10-29&time=${time}`);
  const slider = page.getByRole("slider", { name: "Time of day" });
  await expect(slider).toBeVisible();
  return slider;
}

async function pointer(page: Page, touch: boolean) {
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  return {
    async start(x: number, y: number) {
      if (cdp)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y, id: 0 }],
        });
      else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
    },
    async move(x: number, y: number) {
      if (cdp)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y, id: 0 }],
        });
      else await page.mouse.move(x, y);
    },
    async end(cancel = false) {
      if (cdp)
        await cdp.send("Input.dispatchTouchEvent", {
          type: cancel ? "touchCancel" : "touchEnd",
          touchPoints: [],
        });
      else await page.mouse.up();
    },
    async close() {
      await cdp?.detach();
    },
  };
}

const writes = (page: Page) =>
  page.evaluate(() => (window as any).historyWrites as number);

test("time dial reverses immediately after overshooting either end", async ({
  page,
}, info) => {
  const input = await pointer(page, !!info.project.use.isMobile);
  for (const { time, direction, edge, reversed, url } of [
    {
      time: "21:45",
      direction: -1,
      edge: "1320",
      reversed: "1290",
      url: "21:30",
    },
    { time: "07:15", direction: 1, edge: "420", reversed: "450", url: "07:30" },
  ]) {
    const slider = await openDial(page, time);
    const box = (await slider.boundingBox())!,
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await input.start(x, y);
    await input.move(x + direction * 100, y);
    await expect(slider).toHaveAttribute("aria-valuenow", edge);
    await input.move(x + direction * 80, y);
    await expect(slider).toHaveAttribute("aria-valuenow", reversed);
    await input.end();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("time"))
      .toBe(url);
    // A fresh drag also works, including movements smaller than a single time step.
    await input.start(x, y);
    for (let i = 1; i <= 10; i++) await input.move(x + i, y);
    await input.end();
    await expect(slider).toHaveAttribute(
      "aria-valuenow",
      String(Number(reversed) - 15),
    );
  }
  await input.close();
});

test("rapid dial scrubbing stays responsive and saves one URL update per gesture", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const slider = await openDial(page),
    input = await pointer(page, !!info.project.use.isMobile);
  const box = (await slider.boundingBox())!,
    x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const before = await writes(page);
  await input.start(x, y);
  for (let i = 0; i < 650; i++) await input.move(x + (i % 2 ? 90 : -90), y);
  await expect(slider).toHaveAttribute("aria-valuenow", "720");
  expect(await writes(page)).toBe(before);
  await input.end();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("time"))
    .toBe("12:00");
  expect(await writes(page)).toBe(before + 1);
  // Continue scrubbing after the stress gesture, then verify permalink persistence.
  await input.start(x, y);
  await input.move(x - 30, y);
  await input.end();
  await expect(slider).toHaveAttribute("aria-valuenow", "765");
  await page.reload();
  await expect(slider).toHaveAttribute("aria-valuenow", "765");
  await slider.focus();
  const beforeKeys = await writes(page);
  for (let i = 0; i < 80; i++) await page.keyboard.down("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "1320");
  expect(await writes(page)).toBe(beforeKeys);
  await page.keyboard.up("ArrowRight");
  expect(await writes(page)).toBe(beforeKeys + 1);
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuenow", "1305");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("time"))
    .toBe("21:45");
  if (info.project.use.isMobile) {
    await input.start(x, y);
    await input.move(x + 20, y);
    await input.end(true);
    await expect(slider).toHaveAttribute("aria-valuenow", "1275");
    await input.start(x, y);
    await input.move(x + 10, y);
    await input.end();
    await expect(slider).toHaveAttribute("aria-valuenow", "1260");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
  await page.screenshot({ path: info.outputPath("dial-after-stress.png") });
  expect(errors).toEqual([]);
  await input.close();
});
