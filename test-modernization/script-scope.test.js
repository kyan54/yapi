'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../util-polyfill');
const yapi=require('../server/yapi');
const Collection=require('../server/controllers/interfaceCol');
const {read}=require('../server/sandbox/trusted-scope');
test('actual collection assertion route derives broker scope from authenticated user and checked stored project',async()=>{
 const original=yapi.commons;let called=0;
 yapi.commons={...original,resReturn:(data,errcode=0,errmsg='')=>({data,errcode,errmsg}),runCaseScript:async(params,col,interfaceId,scope)=>{called++;assert.deepEqual(read(scope),{userId:'9',projectId:'11'});return{errcode:0};}};
 try {
  const controller={colModel:{get:async()=>({project_id:11})},interfaceModel:{get:async()=>({project_id:11})},checkAuth:async(project,type,mode)=>{assert.equal(project,11);assert.equal(mode,'view');return true;},getUid:()=>9};
  const ctx={request:{body:{col_id:21,interface_id:17,networkScope:{userId:'1',projectId:'1'}}}};
  await Collection.prototype.runCaseScript.call(controller,ctx);assert.equal(called,1);assert.equal(ctx.body.errcode,0);
  await Collection.prototype.runCaseScript.call({...controller,checkAuth:async()=>false},ctx);assert.equal(ctx.body.errcode,403);assert.equal(called,1);
  await Collection.prototype.runCaseScript.call({...controller,interfaceModel:{get:async()=>({project_id:12})}},ctx);assert.equal(ctx.body.errcode,403);assert.equal(called,1);
 }finally{yapi.commons=original;}
});
test('verified-token auto-test rejects a collection belonging to another project before execution',async()=>{
 const originalHook=yapi.emitHook;yapi.emitHook=()=>{};
 const Open=require('../server/controllers/open');yapi.emitHook=originalHook;
 const original=yapi.commons;
 yapi.commons={...original,resReturn:(data,errcode=0,errmsg='')=>({data,errcode,errmsg})};
 try {
  const controller={$tokenAuth:true,handleEvnParams:()=>[],interfaceColModel:{get:async()=>({project_id:12})},projectModel:{get:()=>assert.fail('cross-project request reached execution')},getUid:()=>9};
  const ctx={query:{token:'synthetic'},params:{project_id:11,id:21}};
  await Open.prototype.runAutoTest.call(controller,ctx);assert.equal(ctx.body.errcode,403);
 }finally{yapi.commons=original;}
});
