import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./__tests__/browser",
  testMatch: "collection-acceptance.spec.ts",
  timeout: 45_000,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:3137", trace: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm dev -p 3137",
    url: "http://127.0.0.1:3137/collection-acceptance",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      COLLECTION_BROWSER_ACCEPTANCE: "true",
      NEXTAUTH_URL: "http://127.0.0.1:3137",
      NEXTAUTH_SECRET: "browser-acceptance-test-only",
      DATABASE_URL: "postgresql://workspace:workspace@localhost:5432/workspace",
      MONGODB_URI: "mongodb://127.0.0.1:27017/workspace",
    },
  },
});
