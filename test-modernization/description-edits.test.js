'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {applyEdits,snapshot,validateEdits}=require('../server/services/documentation/description-edits');
const {createProposal,acceptProposal,restoreRevision,restoreDescriptionSnapshot}=require('../server/services/documentation/proposals');
const audit={actorId:7,now:'2026-10-02T00:00:00.000Z'};
const changes={desc:'new',markdown:'new'};
function fixture(){return {_id:1,project_id:2,version:0,desc:'old',markdown:'old',path:'/original',method:'GET',
 req_query:[{name:'page',type:'integer',required:'1',desc:'wrong',value:'secret'}],req_headers:[{name:'Accept',desc:'format'}],req_params:[{name:'id'}],req_body_form:[{name:'file',type:'file'}],
 res_body_is_json_schema:true,res_body:JSON.stringify({type:'object',required:['id'],properties:{id:{type:'string',default:'secret',enum:['a','b'],description:'wrong'},'a/b~c':{type:'number'},nested:{type:'array',items:{type:'object',properties:{x:{type:'boolean'}}}}},$defs:{shared:{type:'string'}},anyOf:[{type:'object'}],additionalProperties:false},null,2)};}
const edits=[{field:'req_query',index:0,desc:'Page number'},{field:'res_body',pointer:'/properties/id/description',description:'Identifier'},{field:'res_body',pointer:'/properties/a~1b~0c/description',description:'Escaped name'}];
function stripDescriptions(value){if(Array.isArray(value))return value.map(stripDescriptions);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='description').map(([k,v])=>[k,stripDescriptions(v)]));return value;}
test('annotation edits preserve original schema semantics and parameter metadata',()=>{
 const doc=fixture(),copy=JSON.stringify(doc),updated=applyEdits(doc,edits);
 assert.equal(JSON.stringify(doc),copy);assert.equal(updated.req_query[0].desc,'Page number');assert.equal(updated.req_query[0].value,'secret');
 assert.deepEqual(stripDescriptions(JSON.parse(updated.res_body)),stripDescriptions(JSON.parse(doc.res_body)));
 assert.equal(JSON.parse(updated.res_body).properties['a/b~c'].description,'Escaped name');
 assert.equal(updated.path,doc.path);assert.equal(updated.method,doc.method);
});
test('only trusted schema objects are editable, not arbitrary similarly named object members',()=>{
 const doc=fixture();const schema=JSON.parse(doc.res_body);schema.default={description:'literal'};schema.examples=[{description:'literal'}];schema.properties.ref={$ref:'https://evil.invalid/schema',description:'external'};doc.res_body=JSON.stringify(schema);
 for(const pointer of ['/properties/id/type','/properties/noSuch/description','/default/description','/examples/0/description','/required/0/description','/properties/ref/description','/properties/id/default/description','/constructor/description','/__proto__/description','/properties/a~2b/description']) {
  assert.throws(()=>applyEdits(doc,[{field:'res_body',pointer,description:'x'}]),{code:'INVALID_INPUT'});
 }
 assert.equal({}.description,undefined);
});
test('schema constructs, local refs and root annotations are safely enumerated without resolving refs',()=>{
 const doc=fixture();const schema=JSON.parse(doc.res_body);schema.properties.local={$ref:'#/$defs/shared'};doc.res_body=JSON.stringify(schema);
 const pointers=['/description','/$defs/shared/description','/anyOf/0/description','/properties/nested/items/properties/x/description','/properties/local/description'];
 const updated=applyEdits(doc,pointers.map(pointer=>({field:'res_body',pointer,description:'Known fact'})));
 assert.equal(JSON.parse(updated.res_body).properties.local.$ref,'#/$defs/shared');
 for(const pointer of pointers)assert.ok(snapshot(updated).some(item=>item.pointer===pointer&&item.description==='Known fact'));
});
test('malformed oversized duplicate and semantic edits are rejected',()=>{
 const invalid=[null,{},Array(201).fill(edits[0]),[edits[0],edits[0]],[{...edits[0],name:'renamed'}],[{field:'path',index:0,desc:'x'}],[{field:'req_query',index:-1,desc:'x'}],[{field:'req_query',index:0,desc:null}],[{...edits[1],description:'x'.repeat(8001)}]];
 for(const value of invalid)assert.throws(()=>validateEdits(value),{code:'INVALID_INPUT'});
 assert.throws(()=>applyEdits(fixture(),[{field:'req_query',index:2,desc:'x'}]),{code:'INVALID_INPUT'});
 const doc=fixture();doc.res_body='{"properties":{"__proto__":{"type":"string"}}}';assert.throws(()=>applyEdits(doc,[]),{code:'INVALID_INPUT'});
 const nonSchema=fixture();nonSchema.res_body_is_json_schema=false;assert.throws(()=>applyEdits(nonSchema,[edits[1]]),{code:'INVALID_INPUT'});
});
test('base CAS covers annotation changes and full before/after snapshots retain missing values',()=>{
 const doc=fixture(),proposal=createProposal(doc,{...changes,descriptionEdits:edits},audit);
 const result=acceptProposal(doc,proposal,audit);
 assert.equal(result.document.descriptionEdits,undefined);
 assert.equal(result.revision.before.descriptionSnapshot.find(v=>v.pointer==='/properties/a~1b~0c/description').description,null);
 assert.equal(result.revision.after.descriptionSnapshot.find(v=>v.pointer==='/properties/a~1b~0c/description').description,'Escaped name');
 doc.req_query[0].desc='concurrent';assert.throws(()=>acceptProposal(doc,proposal,audit),{code:'VERSION_CONFLICT'});
});
test('restoring version zero restores missing annotations and preserves current schema semantics',()=>{
 const original=fixture();const accepted=acceptProposal(original,createProposal(original,{...changes,descriptionEdits:edits},audit),audit);
 const current=accepted.document;const schema=JSON.parse(current.res_body);schema.properties.id.type='integer';schema.properties.id.default=99;schema.properties.newField={type:'string',description:'Keep newly added field'};current.res_body=JSON.stringify(schema);current.path='/new-path';
 const restored=restoreDescriptionSnapshot(current,accepted.revision.before,audit,0);
 const result=JSON.parse(restored.document.res_body);
 assert.equal(result.properties.id.description,'wrong');assert.equal(result.properties.id.type,'integer');assert.equal(result.properties.id.default,99);
 assert.equal(result.properties['a/b~c'].description,undefined);assert.equal(result.properties.newField.description,'Keep newly added field');assert.equal(restored.document.path,'/new-path');assert.equal(restored.document.req_query[0].desc,'wrong');
 const restoredAgain=restoreRevision(restored.document,accepted.revision,audit);
 assert.equal(JSON.parse(restoredAgain.document.res_body).properties.id.description,'Identifier');
});
test('restoration never resurrects removed fields or moves descriptions onto renamed parameters',()=>{
 const original=fixture();const result=acceptProposal(original,createProposal(original,{...changes,descriptionEdits:edits},audit),audit);
 const removed=JSON.parse(JSON.stringify(result.document));const schema=JSON.parse(removed.res_body);delete schema.properties.id;removed.res_body=JSON.stringify(schema);
 assert.throws(()=>restoreRevision(removed,result.revision,audit),{code:'DESCRIPTION_CONFLICT'});
 const renamed=JSON.parse(JSON.stringify(result.document));renamed.req_query[0].name='different';assert.throws(()=>restoreRevision(renamed,result.revision,audit),{code:'DESCRIPTION_CONFLICT'});
});
test('legacy history without field snapshots restores top-level descriptions only',()=>{
 const current=fixture();current.version=3;
 const restored=restoreDescriptionSnapshot(current,{desc:'legacy',markdown:'legacy'},audit,0);
 assert.equal(restored.document.res_body,current.res_body);assert.deepEqual(restored.document.req_query,current.req_query);
 assert.equal(restored.document.desc,'legacy');
});
test('schema numeric precision is never changed as a side effect of reserialization',()=>{
 for(const number of ['9007199254740993','0.123456789012345678901','1e999']) {
  const doc=fixture();doc.res_body='{"type":"number","maximum":'+number+'}';
  assert.throws(()=>applyEdits(doc,[{field:'res_body',pointer:'/description',description:'Number'}]),{code:'INVALID_INPUT'});
 }
 const doc=fixture();doc.res_body='{"type":"number","maximum":1.00e3,"description":"text 999999999999999999999"}';
 assert.equal(JSON.parse(applyEdits(doc,[{field:'res_body',pointer:'/description',description:'Number'}]).res_body).maximum,1000);
});
