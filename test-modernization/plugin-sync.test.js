'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const mongoose = require('mongoose');
const md5 = require('md5');

// Each fixture has an isolated module/job map. Only the external I/O is mocked;
// the utility, token encoding, sync model, Mongoose queries and write adapter run.
function load(relative, dependencies) {
  const filename = path.resolve(__dirname, '..', relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const actual = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : actual(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}

const swagger = {swagger: '2.0', info: {title: 'Local test API', version: '1'}, paths: {}};
const url = 'http://192.168.1.8/swagger.json';
function fixture(options = {}) {
  const calls = {logs: [], audit: [], imports: [], fetches: [], writes: [], deletes: [], tokens: [], schedules: []};
  const state = {
    record: options.record === undefined ? {_id: 71, project_id: 11, uid: 29, is_sync_open: true,
      sync_json_url: url, sync_cron: '* * * * *', sync_mode: 'good', last_sync_time: 100} : options.record,
    now: 200,
    project: {_id: 11},
    token: {token: 'saved-project-token'},
    ...options.state
  };
  const yapi = {WEBCONFIG: {}, commons: {
    time: () => state.now,
    randStr: () => 'test-salt',
    log: (message, level) => calls.logs.push({message, level}),
    saveLog: async log => {calls.audit.push(log); if (state.logError) throw state.logError;}
  }};
  const Base = load('server/models/base.js', {'../yapi.js': yapi, '../utils/mongoose-auto-increment': {}});
  const SyncModel = load('exts/yapi-plugin-swagger-auto-sync/syncModel.js', {'yapi.js': yapi, 'models/base.js': Base});
  const syncModel = Object.create(SyncModel.prototype);
  const isolated = new mongoose.Mongoose();
  syncModel.model = isolated.model('Sync', new isolated.Schema({...syncModel.getSchema(), _id: Number}));
  syncModel.model.collection.findOne = async () => {
    if (state.configError) throw state.configError;
    return state.record && {...state.record};
  };
  syncModel.model.collection.updateOne = async (filter, update) => {
    if (state.writeError) throw state.writeError;
    calls.writes.push({filter, update});
    if (state.record) Object.assign(state.record, update.$set);
    return {acknowledged: true, matchedCount: state.record ? 1 : 0, modifiedCount: state.record ? 1 : 0};
  };
  syncModel.model.collection.deleteMany = async filter => {
    if (state.deleteError) throw state.deleteError;
    calls.deletes.push(filter);
    state.record = null;
    return {acknowledged: true, deletedCount: 1};
  };
  syncModel.listAll = async () => {
    if (state.startupError) throw state.startupError;
    return options.jobs || [];
  };
  class ProjectModel {}
  class TokenModel {}
  class OpenController {}
  const tokenModel = {
    get: async projectId => {
      calls.tokens.push(projectId);
      if (state.tokenError) throw state.tokenError;
      return state.token;
    },
    save: async data => {state.token = data;}
  };
  const projectModel = {get: async () => {
    if (state.projectError) throw state.projectError;
    return state.project;
  }};
  const openController = {importData: async request => {
    calls.imports.push(request.params);
    if (state.importError) throw state.importError;
    if (options.importData) return options.importData(request);
    request.body = state.importResult || {errcode: 0, errmsg: 'imported'};
  }};
  const instances = new Map([[SyncModel, syncModel], [TokenModel, tokenModel], [ProjectModel, projectModel], [OpenController, openController]]);
  yapi.getInst = Class => instances.get(Class);
  const token = load('server/utils/token.js', {'../yapi': yapi});
  const scheduler = options.scheduler || {scheduleJob: (expression, callback) => {
    if (expression === 'invalid') return null;
    const job = {expression, callback, cancelled: false,
      cancel() {this.cancelled = true;}, invoke() {return this.callback();}};
    calls.schedules.push(job);
    return job;
  }};
  const axios = {get: async (address, config) => {
    calls.fetches.push({address, config});
    if (state.fetchError) throw state.fetchError;
    return state.response || {status: 200, data: swagger};
  }};
  const SyncUtils = load('exts/yapi-plugin-swagger-auto-sync/interfaceSyncUtils.js', {
    'node-schedule': scheduler, 'controllers/open.js': OpenController, 'models/project.js': ProjectModel,
    './syncModel.js': SyncModel, 'models/token.js': TokenModel, 'yapi.js': yapi, 'utils/token': token, axios
  });
  const instance = new SyncUtils();
  return {instance, calls, state, token, syncModel, scheduler};
}

async function run(f) {
  await f.instance.ready;
  return f.instance.syncInterface(11, url, 'good', 29, f.token.getToken('saved-project-token', 29));
}

function assertFailure(f, result, expected) {
  assert.notEqual(result.errcode, 0);
  assert.match(result.errmsg, expected);
  assert.equal(f.calls.writes.length, 0);
  assert.ok(f.calls.logs.some(log => log.level === 'error' && expected.test(log.message)));
  assert.ok(f.calls.audit.some(log => log.content.includes('状态:失败,') && expected.test(log.content)));
  assert.ok(f.calls.audit.every(log => !log.content.includes('状态:成功,')));
}

test('actual import request preserves fields and persists hash/time through real Mongoose upById', async () => {
  const f = fixture();
  const result = await run(f);
  assert.equal(result.errcode, 0);
  assert.deepEqual(f.calls.imports, [{type: 'swagger', json: JSON.stringify(swagger), project_id: 11,
    merge: 'good', token: f.token.getToken('saved-project-token', 29)}]);
  assert.deepEqual(f.calls.writes, [{filter: {_id: 71}, update: {$set: {
    last_sync_time: 200, old_swagger_content: md5(JSON.stringify(swagger)), up_time: 200
  }}}]);
  assert.equal(f.state.record.uid, 29);
  assert.equal(f.state.record.sync_json_url, url);
  assert.equal(f.calls.audit[0].uid, 29);
  assert.ok(f.calls.audit[0].content.includes('状态:成功,'));
});

test('unchanged Swagger updates only last sync time and does not import again', async () => {
  const f = fixture();
  f.state.record.old_swagger_content = md5(JSON.stringify(swagger));
  const result = await run(f);
  assert.equal(result.unchanged, true);
  assert.equal(f.calls.imports.length, 0);
  assert.deepEqual(f.calls.writes[0], {filter: {_id: 71}, update: {$set: {last_sync_time: 200, up_time: 200}}});
  assert.equal(f.state.record.old_swagger_content, md5(JSON.stringify(swagger)));
});

test('initial and recurring callbacks await import and use the same scheduled owner token', async () => {
  let release;
  const imported = new Promise(resolve => {release = resolve;});
  const f = fixture({importData: async request => {await imported; request.body = {errcode: 0};}});
  await f.instance.ready;
  let settled = false;
  const pending = f.instance.addSyncJob(11, '* * * * *', url, 'merge', 29).then(job => {settled = true; return job;});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(f.calls.imports.length, 1);
  release();
  const job = await pending;
  f.state.response = {status: 200, data: {...swagger, info: {...swagger.info, version: '2'}}};
  f.state.now = 300;
  const result = await job.invoke();
  assert.equal(result.errcode, 0);
  assert.equal(f.calls.imports.length, 2);
  for (const request of f.calls.imports) {
    assert.deepEqual(f.token.parseToken(request.token), {uid: '29', projectToken: 'saved-project-token'});
    assert.equal(request.merge, 'merge');
  }
  assert.deepEqual(f.calls.audit.map(log => log.uid), [29, 29]);
  assert.equal(f.state.record.last_sync_time, 300);
  f.instance.deleteSyncJob(11);
  assert.equal(job.cancelled, true);
  assert.equal(f.instance.getSyncJob(11), undefined);
});

test('init awaits enabled job runs and contains startup failures', async () => {
  const f = fixture({jobs: [{project_id: 11, uid: 29, is_sync_open: true, sync_cron: '* * * * *', sync_json_url: url, sync_mode: 'good'},
    {project_id: 12, is_sync_open: false}]});
  await f.instance.ready;
  assert.equal(f.calls.imports.length, 1);
  assert.equal(f.calls.schedules.length, 1);
  assert.equal(f.calls.audit[0].uid, 29);
  const failed = fixture({state: {startupError: new Error('DB unavailable at startup')}});
  await failed.instance.ready;
  assert.equal(failed.calls.imports.length, 0);
  assert.ok(failed.calls.logs.some(log => log.level === 'error' && log.message.includes('DB unavailable at startup')));
});

test('native node-schedule contains callback failures and invalid cron never enters the map', async t => {
  const f = fixture({scheduler: require('node-schedule')});
  await f.instance.ready;
  t.after(() => f.instance.deleteSyncJob(11));
  const job = await f.instance.addSyncJob(11, new Date(Date.now() + 60000), url, 'good', 29);
  assert.ok(job);
  f.instance.syncInterface = async () => {throw new Error('callback rejection');};
  // node-schedule 1.x discards returned promises, so the callback must handle
  // rejection itself rather than relying on the scheduler to observe it.
  job.invoke();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.calls.logs.some(log => log.level === 'error' && /callback rejection/.test(log.message)));
  assert.ok(f.calls.audit.some(log => /状态:失败,.*callback rejection/.test(log.content)));
  const previousImports = f.calls.imports.length;
  const invalid = await f.instance.addSyncJob(11, 'not a cron expression', url, 'good', 29);
  assert.equal(invalid, null);
  assert.equal(f.instance.getSyncJob(11), job);
  assert.equal(f.calls.imports.length, previousImports);
  f.instance.deleteSyncJob(11);
  assert.equal(f.instance.getSyncJob(11), undefined);
  assert.equal(job.nextInvocation(), null);
});

test('numeric persisted project IDs and string API IDs refer to the same timer', async () => {
  const f = fixture();
  await f.instance.ready;
  const first = await f.instance.addSyncJob(11, '* * * * *', url, 'good', 29);
  assert.equal(f.instance.getSyncJob('11'), first);
  const replacement = await f.instance.addSyncJob('11', '*/2 * * * *', url, 'good', 29);
  assert.equal(first.cancelled, true);
  assert.equal(f.instance.getSyncJob(11), replacement);
  f.instance.deleteSyncJob('11');
  assert.equal(replacement.cancelled, true);
  assert.equal(f.instance.getSyncJob(11), undefined);
});

test('replacing a job cancels the old timer and empty URLs are reported without import', async () => {
  const f = fixture();
  await f.instance.ready;
  const first = await f.instance.addSyncJob(11, '* * * * *', url, 'good', 29);
  const second = await f.instance.addSyncJob(11, '*/2 * * * *', url, 'good', 29);
  assert.equal(first.cancelled, true);
  assert.equal(f.instance.getSyncJob(11), second);
  const initial = f.calls.imports.length;
  assert.equal(await f.instance.addSyncJob(12, '* * * * *', '', 'good', 29), null);
  assert.equal(f.instance.getSyncJob(12), undefined);
  assert.equal(f.calls.imports.length, initial);
});

for (const [name, data] of [['null', null], ['string', '<html>not JSON</html>'], ['array', []], ['boolean', false]]) {
  test('invalid Swagger ' + name + ' is a failure and never reaches import', async () => {
    const f = fixture({state: {response: {status: 200, data}}});
    assertFailure(f, await run(f), /Swagger JSON/);
    assert.equal(f.calls.imports.length, 0);
  });
}

test('missing and disabled sync configurations never fetch or import and remove stale timers', async () => {
  for (const record of [null, {_id: 71, project_id: 11, is_sync_open: false}]) {
    const f = fixture({record});
    await f.instance.ready;
    const job = await f.instance.addSyncJob(11, '* * * * *', url, 'good', 29);
    assert.equal(job.cancelled, true);
    assert.equal(f.instance.getSyncJob(11), undefined);
    assert.equal(f.calls.fetches.length, 0);
    assert.equal(f.calls.imports.length, 0);
    assert.equal(f.calls.writes.length, 0);
    assert.equal(f.calls.deletes.length, 0);
  }
});

test('confirmed project deletion removes saved configuration and cancels the timer', async () => {
  const f = fixture({state: {project: null}});
  await f.instance.ready;
  const job = await f.instance.addSyncJob(11, '* * * * *', url, 'good', 29);
  assert.deepEqual(f.calls.deletes, [{project_id: 11}]);
  assert.equal(job.cancelled, true);
  assert.equal(f.instance.getSyncJob(11), undefined);
  assert.equal(f.calls.fetches.length, 0);
  assert.equal(f.calls.imports.length, 0);
});

for (const property of ['projectError', 'configError', 'deleteError']) {
  test('transient ' + property + ' retains saved configuration and its timer for retry', async () => {
    const state = {[property]: new Error('temporary database outage')};
    if (property === 'deleteError') state.project = null;
    const f = fixture({state});
    await f.instance.ready;
    const job = await f.instance.addSyncJob(11, '* * * * *', url, 'good', 29);
    assert.equal(f.instance.getSyncJob(11), job);
    assert.equal(job.cancelled, false);
    assert.ok(f.state.record);
    assert.equal(f.calls.deletes.length, 0);
    assert.equal(f.calls.imports.length, 0);
    assert.equal(f.calls.writes.length, 0);
    assert.ok(f.calls.logs.some(log => log.level === 'error' && log.message.includes('temporary database outage')));
  });
}

for (const [name, state, importData] of [
  ['rejected import', {importError: new Error('import crashed')}],
  ['nonzero import code', {importResult: {errcode: 40022, errmsg: 'bad schema'}}],
  ['missing import response', {}, async () => {}],
  ['malformed import response', {}, async request => {request.body = {errmsg: 'missing code'};}],
  ['write failure', {writeError: new Error('hash persistence failed')}]
]) {
  test(name + ' is logged as a failure and never marks the sync successful', async () => {
    const f = fixture({state, importData});
    assertFailure(f, await run(f), /import crashed|bad schema|有效结果|hash persistence failed/);
    assert.equal(f.state.record.last_sync_time, 100);
    assert.equal(f.state.record.old_swagger_content, undefined);
  });
}

test('only explicit numeric or legacy string zero import codes mark success', async () => {
  for (const errcode of ['', false, {}, []]) {
    const f = fixture({state: {importResult: {errcode}}});
    assertFailure(f, await run(f), /导入失败/);
  }
  const f = fixture({state: {importResult: {errcode: '0'}}});
  assert.equal((await run(f)).errcode, '0');
  assert.equal(f.calls.writes.length, 1);
});

test('a concurrently removed config is not reported as a successful persistence', async () => {
  const f = fixture({importData: async request => {
    f.state.record = null;
    request.body = {errcode: 0};
  }});
  const result = await run(f);
  assert.notEqual(result.errcode, 0);
  assert.match(result.errmsg, /配置可能已删除/);
  assert.equal(f.calls.writes.length, 1);
  assert.ok(f.calls.audit.every(log => !log.content.includes('状态:成功,')));
});

test('audit-log rejection and thrown callback failures do not become unhandled promises', async () => {
  const f = fixture({state: {importError: new Error('broken import'), logError: new Error('broken log')}});
  await f.instance.ready;
  const job = await f.instance.addSyncJob(11, '* * * * *', url, 'good', 29);
  const result = await job.invoke();
  assert.notEqual(result.errcode, 0);
  assert.ok(f.calls.logs.some(log => log.level === 'error' && log.message.includes('broken log')));
  assert.equal(f.calls.writes.length, 0);
});

test('a failed initial run keeps its schedule and succeeds on the next callback', async () => {
  const f = fixture({state: {tokenError: new Error('temporary token lookup failure')}});
  await f.instance.ready;
  const job = await f.instance.addSyncJob(11, '* * * * *', url, 'good', 29);
  assert.equal(f.instance.getSyncJob(11), job);
  assert.equal(job.cancelled, false);
  assert.equal(f.calls.imports.length, 0);
  delete f.state.tokenError;
  assert.equal((await job.invoke()).errcode, 0);
  assert.equal(f.calls.imports.length, 1);
  assert.equal(f.calls.writes.length, 1);
  assert.deepEqual(f.token.parseToken(f.calls.imports[0].token), {uid: '29', projectToken: 'saved-project-token'});
});

test('actual getProjectToken creates a project token and consistently encodes its owner', async () => {
  const f = fixture({state: {token: null}});
  await f.instance.ready;
  const first = await f.instance.getProjectToken(11, 29);
  assert.equal(f.state.token.project_id, 11);
  assert.match(f.state.token.token, /^[0-9a-f]{20}$/);
  assert.deepEqual(f.token.parseToken(first), {uid: '29', projectToken: f.state.token.token});
  assert.equal(await f.instance.getProjectToken(11, 29), first);
  f.state.tokenError = new Error('token lookup unavailable');
  assert.equal(await f.instance.getProjectToken(11, 29), '');
  await f.instance.addSyncJob(11, '* * * * *', url, 'good', 29);
  assert.equal(f.calls.imports.length, 0);
  assert.ok(f.calls.logs.some(log => log.level === 'error' && log.message.includes('token lookup unavailable')));
});

test('actual Swagger fetch permits configured private URLs and has a bounded request timeout', async () => {
  const f = fixture();
  await f.instance.ready;
  assert.deepEqual(await f.instance.getSwaggerContent(url), swagger);
  assert.deepEqual(f.calls.fetches, [{address: url, config: {timeout: 30000}}]);
});

for (const status of [199, 300, 400, 401, 404, 500]) {
  test('actual Swagger fetch rejects HTTP ' + status + ' before import', async () => {
    const f = fixture({state: {response: {status, data: swagger}}});
    assertFailure(f, await run(f), new RegExp('http status "' + status + '"'));
    assert.equal(f.calls.imports.length, 0);
  });
}

test('Axios response and network errors retain useful details and never trigger import', async () => {
  for (const [error, pattern] of [
    [Object.assign(new Error('Axios failure'), {response: {status: 503}}), /http status "503"/],
    [new Error('ECONNREFUSED'), /ECONNREFUSED/]
  ]) {
    const f = fixture({state: {fetchError: error}});
    assertFailure(f, await run(f), pattern);
    assert.equal(f.calls.imports.length, 0);
  }
});
