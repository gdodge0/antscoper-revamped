import { test, expect } from "@playwright/test";

test("terrain and detailed bridge views retain their geometry and fit desktop and phone", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const stage = page.locator('.iso-stage[data-ready="true"]');
  await stage.waitFor();
  await expect(stage).toHaveAttribute("data-terrain-enabled", "true");
  await expect(stage).toHaveAttribute("data-terrain-relief", "1.5");
  await expect(stage).toHaveAttribute("data-bridges", "10");
  await page.evaluate(() => document.fonts.ready);
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: "Collapse room list" }).click();
    await expect(page.locator(".app")).toHaveClass(/sheet-collapsed/);
    await page.waitForTimeout(350);
  }
  const geometryBuilds = await stage.getAttribute("data-geometry-builds");
  for (const [name, id] of [
    ["arts-humanities", "w171169264"],
    ["mesa-court", "w624135494"],
    ["humanities-student-center", "w171169276"],
    ["mesa-parking", "w155705065"],
    ["watson", "w171194239"],
    ["palo-verde", "w171169265"],
    ["continuing-education", "w1196280279"],
  ]) {
    // Compact layouts hide this selector; exercise the shared scene focus logic
    // there as well, including resize/framing in the expanded phone map.
    await page
      .locator("#campus-district")
      .selectOption(`bridge:${id}`, { force: true });
    await expect(stage).toHaveAttribute("data-view", id);
    const stats = await stage.evaluate((el) => ({
      ...(el as HTMLElement).dataset,
    }));
    expect(Number(stats.triangles)).toBeLessThanOrEqual(
      page.viewportSize()!.width < 1024 ? 350000 : 500000,
    );
    expect(Number(stats.drawCalls)).toBeLessThanOrEqual(
      page.viewportSize()!.width < 1024 ? 200 : 300,
    );
    await expect(stage).toHaveAttribute(
      "data-geometry-builds",
      geometryBuilds!,
    );
    await page.screenshot({ path: info.outputPath(`${name}-bridge.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Reset campus view" }).click();
  await expect(stage).toHaveAttribute("data-view", "overview");
  const frame = await stage.getAttribute("data-frames");
  await page.waitForTimeout(250);
  await expect(stage).toHaveAttribute("data-frames", frame!);
  expect(errors).toEqual([]);
});
