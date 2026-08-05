import { defineConfig, devices } from '@playwright/test';

// Smoke tests drive the real WebGL app in headless Chromium. The games expose
// `window.__*` debug hooks (documented in src/games/README.md) precisely so a
// test can play a round without simulating tilt hardware or pixel-hunting a
// 3D scene.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // one WebGL context at a time is plenty
  workers: 1,
  // These drive real animations and real speech synthesis, not mocks, so a
  // round can genuinely take twenty-odd seconds. The default 30s left no room
  // on a loaded machine and produced failures that passed when re-run alone.
  timeout: 90_000,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // software GL so three.js renders in headless CI
          args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
