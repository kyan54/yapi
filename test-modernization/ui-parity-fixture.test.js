'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const fixtureModule = require('../scripts/modernization/ui-parity-fixture.cjs');
const {makeFixture, makeArtifacts, validateFixture, renderMongoScript, dbName, IDS, MARKER} = fixtureModule;
const options = {date: '2026-10-03', run: 'test_20261003'};
const clone = value => JSON.parse(JSON.stringify(value));
const fixture = makeFixture(options);
function fakeMongo(version, state = {}) {
  const collections = clone(state.collections || {}), writes = [];
  const matches = (row, query) => Object.entries(query).every(([key, value]) => row[key] === value);
  const collection = name => ({
    insertOne(doc) {writes.push('insertOne:' + name); (collections[name] ||= []).push(clone(doc)); return {acknowledged: true};},
    insertMany(docs) {writes.push('insertMany:' + name); if (state.failCollection === name) throw Error('simulated disk failure');
      assert(!collections[name], 'fixture unexpectedly replaces a collection'); collections[name] = clone(docs);
      if (name === 'identitycounters') collections[name].forEach((row, i) => row._id = 'generated-' + i); return {acknowledged: true};},
    findOne(query) {return clone((collections[name] || []).find(row => matches(row, query)) || null);},
    findOneAndUpdate(query, update) {writes.push('lock:' + name); if (state.loseLock) return null;
      const row = (collections[name] || []).find(item => matches(item, query)); if (!row) return null;
      const before = clone(row); Object.assign(row, clone(update.$set)); return before;},
    updateOne(query, update) {writes.push('updateOne:' + name); const row = (collections[name] || []).find(item => matches(item, query));
      if (!row) return {matchedCount: 0}; Object.assign(row, clone(update.$set)); return {matchedCount: 1};},
    countDocuments() {return (collections[name] || []).length;},
    createIndex() {writes.push('index:' + name); return 'field_1_model_1';}
  });
  const db = {getName: () => state.database || dbName(version, options.run),
    getMongo: () => state.uri ? {getURI: () => state.uri} : {host: state.host || '127.0.0.1:27017'},
    getCollectionNames: () => Object.keys(collections), getCollection: collection};
  const printed = [];
  async function run(action, runOptions = options) {
    const script = renderMongoScript(fixture, {version, ...runOptions, action});
    return vm.runInNewContext(script, {db, print: value => printed.push(value), quit: code => {throw Error('quit:' + code + ':' + printed.at(-1));}}, {timeout: 1000});
  }
  return {collections, writes, run, printed};
}
test('fixture is deterministic, JSON-only, and equivalent across version scripts', () => {
  assert.deepEqual(makeFixture(options), fixture); assert.deepEqual(clone(fixture), fixture);
  const files = makeArtifacts(options), manifest = JSON.parse(files['manifest.json']);
  assert.equal(manifest.fixtureSha256, fixtureModule.digest(fixture));
  assert.equal(manifest.status, 'GENERATED_OFFLINE_NOT_EXECUTED');
  assert.deepEqual(manifest.viewport, {width: 1920, height: 1080, deviceScaleFactor: 1});
  assert.equal(JSON.parse(files['old.config.json']).db.DATABASE, dbName('old', options.run));
  for (const version of ['old','new']) {
    assert(files[version + '.seed.js'].includes(JSON.stringify(fixtureModule.bindFixture(fixture, version).collections)));
    assert.equal(JSON.parse(files[version + '.config.json']).mail.enable, false);
    assert.deepEqual(JSON.parse(files[version + '.config.json']).plugins, []);
  }
});
test('per-instance browser origins are explicit; all other fixture data remains equivalent', () => {
  const files = makeArtifacts(options), versions = ['old','new'].map(version => JSON.parse(files[version + '.fixture.json']));
  for (let i = 0; i < versions.length; i++) for (const project of versions[i].collections.project) {
    assert.equal(project.env[0].domain, 'http://127.0.0.1:3000/mock/' + project._id);
    assert.equal(project.env[1].domain, 'http://127.0.0.1:' + [4174,4175][i] + '/mock/' + project._id);
    project.env[1].domain = 'NORMALIZED_BROWSER_ORIGIN/mock/' + project._id;
  }
  assert.deepEqual(versions[0], versions[1]);
});
test('representative roles, private access boundaries, and pagination are populated', () => {
  const c = fixture.collections;
  assert.equal(c.user.length, 4); assert.equal(c.user.filter(u => u.role === 'admin').length, 1);
  const main = c.project.find(p => p._id === IDS.project);
  assert.equal(main.project_type, 'private'); assert.equal(main.uid, IDS.owner);
  assert(main.members.some(m => m.uid === IDS.developer && m.role === 'dev'));
  assert(!main.members.some(m => m.uid === IDS.outsider));
  assert(!c.group.find(g => g._id === IDS.group).members.some(m => m.uid === IDS.developer));
  assert.equal(c.group.filter(g => g.type === 'private').length, 4);
  assert(c.group.length > 25 && c.project.length > 25 && c.interface.length > 30 && c.log.length > 40);
  assert(c.project.some(p => p.project_type === 'public'));
});
test('schemas, raw bodies, multipart files, empty states, collections, wiki, and 90 days exist', () => {
  const c = fixture.collections;
  const rich = c.interface.find(api => api._id === IDS.interface);
  const schema = JSON.parse(rich.req_body_other);
  assert.equal(schema.properties.profile.properties.enabled.type, 'boolean');
  assert.equal(schema.properties.items.items.properties.quantity.type, 'integer');
  assert(c.interface.some(api => api.req_body_type === 'json' && !api.req_body_is_json_schema));
  assert(c.interface.some(api => api.req_body_type === 'raw'));
  assert(c.interface.some(api => api.req_body_form.some(field => field.type === 'file')));
  assert(c.interface.some(api => api.status === 'undone' && api.desc === ''));
  assert(c.interface_cat.some(cat => !c.interface.some(api => api.catid === cat._id)));
  assert(c.interface_col.some(col => !c.interface_case.some(item => item.col_id === col._id)));
  assert.equal(c.interface_case.length, 3); assert.equal(c.wiki[0].project_id, IDS.project);
  const dates = [...new Set(c.statis_mock.map(item => item.date))].sort();
  assert.equal(dates.length, 90); assert.equal(dates[0], '2026-07-06'); assert.equal(dates.at(-1), options.date);
});
test('validator rejects broken references, secrets destinations, scripts, and stale counters', () => {
  for (const mutate of [
    c => {c.interface[0].catid = -1;}, c => {c.interface_case[0].project_id = IDS.publicProject;},
    c => {c.user[0].email = 'real@example.com';}, c => {c.project[0].env[0].domain = 'https://example.com';},
    c => {c.project[0].switch_notice = true;}, c => {c.interface_case[0].enable_script = true;},
    c => {c.identitycounters[0].count = 0;}, c => {c.interface.push(c.interface[0]);},
    c => {c.user[0].password = 'bad';}, c => {c.statis_mock[0].ip = '8.8.8.8';}
  ]) {const altered = clone(fixture); mutate(altered.collections); assert.throws(() => validateFixture(altered));}
  for (const date of ['2026-02-30', '2026-13-01', '', '2026-1-3']) assert.throws(() => makeFixture({date}));
  for (const run of ['prod', '../escape', 'production-db', '', 'A00000', 'a'.repeat(25)]) assert.throws(() => makeArtifacts({...options, run}));
});
for (const version of ['old','new']) {
  test(version + ': claim → seed → verify works offline; repeat seed/claim refuses without writes', async () => {
    const mongo = fakeMongo(version); await mongo.run('claim'); await mongo.run('seed'); await mongo.run('verify');
    assert.equal(mongo.collections[MARKER][0].state, 'seeded');
    const writes = mongo.writes.length;
    await assert.rejects(() => mongo.run('seed'), /used database/);
    await assert.rejects(() => mongo.run('claim'), /completely empty/);
    assert.equal(mongo.writes.length, writes);
    for (const [name, docs] of Object.entries(fixture.collections)) assert.equal(mongo.collections[name].length, docs.length);
  });
  test(version + ': production name, external/authenticated/multi-host connection, and unknown flags fail closed', async () => {
    for (const state of [
      {database: 'production'}, {host: 'mongo:27017'}, {host: '127.0.0.1:27018'}, {host: 'prod.example:27017'},
      {uri: 'mongodb://real-user:secret@127.0.0.1:27017/'}, {uri: 'mongodb://127.0.0.1:27017,remote:27017/'},
      {uri: 'mongodb+srv://127.0.0.1/'}, {uri: 'mongodb://127.0.0.1:27017/?replicaSet=prod'}
    ]) {const mongo = fakeMongo(version, state); await assert.rejects(() => mongo.run('claim')); assert.equal(mongo.writes.length, 0);}
    const local = fakeMongo(version, {uri: 'mongodb://127.0.0.1:27017/?directConnection=true&appName=mongosh+2.5.0&serverSelectionTimeoutMS=2000'});
    await local.run('claim'); assert.equal(local.writes.length, 1);
  });
  test(version + ': unmarked and nonempty targets refuse before mutation', async () => {
    for (const collections of [{user: [{_id: 12}]}, {user: []}]) {
      const mongo = fakeMongo(version, {collections}); await assert.rejects(() => mongo.run('claim'));
      await assert.rejects(() => mongo.run('seed'), /Unmarked/); assert.equal(mongo.writes.length, 0);
    }
    const mongo = fakeMongo(version); await mongo.run('claim'); mongo.collections.user = [];
    const writes = mongo.writes.length; await assert.rejects(() => mongo.run('seed'), /Nonempty/); assert.equal(mongo.writes.length, writes);
  });
  test(version + ': altered marker, lost seed lock, and partial failure cannot silently resume', async () => {
    const altered = fakeMongo(version); await altered.run('claim'); altered.collections[MARKER][0].fixtureSha256 = 'bad';
    await assert.rejects(() => altered.run('seed'), /Marker mismatch/);
    const lost = fakeMongo(version, {loseLock: true}); await lost.run('claim');
    await assert.rejects(() => lost.run('seed'), /already started/); assert(!lost.collections.user);
    const partial = fakeMongo(version, {failCollection: 'project'}); await partial.run('claim');
    await assert.rejects(() => partial.run('seed'), /simulated disk failure/);
    assert.equal(partial.collections[MARKER][0].state, 'seeding');
    const writes = partial.writes.length; await assert.rejects(() => partial.run('seed'));
    await assert.rejects(() => partial.run('verify'), /Seed incomplete/); assert.equal(partial.writes.length, writes);
  });
  test(version + ': verification detects data mutation and unexpected collections without writes', async () => {
    const mongo = fakeMongo(version); await mongo.run('claim'); await mongo.run('seed'); const writes = mongo.writes.length;
    mongo.collections.interface[0].title = 'Mutated'; await assert.rejects(() => mongo.run('verify'), /Content mismatch/);
    mongo.collections.interface[0].title = fixture.collections.interface[0].title; mongo.collections.extra = [];
    await assert.rejects(() => mongo.run('verify'), /Unexpected collections/); assert.equal(mongo.writes.length, writes);
  });
}
test('seed documents satisfy actual application model schemas without a DB connection', async () => {
  const mongoose = require('mongoose');
  const sources = {user: 'server/models/user.js', group: 'server/models/group.js', project: 'server/models/project.js',
    interface_cat: 'server/models/interfaceCat.js', interface: 'server/models/interface.js',
    interface_col: 'server/models/interfaceCol.js', interface_case: 'server/models/interfaceCase.js',
    wiki: 'exts/yapi-plugin-wiki/wikiModel.js', follow: 'server/models/follow.js', log: 'server/models/log.js',
    statis_mock: 'exts/yapi-plugin-statistics/statisMockModel.js', token: 'server/models/token.js'};
  const disconnected = mongoose.createConnection();
  for (const [name, source] of Object.entries(sources)) {
    const module = {exports: {}};
    const context = {module, require(dependency) {
      if (dependency === 'mongoose') return mongoose;
      if (dependency.endsWith('base.js')) return class Base {};
      if (dependency.endsWith('yapi.js')) return {commons: {time: () => 0}};
      throw new Error('Unexpected schema import: ' + dependency);
    }};
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', source), 'utf8'), context);
    const schema = new mongoose.Schema({...new module.exports().getSchema(), _id: Number});
    const Model = disconnected.model('Parity_' + name, schema);
    for (const doc of fixtureModule.bindFixture(fixture, 'new').collections[name])
      await assert.doesNotReject(() => new Model(doc).validate(), name + ':' + doc._id);
  }
  assert.equal(disconnected.readyState, 0);
});
test('CLI creates only a new private directory, never overwrites, and accepts no URL input', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yapi-parity-unit-'));
  try {
    const out = path.join(temp, 'bundle'), script = path.resolve(__dirname, '../scripts/modernization/ui-parity-fixture.cjs');
    const args = [script, '--date', options.date, '--run', options.run, '--out', out];
    const first = spawnSync(process.execPath, args, {encoding: 'utf8'}); assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /No database connections or services/);
    assert.equal(fs.statSync(out).mode & 0o777, 0o700);
    const before = fs.readFileSync(path.join(out, 'fixture.json'), 'utf8');
    assert.equal(spawnSync(process.execPath, args, {encoding: 'utf8'}).status, 1);
    assert.equal(fs.readFileSync(path.join(out, 'fixture.json'), 'utf8'), before);
    assert.equal(spawnSync(process.execPath, [...args, '--uri', 'mongodb://production'], {encoding: 'utf8'}).status, 1);
    for (const [name, content] of Object.entries(makeArtifacts(options))) if (name.endsWith('.js')) {
      assert.doesNotThrow(() => new vm.Script(content), name);
      assert(!/dropDatabase|deleteMany|remove\(|drop\(/.test(content), 'destructive operation in ' + name);
    }
  } finally {fs.rmSync(temp, {recursive: true, force: true});} // Test-owned temp only; never a DB.
});
