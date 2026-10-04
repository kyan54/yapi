'use strict';
// Test-only barriers after real model saves / HTTP responses; never replace writes.
const fs=require('node:fs'),assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
const config=JSON.parse(fs.readFileSync(process.env.YAPI_CONFIG,'utf8'));
assert.equal(config.db.connectString,'mongodb://127.0.0.1:27017');
assert.match(config.db.options.dbName,/^yapi_sync_guard_test_[a-f0-9]{32}$/);
assert.equal(config.db.options.dbName,'yapi_sync_guard_test_'+process.env.YAPI_SYNC_TEST_NONCE);
assert.equal(config.host,'127.0.0.1');assert.equal(typeof process.send,'function');
let armed,release;
process.on('message',m=>{if(m.action==='arm'){armed={project:m.project,boundary:m.boundary||'interface'};process.send({event:'armed',project:m.project});}if(m.action==='resume'&&release){release();release=null;}});
async function barrier(project,boundary,errcode){if(!armed||Number(project)!==armed.project||boundary!==armed.boundary)return;const id=armed.project;armed=null;await new Promise(r=>{release=r;process.send({event:'after-write',project:id,boundary,errcode});});}
const load=Module._load,wrapped=new WeakSet(),categoryFile=path.resolve(__dirname,'../../server/models/interfaceCat.js');
Module._load=function(request,parent,isMain){const exported=load.apply(this,arguments);if(Module._resolveFilename(request,parent,isMain)===categoryFile&&!wrapped.has(exported)){wrapped.add(exported);const save=exported.prototype.save;exported.prototype.save=async function(data){const result=await save.call(this,data);if(data.name==='默认分类')await barrier(data.project_id,'default-category',0);return result;};}return exported;};
const axios=require('axios'),post=axios.post.bind(axios);
axios.post=async function(url,data,...args){const result=await post(url,data,...args);const u=new URL(url,'http://127.0.0.1');if(u.hostname==='127.0.0.1'&&Number(u.port)===config.port){const boundary={'/api/interface/add':'interface','/api/interface/save':'interface','/api/interface/add_cat':'new-category','/api/project/up':'basepath'}[u.pathname];if(boundary)await barrier(boundary==='basepath'?data.id:data.project_id,boundary,result.data.errcode);}return result;};
