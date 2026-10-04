'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'exts/yapi-plugin-statistics/controller.js');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const realRequire = loaded.require.bind(loaded);
loaded.require = name => {
  if (name === 'yapi.js') return { WEBCONFIG: { mail: { enable: false } }, commons: {
    resReturn: (data, errcode = 0, errmsg = '') => ({ data, errcode, errmsg })
  } };
  if (name === 'controllers/base.js') return class { getRole() { return this.$user.role; } };
  if (name.startsWith('models/') || name.endsWith('Model.js')) return class {};
  return realRequire(name);
};
loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
const Controller = loaded.exports;
const methods = ['getStatisCount', 'getMockDateList', 'getSystemStatus', 'groupDataStatis'];

test('all statistics endpoints reject missing users and non-admin roles before any data access', async () => {
  for (const user of [null, undefined, { role: 'member' }, { role: 'owner' }, { role: 'dev' }, { role: 'guest' }, { role: '' }]) {
    for (const method of methods) {
      const controller = Object.create(Controller.prototype);
      controller.$user = user;
      const context = {};
      // No model or CPU/mail helpers exist: touching any of them would fail.
      await controller[method](context);
      assert.equal(context.body.errcode, 405, method);
      assert.equal(context.body.data, null, method);
      assert.match(context.body.errmsg, /管理员/, method);
    }
  }
});

test('administrator statistics preserve count, chart, system and group response contracts', async () => {
  const controller = Object.assign(Object.create(Controller.prototype), {
    $user: { role: 'admin' },
    groupModel: { getGroupListCount: async () => 1, list: async () => [{ _id: 8, group_name: 'Synthetic group' }] },
    projectModel: { getProjectListCount: async () => 2, listCount: async () => 2, list: async () => [{ _id: 11 }] },
    interfaceModel: { getInterfaceListCount: async () => 3, listCount: async () => 3 },
    interfaceCaseModel: { getInterfaceCaseListCount: async () => 4 },
    Model: { getTotalCount: async () => 5, getDayCount: async () => [{ _id: '2026-10-03', count: 5 }], countByGroupId: async () => 5 },
    cupLoad: async () => 0.125
  });
  const contexts = [];
  for (const method of methods) { const context = {}; await controller[method](context); assert.equal(context.body.errcode, 0, method); contexts.push(context.body.data); }
  assert.deepEqual(contexts[0], { groupCount: 1, projectCount: 2, interfaceCount: 3, interfaceCaseCount: 4 });
  assert.deepEqual(contexts[1], { mockCount: 5, mockDateList: [{ _id: '2026-10-03', count: 5 }] });
  assert.equal(contexts[2].load, '12.50');
  assert.equal(contexts[2].mail, '未配置');
  assert.equal(typeof contexts[2].systemName, 'string');
  assert.deepEqual(contexts[3], [{ name: 'Synthetic group', interface: 3, mock: 5, project: 2 }]);
});
