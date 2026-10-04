'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createProposal,previewProposal,acceptProposal}=require('../server/services/documentation/proposals');
const {plain,createStore}=require('../server/services/documentation/store');
const {outboundPayload}=require('../server/services/documentation/outbound');
const {toDocumentationDTO}=require('../server/services/documentation/read-service');
const lease={edit_uid:9,edit_lock_token:'synthetic-lease-only',edit_lock_expires_at:46000};
const doc={_id:17,project_id:11,version:0,desc:'before',markdown:'before',path:'/synthetic',method:'GET',...lease};
const audit={actorId:9,now:'2026-10-03T00:00:00.000Z'};
function noLease(value){for(const key of Object.keys(lease))assert.equal(Object.hasOwn(value,key),false);}
test('documentation hashes ignore exactly top-level lease state while real and nested fields still conflict',()=>{
 const proposal=createProposal(doc,{desc:'after',markdown:'after'},audit);
 const heartbeat={...doc,edit_uid:10,edit_lock_token:'synthetic-takeover',edit_lock_expires_at:61000};
 noLease(previewProposal(heartbeat,proposal));noLease(acceptProposal(heartbeat,proposal,audit).document);
 const released={...doc};for(const key of Object.keys(lease))delete released[key];assert.equal(createProposal(released,{desc:'after',markdown:'after'},audit).baseHash,proposal.baseHash);
 for(const change of[{markdown:'different'},{res_body:'different'},{up_time:5},{uid:10},{unknown_plugin:{edit_lock_token:'real nested data'}}])assert.throws(()=>previewProposal({...heartbeat,...change},proposal),{code:'VERSION_CONFLICT'});
 noLease(plain({...doc,docs_revision:0}));noLease(toDocumentationDTO(doc));noLease(outboundPayload(doc));
});

