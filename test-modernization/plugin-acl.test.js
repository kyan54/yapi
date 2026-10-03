'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const yapi = { commons: {
  resReturn: (data, errcode = 0, errmsg = '') => ({ data, errcode, errmsg }),
  time: () => 1790985600,
  handleParams: (input, fields) => Object.fromEntries(Object.entries(fields)
    .filter(([key]) => input[key] !== undefined)
    .map(([key, type]) => [key, type === 'number' ? Number(input[key]) : String(input[key])])),
  saveLog() {}, log() {}
} };
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const actual = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name === 'yapi.js') return yapi;
    if (name === 'controllers/base.js' || /Model\.js$/.test(name) || name.startsWith('models/')) return class {};
    if (name === '../interfaceSyncUtils.js') return class {};
    if (name === '../../common/diff-view.js') return () => [];
    return actual(name);
  };
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}
const Advanced = load('exts/yapi-plugin-advanced-mock/controller.js');
const Sync = load('exts/yapi-plugin-swagger-auto-sync/controller/syncController.js');
const Wiki = load('exts/yapi-plugin-wiki/controller.js');
const result = { n: 1, nModified: 1, ok: 1 };
const ctx = (body = {}, query = {}) => ({ request: { body, query }, query, protocol: 'http', host: 'fixture.invalid' });
const badIds = [{ $ne: null }, { $gt: 0 }, ['17'], true, 1.5, -1, 0, '17junk', '1e2', '9007199254740992'];
function advanced(allowed = [11]) {
  const calls = [];
  const apis = new Map([[17, { _id: 17, project_id: 11 }], [18, { _id: 18, project_id: 12 }]]);
  const cases = new Map([[31, { _id: 31, interface_id: 17, project_id: 11, uid: '9' }],
    [32, { _id: 32, interface_id: 18, project_id: 12, uid: '10' }]]);
  const controller = Object.assign(Object.create(Advanced.prototype), {
    getUid: () => 9,
    checkAuth: async (...args) => { calls.push(['auth', ...args]); return allowed.includes(args[0]); },
    interfaceModel: { get: async id => { calls.push(['interface', id]); return apis.get(id); } },
    Model: {
      get: async id => { calls.push(['mock-get', id]); return { interface_id: id }; },
      up: async data => { calls.push(['mock-up', data]); return result; },
      save: async data => { calls.push(['mock-save', data]); return result; }
    },
    caseModel: {
      get: async filter => { calls.push(['case-get', filter]); return filter._id ? cases.get(filter._id) : null; },
      list: async id => { calls.push(['case-list', id]); return []; },
      up: async (...args) => { calls.push(['case-up', ...args]); return result; },
      save: async data => { calls.push(['case-save', data]); return result; },
      del: async (...args) => { calls.push(['case-del', ...args]); return { n: 1, ok: 1, deletedCount: 1 }; }
    },
    userModel: { findById: async () => null }
  });
  return { controller, calls, apis, cases };
}
function sync(allowed = [11]) {
  const calls = [];
  const configs = new Map([[41, { _id: 41, project_id: 11, uid: 8 }], [42, { _id: 42, project_id: 12, uid: 10 }]]);
  const controller = Object.assign(Object.create(Sync.prototype), {
    getUid: () => 9,
    checkAuth: async (...args) => { calls.push(['auth', ...args]); return allowed.includes(args[0]); },
    projectModel: { get: async id => { calls.push(['project', id]); return [11, 12].includes(id) ? { _id: id } : null; } },
    syncModel: {
      get: async id => { calls.push(['sync-get', id]); return configs.get(id); },
      getByProjectId: async id => { calls.push(['sync-project', id]); return [...configs.values()].find(row => row.project_id === id); },
      up: async (...args) => { calls.push(['sync-up', ...args]); return result; },
      save: async data => { calls.push(['sync-save', data]); return result; }
    },
    interfaceSyncUtils: {
      addSyncJob: async (...args) => { calls.push(['add-job', ...args]); },
      deleteSyncJob: id => { calls.push(['del-job', id]); }
    }
  });
  return { controller, calls, configs };
}
function wiki(allowed = [11]) {
  const calls = [];
  const controller = Object.assign(Object.create(Wiki.prototype), {
    getUid: () => 9, getUsername: () => 'fixture-user',
    checkAuth: async (...args) => { calls.push(['auth', ...args]); return allowed.includes(args[0]); },
    projectModel: { get: async id => { calls.push(['project', id]); return [11, 12].includes(id) ? { _id: id } : null; } },
    Model: {
      get: async id => { calls.push(['wiki-get', id]); return null; },
      save: async data => { calls.push(['wiki-save', data]); return result; },
      up: async (...args) => { calls.push(['wiki-up', ...args]); return result; },
      upEditUid: async (...args) => { calls.push(['wiki-editor', ...args]); return result; }
    }
  });
  return { controller, calls };
}
const writes = calls => calls.filter(([name]) => /-(up|save|del)$/.test(name) || name === 'add-job' || name === 'del-job' || name === 'wiki-editor');

