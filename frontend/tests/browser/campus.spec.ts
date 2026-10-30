import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Room } from "../../src/model";
import type { CampusLocation } from "../../src/locations";
const snapshot = JSON.parse(
  readFileSync(
    new URL("../../fixtures/demo.json", import.meta.url),
    "utf8",
  ),
) as { rooms: Room[] };
const manifest = JSON.parse(
  readFileSync(
    new URL("../../src/data/campus-manifest.json", import.meta.url),
    "utf8",
  ),
) as {
  districts: { id: string; name: string }[];
  locations: CampusLocation[];
  codes: Record<string, string>;
  roomOverrides: Record<string, string>;
};
const districts = manifest.districts;
const locationOfRoom = (r: Room) =>
  manifest.locations.find(
    (l) =>
      l.id === (manifest.roomOverrides[r.id] ?? manifest.codes[r.building]),
  );
const roomAtLocation = (r: Room, id: string) => locationOfRoom(r)?.id === id;
const freeAtPreview = (r: Room) =>
  !r.schedule[4].some(([start, end]) => start <= 855 && end > 855);

async function ready(page: Page) {
  await page.goto("/");
  await page.locator('.iso-stage[data-ready="true"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function expand(page: Page) {
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: "Collapse room list" }).click();
    await expect(page.locator(".app")).toHaveClass(/sheet-collapsed/);
    await page.waitForTimeout(350);
  }
}
async function exploreDistrict(page: Page, id: string) {
  const stage = page.locator(".iso-stage");
  async function renderAfter(action: () => Promise<unknown>) {
    const frame = await stage.getAttribute("data-frames");
    await action();
    await expect(stage).not.toHaveAttribute("data-frames", frame!);
  }
  if (page.viewportSize()!.width >= 1024) {
    await renderAfter(() =>
      page
        .getByRole("combobox", {
          name: "Explore a campus district",
        })
        .selectOption(id),
    );
    return;
  }
  await renderAfter(() =>
    page.getByRole("button", { name: "Reset campus view" }).click(),
  );
  if (!id) return;
  const district = districts.find((d) => d.id === id)!,
    badge = page.locator(
      `.district-label[aria-label^="Explore ${district.name}:"]`,
    );
  // Mobile navigation uses the map itself. Pan an offscreen district badge into
  // view, leaving collision handling and the real click target enabled.
  for (let attempt = 0; attempt < 8 && !(await badge.isVisible()); attempt++) {
    if (attempt === 0 && page.viewportSize()!.width < 600) {
      for (let i = 0; i < 2; i++)
        await renderAfter(() =>
          page.getByRole("button", { name: "Zoom in", exact: true }).click(),
        );
    }
    if (await badge.isVisible()) break;
    const transform = await badge.evaluate((el) => el.style.transform),
      point = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)!;
    const box = (await stage.boundingBox())!;
    const start = await page.evaluate((box) => {
      for (const fy of [0.5, 0.7, 0.3, 0.85])
        for (const fx of [0.5, 0.3, 0.7]) {
          const x = box.x + box.width * fx,
            y = box.y + box.height * fy;
          if (document.elementFromPoint(x, y)?.tagName === "CANVAS")
            return { x, y };
        }
      throw new Error("No uncovered canvas area for district navigation");
    }, box);
    const dx = Math.max(
        -box.width * 0.35,
        Math.min(box.width * 0.35, box.width / 2 - Number(point[1])),
      ),
      dy = Math.max(
        -box.height * 0.35,
        Math.min(box.height * 0.35, box.height / 2 - Number(point[2])),
      );
    await renderAfter(async () => {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + dx, start.y + dy, { steps: 5 });
      await page.mouse.up();
    });
  }
  await expect(badge).toBeVisible();
  await renderAfter(() => badge.click());
}
async function budget(page: Page) {
  const mobile = page.viewportSize()!.width < 1024;
  const stats = await page
    .locator(".iso-stage")
    .evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  expect(Number(stats.triangles), JSON.stringify(stats)).toBeLessThanOrEqual(
    mobile ? 350000 : 500000,
  );
  expect(Number(stats.drawCalls), JSON.stringify(stats)).toBeLessThanOrEqual(
    mobile ? 200 : 300,
  );
}