const workerUri=process.env.YAPI_PARITY_DOCS_MONGO_URI;
const ciUri=process.env.CI==='true' ? process.env.YAPI_TEST_MONGO_URI : undefined;
const uri=workerUri||ciUri;
test('real Mongo Docs commits tolerate lease takeover but reject unknown BSON/content races', {skip:!uri},async()=>{
 const parsed=new URL(uri);let ownedDatabase,ownedRun;
 if(workerUri){
  assert.equal(parsed.hostname,'parity-fast-collections-new-mongo');assert.equal(parsed.pathname,'/parity_fast_collections_new_fastb1003');
 }else{
  assert.equal(process.env.CI,'true');assert.equal(parsed.protocol,'mongodb:');
  assert.ok(['127.0.0.1','localhost'].includes(parsed.hostname));
  assert.ok(parsed.pathname===''||parsed.pathname==='/');
  assert.equal(parsed.username,'');assert.equal(parsed.password,'');assert.equal(parsed.search,'');assert.equal(parsed.hash,'');
  ownedRun=randomUUID();ownedDatabase='yapi_docs_lease_ci_'+ownedRun.replace(/-/g,'');
 }
 const mongoose=require('mongoose'),client=new mongoose.mongo.MongoClient(uri);await client.connect();const db=client.db(ownedDatabase);
 if(ownedDatabase){
  await db.collection('_ui_parity_fixture').insertOne({_id:'docs-lease-ci',synthetic:true,run:ownedRun,database:ownedDatabase});
 }else{
  const marker=await db.collection('_ui_parity_fixture').findOne({_id:'yapi-ui-parity-v1'});assert.equal(marker.synthetic,true);assert.equal(marker.run,'fastb1003');assert.equal(marker.fixtureSha256,'6703c4b0130597ec5874fce801054a915767b93b82429782b294f1cb0ce42f0c');
 }
 const prefix='parity_docs_lease_'+randomUUID().replace(/-/g,''),interfaces=db.collection(prefix+'_interfaces'),proposals=db.collection(prefix+'_proposals'),revisions=db.collection(prefix+'_revisions');
 const seed={...doc};delete seed.version;seed.unknown_plugin={when:new Date('2020-01-01'),id:new mongoose.mongo.ObjectId(),large:mongoose.mongo.Long.fromString('9007199254740993')};
 let race=null,attempts=0;
 const adapter={findOne:q=>interfaces.findOne(q),updateOne:async(q,u)=>{attempts++;if(race){const action=race;race=null;await action();}return interfaces.updateOne(q,u);}};
 const store=createStore({interfaces:adapter,proposals,revisions,now:()=>audit.now});
 const takeover=()=>interfaces.updateOne({_id:17},{$set:{edit_uid:10,edit_lock_token:'synthetic-new-owner',edit_lock_expires_at:99999}});
 try{
  await interfaces.insertOne(seed);const base=await store.get(11,17);await takeover();const proposal=await store.saveProposal(11,17,base,{desc:'accepted',markdown:'accepted'},9);
  race=()=>interfaces.updateOne({_id:17},{$set:{edit_uid:12,edit_lock_token:'synthetic-second-takeover',edit_lock_expires_at:123456}});
  const accepted=await store.accept(11,17,proposal.id,9);assert.equal(attempts,1);noLease(accepted.document);const saved=await interfaces.findOne({_id:17});assert.equal(saved.edit_uid,12);assert.equal(saved.edit_lock_token,'synthetic-second-takeover');assert.equal(saved.edit_lock_expires_at,123456);assert.deepEqual(saved.unknown_plugin,seed.unknown_plugin);assert.equal(saved.docs_revision,1);
  race=()=>interfaces.updateOne({_id:17},{$set:{edit_uid:13,edit_lock_token:'synthetic-restore-takeover',edit_lock_expires_at:234567}});
  noLease((await store.restore(11,17,0,9,1)).document);assert.equal(attempts,2);const restored=await interfaces.findOne({_id:17});assert.equal(restored.markdown,'before');assert.equal(restored.edit_uid,13);assert.equal(restored.edit_lock_token,'synthetic-restore-takeover');assert.equal(restored.docs_revision,2);assert.deepEqual(restored.unknown_plugin,seed.unknown_plugin);
  for(const field of ['res_body','unknown_plugin']){
   const p=await store.propose(11,17,{desc:'must not commit',markdown:'must not commit'},9);const before=await interfaces.findOne({_id:17});race=()=>interfaces.updateOne({_id:17},{$set:{[field]:field==='res_body'?'raw changed without version':{bson:new Date('2030-01-01'),edit_lock_expires_at:888}}});await assert.rejects(store.accept(11,17,p.id,9),{code:'VERSION_CONFLICT'});const after=await interfaces.findOne({_id:17});assert.equal(after.docs_revision,before.docs_revision);assert.equal(after.docs_revision_head,before.docs_revision_head);assert.equal(after.markdown,before.markdown);
  }
  const {writeLegacyInterface}=require('../server/services/documentation/legacy-write');const isolated=new mongoose.Mongoose(),model=isolated.model('lease_fixture',new mongoose.Schema({_id:Number,project_id:Number,desc:String,markdown:String,up_time:Number,edit_uid:Number,edit_lock_token:String,edit_lock_expires_at:Number}));model.db.collection=()=>revisions;model.collection.findOne=q=>interfaces.findOne(q);model.collection.updateOne=async(q,u)=>{await takeover();return interfaces.updateOne(q,u);};await writeLegacyInterface(model,17,{desc:'legacy',markdown:'legacy',edit_uid:777,edit_lock_token:'injected',edit_lock_expires_at:1},{revisions,now:()=>new Date(audit.now),maxAttempts:1});const legacy=await interfaces.findOne({_id:17});assert.equal(legacy.markdown,'legacy');assert.equal(legacy.edit_lock_token,'synthetic-new-owner');assert.equal(legacy.edit_uid,10);assert.equal(legacy.edit_lock_expires_at,99999);
  const history=await store.history(11,17);for(const r of history.revisions){if(r.before)noLease(r.before);if(r.after)noLease(r.after);}
 }finally{
  try{
   if(ownedDatabase){
    const marker=await db.collection('_ui_parity_fixture').findOne({_id:'docs-lease-ci'});
    assert.equal(marker.synthetic,true);assert.equal(marker.run,ownedRun);assert.equal(marker.database,ownedDatabase);assert.equal(db.databaseName,ownedDatabase);
    await db.dropDatabase();
   }else await Promise.all([interfaces.drop(),proposals.drop(),revisions.drop()]);
  }finally{await client.close();}
 }
});