test('Advanced Mock resolves live interface and rejects caller-project substitution before any write', async () => {
  const { controller, calls } = advanced();
  const request = ctx({ project_id: 11, interface_id: 18, enable: true, uid: 9 });
  await controller.upMock(request);
  assert.equal(request.body.errcode, 40033);
  assert.deepEqual(calls, [['interface', 18]]);
});
test('Advanced Mock stores the authenticated UID and accepts normal numeric-string IDs', async () => {
  const { controller, calls } = advanced();
  const request = ctx({ project_id: '11', interface_id: '17', enable: true, uid: 999, mock_script: 'res.body = 1;' });
  await controller.upMock(request);
  assert.equal(request.body.errcode, 0);
  assert.deepEqual(calls.slice(0, 2), [['interface', 17], ['auth', 11, 'project', 'edit']]);
  assert.deepEqual(writes(calls)[0], ['mock-up', { interface_id: 17, project_id: 11, uid: 9, enable: true, mock_script: 'res.body = 1;' }]);
});
test('Advanced Mock checks live edit permission on all case mutations and cannot move another project case', async () => {
  for (const method of ['saveCase', 'delCase', 'hideCase']) {
    const { controller, calls } = advanced();
    const request = ctx({ id: '32', project_id: 11, interface_id: 17, res_body: '{}', name: 'fixture', enable: false });
    await controller[method](request);
    assert.equal(request.body.errcode, 40033, method);
    assert.ok(calls.some(call => call[0] === 'auth' && call[1] === 12 && call[3] === 'edit'), method);
    assert.deepEqual(writes(calls), [], method);
  }
  const { controller, calls } = advanced([11, 12]);
  const request = ctx({ id: 32, project_id: 11, interface_id: 17, res_body: '{}', name: 'fixture' });
  await controller.saveCase(request);
  assert.equal(request.body.errcode, 40033);
  assert.deepEqual(writes(calls), []);
});
test('Advanced Mock create/update/delete/hide use authorized numeric target scope and authenticated owner', async () => {
  for (const method of ['saveCase', 'delCase', 'hideCase']) {
    const { controller, calls } = advanced();
    const request = ctx({ id: '31', project_id: '11', interface_id: '17', res_body: '{}', name: 'fixture', enable: false, uid: 999 });
    await controller[method](request);
    assert.equal(request.body.errcode, 0, method);
    const [write] = writes(calls);
    assert.deepEqual(write[2], { project_id: 11, interface_id: 17 });
    if (method === 'saveCase') { assert.equal(write[1].uid, 9); assert.equal(write[1].id, 31); }
    if (method === 'hideCase') assert.deepEqual(write[1], { id: 31, case_enable: false });
    if (method === 'delCase') assert.equal(write[1], 31);
  }
  const { controller, calls } = advanced();
  const request = ctx({ project_id: '11', interface_id: '17', name: 'new', res_body: '{}', uid: 999 });
  await controller.saveCase(request);
  assert.equal(request.body.errcode, 0);
  assert.equal(writes(calls)[0][0], 'case-save');
  assert.equal(writes(calls)[0][1].uid, 9);
});
test('Advanced Mock duplicate detection recognizes string IDs and treats operator-like params as literal values', async () => {
  const { controller, calls } = advanced();
  controller.caseModel.get = async query => {
    calls.push(['case-get', query]);
    return { _id: 31, project_id: 11, interface_id: 17 };
  };
  const request = ctx({ id: '31', project_id: '11', interface_id: '17', name: 'same', res_body: '{}', params: { q: { $ne: null } } });
  await controller.saveCase(request);
  assert.equal(request.body.errcode, 0);
  const repeat = calls.filter(call => call[0] === 'case-get')[1][1];
  assert.deepEqual(repeat['params.q'], { $eq: { $ne: null } });
});
test('Advanced Mock read routes require live view access; deleted interface and stale case ownership fail closed', async () => {
  for (const method of ['getMock', 'list', 'getCase']) {
    const { controller, calls } = advanced([]);
    const request = ctx({}, { interface_id: '17', id: '31' });
    await controller[method](request);
    assert.equal(request.body.errcode, 40033, method);
    assert.ok(calls.some(call => call[0] === 'auth' && call[3] === 'view'));
    assert.ok(!calls.some(call => call[0] === 'mock-get' || call[0] === 'case-list'));
  }
  const { controller, calls, apis } = advanced([11, 12]);
  apis.set(17, { _id: 17, project_id: 12 });
  const request = ctx({ id: 31 });
  await controller.delCase(request);
  assert.equal(request.body.errcode, 40033);
  assert.deepEqual(writes(calls), []);
  apis.delete(17);
  await controller.hideCase(request);
  assert.equal(request.body.errcode, 404);
});
test('Advanced Mock malformed IDs never become Mongo operators or writes', async () => {
  for (const id of badIds) {
    for (const method of ['getMock', 'list', 'getCase', 'delCase', 'hideCase', 'saveCase', 'upMock']) {
      const { controller, calls } = advanced([11, 12]);
      const request = ctx({ id, interface_id: id, project_id: 11, res_body: '{}' }, { id, interface_id: id });
      await controller[method](request);
      assert.notEqual(request.body.errcode, 0, method + ':' + JSON.stringify(id));
      assert.equal(calls.length, 0, method + ':' + JSON.stringify(id));
    }
  }
});
test('Advanced Mock requires live edit permission after access is revoked', async () => {
  const allowed = [11];
  const { controller, calls } = advanced(allowed);
  await controller.upMock(ctx({ interface_id: 17, project_id: 11 }));
  allowed.length = 0;
  const before = writes(calls).length;
  for (const method of ['upMock', 'saveCase', 'delCase', 'hideCase']) {
    const request = ctx({ id: 31, interface_id: 17, project_id: 11, res_body: '{}' });
    await controller[method](request);
    assert.equal(request.body.errcode, 40033, method);
  }
  assert.equal(writes(calls).length, before);
});

