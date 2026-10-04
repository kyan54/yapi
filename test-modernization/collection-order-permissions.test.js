'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../util-polyfill');const yapi=require('../server/yapi');const Controller=require('../server/controllers/interfaceCol');
yapi.commons={...yapi.commons,resReturn:(data,errcode=0,errmsg='')=>({data,errcode,errmsg})};
const invoke=async(body,controller)=>{const ctx={request:{body}};await Controller.prototype.upCaseIndex.call(controller,ctx);return ctx.body;};
test('case reorder rejects an unauthorized later target before any writes',async()=>{
 const controller={caseModel:{get:async id=>({_id:id,project_id:id===1?10:20}),upCaseIndex:()=>assert.fail('unauthorized batch wrote')},checkAuth:async id=>id===10};
 assert.notEqual((await invoke([{id:1,index:1},{id:2,index:0}],controller)).errcode,0);
});
test('case reorder denies missing targets guest rights and invalid indexes',async()=>{
 for(const body of [{},[{id:1,index:-1}],[{id:0,index:0}],[{id:1,index:1.5}]])assert.notEqual((await invoke(body,{caseModel:{get:()=>assert.fail('invalid input reached DB')}})).errcode,0);
 for(const record of [null,{_id:1,project_id:10}])assert.notEqual((await invoke([{id:1,index:0}],{caseModel:{get:async()=>record,upCaseIndex:()=>assert.fail('guest wrote')},checkAuth:async()=>false})).errcode,0);
});
test('case reorder waits for writes and propagates failures',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),start=new Promise(r=>entered=r);let done=false;
 const controller={caseModel:{get:async id=>({_id:id,project_id:10}),upCaseIndex:async()=>{entered();await gate;}},checkAuth:async()=>true};const result=invoke([{id:1,index:0}],controller).then(r=>{done=true;return r});await start;assert.equal(done,false);release();assert.equal((await result).errcode,0);
 controller.caseModel.upCaseIndex=async()=>{throw Error('synthetic failure')};assert.notEqual((await invoke([{id:1,index:0}],controller)).errcode,0);
});
