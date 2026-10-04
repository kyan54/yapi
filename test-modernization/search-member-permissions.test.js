'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../util-polyfill');const yapi=require('../server/yapi');const C=require('../server/controllers/project');
yapi.commons={...require('../server/utils/commons'),resReturn:(data,errcode=0,errmsg='')=>({data,errcode,errmsg})};
test('search filters private projects and interfaces by live view rights and emits minimal fields',async()=>{
 for(const allowed of [false,true]){
  const projects=[{_id:10,name:'private',group_id:1,project_type:'private',env:[{value:'synthetic-only'}],members:[1]},{_id:20,name:'public',group_id:1,project_type:'public',env:[1]}];
  const c={getUid:()=>7,getRole:()=> 'member',Model:{search:async()=>projects,get:async id=>projects.find(p=>p._id===id)},groupModel:{search:async()=>[{_id:1,group_name:'group',group_desc:'extra'}]},interfaceModel:{search:async()=>[{_id:31,project_id:10,title:'private interface',req_body_other:'extra'},{_id:32,project_id:20,title:'public interface'},{_id:33,project_id:99,title:'orphan'}]},checkAuth:async(id,type,action)=>{assert.deepEqual([id,type,action],[10,'project','view']);return allowed}};
  const ctx={request:{query:{q:'synthetic'}}};await C.prototype.search.call(c,ctx);assert.equal(ctx.body.errcode,0);assert.deepEqual(ctx.body.data.project.map(p=>p._id),allowed?[10,20]:[20]);assert.deepEqual(ctx.body.data.interface.map(p=>p._id),allowed?[31,32]:[32]);for(const p of ctx.body.data.project)assert.deepEqual(Object.keys(p).sort(),['_id','groupId','name']);for(const p of ctx.body.data.interface)assert.deepEqual(Object.keys(p).sort(),['_id','projectId','title']);
 }
});
test('member additions require owner/admin danger rights before any lookup or write',async()=>{
 for(const role of ['dev','guest','member']){const ctx={params:{id:10,member_uids:[2],role:'owner'}};await C.prototype.addMember.call({checkAuth:async(id,type,action)=>{assert.deepEqual([id,type,action],[10,'project','danger']);return false},Model:{checkMemberRepeat:()=>assert.fail('unauthorized read'),addMember:()=>assert.fail('unauthorized write')}},ctx);assert.equal(ctx.body.errcode,405,role);}
});
