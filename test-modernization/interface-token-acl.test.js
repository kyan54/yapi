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