test("campus is the default, has no automatic room selection, and stays idle", async ({
  page,
}, info) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(r.url());
  });
  await ready(page);
  await expect(page).not.toHaveURL(/room=/);
  await expect(
    page.getByRole("region", { name: "Isometric UCI campus map", exact: true }),
  ).toBeVisible();
  await budget(page);
  await page.screenshot({ path: info.outputPath("campus-overview.png") });
  const frames = await page.locator(".iso-stage").getAttribute("data-frames");
  await page.waitForTimeout(250);
  expect(await page.locator(".iso-stage").getAttribute("data-frames")).toBe(
    frames,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expand(page);
  await page.screenshot({ path: info.outputPath("campus-expanded.png") });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("mobile sheet swipes and taps can always return to the split view", async ({
  page,
}, info) => {
  test.skip(!info.project.use.isMobile, "Mobile bottom sheet interaction");
  await ready(page);
  const app = page.locator(".app"),
    panel = page.locator(".results-panel"),
    handle = page.locator(".sheet-handle"),
    initialTop = (await panel.boundingBox())!.y,
    cdp = await page.context().newCDPSession(page);
  async function state(expected: "half" | "full" | "collapsed") {
    await expect(app).toHaveClass(new RegExp(`sheet-${expected}`));
    await expect
      .poll(() =>
        panel.evaluate((el) =>
          el.getAnimations().some((a) => a.playState === "running"),
        ),
      )
      .toBe(false);
    if (expected === "half") {
      expect((await panel.boundingBox())!.y).toBeCloseTo(initialTop, 0);
      await expect(page.locator(".iso-stage canvas")).toBeVisible();
      await expect(page.locator(".panel-content")).toBeVisible();
    }
  }
  async function swipe(dy: number, dx = 0, cancel = false) {
    const box = (await handle.boundingBox())!,
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 0 }],
    });
    for (let i = 1; i <= 4; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (dx * i) / 4, y: y + (dy * i) / 4, id: 0 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: cancel ? "touchCancel" : "touchEnd",
      touchPoints: [],
    });
  }
  // Short swipes and long swipes both stop at the middle position.
  for (const distance of [40, 140]) {
    await swipe(distance);
    await state("collapsed");
    await swipe(-distance);
    await state("half");
    await swipe(-distance);
    await state("full");
    await swipe(distance);
    await state("half");
  }
  // Slight movements and cancelled gestures must not become handle taps.
  await swipe(12);
  await state("half");
  await swipe(-12);
  await state("half");
  await swipe(10, 45);
  await state("half");
  await swipe(40, 0, true);
  await state("half");
  await swipe(-40);
  await state("full");
  await swipe(-40);
  await state("full");
  await page.getByRole("button", { name: "Show map and room list" }).tap();
  await state("half");
  await handle.tap();
  await state("collapsed");
  await swipe(40);
  await state("collapsed");
  await handle.focus();
  await page.keyboard.press("Enter");
  await state("half");
  await page.screenshot({ path: info.outputPath("split-restored.png") });
  await cdp.detach();
});

test("all eight districts retain their panes and GPU buffers with honest counts", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const context = WebGL2RenderingContext.prototype,
      bufferData = context.bufferData;
    (window as any).campusBufferUploads = 0;
    context.bufferData = function (...args: any[]) {
      (window as any).campusBufferUploads++;
      return (bufferData as Function).apply(this, args);
    };
  });
  await ready(page);
  await expand(page);
  const stage = page.locator(".iso-stage");
  await expect(stage).toHaveAttribute("data-geometry-builds", "8");
  for (const d of districts) {
    const free = (snapshot.rooms as Room[]).filter(
      (r) => locationOfRoom(r)?.district === d.id && freeAtPreview(r),
    ).length;
    await expect(
      page.locator(`[aria-label="Explore ${d.name}: ${free} rooms free"]`),
    ).toHaveCount(1);
    const frame = await stage.getAttribute("data-frames");
    await exploreDistrict(page, d.id);
    await expect(stage).not.toHaveAttribute("data-frames", frame!);
    await expect(page.locator(".iso-stage")).toHaveAttribute(
      "data-loaded",
      new RegExp(d.id),
    );
    await budget(page);
    await page.screenshot({ path: info.outputPath(`district-${d.id}.png`) });
    await expect(page).not.toHaveURL(/building=/);
  }
  // Revisit every district and cross the old detail thresholds. No district or
  // pane buffers should be discarded, rebuilt, or uploaded again as we navigate.
  const uploads = await page.evaluate(
    () => (window as any).campusBufferUploads,
  );
  for (const id of ["", ...districts.map((d) => d.id), ""]) {
    const frame = await stage.getAttribute("data-frames");
    await exploreDistrict(page, id);
    await expect(stage).not.toHaveAttribute("data-frames", frame!);
  }
  await stage.focus();
  for (const key of ["+", "+", "+", "-", "-", "-", "Home"])
    await page.keyboard.press(key);
  await expect(stage).toHaveAttribute("data-geometry-builds", "8");
  expect(await page.evaluate(() => (window as any).campusBufferUploads)).toBe(
    uploads,
  );
  await budget(page);
});

test("building badges open exactly their resolved room set and legacy aliases survive", async ({
  page,
}, info) => {
  await ready(page);
  await expand(page);
  await exploreDistrict(page, "social");
  const sst = page.getByRole("button", {
    name: "Social Science Tower: 6 rooms free",
    exact: true,
  });
  await expect(sst).toBeVisible();
  await sst.click();
  await expect(page).toHaveURL(/building=sst/);
  const expected = snapshot.rooms.filter((r) =>
    roomAtLocation(r, "sst"),
  ).length;
  await expect(page.locator(".room-select")).toHaveCount(expected);
  await expect(page.locator(".building-heading")).toContainText(
    "6 of 12 rooms free",
  );
  if (page.viewportSize()!.width >= 1024) {
    await expect(page.locator(".iso-stage")).toHaveAttribute(
      "data-selected",
      "sst",
    );
    await expect(page.locator(".iso-stage")).toHaveAttribute(
      "data-loaded",
      /social/,
    );
    await budget(page);
    await page.screenshot({ path: info.outputPath("sst-selected.png") });
  }
  await page.goto("/?building=hrh");
  await expect(page.locator(".room-select")).toHaveCount(1);
  await expect(page.locator(".room-select")).toContainText("1042");
  await page.goto("/?room=uci-mc");
  await expect(page.locator(".detail-heading")).toContainText(
    "UCI Medical Center",
  );
  await expect(page.locator(".detail-heading")).toContainText(
    "outside the academic campus",
  );
  await expect(page.locator(".detail-heading")).not.toContainText(
    "min from ALP",
  );
});

