'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const mongoose = require('mongoose');
const {writeLegacyInterface} = require('../server/services/documentation/legacy-write');
const {createStore} = require('../server/services/documentation/store');

// Load the real, unchanged schema without booting the application or a DB.
const filename = path.resolve(__dirname, '../server/models/interface.js');
const loaded = new Module(filename, module);
loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const requireActual = loaded.require.bind(loaded);
loaded.require = name => name === '../yapi.js' ? {commons: {time: () => 1790899200}}
  : name === './base.js' ? class {} : requireActual(name);
loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
const Interface = loaded.exports;
function makeModel(connection) {
  const schema = new mongoose.Schema({...Interface.prototype.getSchema(), _id: Number});
  return connection.model('legacy_interface', schema);
}
const clone = value => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(value));
const initial = () => ({_id: 17, project_id: 11, uid: 9, title: 'old', path: '/old', method: 'GET', catid: 14,
  desc: 'old', markdown: 'old', __v: 4, add_time: 1, edit_uid: 0,
  plugin_data: {important: true}, res_body: '{ "exact": true }'});
const options = {now: () => new Date('2026-10-02T00:00:00.000Z')};
function setup(seed = initial()) {
  let record = clone(seed), writes = 0;
  const model = makeModel(new mongoose.Mongoose());
  const nodes=new Map();
  const revisions={insertOne:async row=>nodes.set(row._id,clone(row)),findOne:async query=>{const row=nodes.get(query._id);return row&&Object.entries(query).every(([k,v])=>row[k]===v)?clone(row):null;}};
  model.db.collection=()=>revisions;
  model.collection.findOne = async query => query._id === record._id &&
    (query.project_id === undefined || query.project_id === record.project_id) ? clone(record) : null;
  model.collection.updateOne = async (filter, update) => {
    writes++;
    if (!require('node:util').isDeepStrictEqual(record, filter.$expr.$eq[1].$literal)) return {matchedCount: 0};
    record = {...record, ...clone(update.$set)};for(const key of Object.keys(update.$unset||{}))delete record[key];
    return {acknowledged: true, matchedCount: 1, modifiedCount: 1};
  };
  return {model, revisions,nodes, history:async()=>require('../server/services/documentation/revision-store').createRevisionStore(revisions).history(record), get: () => clone(record), writes: () => writes};
}
test('model.up routes manual/import writes through native atomic revision append', async () => {
  const {model, get,history} = setup();
  const instance = new Interface(); instance.model = model;
  assert.deepEqual(await instance.up('17', {desc: 'manual', markdown: 'manual'}), {n: 1, nModified: 1, ok: 1});
  assert.equal(get().docs_revision, 1); assert.equal((await history()).revisions[0].kind, 'legacy-write');
  assert.equal(get().up_time, 1790899200);
});
test('casts/strict whitelist preserve legacy schema and forbid audit/ownership injection', async () => {
  const {model, get,history} = setup();
  const data = Object.freeze({desc: 42, field2: undefined, catid: '15', req_query: [{name: 3, extra: 'drop'}],
    _id: 88, project_id: 99, uid: 90, edit_uid: 90, add_time: 7, __v: 500,
    docs_revision: 700, docs_history: [], docs_revision_head:'attacker-head', plugin_data: {important: false}, $unset: {title: ''}});
  await writeLegacyInterface(model, '17', data, options);
  const row = get(); assert.equal(row.desc, '42'); assert.equal(row.field2, null); assert.equal(row.catid, 15);
  assert.equal(row.req_query[0].name, '3'); assert.equal(row.req_query[0].required, '1');
  assert.equal(row.req_query[0].extra, undefined); assert.equal(row._id, 17); assert.equal(row.project_id, 11);
  assert.equal(row.uid, 9); assert.equal(row.edit_uid, 0); assert.equal(row.__v, 4); assert.equal(row.add_time, 1);
  assert.deepEqual(row.plugin_data, {important: true}); assert.equal(row.res_body, initial().res_body);
  assert.equal(row.docs_revision, 1); assert.notEqual(row.docs_revision_head,'attacker-head'); assert.equal((await history()).revisions[0].actorId, null); assert.equal(data.field2, undefined);
});
test('keeps BSON plugin values and replaces nested input without leaking stale/default fields', async () => {
  const plugin = {id: new mongoose.Types.ObjectId(), date: new Date('2020-01-01T00:00:00.000Z'), bytes: Buffer.from([1, 2, 3])};
  const seed = {...initial(), plugin_data: plugin, query_path: {path: '/old', params: [{name: 'old', value: 'old'}]}};
  const {model, get} = setup(seed);
  const before = mongoose.mongo.BSON.serialize({value: get().plugin_data});
  await writeLegacyInterface(model, 17, {query_path: {path: '/new', unknown: 'discard'}}, options);
  const row = get();
  assert.deepEqual(mongoose.mongo.BSON.serialize({value: row.plugin_data}), before);
  assert.equal(row.query_path.path, '/new'); assert.equal(row.query_path.unknown, undefined);
  assert.equal((row.query_path.params || []).some(item => item.name === 'old'), false);
  assert.equal(row.req_query, undefined); assert.equal(row.api_opened, undefined);
});
test('validates only supplied fields and validates nested enum casts', async () => {
  const seed = initial(); delete seed.title;
  const {model, get, writes} = setup(seed);
  await writeLegacyInterface(model, 17, {markdown: 'partial update'}, options);
  assert.equal(get().title, undefined);
  for (const update of [{title: ''}, {status: 'invalid'}, {catid: 'NaN'}, {req_query: [{required: 'bad'}]}]) {
    await assert.rejects(writeLegacyInterface(model, 17, update, options), {name: 'ValidationError'});
  }
  assert.equal(writes(), 1); assert.equal(get().docs_revision, 1);
});
test('concurrent legacy content changes append once each and retain both changed fields', async () => {
  const {model, get,history} = setup();
  const results = await Promise.all([
    writeLegacyInterface(model, 17, {path: '/new'}, options),
    writeLegacyInterface(model, 17, {res_body: '{"new":true}'}, options)
  ]);
  assert.equal(results.length, 2); const row = get();
  assert.equal(row.path, '/new'); assert.equal(row.res_body, '{"new":true}');
  assert.equal(row.docs_revision, 2); assert.deepEqual((await history()).revisions.map(x => x.version), [2, 1, 0]);
  assert.deepEqual((await history()).revisions.filter(x=>x.before).map(x => x.before.desc), ['old', 'old']);
});
test('legacy edits invalidate pending proposals and description restore preserves current schemas', async () => {
  const {model, get,history} = setup(); const proposals = new Map();
  const store = createStore({interfaces: model.collection,revisions:model.db.collection('documentation_revisions'), now: () => options.now().toISOString(),
    proposals: {insertOne: async row => proposals.set(row._id, row), findOne: async query => proposals.get(query._id)}});
  const proposal = await store.propose(11, 17, {desc: 'AI', markdown: 'AI'}, 9);
  await writeLegacyInterface(model, 17, {desc: 'manual', markdown: 'manual', res_body: 'new schema'}, options);
  await assert.rejects(store.accept(11, 17, proposal.id, 9), {code: 'VERSION_CONFLICT'});
  await store.restore(11, 17, 0, 9);
  assert.equal(get().desc, 'old'); assert.equal(get().res_body, 'new schema'); assert.equal(get().docs_revision, 2);
});
test('missing IDs preserve write result; malformed IDs, history overflow and retry exhaustion fail closed', async () => {
  const {model, get,history} = setup();
  assert.deepEqual(await writeLegacyInterface(model, 99, {desc: 'x'}, options), {n: 0, nModified: 0, ok: 1});
  await assert.rejects(writeLegacyInterface(model, {$ne: null}, {}, options), {code: 'INVALID_ID'});
  model.collection.updateOne = async () => ({matchedCount: 0});
  await assert.rejects(writeLegacyInterface(model, 17, {desc: 'x'}, options), {code: 'VERSION_CONFLICT'});
  assert.equal(get().docs_revision, undefined);
  for (const patch of [{docs_history: Array(500).fill({})}, {docs_history: null}, {docs_revision: Number.MAX_SAFE_INTEGER}, {docs_revision: -1}]) {
    const fixture = setup({...initial(), ...patch});
    await assert.rejects(writeLegacyInterface(fixture.model, 17, {desc: 'x'}, options), /VERSION_OVERFLOW|INVALID_REVISION/);
    assert.equal(fixture.writes(), 0);
  }
});
test('real standalone Mongo performs numeric-ID full-root CAS and concurrent history append', {skip: !process.env.YAPI_TEST_MONGO_URI}, async () => {
  const connection = await mongoose.createConnection(process.env.YAPI_TEST_MONGO_URI,
    {dbName: 'yapi_legacy_write_test_' + process.pid, autoIndex: false}).asPromise();
  try {
    const model = makeModel(connection); await model.collection.insertOne(initial());
    await Promise.all([writeLegacyInterface(model, '17', {desc: 'manual'}, options),
      writeLegacyInterface(model, 17, {res_body: 'imported schema'}, options)]);
    const row = await model.collection.findOne({_id: 17});
    assert.equal(row.docs_revision, 2); assert.equal(row.docs_history, undefined);const history=await require('../server/services/documentation/revision-store').createRevisionStore(connection.collection('documentation_revisions')).history(row);assert.equal(history.revisions.length,3);
    assert.equal(row.desc, 'manual'); assert.equal(row.res_body, 'imported schema');
    assert.deepEqual(row.plugin_data, {important: true}); assert.equal(typeof row._id, 'number');
  } finally { await connection.dropDatabase(); await connection.close(); }
});
test('more than 500 manual/import writes remain writable with bounded complete history pages',async()=>{
 const {model,get,revisions}=setup();
 for(let i=1;i<=505;i++)await writeLegacyInterface(model,17,{desc:String(i)},options);
 assert.equal(get().docs_revision,505);assert.equal(get().docs_history,undefined);
 const reader=require('../server/services/documentation/revision-store').createRevisionStore(revisions);
 let cursor,total=0;do {const page=await reader.history(get(),{limit:100,...(cursor===undefined?{}:{cursor})});total+=page.revisions.length;cursor=page.nextCursor;}while(cursor!==null);
 assert.equal(total,506);
});
test('repeated identical imports and audit-only updates do not consume versions',async()=>{
 const {model,get,nodes}=setup();
 await writeLegacyInterface(model,17,{desc:'manual'},options);const size=nodes.size;
 assert.deepEqual(await writeLegacyInterface(model,17,{desc:'manual',up_time:999,edit_uid:90},options),{n:1,nModified:0,ok:1});
 assert.equal(get().docs_revision,1);assert.equal(nodes.size,size);
});
test('manual field description snapshots restore baseline while preserving current semantics',async()=>{
 const {model,get,revisions}=setup({...initial(),req_query:[{name:'page',desc:'before',required:'1'}],res_body_is_json_schema:true,res_body:'{"type":"string","description":"before"}'});
 await writeLegacyInterface(model,17,{req_query:[{name:'page',desc:'after',required:'0'}],res_body:'{"type":"integer","description":"after"}'},options);
 const store=createStore({interfaces:model.collection,revisions});await store.restore(11,17,0,9);
 assert.equal(get().req_query[0].desc,'before');assert.equal(get().req_query[0].required,'0');
 assert.deepEqual(JSON.parse(get().res_body),{type:'integer',description:'before'});
 await writeLegacyInterface(model,17,{req_query:[]},options);
 await assert.rejects(store.restore(11,17,0,9),{code:'DESCRIPTION_CONFLICT'});
});
test('large plugin payload is preserved without an artificial 8 MiB history ceiling',async()=>{
 const payload='x'.repeat(8*1024*1024),{model,get}=setup({...initial(),plugin_data:payload});
 await writeLegacyInterface(model,17,{desc:'manual'},options);
 assert.equal(get().plugin_data,payload);assert.equal(get().docs_revision,1);
});
test('persisted standalone chain migrates 500 revisions and excludes orphan prepares', {skip:!process.env.YAPI_TEST_MONGO_URI},async()=>{
 const connection=await mongoose.createConnection(process.env.YAPI_TEST_MONGO_URI,{dbName:'yapi_revision_chain_test_'+process.pid,autoIndex:false}).asPromise();
 try {
  const model=makeModel(connection),revisions=connection.collection('documentation_revisions');
  const history=Array.from({length:500},(_,i)=>({interfaceId:17,projectId:11,parentVersion:i,version:i+1,kind:'legacy-write',actorId:null,createdAt:null,before:{desc:String(i),markdown:String(i)},after:{desc:String(i+1),markdown:String(i+1)}}));
  await model.collection.insertOne({...initial(),desc:'500',markdown:'500',docs_revision:500,docs_history:history});
  await writeLegacyInterface(model,17,{desc:'501'},options);
  const row=await model.collection.findOne({_id:17});assert.equal(row.docs_revision,501);assert.equal(row.docs_history,undefined);
  const reader=require('../server/services/documentation/revision-store').createRevisionStore(revisions);
  const first=await reader.history(row,{limit:100});assert.equal(first.revisions.length,100);assert.equal(first.nextCursor,401);
  const proposals=connection.collection('documentation_proposals');
  const orphanStore=createStore({interfaces:{findOne:q=>model.collection.findOne(q),updateOne:async()=>({matchedCount:0})},proposals,revisions});
  const p=await orphanStore.propose(11,17,{desc:'orphan',markdown:'orphan'},9);
  await assert.rejects(orphanStore.accept(11,17,p.id,9),{code:'VERSION_CONFLICT'});
  assert.equal(await revisions.countDocuments({version:502}),1);
  const store=createStore({interfaces:model.collection,proposals,revisions});
  const visible=await store.history(11,17);assert.equal(visible.currentVersion,501);assert.equal(visible.revisions[0].version,501);
  await assert.rejects(store.restore(11,17,502,9),{code:'NOT_FOUND'});
  await store.restore(11,17,0,9);const restored=await model.collection.findOne({_id:17});assert.equal(restored.desc,'0');assert.equal(restored.docs_revision,502);
  assert.equal(await revisions.countDocuments({version:502}),2);assert.equal((await store.history(11,17)).revisions[0].kind,'restore');
  assert.deepEqual(await writeLegacyInterface(model,17,{desc:'0',markdown:'0'},options),{n:1,nModified:0,ok:1});
  await revisions.updateOne({_id:restored.docs_revision_head},{$set:{projectId:99}});
  await assert.rejects(store.history(11,17),{code:'INVALID_REVISION'});
 } finally {await connection.dropDatabase();await connection.close();}
});

test('schema formatting-only import does not create a semantic revision',async()=>{
 const {model,get,nodes}=setup({...initial(),res_body_is_json_schema:true,res_body:'{ "type": "string", "description": "same" }'});
 assert.deepEqual(await writeLegacyInterface(model,17,{res_body:'{"description":"same","type":"string"}'},options),{n:1,nModified:0,ok:1});
 assert.equal(nodes.size,0);assert.equal(get().docs_revision,undefined);
});
test('no-op detection never rounds distinct high-precision numeric schema bounds into equality',()=>{
 const {meaningfulChange}=require('../server/services/documentation/semantic-change');
 assert.equal(meaningfulChange({res_body_is_json_schema:true,res_body:'{"maximum":9007199254740992}'},{res_body:'{"maximum":9007199254740993}'}),true);
});
