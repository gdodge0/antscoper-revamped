import { test, expect } from "@playwright/test";

test("map settings use defaults, preserve the view, and persist relief choices", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const desktop = page.viewportSize()!.width >= 1024;
  await page.goto(desktop ? "/?building=alp" : "/");
  const stage = page.locator(".iso-stage");
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect(stage).toHaveAttribute("data-terrain-enabled", "true");
  if (!desktop)
    await page.getByRole("button", { name: "Collapse room list" }).click();
  await page
    .locator("#campus-district")
    .selectOption("bridge:w171194239", { force: true });
  await expect(stage).toHaveAttribute("data-view", "w171194239");
  const beforeZoom = await stage.getAttribute("data-frames");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(stage).not.toHaveAttribute("data-frames", beforeZoom!);
  const zoom = await stage.getAttribute("data-zoom");
  const settingsButton = page.getByRole("button", {
    name: "Map settings",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Map settings" });
  await settingsButton.click();
  await expect(dialog).toBeVisible();
  await expect(settingsButton).toHaveAttribute("aria-expanded", "true");
  const toggle = dialog.getByRole("switch", { name: /Heightmap/ });
  const relief = dialog.getByRole("slider", { name: "Relief scale" });
  await expect(toggle).toBeChecked();
  await expect(relief).toHaveValue("1.5");
  await expect(relief).toBeEnabled();
  await expect(
    dialog.getByRole("switch", { name: /Terrain shadows/ }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("switch", { name: /Building shadows/ }),
  ).toBeChecked();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.screenshot({ path: info.outputPath("settings-default.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settingsButton).toBeFocused();
  await settingsButton.click();
  await toggle.check();
  await expect(stage).toHaveAttribute("data-terrain-enabled", "true");
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect(stage).toHaveAttribute("data-view", "w171194239");
  await expect(stage).toHaveAttribute("data-zoom", zoom!);
  if (desktop) await expect(stage).toHaveAttribute("data-selected", "alp");
  await expect(relief).toBeEnabled();
  await relief.focus();
  await relief.press("End");
  await expect(stage).toHaveAttribute("data-terrain-relief", "3");
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect(stage).toHaveAttribute("data-view", "w171194239");
  await expect(stage).toHaveAttribute("data-zoom", zoom!);
  await expect(page.locator(".iso-stage canvas")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("settings-relief.png") });
  await relief.press("Home");
  await expect(stage).toHaveAttribute("data-terrain-relief", "0.5");
  await expect(stage).toHaveAttribute("data-ready", "true");
  await page.reload();
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect(stage).toHaveAttribute("data-terrain-enabled", "true");
  await expect(stage).toHaveAttribute("data-terrain-relief", "0.5");
  await settingsButton.click();
  await toggle.uncheck();
  await expect(stage).toHaveAttribute("data-terrain-enabled", "false");
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect(relief).toHaveValue("0.5");
  await expect(relief).toBeDisabled();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect(stage).toHaveAttribute("data-terrain-enabled", "false");
  await expect(stage).toHaveAttribute("data-terrain-relief", "0.5");
  const frame = await stage.getAttribute("data-frames");
  await page.waitForTimeout(300);
  await expect(stage).toHaveAttribute("data-frames", frame!);
  expect(errors).toEqual([]);
});

test("terrain and building shadows change independently without rebuilding the map", async ({
  page,
}, info) => {
  // Preferences from the previous version gain the two new defaults.
  await page.addInitScript(() => {
    if (!localStorage.getItem("antscoper.map-settings.v1"))
      localStorage.setItem(
        "antscoper.map-settings.v1",
        JSON.stringify({ heightmap: true, relief: 1.5 }),
      );
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const stage = page.locator(".iso-stage");
  await expect(stage).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => document.fonts.ready);
  if (page.viewportSize()!.width < 1024)
    await page.getByRole("button", { name: "Collapse room list" }).click();
  await page
    .locator("#campus-district")
    .selectOption("health", { force: true });
  await expect(stage).toHaveAttribute("data-view", "district");
  const builds = await stage.getAttribute("data-geometry-builds");
  const canvas = page.locator(".iso-stage canvas");
  const originalCanvas = await canvas.elementHandle();
  const settingsButton = page.getByRole("button", {
    name: "Map settings",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Map settings" });
  async function state(terrain: boolean, buildings: boolean, name: string) {
    await settingsButton.click();
    await dialog
      .getByRole("switch", { name: /Terrain shadows/ })
      .setChecked(terrain);
    await dialog
      .getByRole("switch", { name: /Building shadows/ })
      .setChecked(buildings);
    await expect(stage).toHaveAttribute(
      "data-terrain-shadows",
      String(terrain),
    );
    await expect(stage).toHaveAttribute(
      "data-building-shadows",
      String(buildings),
    );
    const casters = expect.poll(async () =>
      Number(await stage.getAttribute("data-building-shadow-casters")),
    );
    if (buildings) await casters.toBeGreaterThan(0);
    else await casters.toBe(0);
    await expect(stage).toHaveAttribute("data-geometry-builds", builds!);
    expect(
      await canvas.evaluate((el, previous) => el === previous, originalCanvas),
    ).toBe(true);
    await dialog.getByRole("button", { name: "Close map settings" }).click();
    return canvas.screenshot({ path: info.outputPath(`${name}.png`) });
  }
  const normal = await state(false, true, "building-shadows");
  const noShadows = await state(false, false, "shadows-off");
  expect(noShadows.equals(normal)).toBe(false);
  const terrainOnly = await state(true, false, "terrain-shadows");
  expect(terrainOnly.equals(noShadows)).toBe(false);
  const both = await state(true, true, "both-shadows");
  expect(both.equals(terrainOnly)).toBe(false);
  await state(true, false, "saved-shadows");
  await page.reload();
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect(stage).toHaveAttribute("data-terrain-shadows", "true");
  await expect(stage).toHaveAttribute("data-building-shadows", "false");
  await expect(stage).toHaveAttribute("data-building-shadow-casters", "0");
  await settingsButton.click();
  await expect(
    dialog.getByRole("switch", { name: /Terrain shadows/ }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("switch", { name: /Building shadows/ }),
  ).not.toBeChecked();
  expect(errors).toEqual([]);
});
