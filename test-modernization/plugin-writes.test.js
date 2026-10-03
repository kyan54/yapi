'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const mongoose = require(process.env.YAPI_MONGOOSE_MODULE || 'mongoose');
const root = path.resolve(__dirname, '..');
const now = 1720000000;
const files = {
  advanced: 'exts/yapi-plugin-advanced-mock/advMockModel.js',
  cases: 'exts/yapi-plugin-advanced-mock/caseModel.js',
  sync: 'exts/yapi-plugin-swagger-auto-sync/syncModel.js',
  wiki: 'exts/yapi-plugin-wiki/wikiModel.js'
};

// Compile the actual bundled models with only their application dependencies
// injected. These tests never boot the application or read its database config.
function load(relative, dependencies) {
  const filename = path.join(root, relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = name => Object.prototype.hasOwnProperty.call(dependencies, name)
    ? dependencies[name] : originalRequire(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}

function fixtureAutoIncrement() {
  return { plugin(schema, options) {
    let next = options.startAt;
    schema.add({ [options.field]: { type: Number } });
    schema.pre('save', function() {
      if (this[options.field] === undefined) {
        this[options.field] = next;
        next += options.incrementBy;
      }
    });
  } };
}

function models(m, connection = m.connection, plugin = fixtureAutoIncrement()) {
  const yapi = {
    commons: { rand: () => 1, time: () => now, log() {} },
    db(name, schema) {
      schema.set('bufferCommands', false);
      schema.set('autoCreate', false);
      schema.set('autoIndex', false);
      return connection.model(name, schema, name);
    }
  };
  const Base = load('server/models/base.js', {
    mongoose: m, '../yapi.js': yapi, '../utils/mongoose-auto-increment': plugin
  });
  return Object.fromEntries(Object.entries(files).map(([name, file]) => {
    const Model = load(file, { 'yapi.js': yapi, 'models/base.js': Base, mongoose: m });
    return [name, new Model()];
  }));
}

function driver(instance) {
  const calls = [];
  instance.model.collection.insertOne = async (document, options) => {
    calls.push({ method: 'insertOne', document, options });
    return { acknowledged: true, insertedId: document._id };
  };
  instance.model.collection.updateOne = async (filter, update, options) => {
    calls.push({ method: 'updateOne', filter, update, options });
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  };
  instance.model.collection.deleteMany = async (filter, options) => {
    calls.push({ method: 'deleteMany', filter, options });
    return { acknowledged: true, deletedCount: filter._id === undefined ? 2 : 1 };
  };
  instance.model.collection.findOne = async (filter, options) => {
    calls.push({ method: 'findOne', filter, options });
    return null;
  };
  return calls;
}

const changed = { n: 1, nModified: 1, ok: 1 };
const removedTwo = { n: 2, ok: 1, deletedCount: 2 };
const removedOne = { n: 1, ok: 1, deletedCount: 1 };

function sources() {
  return {
    advanced: { interface_id: 71, project_id: 21, uid: '9', mock_script: 'return { ok: true };' },
    cases: { interface_id: 71, project_id: 21, name: 'Synthetic case', uid: '9',
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      params: { query: { page: '1' } }, res_body: '{"ok":true}' },
    sync: { project_id: 21, uid: 9, sync_cron: '0 * * * *',
      sync_json_url: 'https://example.invalid/swagger.json', sync_mode: 'good',
      old_swagger_content: '{"swagger":"2.0"}' },
    wiki: { project_id: 21, uid: 9, username: 'Synthetic author',
      desc: '<p>Initial</p>', markdown: 'Initial', add_time: now, up_time: now }
  };
}

test('bundled plugin saves use actual schemas, numeric IDs and legacy defaults on Mongoose 9', async () => {
  assert.match(mongoose.version, /^9\./);
  const instances = models(new mongoose.Mongoose());
  const inputs = sources();
  for (const [name, instance] of Object.entries(instances)) {
    const calls = driver(instance);
    assert.equal(instance.model.schema.path('_id').instance, 'Number', name);
    const saved = await instance.save(inputs[name]);
    assert.equal(saved._id, 11, name);
    assert.equal(calls.length, 1, name);
    assert.equal(calls[0].method, 'insertOne', name);
    assert.equal(calls[0].document._id, 11, name);
    assert.equal(saved.project_id, 21, name);
    assert.equal(saved.up_time, now, name);
    await assert.rejects(instance.save({}), { name: 'ValidationError' }, name);
    assert.equal(calls.length, 1, 'invalid ' + name + ' must not reach the driver');
  }
  const advanced = new instances.advanced.model(inputs.advanced);
  assert.equal(advanced.enable, false);
  const mockCase = new instances.cases.model(inputs.cases);
  assert.equal(mockCase.code, 200);
  assert.equal(mockCase.delay, 0);
  assert.equal(mockCase.ip_enable, false);
  assert.equal(mockCase.case_enable, true);
  assert.equal(mockCase.headers[0].name, 'Content-Type');
  assert.deepEqual(mockCase.params, { query: { page: '1' } });
  assert.equal(new instances.sync.model(inputs.sync).is_sync_open, false);
  assert.equal(new instances.wiki.model(inputs.wiki).edit_uid, 0);
});

test('advanced mock update and both bulk cleanup methods execute supported driver writes', async () => {
  const { advanced } = models(new mongoose.Mongoose());
  const calls = driver(advanced);
  const query = advanced.up({ interface_id: '71', project_id: 21, uid: '9',
    mock_script: undefined, enable: true });
  assert.equal(calls.length, 0, 'update must remain lazy');
  assert.deepEqual(await query.exec(), changed);
  assert.equal(calls[0].method, 'updateOne');
  assert.equal(calls[0].filter.interface_id, 71);
  assert.equal(calls[0].filter.project_id, 21);
  assert.equal(calls[0].options.upsert, true);
  assert.equal(calls[0].update.$set.mock_script, null);
  assert.equal(calls[0].update.$set.enable, true);
  assert.equal(calls[0].update.$set.up_time, now);
  assert.deepEqual(await advanced.delByInterfaceId('71'), removedTwo);
  assert.equal(calls[1].method, 'deleteMany');
  assert.equal(calls[1].filter.interface_id, 71);
  assert.deepEqual(await advanced.delByProjectId('21').exec(), removedTwo);
  assert.equal(calls[2].method, 'deleteMany');
  assert.equal(calls[2].filter.project_id, 21);
});

test('advanced mock cases cast numeric IDs and preserve all update and deletion entry points', async () => {
  const { cases } = models(new mongoose.Mongoose());
  const calls = driver(cases);
  const query = cases.up({ id: '11', name: 'Changed case', res_body: '{"changed":true}',
    code: '201', params: { body: { enabled: true } } });
  assert.equal(calls.length, 0);
  assert.deepEqual(await query.exec(), changed);
  assert.equal(calls[0].method, 'updateOne');
  assert.equal(calls[0].filter._id, 11);
  assert.equal(calls[0].update.$set.code, 201);
  assert.equal(calls[0].update.$set.up_time, now);
  assert.equal(calls[0].update.$set.res_body, '{"changed":true}');
  assert.deepEqual(calls[0].update.$set.params, { body: { enabled: true } });
  assert.equal(Object.hasOwn(calls[0].update.$set, 'id'), false);
  assert.deepEqual(await cases.del('11'), removedOne);
  assert.equal(calls[1].filter._id, 11);
  assert.deepEqual(await cases.delByInterfaceId('71'), removedTwo);
  assert.equal(calls[2].filter.interface_id, 71);
  assert.deepEqual(await cases.delByProjectId('21'), removedTwo);
  assert.equal(calls[3].filter.project_id, 21);
  assert.ok(calls.slice(1).every(call => call.method === 'deleteMany'));
});

test('swagger auto-sync retains both update methods, ID lookup and all cleanup methods', async () => {
  const { sync } = models(new mongoose.Mongoose());
  const calls = driver(sync);
  const query = sync.up({ id: '11', is_sync_open: true, sync_cron: '*/5 * * * *' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await query.exec(), changed);
  assert.equal(calls[0].method, 'updateOne');
  assert.equal(calls[0].filter._id, 11);
  assert.equal(calls[0].update.$set.is_sync_open, true);
  assert.equal(calls[0].update.$set.up_time, now);
  assert.deepEqual(await sync.upById('11', { id: 99, last_sync_time: now,
    old_swagger_content: '{"swagger":"2.0","info":{"version":"new"}}' }), changed);
  assert.equal(calls[1].method, 'updateOne');
  assert.equal(calls[1].filter._id, 11);
  assert.equal(calls[1].update.$set.last_sync_time, now);
  assert.equal(Object.hasOwn(calls[1].update.$set, 'id'), false);
  assert.equal(await sync.get('11'), null);
  assert.equal(calls[2].method, 'findOne');
  assert.equal(calls[2].filter._id, 11);
  assert.deepEqual(await sync.del('11'), removedOne);
  assert.equal(calls[3].filter._id, 11);
  assert.deepEqual(await sync.delByProjectId('21'), removedTwo);
  assert.equal(calls[4].filter.project_id, 21);
  assert.ok(calls.slice(3).every(call => call.method === 'deleteMany'));
});

test('plugin updates preserve caller data and optional project scopes reach the native driver', async () => {
  const instances = models(new mongoose.Mongoose());
  const advancedCalls = driver(instances.advanced);
  const advancedInput = Object.freeze({ interface_id: 71, project_id: 21, uid: '9',
    enable: true, mock_script: 'return {}; ' });
  assert.deepEqual(await instances.advanced.up(advancedInput), changed);
  assert.equal(advancedCalls[0].filter.project_id, 21);
  assert.equal(Object.hasOwn(advancedInput, 'up_time'), false);

  const caseCalls = driver(instances.cases);
  const caseInput = Object.freeze({ id: '11', name: 'Scoped case' });
  const scope = Object.freeze({ project_id: '21', interface_id: '71' });
  assert.deepEqual(await instances.cases.up(caseInput, scope), changed);
  assert.equal(caseCalls[0].filter._id, 11);
  assert.equal(caseCalls[0].filter.project_id, 21);
  assert.equal(caseCalls[0].filter.interface_id, 71);
  assert.deepEqual(await instances.cases.del('11', scope), removedOne);
  assert.equal(caseCalls[1].filter._id, 11);
  assert.equal(caseCalls[1].filter.project_id, 21);
  assert.equal(caseCalls[1].filter.interface_id, 71);
  assert.equal(caseInput.id, '11');
  assert.equal(Object.hasOwn(caseInput, 'up_time'), false);

  const syncCalls = driver(instances.sync);
  const syncInput = Object.freeze({ id: '11', sync_mode: 'good' });
  assert.deepEqual(await instances.sync.up(syncInput, { project_id: '21' }), changed);
  assert.equal(syncCalls[0].filter._id, 11);
  assert.equal(syncCalls[0].filter.project_id, 21);
  assert.deepEqual(await instances.sync.upById('11', syncInput), changed);
  assert.equal(syncInput.id, '11');
  assert.equal(Object.hasOwn(syncInput, 'up_time'), false);
});

test('wiki update methods retain validators, numeric casting and legacy write results', async () => {
  const { wiki } = models(new mongoose.Mongoose());
  const calls = driver(wiki);
  const query = wiki.up('11', { desc: '<p>Changed</p>', markdown: 'Changed' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await query.exec(), changed);
  assert.equal(calls[0].method, 'updateOne');
  assert.equal(calls[0].filter._id, 11);
  assert.equal(calls[0].update.$set.desc, '<p>Changed</p>');
  assert.equal(calls[0].update.$set.markdown, 'Changed');
  assert.equal(calls[0].options.runValidators, true);
  assert.deepEqual(await wiki.upEditUid('11', '9'), changed);
  assert.equal(calls[1].filter._id, 11);
  assert.equal(calls[1].update.$set.edit_uid, 9);
  assert.equal(calls[1].options.runValidators, true);
  await assert.rejects(wiki.up('11', { uid: null }), { name: 'ValidationError' });
  assert.equal(calls.length, 2, 'invalid wiki update must not reach the driver');
  // Wiki exposes no domain-specific delete; exercise the inherited adapter.
  assert.deepEqual(await wiki.removeDocuments({ project_id: '21' }), removedTwo);
  assert.equal(calls[2].method, 'deleteMany');
  assert.equal(calls[2].filter.project_id, 21);
});

test('real MongoDB: bundled plugin models persist numeric-ID creates, updates and deletes', {
  skip: !process.env.YAPI_TEST_MONGO_URI && 'Set YAPI_TEST_MONGO_URI to a disposable test MongoDB instance',
  timeout: 60000
}, async t => {
  const m = new mongoose.Mongoose();
  const dbName = 'yapi_modernization_test_plugins_' + process.pid + '_' + Date.now();
  const connection = await m.createConnection(process.env.YAPI_TEST_MONGO_URI, {
    dbName, serverSelectionTimeoutMS: 15000, autoIndex: false, autoCreate: false
  }).asPromise();
  try {
    const plugin = load('server/utils/mongoose-auto-increment.js', { mongoose: m });
    const Counter = plugin.initialize(connection);
    const instances = models(m, connection, plugin);
    const inputs = sources();

    await t.test('advanced mock: persisted update and interface/project bulk delete', async () => {
      const { advanced } = instances;
      const first = await advanced.save({ ...inputs.advanced });
      assert.equal(first._id, 11);
      assert.equal((await advanced.get('71')).enable, false);
      assert.deepEqual(await advanced.up({ ...inputs.advanced, enable: true,
        mock_script: 'return { changed: true };' }), changed);
      const saved = await advanced.model.findById(first._id).lean();
      assert.equal(saved._id, first._id);
      assert.equal(saved.enable, true);
      assert.equal(saved.mock_script, 'return { changed: true };');
      await advanced.save({ ...inputs.advanced });
      const other = await advanced.save({ ...inputs.advanced, interface_id: 72 });
      assert.deepEqual(await advanced.delByInterfaceId('71'), removedTwo);
      assert.ok(await advanced.model.findById(other._id));
      assert.deepEqual(await advanced.delByProjectId('21'), removedOne);
      assert.equal(await advanced.model.countDocuments({}), 0);
    });

    await t.test('advanced mock cases: persisted fields and all three delete methods', async () => {
      const { cases } = instances;
      const first = await cases.save({ ...inputs.cases });
      assert.equal(first._id, 11);
      assert.equal(first.code, 200);
      assert.deepEqual(await cases.up({ id: first._id, name: 'Wrong project' },
        { project_id: 999 }), { n: 0, nModified: 0, ok: 1 });
      assert.deepEqual(await cases.del(first._id, { project_id: 999 }),
        { n: 0, ok: 1, deletedCount: 0 });
      assert.equal((await cases.get({ _id: first._id })).name, inputs.cases.name);
      assert.deepEqual(await cases.up({ id: String(first._id), name: 'Changed case',
        res_body: '{"changed":true}', code: 201 }), changed);
      const saved = await cases.get({ _id: String(first._id) });
      assert.equal(saved.name, 'Changed case');
      assert.equal(saved.res_body, '{"changed":true}');
      assert.equal(saved.code, 201);
      assert.equal(saved.headers[0].name, 'Content-Type');
      assert.deepEqual(saved.params, { query: { page: '1' } });
      assert.deepEqual(await cases.del(String(first._id)), removedOne);
      assert.equal(await cases.get({ _id: first._id }), null);
      await cases.save({ ...inputs.cases });
      await cases.save({ ...inputs.cases });
      const other = await cases.save({ ...inputs.cases, interface_id: 72 });
      assert.deepEqual(await cases.delByInterfaceId('71'), removedTwo);
      assert.ok(await cases.get({ _id: other._id }));
      assert.deepEqual(await cases.delByProjectId('21'), removedOne);
      assert.equal(await cases.model.countDocuments({}), 0);
    });

    await t.test('swagger auto-sync: persisted updates, lookup and ID/project deletes', async () => {
      const { sync } = instances;
      const first = await sync.save({ ...inputs.sync });
      assert.equal(first._id, 11);
      assert.equal(first.is_sync_open, false);
      assert.deepEqual(await sync.up({ id: first._id, is_sync_open: true },
        { project_id: 999 }), { n: 0, nModified: 0, ok: 1 });
      assert.equal((await sync.get(first._id)).is_sync_open, false);
      assert.deepEqual(await sync.up({ id: String(first._id), is_sync_open: true }), changed);
      assert.deepEqual(await sync.upById(String(first._id), {
        last_sync_time: now, old_swagger_content: '{"info":{"version":"updated"}}'
      }), changed);
      const saved = await sync.get(String(first._id));
      assert.equal(saved._id, first._id);
      assert.equal(saved.is_sync_open, true);
      assert.equal(saved.last_sync_time, now);
      assert.equal(saved.old_swagger_content, '{"info":{"version":"updated"}}');
      assert.equal((await sync.getByProjectId('21'))._id, first._id);
      assert.equal((await sync.listAll()).length, 1);
      assert.deepEqual(await sync.del(String(first._id)), removedOne);
      assert.equal(await sync.get(first._id), null);
      await sync.save({ ...inputs.sync });
      await sync.save({ ...inputs.sync });
      assert.deepEqual(await sync.delByProjectId('21'), removedTwo);
      assert.equal(await sync.model.countDocuments({}), 0);
    });

    await t.test('wiki: persisted validated updates, editor and inherited delete', async () => {
      const { wiki } = instances;
      const first = await wiki.save({ ...inputs.wiki });
      assert.equal(first._id, 11);
      assert.equal(first.edit_uid, 0);
      assert.deepEqual(await wiki.up(String(first._id), {
        desc: '<p>Changed</p>', markdown: 'Changed'
      }), changed);
      assert.deepEqual(await wiki.upEditUid(String(first._id), '17'), changed);
      await assert.rejects(wiki.up(first._id, { uid: null }), { name: 'ValidationError' });
      const saved = await wiki.get('21');
      assert.equal(saved._id, first._id);
      assert.equal(saved.desc, '<p>Changed</p>');
      assert.equal(saved.markdown, 'Changed');
      assert.equal(saved.edit_uid, 17);
      assert.equal(saved.uid, 9);
      assert.deepEqual(await wiki.removeDocuments({ _id: String(first._id) }), removedOne);
      assert.equal(await wiki.get(21), null);
    });

    for (const instance of Object.values(instances)) {
      const counter = await Counter.findOne({ model: instance.name, field: '_id' }).lean();
      assert.ok(counter && Number.isSafeInteger(counter.count), instance.name);
      assert.ok(counter.count >= 11, instance.name);
    }
  } finally {
    try { await connection.dropDatabase(); } finally { await connection.close(); }
  }
});
