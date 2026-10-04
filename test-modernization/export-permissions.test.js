'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name === 'controllers/base.js') return class {};
    if (name.startsWith('models/')) return class {};
    if (name === 'yapi.js') return {commons: {resReturn: (data, errcode = 0) => ({data, errcode}), log() {}}};
    return original(name);
  };
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}
for (const [file, type] of [['yapi-plugin-export-data', 'json'], ['yapi-plugin-export-swagger2-data', 'OpenAPIV2']]) {
  const Controller = load(`exts/${file}/controller.js`);
  async function invoke(project, allowed, token = false) {
    let reads = 0, checks = 0;
    const controller = Object.create(Controller.prototype);
    Object.assign(controller, {$tokenAuth: token, projectModel: {get: async () => project},
      checkAuth: async (id, scope, action) => {
        checks++;
        assert.deepEqual([id, scope, action], [42, 'project', 'view']);
        return allowed;
      }, handleListClass: async () => { reads++; return []; }});
    const ctx = {request: {query: {pid: 42, type}}, set() {}};
    await controller.exportData(ctx);
    return {ctx, reads, checks};
  }
  test(`${file} denies private outsider before reading export data`, async () => {
    const result = await invoke({_id: 42, project_type: 'private'}, false);
    assert.equal(result.ctx.body.errcode, 400);
    assert.equal(result.reads, 0);
  });
  test(`${file} preserves member, public and authenticated-token exports`, async () => {
    for (const [visibility, allowed, token] of [['private', true, false], ['public', false, false], ['private', false, true]]) {
      const result = await invoke({_id: 42, name: 'Synthetic', project_type: visibility}, allowed, token);
      assert.equal(result.reads, 1);
      assert.equal(typeof result.ctx.body, 'string');
      assert.equal(result.checks, visibility === 'private' && !token ? 1 : 0);
    }
  });
  test(`${file} missing project returns without reading export data`, async () => {
    const result = await invoke(null, false);
    assert.equal(result.ctx.body.errcode, 404);
    assert.equal(result.reads, 0);
  });
}
