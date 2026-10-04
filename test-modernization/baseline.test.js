'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const baseline = require('./fixtures/legacy-baseline.json');
const approved = require('../docs/modernization/approved-baseline-changes.json');

test('legacy inventory changes are confined to explicit modernization boundaries', () => {
  const actual = JSON.parse(execFileSync(process.execPath,
    [path.join(__dirname, '../scripts/modernization/baseline.js')], { encoding: 'utf8' }));
  for (const key of ['format', 'name', 'version']) assert.equal(actual[key], baseline[key], key);
  for (const section of ['dependencies', 'devDependencies']) {
    const expected = { ...baseline[section] };
    for (const [name, version] of Object.entries(approved[section])) {
      if (version === null) delete expected[name];
      else expected[name] = version;
    }
    assert.deepEqual(actual[section], expected, section + ' changed outside reviewed pins');
  }
  const files = new Set([...Object.keys(baseline.protectedFiles), ...Object.keys(actual.protectedFiles)]);
  for (const file of files) {
    const exception = approved.protectedFileChanges[file];
    if (exception) {
      assert.equal(exception.baselineSha256, baseline.protectedFiles[file] || null,
        file + ': the original fingerprint must remain recorded');
      assert.ok(exception.reason && exception.reason.length > 15, file + ': document the change');
      assert.match(actual.protectedFiles[file], /^[a-f0-9]{64}$/, file + ': must still exist');
    } else {
      assert.equal(actual.protectedFiles[file], baseline.protectedFiles[file],
        file + ': legacy Mock, plugins, fixtures and untouched controllers must stay unchanged');
    }
  }
});
