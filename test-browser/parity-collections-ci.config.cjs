'use strict';
// Separate command lets the integration owner include these tests without editing app.spec.cjs.
const config = require('./playwright.config.cjs');
module.exports = {...config, testMatch: 'parity-collections-ci.spec.cjs', timeout: 120000,
  outputDir: 'test-results/collections-ci', reporter: [['list'], ['html', {outputFolder:'playwright-report/collections-ci',open:'never'}]]};
