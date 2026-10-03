#!/usr/bin/env node
'use strict';
// Offline only. This module never imports a driver, connects, or starts a service.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const FORMAT = 'yapi-ui-parity-v1';
const PASSWORD = 'SyntheticParityOnly_901000!';
const MARKER = '_ui_parity_fixture';
const IDS = Object.freeze({group: 901000, project: 901001, category: 901002,
  interface: 901003, privateProject: 901004, publicProject: 901005,
  admin: 910001, owner: 910002, developer: 910003, outsider: 910004,
  wiki: 901030, collection: 901040, case: 901050});
const sha1 = value => crypto.createHash('sha1').update(value).digest('hex');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function assert(condition, message) { if (!condition) throw new Error(message); }
function utcDate(date) {
  assert(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), 'date must be YYYY-MM-DD');
  const stamp = Date.parse(date + 'T12:00:00.000Z');
  assert(Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date, 'invalid calendar date');
  return stamp;
}
function makeFixture({date} = {}) {
  const anchor = utcDate(date), t = Math.floor(anchor / 1000);
  const collections = {};
  collections.user = ['admin', 'owner', 'developer', 'outsider'].map((role, i) => {
    const passsalt = 'synthetic-ui-parity-salt-' + role;
    return {_id: 910001 + i, username: 'Synthetic ' + role, email: role + '@ui-parity.invalid',
      password: sha1(PASSWORD + sha1(passsalt)), passsalt, study: true,
      role: role === 'admin' ? 'admin' : 'member', type: 'site', add_time: t, up_time: t};
  });
  const member = (role, uid) => {
    const user = collections.user.find(item => item._id === uid);
    return {uid, role, username: user.username, email: user.email, email_notice: false};
  };
  collections.group = Array.from({length: 26}, (_, i) => ({_id: i ? 920000 + i : IDS.group,
    uid: IDS.owner, group_name: i ? 'Synthetic group ' + String(i).padStart(2, '0') : 'Synthetic parity group',
    group_desc: 'Synthetic comparison only. 中文 / English.', type: 'public',
    members: [member('owner', IDS.owner)], custom_field1: {name: 'Review status', enable: true}, add_time: t, up_time: t}));
  for (const user of collections.user) collections.group.push({_id: 920100 + user._id - IDS.admin,
    uid: user._id, group_name: 'Personal: ' + user.username, group_desc: 'Synthetic private personal group',
    type: 'private', members: [], custom_field1: {name: '', enable: false}, add_time: t, up_time: t});
  const project = (id, name, type, group) => ({_id: id, uid: IDS.owner, name,
    group_id: group, project_type: type, members: [member('dev', IDS.developer)],
    basepath: '', switch_notice: false, desc: '<p>Synthetic project: 中文 / English</p>',
    env: [{name: 'local-synthetic', domain: 'http://127.0.0.1:3000/mock/' + id,
      header: [{name: 'X-Parity-Fixture', value: FORMAT}], global: [{name: 'sampleId', value: '42'}]}],
    icon: 'code-o', color: 'blue', tag: [{name: 'synthetic', desc: 'Comparison only'}, {name: 'review', desc: 'Review state'}],
    pre_script: '', after_script: '', project_mock_script: '', is_mock_open: true,
    strice: false, is_json5: true, add_time: t, up_time: t});
  collections.project = [project(IDS.project, 'Synthetic parity project', 'private', IDS.group),
    project(IDS.privateProject, 'Synthetic personal private project', 'private', 920101),
    project(IDS.publicProject, 'Synthetic public project', 'public', IDS.group)];
  for (let i = 1; i <= 25; i++) collections.project.push(project(930000 + i,
    'Synthetic pagination project ' + String(i).padStart(2, '0'), i % 2 ? 'private' : 'public', IDS.group));
  collections.interface_cat = [
    {_id: IDS.category, name: '01 Rich examples', project_id: IDS.project},
    {_id: 901012, name: '02 Empty category', project_id: IDS.project},
    {_id: 901022, name: '03 Pagination', project_id: IDS.project},
    {_id: 901032, name: 'Public endpoints', project_id: IDS.publicProject}
  ].map((item, index) => ({...item, uid: IDS.owner, desc: 'Synthetic category', index, add_time: t, up_time: t}));
  const requestSchema = {type: 'object', title: 'Synthetic nested request', properties: {
    profile: {type: 'object', description: 'Profile fields', properties: {
      displayName: {type: 'string', minLength: 1, description: 'Display name'},
      enabled: {type: 'boolean', default: true, description: 'Whether enabled'}}, required: ['displayName']},
    items: {type: 'array', description: 'Line items', items: {type: 'object', properties: {
      sku: {type: 'string', description: 'Synthetic SKU'}, quantity: {type: 'integer', minimum: 1}}, required: ['sku']}},
    mode: {type: 'string', enum: ['preview', 'commit'], description: 'Synthetic enum'}}, required: ['profile']};
  const responseSchema = {type: 'object', properties: {code: {type: 'integer', enum: [0], description: 'Success'},
    data: {type: 'object', properties: {id: {type: 'integer', enum: [42]},
      name: {type: 'string', enum: ['Synthetic sample']},
      tags: {type: 'array', items: {type: 'string'}, minItems: 2, maxItems: 2}}}}, required: ['code', 'data']};
  const endpoint = (id, title, method, endpointPath, overrides = {}) => ({_id: id, title, method,
    path: endpointPath, query_path: {path: endpointPath, params: []}, project_id: IDS.project,
    catid: IDS.category, uid: IDS.owner, edit_uid: 0, status: 'done', type: 'static', index: id,
    desc: '<h2>Synthetic documentation</h2><p>中文说明 and English. No customer data.</p><ul><li>Nested schemas</li><li>Long descriptions wrap predictably.</li></ul>',
    markdown: '## Synthetic documentation\n\n中文说明 and English. No customer data.\n\n- Nested schemas\n- Long descriptions wrap predictably.',
    req_params: [], req_query: [{name: 'verbose', value: 'true', example: 'true', required: '0', desc: 'Include optional details'}],
    req_headers: [{name: 'X-Parity-Fixture', value: FORMAT, example: FORMAT, required: '0', desc: 'Synthetic header'}],
    req_body_type: 'json', req_body_is_json_schema: true, req_body_other: JSON.stringify(requestSchema), req_body_form: [],
    res_body_type: 'json', res_body_is_json_schema: true, res_body: JSON.stringify(responseSchema),
    custom_field_value: 'Reviewed', field2: '', field3: '', api_opened: false, tag: ['synthetic'], add_time: t, up_time: t,
    ...overrides});
  collections.interface = [endpoint(IDS.interface, 'Nested JSON: get sample', 'GET', '/samples/{id}', {
    type: 'var', req_params: [{name: 'id', desc: 'Synthetic sample ID', example: '42'}]}),
    endpoint(901013, 'Nested JSON: create sample', 'POST', '/samples'),
    endpoint(901014, 'Raw JSON example', 'POST', '/raw-json', {req_body_is_json_schema: false,
      req_body_other: '{"message":"Synthetic 中文","count":2}', res_body_is_json_schema: false, res_body: '{"code":0,"message":"Synthetic response"}'}),
    endpoint(901015, 'Raw text example', 'POST', '/text', {req_body_type: 'raw', req_body_is_json_schema: false,
      req_body_other: 'Synthetic plain text\nSecond line', res_body_type: 'text', res_body_is_json_schema: false, res_body: 'Synthetic OK'}),
    endpoint(901016, 'URL-encoded form', 'POST', '/form', {req_body_type: 'form', req_body_is_json_schema: false,
      req_body_other: '', req_headers: [{name: 'Content-Type', value: 'application/x-www-form-urlencoded', required: '1'}],
      req_body_form: [{name: 'title', type: 'text', example: 'Synthetic form', value: 'Synthetic form', desc: 'Required title', required: '1'},
        {name: 'note', type: 'text', example: 'Optional 中文', desc: 'Optional note', required: '0'}]}),
    endpoint(901017, 'Multipart upload', 'POST', '/upload', {req_body_type: 'form', req_body_is_json_schema: false,
      req_body_other: '', req_headers: [{name: 'Content-Type', value: 'multipart/form-data', required: '1'}],
      req_body_form: [{name: 'attachment', type: 'file', desc: 'Use upload.txt only', required: '1'},
        {name: 'label', type: 'text', example: 'Synthetic upload', required: '0'}]}),
    endpoint(901018, 'Unfinished empty endpoint', 'DELETE', '/samples/{id}', {type: 'var', status: 'undone',
      req_params: [{name: 'id', desc: 'Synthetic sample ID', example: '42'}], req_query: [], req_headers: [],
      desc: '', markdown: '', req_body_other: '', req_body_is_json_schema: false, res_body: '', res_body_is_json_schema: false}),
    endpoint(901019, 'Public sample', 'GET', '/public', {project_id: IDS.publicProject, catid: 901032, api_opened: true})];
  for (let i = 1; i <= 31; i++) collections.interface.push(endpoint(940000 + i,
    'Pagination endpoint ' + String(i).padStart(2, '0'), i % 2 ? 'GET' : 'POST', '/pagination/' + i,
    {catid: 901022, status: i % 3 ? 'done' : 'undone', tag: i % 2 ? ['synthetic'] : ['review']}));
  collections.interface_col = [{_id: IDS.collection, uid: IDS.owner, project_id: IDS.project,
    name: 'Synthetic smoke collection', desc: 'Local Mock only. Scripts disabled until the runner gate passes.', index: 0,
    test_report: '{}', checkHttpCodeIs200: true, checkResponseSchema: false,
    checkResponseField: {name: 'code', value: '0', enable: true}, checkScript: {content: '', enable: false}, add_time: t, up_time: t},
  {_id: 901041, uid: IDS.owner, project_id: IDS.project, name: 'Empty collection', desc: 'Empty state', index: 1,
    test_report: '{}', checkHttpCodeIs200: false, checkResponseSchema: false,
    checkResponseField: {name: 'code', value: '0', enable: false}, checkScript: {content: '', enable: false}, add_time: t, up_time: t}];
  collections.interface_case = [IDS.interface, 901014, 901016].map((id, index) => ({_id: IDS.case + index,
    casename: ['Synthetic GET sample', 'Synthetic raw JSON', 'Synthetic form'][index], uid: IDS.owner,
    col_id: IDS.collection, project_id: IDS.project, interface_id: id, index, case_env: 'local-synthetic',
    req_params: index ? [] : [{name: 'id', value: '42'}], req_headers: [],
    req_query: [{name: 'verbose', value: 'true', enable: true}, {name: 'ignored', value: 'disabled', enable: false}],
    req_body_form: index === 2 ? [{name: 'title', value: 'Synthetic form', enable: true}] : [],
    req_body_other: index === 1 ? '{"message":"Synthetic 中文","count":2}' : '',
    test_status: '', test_res_body: '', test_res_header: {}, mock_verify: false, enable_script: false, test_script: '', add_time: t, up_time: t}));
  collections.wiki = [{_id: IDS.wiki, project_id: IDS.project, uid: IDS.owner, edit_uid: 0,
    username: 'Synthetic owner', desc: '<h1>Synthetic wiki</h1><p>中文文档 / English</p><pre><code>{"sample":42}</code></pre>',
    markdown: '# Synthetic wiki\n\n中文文档 / English\n\n```json\n{"sample":42}\n```', add_time: t, up_time: t}];
  collections.follow = [IDS.admin, IDS.owner, IDS.developer].map((uid, index) => ({_id: 950001 + index,
    uid, projectid: IDS.project, projectname: 'Synthetic parity project', icon: 'code-o', color: 'blue'}));
  collections.log = Array.from({length: 42}, (_, i) => ({_id: 960001 + i, uid: IDS.owner,
    username: 'Synthetic owner', type: 'project', typeid: IDS.project, add_time: t - i * 3600,
    content: 'Synthetic activity ' + String(i + 1).padStart(2, '0') + ': reviewed documentation',
    data: i % 5 ? {interface_id: IDS.interface, type: 'interface'} : {type: 'wiki'}}));
  collections.statis_mock = [];
  for (let day = 0; day < 90; day++) for (let hit = 0; hit < 1 + day % 7; hit++) {
    const stamp = anchor - day * 86400000 + hit * 1000;
    collections.statis_mock.push({_id: 970001 + collections.statis_mock.length,
      interface_id: IDS.interface, project_id: IDS.project, group_id: IDS.group,
      time: Math.floor(stamp / 1000), date: new Date(stamp).toISOString().slice(0, 10), ip: '127.0.0.1'});
  }
  collections.token = collections.project.map((item, i) => ({_id: 980001 + i, project_id: item._id,
    token: sha1('synthetic-not-secret-project-token-' + item._id)}));
  collections.identitycounters = Object.entries(collections).map(([model, docs]) => ({model, field: '_id',
    count: Math.max(...docs.map(item => item._id))}));
  const result = {format: FORMAT, synthetic: true, date, ids: IDS, collections};
  validateFixture(result);
  return result;
}
function validateFixture(fixture) {
  assert(fixture.format === FORMAT && fixture.synthetic === true, 'not a synthetic parity fixture');
  utcDate(fixture.date);
  const c = fixture.collections;
  const names = ['user','group','project','interface_cat','interface','interface_col','interface_case','wiki','follow','log','statis_mock','token','identitycounters'];
  assert(JSON.stringify(Object.keys(c).sort()) === JSON.stringify(names.sort()), 'unexpected collection');
  const ids = {};
  for (const [name, docs] of Object.entries(c)) {
    assert(Array.isArray(docs) && docs.length, 'empty collection ' + name);
    if (name === 'identitycounters') continue;
    ids[name] = new Set();
    for (const doc of docs) { assert(Number.isSafeInteger(doc._id) && doc._id > 900000, 'unsafe ID');
      assert(!ids[name].has(doc._id), 'duplicate ID'); ids[name].add(doc._id); }
  }
  const ref = (name, id) => assert(ids[name].has(id), 'missing reference ' + name + ':' + id);
  for (const user of c.user) {
    assert(user.email.endsWith('@ui-parity.invalid'), 'non-synthetic email');
    assert(user.password === sha1(PASSWORD + sha1(user.passsalt)), 'invalid password hash');
  }
  for (const group of c.group) { ref('user', group.uid); for (const m of group.members) ref('user', m.uid); }
  for (const p of c.project) {
    ref('group', p.group_id); ref('user', p.uid); for (const m of p.members) ref('user', m.uid);
    assert(p.switch_notice === false && p.pre_script === '' && p.after_script === '' && p.project_mock_script === '', 'unsafe project execution');
    assert(p.env.every(env => (env.name === 'local-synthetic' && env.domain === 'http://127.0.0.1:3000/mock/' + p._id) ||
      (env.name === 'browser-synthetic' && [4174,4175].some(port => env.domain === 'http://127.0.0.1:' + port + '/mock/' + p._id))), 'nonlocal environment');
  }
  for (const category of c.interface_cat) {ref('project', category.project_id); ref('user', category.uid);}
  for (const endpoint of c.interface) {
    ref('project', endpoint.project_id); ref('interface_cat', endpoint.catid); ref('user', endpoint.uid);
    assert(c.interface_cat.find(cat => cat._id === endpoint.catid).project_id === endpoint.project_id, 'category project mismatch');
    for (const field of ['req_body_other','res_body']) if (endpoint[field === 'res_body' ? 'res_body_is_json_schema' : 'req_body_is_json_schema']) {
      const schema = JSON.parse(endpoint[field]); assert(schema.type === 'object', 'invalid schema');
      assert(!JSON.stringify(schema).includes('http'), 'external schema reference');
    }
  }
  for (const col of c.interface_col) {ref('project', col.project_id); ref('user', col.uid); assert(!col.checkScript.enable, 'scripts enabled');}
  for (const item of c.interface_case) {
    ref('interface_col', item.col_id); ref('interface', item.interface_id); ref('project', item.project_id); ref('user', item.uid);
    assert(c.interface_col.find(col => col._id === item.col_id).project_id === item.project_id &&
      c.interface.find(api => api._id === item.interface_id).project_id === item.project_id, 'case project mismatch');
    assert(!item.enable_script && item.test_script === '', 'scripts enabled');
  }
  for (const wiki of c.wiki) {ref('project', wiki.project_id); ref('user', wiki.uid);}
  for (const item of c.follow) {ref('project', item.projectid); ref('user', item.uid);}
  for (const item of c.log) {ref('project', item.typeid); ref('user', item.uid);}
  for (const item of c.token) ref('project', item.project_id);
  for (const item of c.statis_mock) {
    ref('project', item.project_id); ref('group', item.group_id); ref('interface', item.interface_id);
    assert(item.ip === '127.0.0.1' && new Date(item.time * 1000).toISOString().slice(0, 10) === item.date, 'invalid statistics date');
  }
  assert(new Set(c.statis_mock.map(row => row.date)).size === 90, 'expected 90 statistics days');
  assert(c.group.filter(group => group.type === 'public').length > 20 && c.project.filter(p => p.group_id === IDS.group).length > 20, 'pagination missing');
  for (const name of Object.keys(ids)) {
    const counters = c.identitycounters.filter(counter => counter.model === name && counter.field === '_id');
    assert(counters.length === 1 && counters[0].count === Math.max(...ids[name]), 'unsafe counter ' + name);
  }
  return true;
}
function checkRun(run) { assert(typeof run === 'string' && /^[a-z0-9][a-z0-9_]{5,23}$/.test(run), 'run must be 6–24 lowercase letters/digits/underscores'); }
function dbName(version, run) { checkRun(run); assert(['old','new'].includes(version), 'invalid version'); return 'ui_parity_' + version + '_' + run; }
function bindFixture(fixture, version) {
  assert(['old','new'].includes(version), 'invalid version');
  const bound = JSON.parse(JSON.stringify(fixture));
  const port = version === 'old' ? 4174 : 4175;
  for (const project of bound.collections.project) {
    project.env = project.env.filter(env => env.name !== 'browser-synthetic');
    project.env.push({name: 'browser-synthetic', domain: 'http://127.0.0.1:' + port + '/mock/' + project._id, header: [], global: []});
  }
  validateFixture(bound); return bound;
}
function renderMongoScript(fixture, {version, run, action}) {
  fixture = bindFixture(fixture, version);
  validateFixture(fixture); const database = dbName(version, run);
  assert(['claim','seed','verify'].includes(action), 'invalid Mongo action');
  const asyncShell = version === 'new', wait = asyncShell ? 'await ' : '';
  const marker = {_id: FORMAT, database, run, fixtureSha256: digest(fixture), state: 'claimed', synthetic: true};
  const prelude = `// SYNTHETIC DISPOSABLE DATABASE ONLY. Generated; no deletion/reset operations.\n` +
    `var expected = ${JSON.stringify(marker)};\n` +
    `function check(ok, message) { if (!ok) throw new Error(message); }\n` +
    `check(db.getName() === expected.database, 'Wrong database; refusing');\n` +
    `var connection = db.getMongo();\n` +
    `var address = typeof connection.host === 'string' ? connection.host : connection.getURI();\n` +
    `var uriParts = address.split('?');\n` +
    `check(uriParts.length <= 2 && /^(?:mongodb:\\/\\/)?127\\.0\\.0\\.1:27017(?:\\/[a-z0-9_]*|)$/.test(uriParts[0]), 'Only isolated container loopback:27017 is allowed');\n` +
    `check(!uriParts[1] || /^(?:(?:directConnection=true|appName=[a-zA-Z0-9+%._-]+|serverSelectionTimeoutMS=[0-9]+)(?:&|$))+$/.test(uriParts[1]), 'Unexpected connection options; refusing');\n` +
    `var names = ${wait}db.getCollectionNames();\n`;
  let body;
  if (action === 'claim') body = `check(names.length === 0, 'Claim requires a completely empty database');\n` +
    `${wait}db.getCollection(${JSON.stringify(MARKER)}).insertOne(expected);\nprint('Claimed synthetic database ' + expected.database);\n`;
  else {
    body = `check(names.indexOf(${JSON.stringify(MARKER)}) !== -1, 'Unmarked database; refusing');\n` +
      `var marks = db.getCollection(${JSON.stringify(MARKER)});\nvar mark = ${wait}marks.findOne({_id: expected._id});\n` +
      `check(mark && mark.synthetic === true && mark.database === expected.database && mark.run === expected.run && mark.fixtureSha256 === expected.fixtureSha256, 'Marker mismatch; refusing');\n`;
    const data = JSON.stringify(fixture.collections);
    if (action === 'seed') body += `check(mark.state === 'claimed' && names.length === 1 && (${wait}marks.countDocuments({})) === 1, 'Nonempty or already used database; refusing');\n` +
      `var locked = ${wait}marks.findOneAndUpdate({_id: expected._id, state: 'claimed'}, {$set: {state: 'seeding'}}, {returnNewDocument: false});\ncheck(locked && locked.state === 'claimed', 'Seed already started; refusing');\n` +
      `var collections = ${data};\nfor (var name of Object.keys(collections)) {\n  ${wait}db.getCollection(name).insertMany(collections[name]);\n}\n` +
      `${wait}db.getCollection('identitycounters').createIndex({field: 1, model: 1}, {unique: true});\n` +
      `${wait}marks.updateOne({_id: expected._id, state: 'seeding'}, {$set: {state: 'seeded'}});\nprint('Seeded ' + expected.database + ' / ' + expected.fixtureSha256);\n`;
    else body += `check(mark.state === 'seeded', 'Seed incomplete; refusing verification');\nvar collections = ${data};\n` +
      `function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') { var out = {}; Object.keys(value).sort().forEach(function(key) {out[key] = canonical(value[key]);}); return out;} return value; }\n` +
      `check(names.length === Object.keys(collections).length + 1, 'Unexpected collections; run verification before app startup');\n` +
      `for (var name of Object.keys(collections)) {\n check((${wait}db.getCollection(name).countDocuments({})) === collections[name].length, 'Count mismatch: ' + name);\n` +
      ` for (var expectedDoc of collections[name]) { var query = name === 'identitycounters' ? {model: expectedDoc.model, field: expectedDoc.field} : {_id: expectedDoc._id};\n` +
      `  var actualDoc = ${wait}db.getCollection(name).findOne(query); check(actualDoc, 'Missing document: ' + name);\n` +
      `  if (name === 'identitycounters') delete actualDoc._id;\n` +
      `  check(JSON.stringify(canonical(actualDoc)) === JSON.stringify(canonical(expectedDoc)), 'Content mismatch: ' + name);\n }\n}\n` +
      `print('VERIFIED equivalent synthetic fixture ' + expected.fixtureSha256 + ' in ' + expected.database);\n`;
  }
  return asyncShell ? `(async function() {\n${prelude}${body}})().catch(function(error) { print(error.message); quit(1); });\n` : `(function() {\n${prelude}${body}})();\n`;
}
function makeArtifacts({date, run}) {
  checkRun(run); const fixture = makeFixture({date});
  const artifacts = {'fixture.json': JSON.stringify(fixture, null, 2) + '\n'};
  const manifest = {format: FORMAT, status: 'GENERATED_OFFLINE_NOT_EXECUTED', date, run,
    fixtureSha256: digest(fixture), instanceFixtureSha256: {old: digest(bindFixture(fixture, 'old')), new: digest(bindFixture(fixture, 'new'))},
    originBindings: {serverModeInsideEachContainer: 'http://127.0.0.1:3000', browserMode: {old: 'http://127.0.0.1:4174', new: 'http://127.0.0.1:4175'},
      equivalence: 'All data is identical except project.env[name=browser-synthetic].domain origin; normalize only these two documented browser origins.'},
    databaseNames: {old: dbName('old',run), new: dbName('new',run)},
    counts: Object.fromEntries(Object.entries(fixture.collections).map(([name, docs]) => [name, docs.length])),
    ids: IDS, viewport: {width: 1920, height: 1080, deviceScaleFactor: 1},
    accounts: fixture.collections.user.map(user => ({email: user.email, password: PASSWORD, uid: user._id, role: user.role})),
    limitations: ['No services were started by this generator.', 'Old Node16/Mongo4.4 candidate is unvalidated and EOL; disposable isolated test only.',
      'Generated Mongo scripts have only offline unit coverage until actually run.', 'Browser execution and actual 1920x1080 viewport remain unverified.']};
  artifacts['manifest.json'] = JSON.stringify(manifest, null, 2) + '\n';
  for (const version of ['old','new']) {
    artifacts[version + '.fixture.json'] = JSON.stringify(bindFixture(fixture, version), null, 2) + '\n';
    for (const action of ['claim','seed','verify']) artifacts[version + '.' + action + '.js'] = renderMongoScript(fixture, {version, run, action});
    artifacts[version + '.config.json'] = JSON.stringify({port: 3000, host: '0.0.0.0', timeout: 10000,
      adminAccount: 'admin@ui-parity.invalid', closeRegister: false, versionNotify: false, plugins: [],
      db: {servername: 'mongo', DATABASE: dbName(version, run), port: 27017}, mail: {enable: false}}, null, 2) + '\n';
  }
  artifacts['routes.json'] = JSON.stringify(['/', '/login', '/group/' + IDS.group, '/add-project',
    '/project/' + IDS.project + '/interface/api', '/project/' + IDS.project + '/interface/api/' + IDS.interface,
    '/project/' + IDS.project + '/interface/col/' + IDS.collection, ...['activity','data','members','setting','wiki'].map(route => '/project/' + IDS.project + '/' + route),
    '/project/' + IDS.publicProject + '/interface/api/901019', '/statistic', '/user/profile/' + IDS.owner], null, 2) + '\n';
  artifacts['upload.txt'] = 'SYNTHETIC UI PARITY UPLOAD. No personal data.\n';
  artifacts['import.swagger2.json'] = JSON.stringify({swagger: '2.0', info: {title: 'Synthetic import', version: '1.0'},
    host: '127.0.0.1:3000', basePath: '/', schemes: ['http'], paths: {'/imported-synthetic': {get: {summary: 'Synthetic imported endpoint',
      responses: {'200': {description: 'Synthetic success', schema: {type: 'object', properties: {code: {type: 'integer'}}}}}}}}}, null, 2) + '\n';
  return artifacts;
}
function writeArtifacts(output, artifacts) {
  const target = path.resolve(output);
  assert(!fs.existsSync(target), 'output must be a new nonexistent directory; no overwrite/reset supported');
  fs.mkdirSync(target, {mode: 0o700});
  for (const [name, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(target, name), content, {flag: 'wx', mode: 0o600});
  return target;
}
function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    assert(['--date','--run','--out'].includes(argv[i]) && argv[i + 1] && !argv[i + 1].startsWith('--'),
      'Usage: node ui-parity-fixture.cjs --date YYYY-MM-DD --run unique_run_id --out NEW_DIRECTORY');
    const key = argv[i].slice(2); assert(!Object.prototype.hasOwnProperty.call(options, key), 'duplicate option'); options[key] = argv[i + 1];
  }
  assert(options.out, '--out is required'); const artifacts = makeArtifacts(options);
  const output = writeArtifacts(options.out, artifacts);
  process.stdout.write('Generated offline-only synthetic fixture: ' + output + '\nNo database connections or services were started.\n');
}
module.exports = {FORMAT, PASSWORD, MARKER, IDS, makeFixture, bindFixture, validateFixture, makeArtifacts, renderMongoScript, writeArtifacts, dbName, digest};
if (require.main === module) {try {main(process.argv.slice(2));} catch (error) {process.stderr.write(error.message + '\n'); process.exitCode = 1;}}
