'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const filename=path.resolve(__dirname,'../server/controllers/interface.js');
const loaded=new Module(filename,module);loaded.filename=filename;
loaded.require=name=>name==='../yapi.js'?{commons:{resReturn:(data,errcode=0,errmsg='')=>({data,errcode,errmsg})}}:name==='./base.js'?class {}:{};
loaded._compile(fs.readFileSync(filename,'utf8'),filename);
for(const [method,key,write] of [['upIndex','Model','upIndex'],['upCatIndex','catModel','upCatIndex']]){
 function setup({projects=[11,11],auth=async()=>true,update=async()=>({})}={}){const writes=[],checks=[];const instance={[key]:{get:async id=>id===1||id===2?{_id:id,project_id:projects[id-1]}:null,[write]:async(id,index)=>{writes.push({id,index});return update(id,index);}},checkAuth:async(...args)=>{checks.push(args);return auth(...args);}};return {writes,checks,run:async body=>{const ctx={request:{body}};await loaded.exports.prototype[method].call(instance,ctx);return ctx.body;},instance};}
 const batch=[{id:1,index:1,project_id:999},{id:'2',index:0,project_id:999}];
 test(method+' resolves stored project ownership for legal owner/dev reorder',async()=>{for(const role of ['owner','dev']){const h=setup({auth:async(id,type,mode)=>id===11&&type==='project'&&mode==='edit'&&['owner','dev'].includes(role)});assert.equal((await h.run(batch)).errcode,0);assert.deepEqual(h.writes,[{id:1,index:1},{id:2,index:0}]);assert.deepEqual(h.checks,[[11,'project','edit'],[11,'project','edit']]);}});
 test(method+' guest or revoked access rejects before any write',async()=>{for(const revoked of [false,true]){let calls=0;const h=setup({auth:async()=>revoked?++calls===1:false});assert.notEqual((await h.run(batch)).errcode,0);assert.deepEqual(h.writes,[]);}});
 test(method+' mixed projects reject even when both are editable',async()=>{const h=setup({projects:[11,12]});assert.notEqual((await h.run(batch)).errcode,0);assert.deepEqual(h.writes,[]);});
 test(method+' unknown and malformed later target cannot partially write',async()=>{for(const body of [null,{},[batch[0],{id:3,index:0}],[batch[0],{id:2,index:-1}],[batch[0],{id:1,index:0}],[batch[0],{id:2,index:0.5}],[batch[0],null]]){const h=setup();assert.notEqual((await h.run(body)).errcode,0);assert.deepEqual(h.writes,[]);}});
 test(method+' success waits for every write to complete',async()=>{let release;const gate=new Promise(r=>release=r);const h=setup({update:async id=>{if(id===2)await gate;}});let settled=false;const pending=h.run(batch).then(r=>{settled=true;return r;});await new Promise(setImmediate);assert.equal(h.writes.length,2);assert.equal(settled,false);release();assert.equal((await pending).errcode,0);});
 test(method+' write failure is an error response',async()=>{const h=setup({update:async()=>{throw new Error('synthetic write failure');}});const r=await h.run(batch);assert.notEqual(r.errcode,0);assert.match(r.errmsg,/synthetic write failure/);});
}
