'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

// Exercise the actual component method with deferred React state updates.
// The browser suite separately checks Ace rendering, save, refresh and DB data.
function componentWithResponse(response) {
  let editorOptions;
  const filename = path.resolve(__dirname, '../exts/yapi-plugin-advanced-mock/AdvMock.js');
  const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    presets: [['@babel/preset-env', { targets: { node: '24' } }], '@babel/preset-react'],
    plugins: [['@babel/plugin-transform-class-properties', { loose: true }]]
  }).code;
  const module = { exports: {} };
  const React = require('react');
  const imports = {
    react: React, axios: { get: async () => response }, 'prop-types': require('prop-types'),
    'react-router-dom': { withRouter: Component => Component },
    antd: { Form: { create: () => Component => Component } },
    './MockCol/MockCol.js': () => null,
    'client/components/AceEditor/mockEditor': options => { editorOptions = options; },
    '../../client/constants/variable.js': {}
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (!(name in imports)) throw new Error('Unexpected import: ' + name);
    return imports[name];
  } }, { filename });
  const instance = new module.exports({ match: { params: { actionId: '901015' } } });
  const pending = [];
  instance.setState = update => pending.push(update);
  return { instance, pending, editor: () => editorOptions };
}

test('advanced Mock hydrates saved script even when React batches state updates', async () => {
  const saved = '// synthetic disabled draft';
  const harness = componentWithResponse({ data: { errcode: 0, data: { enable: false, mock_script: saved } } });
  await harness.instance.getAdvMockData();
  assert.equal(harness.instance.state.mock_script, '', 'state remains deferred');
  assert.equal(harness.editor().data, saved, 'editor must use fetched persisted text');
  assert.equal(harness.pending[0].enable, false);
  harness.editor().onChange({ text: '// revised' });
  assert.equal(harness.pending[1].mock_script, '// revised');
});

test('advanced Mock missing saved draft initializes an empty editor', async () => {
  const harness = componentWithResponse({ data: { errcode: 408, data: null } });
  await harness.instance.getAdvMockData();
  assert.equal(harness.editor().data, '');
  assert.equal(harness.pending.length, 0);
});
