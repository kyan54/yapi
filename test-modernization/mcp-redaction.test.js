'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {redactMcpDocumentation}=require('../server/services/documentation/mcp-redaction');
const {toDocumentationDTO}=require('../server/services/documentation/read-service');
const fixture=require('./fixtures/interface.json');
test('MCP retains useful safe literals but omits credentials in nested defaults examples query prose and raw bodies',()=>{
  const schema={type:'object',required:['password','state'],properties:{password:{type:'string',default:'cleartext-secret',examples:['another-secret']},state:{type:'string',enum:['open','closed'],default:'open'},count:{type:'integer',default:10},comment:{type:'string',example:'Bearer credential-secret'}}};
  const dto=toDocumentationDTO({...fixture,markdown:'password is hidden-password and token=hidden-token',req_query:[{name:'q',desc:'email alice@example.com',example:'query-secret'}],res_body:JSON.stringify(schema)});
  const result=redactMcpDocumentation(dto);const text=JSON.stringify(result);
  for(const secret of ['cleartext-secret','another-secret','credential-secret','hidden-password','hidden-token','alice@example.com','query-secret'])assert.equal(text.includes(secret),false,secret);
  const redacted=JSON.parse(result.res_body);assert.equal(redacted.properties.password.type,'string');assert.deepEqual(redacted.required,['password','state']);assert.deepEqual(redacted.properties.state.enum,['open','closed']);assert.equal(redacted.properties.state.default,'open');assert.equal(redacted.properties.count.default,10);
  assert.ok(result.redactions.some(item=>item.path==='/res_body/properties/password/default'));
});
test('MCP conservatively omits raw payload examples and labels unknown schema extensions',()=>{
  const result=redactMcpDocumentation(toDocumentationDTO({...fixture,req_body_is_json_schema:false,req_body_other:'private raw body',res_body:'{"type":"string","x-secret":"unknown-secret"}'}));
  assert.equal('req_body_other' in result,false);assert.equal(result.res_body.includes('unknown-secret'),false);assert.ok(result.redactions.length);
});
test('MCP recursively inspects object-valued defaults/examples and discovery metadata',()=>{
  const result=redactMcpDocumentation(toDocumentationDTO({...fixture,res_body:JSON.stringify({type:'object',properties:{password:{type:'string'}},default:{password:'hunter2'},examples:[{access_token:'secretToken'}]})}));
  assert.equal(result.res_body.includes('hunter2'),false);assert.equal(result.res_body.includes('secretToken'),false);
  const {redactDiscovery}=require('../server/services/documentation/mcp-redaction');
  const metadata=redactDiscovery([{_id:17,name:'Bearer secret-token',title:'password=private',path:'/v1?token=secret'}]);
  assert.equal(JSON.stringify(metadata).includes('secret-token'),false);assert.equal(JSON.stringify(metadata).includes('token=secret'),false);assert.equal(metadata[0]._id,17);
});


test('MCP tag metadata follows prose redaction and omits arbitrary nested payloads',()=>{
  const result=redactMcpDocumentation({tag:['safe tag','token=example-secret',{password:'nested-secret'}]});
  assert.deepEqual(result.tag,['safe tag','token=[REDACTED]']);
  assert.equal(JSON.stringify(result).includes('example-secret'),false);
  assert.equal(JSON.stringify(result).includes('nested-secret'),false);
  assert.deepEqual(result.redactions.map(row=>row.path),['/tag/1','/tag/2']);
});
