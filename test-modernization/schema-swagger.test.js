'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {generate,normalizeLegacySchema}=require('../server/utils/schema-faker.mjs');
const {schemaValidator}=require('../common/utils');
const importSwagger=require('../exts/yapi-plugin-import-swagger/run');
test('modern generator preserves legacy draft04 exclusive bounds and does not rewrite stored schema',()=>{
  const schema={$schema:'http://json-schema.org/draft-04/schema#',type:'object',properties:{count:{type:'integer',minimum:10,exclusiveMinimum:true,maximum:15,exclusiveMaximum:true}},required:['count']};
  const before=JSON.stringify(schema);
  for(let index=0;index<30;index++){const generated=generate(schema);assert.ok(generated.count>10&&generated.count<15,JSON.stringify(generated));assert.equal(schemaValidator(schema,generated).valid,true);}
  assert.equal(JSON.stringify(schema),before);
  assert.deepEqual(normalizeLegacySchema({type:'number',minimum:10,exclusiveMinimum:false}),{type:'number',minimum:10});
});
test('Mock custom annotations, local refs and required/optional behavior remain usable without IO',()=>{
  const schema={type:'object',definitions:{id:{type:'integer',enum:[42]}},properties:{id:{$ref:'#/definitions/id'},label:{type:'string',mock:{mock:'fixed'}}},required:['id','label']};
  assert.deepEqual(generate(schema,{alwaysFakeOptionals:true}),{id:42,label:'fixed'});
  assert.throws(()=>generate({$ref:'https://secret.invalid/schema'}),/ref|resolve|remote/i);
});
test('Swagger v2 and v3 fixtures import independently and concurrently with stable method/path/schema output',async()=>{
  const clone=value=>JSON.parse(JSON.stringify(value));
  const v2=require('../test/swagger.v2.json'),v3=require('../test/swagger.v3.json');
  const old=await importSwagger(clone(v2));const modern=await importSwagger(clone(v3));
  assert.ok(old.apis.length>0);assert.ok(modern.apis.length>0);
  const pair=await Promise.all([importSwagger(clone(v2)),importSwagger(clone(v3))]);
  assert.deepEqual(pair,[old,modern]);
  for(const result of pair)for(const api of result.apis){assert.equal(typeof api.path,'string');assert.ok(api.path.startsWith('/'));assert.equal(typeof api.method,'string');}
});
test('malformed Swagger JSON rejects without a false empty import result',async()=>{
  await assert.rejects(importSwagger('{invalid'),SyntaxError);
});
