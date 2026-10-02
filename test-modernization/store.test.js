'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createStore}=require('../server/services/documentation/store');
const copy=value=>JSON.parse(JSON.stringify(value));
function setup() {
  let record={_id:17,project_id:11,path:'/before',method:'GET',desc:'old',markdown:'old',res_body:'exact schema'};
  const proposals=new Map(),nodes=new Map();
  const revisions={insertOne:async row=>nodes.set(row._id,copy(row)),findOne:async query=>{const row=nodes.get(query._id);return row&&Object.entries(query).every(([k,v])=>row[k]===v)?copy(row):null;}};
  const interfaces={findOne:async filter=>filter._id===record._id && filter.project_id===record.project_id ? copy(record):null,
    updateOne:async(filter,update)=>{
      if(JSON.stringify(record)!==JSON.stringify(filter.$expr.$eq[1].$literal)) return {matchedCount:0};
      record={...record,...copy(update.$set)};for(const key of Object.keys(update.$unset||{}))delete record[key];return{matchedCount:1};
    }};
  return {nodes,revisions,store:createStore({interfaces,revisions,proposals:{insertOne:async row=>proposals.set(row._id,copy(row)),findOne:async query=>{const row=proposals.get(query._id);return row && row.projectId===query.projectId && row.interfaceId===query.interfaceId ? copy(row):null;}},now:()=> '2026-10-02T00:00:00.000Z'}),mutate:update=>{record={...record,...update};},get:()=>copy(record)};
}
test('two concurrent accepts have exactly one winner and history is appended atomically',async()=>{
  const {store,get}=setup();const proposal=await store.propose(11,17,{desc:'new',markdown:'new'},9);
  const results=await Promise.allSettled([store.accept(11,17,proposal.id,9),store.accept(11,17,proposal.id,9)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.filter(result=>result.status==='rejected')[0].reason.code,'VERSION_CONFLICT');
  assert.equal(get().docs_history,undefined);assert.equal((await store.history(11,17)).revisions.length,2);assert.equal(get().docs_revision,1);
});
test('legacy semantic write without a revision bump invalidates proposal',async()=>{
  const {store,mutate,get}=setup();const proposal=await store.propose(11,17,{desc:'new',markdown:'new'},9);
  mutate({path:'/changed'});
  await assert.rejects(store.accept(11,17,proposal.id,9),{code:'VERSION_CONFLICT'});
  assert.equal(get().desc,'old');assert.equal(get().docs_history,undefined);
});
test('slow provider response cannot rebase over intervening edits',async()=>{
  const {store,mutate}=setup();const base=await store.get(11,17);mutate({markdown:'manual'});
  await assert.rejects(store.saveProposal(11,17,base,{desc:'new',markdown:'new'},9),{code:'VERSION_CONFLICT'});
});
test('restore original creates another version while preserving latest semantic fields',async()=>{
  const {store,mutate,get}=setup();const proposal=await store.propose(11,17,{desc:'new',markdown:'new'},9);
  await store.accept(11,17,proposal.id,9);mutate({path:'/current'});
  await store.restore(11,17,0,9);
  assert.equal(get().desc,'old');assert.equal(get().path,'/current');assert.equal(get().docs_revision,2);
  assert.deepEqual((await store.history(11,17)).revisions.map(item=>item.kind),['restore','accept','baseline']);
  assert.equal((await store.history(11,17)).revisions.at(-1).version,0);
});
test('cross-project and invalid proposals fail closed',async()=>{
  const {store}=setup();const proposal=await store.propose(11,17,{desc:'new',markdown:'new'},9);
  await assert.rejects(store.accept(12,17,proposal.id,9),{code:'NOT_FOUND'});
  await assert.rejects(store.accept(11,17,{$ne:null},9),{code:'INVALID_ID'});
});
test('store atomically persists annotation fields and restores baseline without changing schema semantics',async()=>{
 const {store,mutate,get}=setup();
 mutate({req_query:[{name:'page',desc:'old',required:'1'}],res_body_is_json_schema:true,res_body:'{"type":"object","properties":{"id":{"type":"string","default":"secret"}}}'});
 const proposal=await store.propose(11,17,{desc:'new',markdown:'new',descriptionEdits:[{field:'req_query',index:0,desc:'Page number'},{field:'res_body',pointer:'/properties/id/description',description:'Identifier'}]},9);
 await store.accept(11,17,proposal.id,9);
 assert.equal(get().req_query[0].desc,'Page number');assert.equal(JSON.parse(get().res_body).properties.id.description,'Identifier');
 assert.equal((await store.history(11,17)).revisions[0].fieldHistoryAvailable,true);
 const schema=JSON.parse(get().res_body);schema.properties.id.type='integer';mutate({res_body:JSON.stringify(schema)});
 await store.restore(11,17,0,9);
 assert.equal(get().req_query[0].desc,'old');assert.equal(JSON.parse(get().res_body).properties.id.description,undefined);assert.equal(JSON.parse(get().res_body).properties.id.type,'integer');assert.equal(JSON.parse(get().res_body).properties.id.default,'secret');
});
test('legacy history clearly discloses absent annotation history and leaves current annotations alone',async()=>{
 const {store,mutate,get}=setup();mutate({req_query:[{name:'page',desc:'current'}],docs_revision:1,docs_history:[{version:1,parentVersion:0,interfaceId:17,projectId:11,kind:'legacy-write',before:{desc:'original',markdown:'original'},after:{desc:'legacy',markdown:'legacy'}}]});
 const history=await store.history(11,17);assert.equal(history.revisions[0].fieldHistoryAvailable,false);assert.equal(history.revisions[1].fieldHistoryAvailable,false);
 await store.restore(11,17,0,9);assert.equal(get().req_query[0].desc,'current');assert.equal(get().desc,'original');
});
test('prepared losing CAS records stay unreachable, including with a guessed version cursor',async()=>{
 const {store,nodes,get}=setup();const proposal=await store.propose(11,17,{desc:'new',markdown:'new'},9);
 await Promise.allSettled([store.accept(11,17,proposal.id,9),store.accept(11,17,proposal.id,9)]);
 assert.equal(nodes.size,4);assert.equal((await store.history(11,17,{cursor:1})).revisions.length,2);
 const committed=get().docs_revision_head;
 assert.equal([...nodes.values()].filter(x=>x.version===1&&x._id!==committed).length,1);
 await assert.rejects(store.history(11,17,{cursor:2}),{code:'INVALID_INPUT'});
});
test('history rejects corrupted ownership, project, version and ancestry before returning any page',async()=>{
 for(const damage of [{projectId:99},{interfaceId:99},{ownerId:99},{version:8},{parentVersion:8},{parentId:'00000000-0000-0000-0000-000000000000'}]) {
  const {store,nodes,get}=setup();const p=await store.propose(11,17,{desc:'new',markdown:'new'},9);await store.accept(11,17,p.id,9);
  Object.assign(nodes.get(get().docs_revision_head),damage);
  await assert.rejects(store.history(11,17,{limit:1}),{code:'INVALID_REVISION'});
  await assert.rejects(store.restore(11,17,0,9),{code:'INVALID_REVISION'});
 }
});
test('unchanged accept and restore do not consume revision versions or create records',async()=>{
 const {store,nodes,get}=setup();const p=await store.propose(11,17,{desc:'old',markdown:'old'},9);
 const accepted=await store.accept(11,17,p.id,9);assert.equal(accepted.unchanged,true);assert.equal(nodes.size,0);
 const restored=await store.restore(11,17,0,9);assert.equal(restored.unchanged,true);assert.equal(get().docs_revision,undefined);
});
test('500 embedded revisions migrate lazily without losing versions or freezing the next write',async()=>{
 const {store,mutate,get,nodes}=setup();const old=Array.from({length:500},(_,i)=>({interfaceId:17,projectId:11,parentVersion:i,version:i+1,kind:'legacy-write',actorId:null,createdAt:null,before:{desc:String(i),markdown:String(i)},after:{desc:String(i+1),markdown:String(i+1)}}));
 mutate({docs_history:old,docs_revision:500,desc:'500',markdown:'500'});
 const p=await store.propose(11,17,{desc:'501',markdown:'501'},9);await store.accept(11,17,p.id,9);
 assert.equal(get().docs_revision,501);assert.equal(get().docs_history,undefined);assert.equal(nodes.size,502);
 let cursor,versions=[];
 do {const page=await store.history(11,17,{limit:73,...(cursor===undefined?{}:{cursor})});assert.ok(page.revisions.length<=73);versions.push(...page.revisions.map(x=>x.version));cursor=page.nextCursor;}while(cursor!==null);
 assert.deepEqual(versions,Array.from({length:502},(_,i)=>501-i));
 await store.restore(11,17,0,9);assert.equal(get().desc,'0');assert.equal(get().docs_revision,502);
});
