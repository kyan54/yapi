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
  const controller=Object.assign(Object.create(Collection.prototype), {
    colModel:{get:async()=>({_id:21,project_id:11})},
    caseModel:{get:async()=>({_id:31,col_id:21,project_id:11,interface_id:17})},
    interfaceModel:{get:async()=>({_id:17,project_id:11})},
    projectModel:{get:async()=>({_id:11,project_type:'private'})},
    checkAuth:async(project,type,mode)=>{assert.equal(project,11);assert.ok(['edit','view'].includes(mode));return true;},getUid:()=>9
  });
  const ctx={request:{body:{case_id:31,col_id:21,interface_id:17,networkScope:{userId:'1',projectId:'1'}}}};
  await controller.runCaseScript(ctx);assert.equal(called,1);assert.equal(ctx.body.errcode,0);
  const rejected=Object.assign(Object.create(Collection.prototype),controller,{checkAuth:async()=>false});
  await rejected.runCaseScript(ctx);assert.equal(ctx.body.errcode,403);assert.equal(called,1);
  const foreign=Object.assign(Object.create(Collection.prototype),controller,{interfaceModel:{get:async()=>({_id:17,project_id:12})},projectModel:{get:async()=>({_id:12,project_type:'private'})},checkAuth:async project=>project===11});
  await foreign.runCaseScript(ctx);assert.equal(ctx.body.errcode,403);assert.equal(called,1);

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
