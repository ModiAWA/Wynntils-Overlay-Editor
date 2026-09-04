const { defineConfig } = require('@playwright/test');

const editorPort = Number.parseInt(process.env.WYNNTILS_EDITOR_PORT || '4173', 10);
const editorBaseUrl = `http://127.0.0.1:${editorPort}`;

module.exports = defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: process.env.WYNNTILS_PLAYWRIGHT_OUTPUT || '/tmp/wynntils-editor-playwright/results',
  reporter: [['line']],
  use: {
    baseURL: editorBaseUrl,
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'node tests/browser/static-server.mjs',
    url: `${editorBaseUrl}/index.html`,
    timeout: 10_000,
    reuseExistingServer: false,
  },
});
