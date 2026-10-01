import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    // Optional system browser override; otherwise use Playwright's installed Chromium.
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: process.env.E2E_SERVER_MODE === "production" ? "npm run start" : "npm run server",
    env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require dotenv/config`.trim() },
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
