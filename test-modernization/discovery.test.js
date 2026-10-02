'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createDiscovery}=require('../server/services/documentation/discovery');
test('discovery honors explicit project grants, live ACL and bounded escaped search',async()=>{
  const calls=[];
  const db={collection:name=>({findOne:async(filter,options)=>{calls.push([name,filter,options]);return {_id:filter._id,name:'synthetic'};},find:(filter,options)=>{calls.push([name,filter,options]);return {sort(spec){calls.push(spec);return this;},limit(value){calls.push(value);return this;},toArray:async()=>[]};}})};
  const auth=[];const discovery=createDiscovery({db,authorize:async grant=>{auth.push(grant);return grant.projectId===11;}});
  assert.deepEqual(await discovery.listProjects({principal:{projects:[11,12]}}),[{_id:11,name:'synthetic'}]);
  await discovery.listInterfaces({principal:{},projectId:11,query:'a.*(b)',limit:10,cursor:17});
  const filter=calls[1][1];assert.equal(filter.project_id,11);assert.deepEqual(filter._id,{$gt:17});assert.equal(filter.$or[0].title.$regex,'a\\.\\*\\(b\\)');assert.equal(calls[3],10);
  await assert.rejects(discovery.listCategories({principal:{},projectId:12}),{code:'FORBIDDEN'});
  await assert.rejects(discovery.listInterfaces({principal:{},projectId:11,limit:10000}),{code:'INVALID_ID'});
  assert.equal(auth.length,4);
});
