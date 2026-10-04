'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createReadService, toDocumentationDTO, FIELDS } = require('../server/services/documentation/read-service');
const fixture = require('./fixtures/interface.json');
const copy = value => JSON.parse(JSON.stringify(value));
function adapter(record) {
  const calls = [];
  return { calls, findOne(query) {
    calls.push(['findOne', query]);
    return { select(fields) { calls.push(['select', fields]); return this; },
      lean() { calls.push(['lean']); return this; },
      async exec() { calls.push(['exec']); return record; } };
  } };
}
const request = { principal: { subject: 'synthetic-user' }, projectId: 11, interfaceId: 17 };
test('normalization preserves numeric IDs and exact raw schema and required encodings', () => {
  const dto = toDocumentationDTO(fixture);
  assert.equal(dto._id, 17);
  assert.equal(dto.project_id, 11);
  assert.equal(dto.req_query[0].required, '0');
  assert.equal(dto.req_headers[0].required, '1');
  assert.equal(dto.req_body_other, fixture.req_body_other);
  assert.equal(dto.res_body, fixture.res_body);
  assert.equal(dto.method, fixture.method);
  assert.equal(dto.path, fixture.path);
});
test('allowlist omits execution, environment, credentials, parameter values and examples', () => {
  const dto = toDocumentationDTO(fixture);
  assert.equal(JSON.stringify(dto).includes('SYNTHETIC_SECRET'), false);
  for (const key of ['token', 'env', 'pre_script', 'uid', 'custom_plugin_secret']) assert.equal(key in dto, false);
  for (const key of ['req_query', 'req_headers', 'req_params']) {
    assert.equal('value' in dto[key][0], false);
    assert.equal('example' in dto[key][0], false);
  }
});
test('DTO is detached and does not mutate input', () => {
  const input = copy(fixture);
  const dto = toDocumentationDTO(input);
  dto.req_query[0].name = 'changed';
  dto.tag.push('changed');
  assert.deepEqual(input, fixture);
});
test('fixed scoped read invokes authorization each time and only read adapter methods', async () => {
  const db = adapter(fixture);
  const grants = [];
  const service = createReadService({interfaces: db, authorize: async grant => {grants.push(grant); return true;}});
  await service.getInterface(request);
  await service.getInterface(request);
  assert.equal(grants.length, 2);
  assert.deepEqual(grants[0], { principal: request.principal, projectId: 11, scope: 'docs.read' });
  assert.deepEqual(db.calls.slice(0, 4), [ ['findOne', {_id:17,project_id:11}], ['select', FIELDS.join(' ')], ['lean'], ['exec'] ]);
  assert.deepEqual(Object.keys(service), ['getInterface']);
});
test('denial, truthy nonboolean and authorization errors fail before database reads', async () => {
  for (const authorize of [async()=>false, async()=>({allowed:true}), async()=>{throw Error('ACL unavailable');}]) {
    const db = adapter(fixture);
    await assert.rejects(createReadService({interfaces:db, authorize}).getInterface(request));
    assert.equal(db.calls.length, 0);
  }
});
test('cross-project or wrong-ID adapter records fail closed', async () => {
  for (const record of [null, {...fixture, project_id:12}, {...fixture, _id:18}]) {
    await assert.rejects(createReadService({interfaces:adapter(record),authorize:async()=>true}).getInterface(request), {code:'NOT_FOUND'});
  }
});
test('Mongo operator injection and lossy/non-numeric identifiers fail before ACL/DB', async () => {
  for (const invalid of ['11', {$ne:null}, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER+1]) {
    const db = adapter(fixture);
    const service = createReadService({interfaces:db,authorize:async()=>assert.fail('unexpected ACL call')});
    await assert.rejects(service.getInterface({...request,projectId:invalid}),{code:'INVALID_ID'});
    await assert.rejects(service.getInterface({...request,interfaceId:invalid}),{code:'INVALID_ID'});
    assert.equal(db.calls.length,0);
  }
});
test('raw documentation is not falsely asserted free of secrets', () => {
  const record = {...fixture, markdown:'Accidental pasted credential', res_body:'raw response may contain sensitive data'};
  const dto = toDocumentationDTO(record);
  assert.equal(dto.markdown, record.markdown);
  assert.equal(dto.res_body, record.res_body);
});
