'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../util-polyfill');
const yapi = require('../server/yapi');
const InterfaceController = require('../server/controllers/interface');
yapi.commons = {...yapi.commons,resReturn:(data,errcode=0,errmsg='')=>({data,errcode,errmsg})};
test('actual update controller denies cross-project token before a write', async()=>{
  const ctx={params:{id:17,project_id:11,title:'unauthorized change'}};
  const controller={$tokenAuth:true,Model:{get:async()=>({_id:17,project_id:12}),up:()=>assert.fail('write reached')},checkAuth:()=>assert.fail('token bypass reached')};
  await InterfaceController.prototype.up.call(controller,ctx);
  assert.equal(ctx.body.errcode,400);
  assert.equal(ctx.body.data,null);
});
test('missing project scope on token fails closed',async()=>{
  const ctx={params:{id:17}};
  await InterfaceController.prototype.up.call({$tokenAuth:true,Model:{get:async()=>({_id:17,project_id:12})}},ctx);
  assert.equal(ctx.body.errcode,400);
});

test('import save awaits every update and does not mutate shared target ID',async()=>{
  let release,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  const blocked=new Promise(resolve=>{release=resolve;});
  yapi.commons={...yapi.commons,verifyPath:()=>true,validateParams:()=>({valid:true})};
  const targets=[{_id:17,res_body:'{}'},{_id:18,res_body:'{}'}],seen=[];
  const controller={$tokenAuth:true,schemaMap:{up:{}},Model:{getByPath:async()=>targets},up:async context=>{
    seen.push(context.params.id);if(seen.length===1){entered();await blocked;}context.body={errcode:0,data:null};
  }};
  const ctx={params:{project_id:11,path:'/sync',method:'GET'}};
  let completed=false;
  const pending=InterfaceController.prototype.save.call(controller,ctx).then(()=>{completed=true;});
  await started;assert.equal(completed,false);assert.equal(ctx.body,undefined);release();await pending;
  assert.deepEqual(seen,[17,18]);assert.equal(ctx.params.id,undefined);assert.equal(ctx.body.errcode,0);assert.deepEqual(ctx.body.data,targets);
});

test('import save propagates add/update and validation errors instead of success',async()=>{
  yapi.commons={...yapi.commons,verifyPath:()=>true,validateParams:()=>({valid:true})};
  for(const targets of [[],[{_id:17}]]){
    const ctx={params:{project_id:11,path:'/sync',method:'GET'}};
    const fail=async context=>{context.body={errcode:409,errmsg:'Conflict',data:null};};
    await InterfaceController.prototype.save.call({$tokenAuth:true,schemaMap:{add:{},up:{}},Model:{getByPath:async()=>targets},add:fail,up:fail},ctx);
    assert.equal(ctx.body.errcode,409);
  }
  yapi.commons.validateParams=()=>({valid:false,message:'Invalid schema'});
  const ctx={params:{project_id:11,path:'/sync',method:'GET'}};
  await InterfaceController.prototype.save.call({$tokenAuth:true,schemaMap:{up:{}},Model:{getByPath:async()=>[{_id:17}]},up:()=>assert.fail('invalid write')},ctx);
  assert.equal(ctx.body.errcode,400);
});

test('session edit tags use the persisted authorized project when project_id is absent or spoofed', async()=>{
  const oldHook=yapi.emitHook;
  yapi.emitHook=async()=>{};
  yapi.commons={...yapi.commons,time:()=>100,saveLog:()=>{}};
  try {
    for (const supplied of [undefined,99]) {
      const doc={_id:17,project_id:12,catid:13,title:'same',toObject:()=>({_id:17,project_id:12,catid:13,title:'same'})};
      const seen=[];
      const controller={Model:{get:async()=>doc,up:async()=>({ok:1})},checkAuth:async id=>id===12,getUsername:()=> 'synthetic',getUid:()=>9,
        catModel:{get:async()=>({project_id:12,name:'test'})},projectModel:{get:async id=>{assert.equal(id,12);return {tag:[]};},up:async(id,data)=>{seen.push({id,data});}},autoAddTag:InterfaceController.prototype.autoAddTag};
      const ctx={params:{id:17,tag:['synthetic'],...(supplied===undefined?{}:{project_id:supplied})}};
      await InterfaceController.prototype.up.call(controller,ctx);
      assert.equal(ctx.body.errcode,0);
      assert.ok(seen.some(entry=>entry.id===12&&entry.data.tag?.[0].name==='synthetic'));
      assert.ok(seen.every(entry=>entry.id===12));
    }
  } finally {yapi.emitHook=oldHook;}
});

test('missing project remains a null result instead of throwing in environment normalization',()=>{
  const Project=require('../server/models/project');
  assert.equal(Project.prototype.handleEnvNullData.call({},null),null);
});
