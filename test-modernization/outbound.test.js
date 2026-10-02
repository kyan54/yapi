'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {outboundPayload,payloadHash}=require('../server/services/documentation/outbound');
const fixture=require('./fixtures/interface.json');
test('outbound context removes nested examples/defaults/literals/headers and redacts known text patterns',()=>{
  const schema={type:'object',required:['password'],properties:{password:{type:'string',default:'secret-default',examples:['secret-example'],description:'password=cleartext'},token:{type:'string',enum:['enum-secret'],const:'const-secret', 'x-token':'extension-secret'},email:{type:'string',description:'Contact alice@example.com. Authorization: Bearer foo-secret'}},$ref:'https://internal.example/?token=ref-secret'};
  const input={...fixture,markdown:'Bearer token-secret Cookie=session-secret https://u:p@host.invalid/path?key=url-secret sk-0123456789secret',res_body:JSON.stringify(schema)};
  const output=outboundPayload(input);const text=JSON.stringify(output);
  for(const secret of ['secret-default','secret-example','cleartext','enum-secret','const-secret','extension-secret','alice@example.com','foo-secret','ref-secret','token-secret','session-secret','url-secret','0123456789secret','u:p'])assert.equal(text.includes(secret),false,secret);
  assert.equal(output.res_body.properties.password.type,'string');assert.deepEqual(output.res_body.required,['password']);assert.equal(input.res_body,JSON.stringify(schema));
});
test('raw payload examples are omitted and output is bound to provider for review',()=>{
  const output=outboundPayload({...fixture,res_body_is_json_schema:false,res_body:'private raw body'});
  assert.equal(JSON.stringify(output).includes('private raw body'),false);
  assert.notEqual(payloadHash(output,{model:'one'}),payloadHash(output,{model:'two'}));
});
test('unknown free text cannot be guaranteed secret-free and stays visible for human review',()=>{
  const output=outboundPayload({...fixture,markdown:'arbitrary unknown phrase'});
  assert.equal(output.markdown,'arbitrary unknown phrase');
});
