import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "../test-results/browser",
  fullyParallel: true,
  workers: 2,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    {
      name: "phone",
      use: {
        viewport: { width: 402, height: 874 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "small-phone",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "narrow-phone",
      use: {
        viewport: { width: 320, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "tablet",
      use: {
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "small-desktop", use: { viewport: { width: 1024, height: 768 } } },
    ...(process.env.PLAYWRIGHT_FIREFOX === "1"
      ? [
          {
            name: "firefox",
            testMatch: "navigation.spec.ts",
            use: {
              browserName: "firefox" as const,
              viewport: { width: 1280, height: 800 },
              launchOptions: {},
            },
          },
          {
            name: "firefox-phone",
            testMatch: "navigation.spec.ts",
            use: {
              browserName: "firefox" as const,
              viewport: { width: 390, height: 844 },
              hasTouch: true,
              launchOptions: {},
            },
          },
        ]
      : []),
  ],
});