test('Swagger config cannot authorize one project then update another project ID', async () => {
  const { controller, calls } = sync();
  const request = ctx({ id: '42', project_id: '11', is_sync_open: true });
  await controller.upSync(request);
  assert.equal(request.body.errcode, 405);
  assert.deepEqual(calls, [['sync-get', 42]]);
});
test('Swagger config authenticates numeric-string reads and does not disclose configs without view access', async () => {
  const { controller, calls } = sync();
  const request = ctx({}, { project_id: '11' });
  await controller.getSync(request);
  assert.equal(request.body.errcode, 0);
  assert.equal(request.body.data._id, 41);
  assert.deepEqual(calls, [['project', 11], ['auth', 11, 'project', 'view'], ['sync-project', 11]]);
  const denied = sync([]);
  await denied.controller.getSync(request);
  assert.equal(request.body.errcode, 405);
  assert.ok(!denied.calls.some(call => call[0] === 'sync-project'));
});
test('Swagger config only persists editable fields and schedules the authenticated editor for private URLs', async () => {
  const { controller, calls } = sync();
  const request = ctx({ id: '41', project_id: '11', uid: 999, is_sync_open: true,
    sync_cron: '0 * * * *', sync_json_url: 'http://127.0.0.1:12345/swagger.json', sync_mode: 'good',
    old_swagger_content: 'forged', last_sync_time: 999, $unset: { project_id: '' }, _id: 42 });
  await controller.upSync(request);
  assert.equal(request.body.errcode, 0);
  const [write, job] = writes(calls);
  assert.deepEqual(write, ['sync-up', { id: 41, project_id: 11, uid: 9, is_sync_open: true,
    sync_cron: '0 * * * *', sync_json_url: 'http://127.0.0.1:12345/swagger.json', sync_mode: 'good' }, { project_id: 11 }]);
  assert.deepEqual(job, ['add-job', 11, '0 * * * *', 'http://127.0.0.1:12345/swagger.json', 'good', 9]);
  assert.equal(request.request.body.uid, 999);
});
test('Swagger config creates, updates existing project without ID, and disables its actual job', async () => {
  const fixture = sync();
  fixture.configs.clear();
  let request = ctx({ project_id: '11', is_sync_open: false, uid: 99 });
  await fixture.controller.upSync(request);
  assert.equal(request.body.errcode, 0);
  assert.equal(writes(fixture.calls)[0][0], 'sync-save');
  assert.equal(writes(fixture.calls)[0][1].uid, 9);
  assert.equal(writes(fixture.calls)[0][1].add_time, 1790985600);
  assert.deepEqual(writes(fixture.calls)[1], ['del-job', 11]);
  const existing = sync();
  request = ctx({ project_id: '11', is_sync_open: false });
  await existing.controller.upSync(request);
  assert.equal(writes(existing.calls)[0][0], 'sync-up');
  assert.equal(writes(existing.calls)[0][1].id, 41);
});
test('Swagger config rejects forged IDs, unauthenticated writes and missing live project/config', async () => {
  for (const id of badIds) {
    for (const field of ['id', 'project_id']) {
      const { controller, calls } = sync([11, 12]);
      const request = ctx({ project_id: 11, [field]: id });
      await controller.upSync(request);
      assert.notEqual(request.body.errcode, 0);
      assert.equal(calls.length, 0);
    }
    const { controller, calls } = sync();
    const request = ctx({}, { project_id: id });
    await controller.getSync(request);
    assert.notEqual(request.body.errcode, 0);
    assert.equal(calls.length, 0);
  }
  for (const body of [{ project_id: 11 }, { project_id: 11, id: 41 }, { project_id: 11, id: 999 }, { project_id: 999 }]) {
    const { controller, calls } = sync([]);
    const request = ctx(body);
    await controller.upSync(request);
    assert.notEqual(request.body.errcode, 0);
    assert.deepEqual(writes(calls), []);
  }
});

