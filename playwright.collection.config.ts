import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./__tests__/browser",
  testMatch: "collection-acceptance.spec.ts",
  timeout: 45_000,
  retries: 0,
  // Keep both projects concurrent to catch cross-browser races, but serve
  // an immutable build instead of Next dev/HMR recompiling during reload.
  workers: 2,
  use: { baseURL: "http://127.0.0.1:3137", trace: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    // Requires `pnpm build` first; do not start Next dev inside Playwright.
    command: "pnpm exec next start -p 3137",
    url: "http://127.0.0.1:3137/collection-acceptance",
    timeout: 180_000,
    // A reused dev server would invalidate the production acceptance proof.
    reuseExistingServer: false,
    env: {
      COLLECTION_BROWSER_ACCEPTANCE: "true",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXTAUTH_URL: "http://127.0.0.1:3137",
      NEXTAUTH_SECRET: "browser-acceptance-test-only",
      DATABASE_URL: "postgresql://workspace:workspace@localhost:5432/workspace",
      MONGODB_URI: "mongodb://127.0.0.1:27017/workspace",
    },
  },
});
