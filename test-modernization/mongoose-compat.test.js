'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const mongoose = require(process.env.YAPI_MONGOOSE_MODULE || 'mongoose');
const root = path.resolve(__dirname, '..');
const baselineModule = process.env.YAPI_MONGOOSE5_MODULE || 'mongoose-baseline';

// Inject dependencies without loading application config or connecting to a DB.
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
function base(m, plugin = { plugin() {} }) {
  const yapi = { commons: { rand: () => 1, log() {} },
    db: (name, schema) => m.model(name, schema, name) };
  return load('server/models/base.js', {
    mongoose: m, '../yapi.js': yapi, '../utils/mongoose-auto-increment': plugin
  });
}
function adapter(m) {
  const Base = base(m);
  class Example extends Base {
    getName() { return 'write_contract'; }
    getSchema() { return { _id: Number, value: String, nested: { label: String } }; }
    isNeedAutoIncrement() { return false; }
  }
  return new Example();
}

test('runtime is supported Mongoose 9 and preserves explicit query filters', () => {
  assert.match(mongoose.version, /^9\./);
  const instance = adapter(new mongoose.Mongoose());
  const query = instance.model.find({ undeclaredLegacyField: 7 });
  assert.deepEqual(query.cast(instance.model), { undeclaredLegacyField: 7 });
});

test('real Mongoose queries preserve legacy results, cardinality and lazy execution', async () => {
  const instance = adapter(new mongoose.Mongoose());
  const calls = [];
  instance.model.collection.updateOne = async (filter, update, options) => {
    calls.push({ method: 'updateOne', filter, update, options });
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  };
  instance.model.collection.updateMany = async (filter, update, options) => {
    calls.push({ method: 'updateMany', filter, update, options });
    return { acknowledged: true, matchedCount: 3, modifiedCount: 2, upsertedCount: 0 };
  };
  instance.model.collection.deleteMany = async filter => {
    calls.push({ method: 'deleteMany', filter });
    return { acknowledged: true, deletedCount: 3 };
  };
  const input = Object.freeze({ value: undefined });
  const single = instance.updateDocuments({ _id: 1 }, input);
  assert.equal(calls.length, 0);
  assert.deepEqual(await single.exec(), { n: 1, nModified: 1, ok: 1 });
  assert.deepEqual(calls[0].update, { $set: { value: null } });
  assert.equal(input.value, undefined);
  assert.deepEqual(await instance.updateDocuments({}, { value: 'x' }, { multi: true }).exec(),
    { n: 3, nModified: 2, ok: 1 });
  assert.equal(calls[1].method, 'updateMany');
  assert.equal(calls[1].options.multi, undefined);
  assert.deepEqual(await instance.removeDocuments({ value: 'x' }).exec(),
    { n: 3, ok: 1, deletedCount: 3 });
  assert.deepEqual(await instance.updateDocuments({}, {}).exec(), { n: 0, nModified: 0, ok: 0 });
  assert.equal(calls.length, 3);
});

test('upserts and unmatched writes keep caller-visible Mongoose 5 fields', async () => {
  const instance = adapter(new mongoose.Mongoose());
  instance.model.collection.updateOne = async () => ({
    acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: 101
  });
  assert.deepEqual(await instance.updateDocuments({ _id: 101 }, { value: 'new' }, { upsert: true }),
    { n: 1, nModified: 0, ok: 1, upserted: [{ index: 0, _id: 101 }] });
  instance.model.collection.updateOne = async () => ({
    acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0
  });
  assert.deepEqual(await instance.updateDocuments({ _id: 101 }, { value: 'new' }),
    { n: 0, nModified: 0, ok: 1 });
});

test('connection adapter removes obsolete options, retains credentials and propagates failure', async () => {
  const failure = new Error('sensitive-uri-that-must-not-be-logged');
  const logged = [];
  const config = { servername: '127.0.0.1', port: 27017, DATABASE: 'synthetic',
    authSource: 'database name', user: 'synthetic-user', pass: 'synthetic-test-password',
    options: { poolSize: 8, useUnifiedTopology: true, reconnectTries: 4, serverSelectionTimeoutMS: 25 } };
  let received;
  let initialized = false;
  const fake = { Schema: mongoose.Schema, connection: {}, set() {},
    connect: (uri, options) => { received = { uri, options }; return Promise.reject(failure); } };
  const db = load('server/utils/db.js', {
    mongoose: fake, '../yapi.js': { WEBCONFIG: { db: config }, commons: { log: message => logged.push(message) } },
    './mongoose-auto-increment': { initialize(connection) { assert.equal(connection, fake.connection); initialized = true; } }
  });
  await assert.rejects(db.connect(), error => error === failure);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(initialized, true);
  assert.equal(received.uri, 'mongodb://127.0.0.1:27017/synthetic?authSource=database%20name');
  assert.deepEqual(received.options, { maxPoolSize: 8, serverSelectionTimeoutMS: 25,
    user: 'synthetic-user', pass: 'synthetic-test-password' });
  assert.equal(config.options.poolSize, 8);
  assert.equal(logged.some(message => message.includes('sensitive-uri')), false);
});

