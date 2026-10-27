const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: '.', timeout: 90000, workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }], ...(process.env.GITHUB_STEP_SUMMARY ? [['./github-summary-reporter.js']] : [])],
  use: { baseURL: 'http://127.0.0.1:8888', browserName: 'chromium',
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