test('Wiki reads and writes resolve the live project, use view/edit ACL, and reject a token bypass', async () => {
  const fixture = wiki();
  const request = ctx({}, { project_id: '11' });
  await fixture.controller.getWikiDesc(request);
  assert.equal(request.body.errcode, 0);
  assert.deepEqual(fixture.calls, [['project', 11], ['auth', 11, 'project', 'view'], ['wiki-get', 11]]);
  for (const method of ['getWikiDesc', 'uplodaWikiDesc']) {
    const { controller, calls } = wiki([]);
    controller.$tokenAuth = true;
    const denied = ctx({ project_id: '11', desc: 'forged', markdown: 'forged' }, { project_id: '11' });
    await controller[method](denied);
    assert.equal(denied.body.errcode, 400);
    assert.ok(!calls.some(call => call[0] === 'wiki-get'));
    assert.deepEqual(writes(calls), []);
  }
});
test('Wiki normal numeric-string writes retain source fields and use authenticated author', async () => {
  const { controller, calls } = wiki();
  const request = ctx({ project_id: '11', desc: '<p>fixture</p>', markdown: 'fixture', uid: 99, edit_uid: 99 });
  await controller.uplodaWikiDesc(request);
  assert.equal(request.body.errcode, 0);
  assert.deepEqual(writes(calls), [['wiki-save', { project_id: 11, desc: '<p>fixture</p>', markdown: 'fixture',
    uid: 9, username: 'fixture-user', add_time: 1790985600, up_time: 1790985600 }]]);
});
test('Wiki rejects object/malformed IDs before database access, and missing projects before document access', async () => {
  for (const id of badIds) {
    for (const method of ['getWikiDesc', 'uplodaWikiDesc']) {
      const { controller, calls } = wiki([11, 12]);
      const request = ctx({ project_id: id }, { project_id: id });
      await controller[method](request);
      assert.notEqual(request.body.errcode, 0);
      assert.equal(calls.length, 0);
    }
  }
  const { controller, calls } = wiki([999]);
  const request = ctx({}, { project_id: '999' });
  await controller.getWikiDesc(request);
  assert.equal(request.body.errcode, 404);
  assert.deepEqual(calls, [['project', 999]]);
});
test('Wiki editing socket rechecks live edit ACL and cannot release another editor lock', async () => {
  const { controller, calls } = wiki([]);
  const handlers = {}, sent = [];
  const request = ctx({}, { id: '11' });
  request.websocket = { on: (event, handler) => { handlers[event] = handler; }, send: text => sent.push(text) };
  await controller.wikiConflict(request);
  await handlers.message('editor');
  assert.deepEqual(sent, ['没有权限']);
  assert.ok(!calls.some(call => call[0] === 'wiki-get'));
  await controller.endFunc({ _id: 51, edit_uid: 10 });
  assert.deepEqual(writes(calls), []);
  await controller.endFunc({ _id: 51, edit_uid: 9 });
  assert.deepEqual(writes(calls), [['wiki-editor', 51, 0]]);
  assert.equal(controller.websocketMsgMap('toString', {}), null);
});

test('Swagger config reports a scheduler validation failure instead of claiming the timer started', async () => {
  const { controller, calls } = sync();
  controller.interfaceSyncUtils.addSyncJob = async () => null;
  const request = ctx({ id: 41, project_id: 11, is_sync_open: true, sync_cron: 'invalid', sync_json_url: 'http://fixture.invalid/swagger.json' });
  await controller.upSync(request);
  assert.equal(request.body.errcode, 400);
  assert.match(request.body.errmsg, /新定时任务未启动/);
  assert.match(request.body.errmsg, /已有任务会保留/);
  assert.equal(writes(calls)[0][0], 'sync-up');
});
