import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5178",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 5178",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_PREDICTION_MARKET_ADDRESS: "0x1000000000000000000000000000000000000001",
      VITE_AURAPREDICT_V5_ADDRESS: "0x1000000000000000000000000000000000000001",
      VITE_AURAPREDICT_V5_DEPLOYMENT_BLOCK: "1",
      VITE_AURA_INDEXER_URL: "http://127.0.0.1:8787"
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