test("keyboard, drag and pinch navigation preserve filters and reset", async ({
  page,
}, info) => {
  await ready(page);
  await expand(page);
  const stage = page.locator(".iso-stage"),
    initial = await stage.getAttribute("data-zoom");
  await stage.focus();
  await page.keyboard.press("+");
  await expect(stage).not.toHaveAttribute("data-zoom", initial!);
  await page.keyboard.press("Home");
  await expect(stage).toHaveAttribute("data-zoom", initial!);
  const box = (await stage.boundingBox())!;
  // Start gestures on the navigation canvas, not an HTML building button.
  const canvasPoint = () =>
    page.evaluate((box) => {
      for (const fy of [0.6, 0.7, 0.45, 0.8, 0.35])
        for (const fx of [0.5, 0.4, 0.65, 0.3]) {
          const x = box.x + box.width * fx,
            y = box.y + box.height * fy;
          if (
            [-55, -25, 0, 25, 55].every(
              (dx) =>
                document.elementFromPoint(x + dx, y)?.tagName === "CANVAS",
            )
          )
            return { x, y };
        }
      throw new Error("No uncovered canvas area for pinch gesture");
    }, box);
  const { x, y } = await canvasPoint();
  const before = await page.locator(".park-label").getAttribute("style");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 20, { steps: 6 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/building=/);
  await expect(page.locator(".park-label")).not.toHaveAttribute(
    "style",
    before!,
  );
  if (info.project.use.isMobile) {
    // Panning moves labels; choose an uncovered spot again for both fingers.
    const { x, y } = await canvasPoint();
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
    await expect(stage).not.toHaveAttribute("data-zoom", initial!);
    await expect(page).not.toHaveURL(/building=/);
  }
});

test("a failed district preserves geographic volumes and retry controls", async ({
  page,
}) => {
  await page.route("**/src/map/models/health.ts*", (route) => route.abort());
  await ready(page);
  await expand(page);
  await exploreDistrict(page, "health");
  await expect(
    page.getByRole("button", { name: "Retry details" }),
  ).toBeVisible();
  await expect(page.locator(".iso-stage canvas")).toBeVisible();
  await page.unroute("**/src/map/models/health.ts*");
  await page.getByRole("button", { name: "Retry details" }).click();
  await page.locator('.iso-stage[data-ready="true"]').waitFor();
  await expand(page);
  await exploreDistrict(page, "health");
  await expect(page.locator(".iso-stage")).toHaveAttribute(
    "data-loaded",
    /health/,
  );
  await page
    .getByRole("textbox", { name: "Search rooms or buildings" })
    .fill("COHS");
  await expect(page.locator(".room-select").first()).toBeVisible();
});

test("WebGL loss has a local fallback, retry and usable lightweight map", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator(".iso-stage canvas")
    .evaluate((el) =>
      (el as HTMLCanvasElement)
        .getContext("webgl2")!
        .getExtension("WEBGL_lose_context")!
        .loseContext(),
    );
  await expect(page.getByRole("button", { name: "Retry map" })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".iso-fallback img")
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Retry map" }).click();
  // Recovery initializes all eight districts, just like a fresh page load.
  await expect(
    page.locator('.iso-stage[data-ready="true"] canvas'),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Lightweight map ↗" }).click();
  await expect(
    page.getByRole("region", { name: "Schematic UCI campus map" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Architectural map ↗" }).click();
  await expect(
    page.locator('.iso-stage[data-ready="true"] canvas'),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".iso-stage canvas")).toHaveCount(1);
});

test("desktop room panels leave the selected building visible", async ({
  page,
}) => {
  test.skip(
    page.viewportSize()!.width < 1024,
    "Mobile room details use a separate full-screen view",
  );
  await page.goto("/?building=ssl");
  await page.locator('.iso-stage[data-ready="true"]').waitFor();
  await page.locator("#room-ssl-122").click();
  await expect(page.locator(".room-detail")).toBeVisible();
  const marker = page.getByRole("button", {
    name: "Social Science Lab: 7 rooms free",
    exact: true,
  });
  await expect(marker).toBeVisible();
  await expect
    .poll(async () => {
      const a = (await marker.boundingBox())!,
        b = (await page.locator(".room-detail").boundingBox())!;
      return a.x + a.width < b.x || a.y + a.height < b.y;
    })
    .toBe(true);
});
