import { test, expect, type Page } from "@playwright/test";

const stageOf = (page: Page) => page.locator(".iso-stage");
const mobile = (page: Page) => page.viewportSize()!.width < 1024;

async function ready(page: Page, map = "campus") {
  await page.goto(`/?map=${map}&date=2026-10-29&time=14:15`);
  await expect(stageOf(page)).toHaveAttribute("data-ready", "true", {
    timeout: 20000,
  });
  await page.evaluate(() => document.fonts.ready);
  if (mobile(page)) {
    await page.getByRole("button", { name: "Collapse room list" }).click();
    await expect(page.locator(".results-panel")).toHaveCSS(
      "top",
      `${page.viewportSize()!.height - 96}px`,
    );
  }
}

async function buildingLabel(page: Page) {
  const labels = page.locator(
    ".iso-label[aria-pressed]:not(.is-landmark):not([hidden])",
  );
  if (!(await labels.count())) {
    await page.locator(".district-label:not([hidden])").first().click();
    await expect(stageOf(page)).toHaveAttribute("data-view", "district");
    await settled(page);
  }
  await expect(labels.first()).toBeVisible();
  return labels.first();
}

async function camera(page: Page) {
  return stageOf(page).evaluate((el) => ({
    zoom: Number((el as HTMLElement).dataset.zoom),
    target: JSON.parse((el as HTMLElement).dataset.target!) as number[],
  }));
}

async function settled(page: Page) {
  // A URL can commit before the next rendered frame reports its new motion.
  await expect(stageOf(page)).toHaveAttribute(
    "data-selected",
    new URL(page.url()).searchParams.get("building") ?? "",
  );
  await expect(stageOf(page)).toHaveAttribute("data-animating", "false");
}

async function pauseAnimationClock(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60000));
}

async function sampleCameraMotion(page: Page) {
  // Sample the first frame, midpoint, and end without depending on the CI
  // renderer producing a minimum frame rate during the 380 ms transition.
  const samples = [];
  for (const milliseconds of [16, 164, 220]) {
    await page.clock.fastForward(milliseconds);
    samples.push(await camera(page));
  }
  return samples;
}

async function blankMapClick(page: Page) {
  const box = (await stageOf(page).boundingBox())!;
  // The wide tablet crop includes IAB at the left midpoint; use the open ground
  // below it. In the taller crops, that building is at the lower-left edge.
  const y = box.width / box.height > 1.5 ? box.height - 40 : box.height / 2;
  await page.mouse.click(box.x + 12, box.y + y);
}

for (const reducedMotion of [false, true]) {
  test(`building groups ${reducedMotion ? "respect reduced motion" : "animate into view"} without selecting a building or animating back`, async ({
    page,
  }, info) => {
    await page.clock.install();
    await page.emulateMedia({
      reducedMotion: reducedMotion ? "reduce" : "no-preference",
    });
    await ready(page);
    await pauseAnimationClock(page);
    const before = await camera(page);
    const url = page.url();
    if (reducedMotion && !mobile(page))
      await page
        .getByRole("combobox", { name: "Explore a campus district" })
        .selectOption("humanities");
    else await page.locator(".district-label:not([hidden])").first().click();
    const [first, middle, focused] = await sampleCameraMotion(page);
    await expect(stageOf(page)).toHaveAttribute("data-view", "district");
    await settled(page);
    expect(focused.zoom).toBeGreaterThan(before.zoom);
    if (reducedMotion) {
      expect(first).toEqual(focused);
      expect(middle).toEqual(focused);
    } else {
      expect(first.zoom).toBeGreaterThan(before.zoom);
      expect(middle.zoom).toBeGreaterThan(first.zoom);
      expect(focused.zoom).toBeGreaterThan(middle.zoom);
    }
    await expect(page).toHaveURL(url);
    await expect(page.locator('.iso-label[aria-pressed="true"]')).toHaveCount(
      0,
    );
    await expect(page.locator(".building-heading")).toHaveCount(0);
    if (mobile(page))
      await expect(page.locator(".app")).toHaveClass(/sheet-collapsed/);
    await stageOf(page).focus();
    await page.keyboard.press("Escape");
    await expect(stageOf(page)).toHaveAttribute("data-animating", "false");
    await page.clock.fastForward(450);
    expect(await camera(page)).toEqual(focused);
    await expect(page).toHaveURL(url);
    await page.screenshot({ path: info.outputPath("building-group.png") });
  });
}