function counterHarness({ stored, maximum, indexError, insertRace } = {}) {
  const m = new mongoose.Mongoose();
  const plugin = load('server/utils/mongoose-auto-increment.js', { mongoose: m });
  const Counter = plugin.initialize(m.connection);
  assert.equal(plugin.initialize(m.connection), Counter);
  let count = stored;
  let indexes = 0;
  Counter.collection.createIndex = async (keys, options) => {
    indexes++;
    assert.deepEqual(keys, { field: 1, model: 1 });
    assert.equal(options.unique, true);
    if (indexError) throw indexError;
  };
  Counter.updateOne = async (key, update) => {
    if (update.$setOnInsert && count === undefined) {
      count = update.$setOnInsert.count;
      if (insertRace) throw Object.assign(new Error('Concurrent insert'), { code: 11000 });
    }
    if (update.$max && count !== undefined) count = Math.max(count, update.$max.count);
    if (update.$set) count = update.$set.count;
    return { matchedCount: count === undefined ? 0 : 1 };
  };
  Counter.findOne = () => ({ lean: async () => count === undefined ? null : { count } });
  Counter.findOneAndUpdate = async (key, update) => {
    if (count === undefined || count > key.count.$lte) return null;
    count += update.$inc.count;
    return { count };
  };
  const schema = new m.Schema({ label: String }, { bufferCommands: false, autoCreate: false });
  schema.plugin(plugin.plugin, { model: 'counter_test', startAt: 11, incrementBy: 2 });
  const Model = m.model('counter_test', schema);
  Model.findOne = () => ({ sort: () => ({ select: () => ({ lean: async () => maximum === undefined ? null : { _id: maximum } }) }) });
  Model.collection.insertOne = async value => ({ acknowledged: true, insertedId: value._id });
  return { Model, Counter, count: () => count, indexes: () => indexes };
}

test('async save middleware allocates concurrent numeric IDs without polling or duplicates', async () => {
  const harness = counterHarness({ insertRace: true });
  const documents = await Promise.all(Array.from({ length: 40 }, () => new harness.Model({ label: 'synthetic' }).save()));
  const ids = documents.map(document => document._id).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: 40 }, (_, index) => 11 + index * 2));
  assert.equal(harness.indexes(), 1);
  assert.equal(harness.count(), 89);
});

test('explicit IDs advance counter, low IDs do not lower it and stale counters recover', async () => {
  const harness = counterHarness({ stored: 15, maximum: 100 });
  assert.equal((await new harness.Model().save())._id, 102);
  assert.equal((await new harness.Model({ _id: 900 }).save())._id, 900);
  assert.equal((await new harness.Model({ _id: 20 }).save())._id, 20);
  assert.equal((await new harness.Model().save())._id, 902);
  assert.equal(await harness.Model.nextCount(), 904);
  assert.equal(await new Promise((resolve, reject) => harness.Model.nextCount((error, value) => error ? reject(error) : resolve(value))), 904);
});

test('counter index failures, invalid legacy counts and exhausted IDs fail closed', async () => {
  const failed = counterHarness({ indexError: new Error('Duplicate counter documents') });
  await assert.rejects(new failed.Model().save(), /Duplicate counter documents/);
  const invalid = counterHarness({ stored: 1.5 });
  await assert.rejects(new invalid.Model().save(), /safe integer/);
  const overflow = counterHarness({ stored: Number.MAX_SAFE_INTEGER });
  await assert.rejects(new overflow.Model().save(), /exhausted/);
  const explicit = counterHarness();
  await assert.rejects(new explicit.Model({ _id: Number.MAX_SAFE_INTEGER + 1 }).save(), /safe integer/);
});

test('all schema field inventories match source-grounded archived definitions', () => {
  const contract = require('./fixtures/legacy-schema-contract.json');
  assert.equal(contract.commit, 'fd90eaf108c0382db133a6650e368e5d7d38734a');
  for (const [file, expected] of Object.entries(contract.models)) {
    const Klass = load('server/models/' + file, { './base.js': class {}, '../yapi.js': {} });
    const schema = new mongoose.Schema(Klass.prototype.getSchema());
    const actual = {};
    schema.eachPath((name, field) => {
      actual[name] = { type: field.instance.toLowerCase(), required: !!field.options.required };
      if (field.enumValues && field.enumValues.length) actual[name].enum = field.enumValues;
      if (field.options.default !== undefined && typeof field.options.default !== 'function') actual[name].default = field.options.default;
    });
    if (file === 'interface.js') {
      // Authorized additive, server-only connection leases; all archived fields remain exact.
      for (const [name, type] of Object.entries({ edit_lock_token: 'string', edit_lock_expires_at: 'number' })) {
        assert.deepEqual(actual[name], { type, required: false }, name);
        assert.equal(schema.path(name).options.select, false, name + ' must be hidden from ordinary queries');
        delete actual[name];
      }
    }
    assert.deepEqual(actual, expected, file);
  }
});