test("click away clears the permalink and animates back to the previous map and sheet", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await ready(page);
  const label = await buildingLabel(page);
  await pauseAnimationClock(page);
  const before = await camera(page);
  await label.click();
  await expect(page).toHaveURL(/building=/);
  await expect(page.locator(".building-heading")).toBeVisible();
  const [first, middle, selected] = await sampleCameraMotion(page);
  await settled(page);
  expect(first.zoom).toBeGreaterThan(before.zoom);
  expect(middle.zoom).toBeGreaterThan(first.zoom);
  expect(selected.zoom).toBeGreaterThan(middle.zoom);
  await page.screenshot({ path: info.outputPath("building-selected.png") });
  await blankMapClick(page);
  await expect(page).not.toHaveURL(/building=|room=/);
  await expect(page).toHaveURL(/date=2026-10-29/);
  await expect(page).toHaveURL(/time=14%3A15/);
  const [returnFirst, returnMiddle, after] = await sampleCameraMotion(page);
  await settled(page);
  expect(returnFirst.zoom).toBeLessThan(selected.zoom);
  expect(returnMiddle.zoom).toBeLessThan(returnFirst.zoom);
  expect(after.zoom).toBeLessThan(returnMiddle.zoom);
  expect(after.zoom).toBeCloseTo(before.zoom, 3);
  after.target.forEach((value, i) =>
    expect(value).toBeCloseTo(before.target[i], 3),
  );
  if (mobile(page))
    await expect(page.locator(".app")).toHaveClass(/sheet-collapsed/);
  await expect(page.locator('.iso-label[aria-pressed="true"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("building-dismissed.png") });
  await page.clock.resume();
  await page.reload();
  await expect(page.locator(".building-heading")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("dismissal restores search and filters, and shared building links can be cleared", async ({
  page,
}) => {
  await ready(page);
  const search = page.getByRole("textbox", {
    name: "Search rooms or buildings",
  });
  await search.fill("soc sci");
  await page
    .getByRole("button", { name: "Open SSL: Social Science Lab", exact: true })
    .click();
  await page.getByRole("button", { name: "All rooms", exact: true }).click();
  await expect(search).toHaveValue("soc sci");
  await expect(page).not.toHaveURL(/building=/);
  await page.goto("/?building=ssl&date=2026-10-29&time=14:15");
  await expect(page.locator(".building-heading")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).not.toHaveURL(/building=/);
  await expect(search).toHaveValue("");
  await expect(page.locator(".app")).toHaveClass(/sheet-half/);
  await page.getByRole("button", { name: "Free 1 hr+", exact: true }).click();
  const scroll = page.locator(".results-scroll");
  await scroll.evaluate((el) => {
    el.scrollTop = 80;
  });
  const scrollTop = await scroll.evaluate((el) => el.scrollTop);
  const label = await buildingLabel(page);
  await label.click();
  await expect(page).toHaveURL(/building=/);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Free 1 hr+", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page).not.toHaveURL(/building=/);
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollTop))
    .toBe(scrollTop);
});

test("shared building links focus the building on initial load and can return to browsing", async ({
  page,
}) => {
  await ready(page);
  const overview = await camera(page);
  await page.goto("/?building=ssl&date=2026-10-29&time=14:15");
  await expect(stageOf(page)).toHaveAttribute("data-ready", "true", {
    timeout: 20000,
  });
  await settled(page);
  expect((await camera(page)).zoom).toBeGreaterThan(overview.zoom * 2);
  await expect(page.locator('.iso-label[aria-pressed="true"]')).toBeVisible();
  await page.getByRole("button", { name: "All rooms", exact: true }).click();
  await expect(page).not.toHaveURL(/building=/);
  await settled(page);
  await expect(page.locator(".app")).toHaveClass(/sheet-half/);
});

test("labels keep their dimensions and visibility during tiny drags at adjacent zoom levels", async ({
  page,
}) => {
  await ready(page);
  await buildingLabel(page);
  const stage = stageOf(page);
  for (let level = 0; level < 4; level++) {
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    // Render repeatedly at nearly identical positions: hidden badges used to
    // shrink to a fallback width, appear, then immediately hide again.
    const point = await stage.evaluate((el) => {
      const box = el.getBoundingClientRect();
      for (const fy of [0.6, 0.8, 0.4])
        for (const fx of [0.5, 0.2, 0.8]) {
          const x = box.x + box.width * fx,
            y = box.y + box.height * fy;
          if (document.elementFromPoint(x, y)?.tagName === "CANVAS")
            return { x, y };
        }
      throw new Error("No canvas space to drag");
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 10, point.y);
    const histories: boolean[][] = [];
    for (let step = 0; step < 8; step++) {
      const frames = await stage.getAttribute("data-frames");
      await page.mouse.move(point.x + 10 + step, point.y);
      if (step) await expect(stage).not.toHaveAttribute("data-frames", frames!);
      const badges = await page.locator(".iso-label").evaluateAll((elements) =>
        elements.map((el) => ({
          hidden: (el as HTMLElement).hidden,
          width: (el as HTMLElement).offsetWidth,
        })),
      );
      expect(badges.every((b) => b.width > 0)).toBe(true);
      histories.push(badges.map((b) => b.hidden));
    }
    await page.mouse.up();
    for (let label = 0; label < histories[0].length; label++) {
      const changes = histories
        .slice(1)
        .filter((state, i) => state[label] !== histories[i][label]).length;
      expect(
        changes,
        `label ${label} at zoom level ${level}`,
      ).toBeLessThanOrEqual(1);
    }
    await expect(page).not.toHaveURL(/building=/);
  }
});

test("mobile search and favorites float above a continuous map", async ({
  page,
}, info) => {
  test.skip(!mobile(page), "Mobile toolbar layout");
  await ready(page);
  const stage = (await stageOf(page).boundingBox())!;
  for (const control of [
    page.locator(".search-box"),
    page.getByRole("button", { name: /^Saved rooms/ }),
  ]) {
    const box = (await control.boundingBox())!;
    expect(stage.y).toBeLessThan(box.y);
    expect(stage.y + stage.height).toBeGreaterThan(box.y + box.height + 12);
  }
  const search = (await page.locator(".search-box").boundingBox())!;
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      { x: search.x + 20, y: search.y - 5 },
    ),
  ).toBe("CANVAS");
  await page.screenshot({ path: info.outputPath("floating-toolbar.png") });
  await page.getByRole("button", { name: /^Saved rooms/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your saved rooms" }),
  ).toBeVisible();
});

for (const map of ["campus", "alp"]) {
  test(`${map}: pinch starts on badges, changes finger count, and cancels without jumping or selecting`, async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      !info.project.use.hasTouch || browserName !== "chromium",
      "Native multitouch uses Chromium's input protocol",
    );
    await ready(page, map);
    const label = await buildingLabel(page);
    const box = (await label.boundingBox())!;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    const send = (
      type: string,
      touchPoints: { x: number; y: number; id: number }[],
    ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    const first = { ...center, id: 0 };
    const second = { x: center.x + 45, y: center.y + 5, id: 1 };
    const before = await camera(page);
    await send("touchStart", [first]);
    await send("touchStart", [first, second]);
    for (let i = 1; i <= 5; i++)
      await send("touchMove", [
        { ...first, x: first.x - i * 4 },
        { ...second, x: second.x + i * 4 },
      ]);
    await expect
      .poll(async () => (await camera(page)).zoom)
      .toBeGreaterThan(before.zoom * 1.5);
    const zoomed = await camera(page);
    // Lift the first finger; the remaining finger starts from its own position.
    await send("touchEnd", [{ ...second, x: second.x + 20 }]);
    await send("touchMove", [{ ...second, x: second.x + 23 }]);
    const oneFinger = await camera(page);
    expect(oneFinger.zoom).toBeCloseTo(zoomed.zoom, 3);
    expect(
      Math.hypot(...oneFinger.target.map((n, i) => n - zoomed.target[i])),
    ).toBeLessThan(20 / zoomed.zoom);
    await send("touchCancel", []);
    await expect(page).not.toHaveURL(/building=/);
    // Pinch inward after cancellation; stale pointer state must not survive.
    const x = center.x,
      y = center.y;
    await send("touchStart", [
      { x: x - 30, y, id: 2 },
      { x: x + 30, y, id: 3 },
    ]);
    await send("touchMove", [
      { x: x - 18, y, id: 2 },
      { x: x + 18, y, id: 3 },
    ]);
    await send("touchEnd", []);
    await expect
      .poll(async () => (await camera(page)).zoom)
      .toBeLessThan(zoomed.zoom * 0.8);
    await expect(page).not.toHaveURL(/building=/);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await cdp.detach();
    // Normal taps still work after both gestures.
    await (await buildingLabel(page)).tap();
    await expect(page).toHaveURL(/building=/);
  });
}

test("reduced motion skips the camera transition and Escape clears selection", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await (await buildingLabel(page)).click();
  await expect(page).toHaveURL(/building=/);
  await settled(page);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/building=/);
  await settled(page);
});