test('legacy Mongoose 5 and modern adapter expose equal write-result contracts', async () => {
  const legacy = require(baselineModule);
  const m = new legacy.Mongoose();
  const Model = m.model('legacy_write_contract', new m.Schema({ _id: Number, value: String },
    { bufferCommands: false }));
  const instance = adapter(new mongoose.Mongoose());
  Model.collection.update = (filter, update, options, callback) =>
    callback(null, { result: { n: 1, nModified: 1, ok: 1 } });
  instance.model.collection.updateOne = async () => ({
    acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0
  });
  assert.deepEqual(await instance.updateDocuments({ _id: 1 }, { value: 'x' }),
    await Model.update({ _id: 1 }, { value: 'x' }));
  Model.collection.remove = (filter, options, callback) =>
    callback(null, { result: { n: 2, ok: 1 }, deletedCount: 2 });
  instance.model.collection.deleteMany = async () => ({ acknowledged: true, deletedCount: 2 });
  assert.deepEqual(await instance.removeDocuments({}), await Model.remove({}));
});

test('real MongoDB: concurrent allocation, persisted fields, legacy writes and fresh counter state', {
  skip: !process.env.YAPI_TEST_MONGO_URI && 'Set YAPI_TEST_MONGO_URI to a disposable test MongoDB instance'
}, async () => {
  // Never read the application configuration or use its database name.
  const m = new mongoose.Mongoose();
  const dbName = 'yapi_modernization_test_' + process.pid + '_' + Date.now();
  const connection = await m.createConnection(process.env.YAPI_TEST_MONGO_URI,
    { dbName, serverSelectionTimeoutMS: 15000, autoIndex: false, autoCreate: false }).asPromise();
  try {
    const plugin = load('server/utils/mongoose-auto-increment.js', { mongoose: m });
    const Counter = plugin.initialize(connection);
    const schema = new m.Schema({ title: String, desc: String, markdown: String,
      path: String, method: String, req_query: [{ name: String, desc: String }] }, { autoCreate: false });
    schema.plugin(plugin.plugin, { model: 'interface_contract', startAt: 11, incrementBy: 1 });
    const Model = connection.model('interface_contract', schema, 'interface_contract');
    const source = { title: 'synthetic', desc: '<p>Initial</p>', markdown: 'Initial',
      path: '/synthetic', method: 'GET', req_query: [{ name: 'limit', desc: 'Page size' }] };
    const documents = await Promise.all(Array.from({ length: 30 }, () => new Model(source).save()));
    assert.equal(new Set(documents.map(document => document._id)).size, 30);
    assert.equal(Math.min(...documents.map(document => document._id)), 11);
    const explicit = await new Model({ ...source, _id: 500 }).save();
    assert.equal(explicit._id, 500);
    assert.equal((await new Model(source).save())._id, 501);
    const persisted = await Model.findById(documents[0]._id).lean();
    for (const field of ['desc', 'markdown', 'path', 'method']) assert.equal(persisted[field], source[field]);
    assert.equal(persisted.req_query[0].desc, 'Page size');
    assert.equal((await Counter.findOne({ model: 'interface_contract', field: '_id' })).count, 501);
    const Base = base(m);
    const instance = Object.create(Base.prototype);
    instance.model = Model;
    assert.deepEqual(await instance.updateDocuments({ _id: explicit._id }, { title: 'changed' }),
      { n: 1, nModified: 1, ok: 1 });
    const removed = await instance.removeDocuments({ _id: explicit._id });
    assert.deepEqual(removed, { n: 1, ok: 1, deletedCount: 1 });
    assert.equal(await Model.countDocuments({}), 31);
    // Existing installations retain numeric IDs and the identitycounters layout.
    const importedSchema = new m.Schema({ title: String }, { autoCreate: false });
    importedSchema.plugin(plugin.plugin, { model: 'historical_contract', startAt: 11, incrementBy: 1 });
    const Imported = connection.model('historical_contract', importedSchema, 'historical_contract');
    await Imported.collection.insertOne({ _id: 200, title: 'legacy record' });
    await Counter.collection.insertOne({ model: 'historical_contract', field: '_id', count: 150 });
    assert.equal((await new Imported({ title: 'new record' }).save())._id, 201);
    assert.equal((await Imported.findById(200)).title, 'legacy record');
    assert.equal((await Counter.findOne({ model: 'historical_contract', field: '_id' })).count, 201);
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
