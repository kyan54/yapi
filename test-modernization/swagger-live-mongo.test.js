'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),mongoose=require('mongoose'),jwt=require('jsonwebtoken');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function eventually(check){for(let n=0;n<60;n++){if(await check())return;await delay(50);}assert.fail('fixture DB observation timed out');}
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('isolated real app/Mongo Swagger permissions, token errors, snapshots and multiple ticks',{skip:!process.env.YAPI_TEST_MONGO_URI,timeout:300000},async()=>{
 assert.equal(process.env.YAPI_TEST_MONGO_URI,'mongodb://127.0.0.1:27017','only the fixed CI loopback Mongo endpoint is permitted');
 const uri='mongodb://127.0.0.1:27017';
 const nonce=crypto.randomBytes(16).toString('hex'),dbName='yapi_sync_guard_test_'+nonce,dir=await fs.mkdtemp(path.join(os.tmpdir(),'yapi-sync-guard-'));
 const connection=await mongoose.createConnection(uri,{dbName,serverSelectionTimeoutMS:15000}).asPromise(),db=connection.db;let child,fixture,markerCreated=false;const pending=new Map(),events=[],sources=new Map();let downloadHook=null,version=0;
 const guard=async()=>{assert.equal(db.databaseName,dbName);assert.deepEqual(await db.collection('test_identity').findOne({_id:nonce}),{_id:nonce,kind:'swagger-guard-disposable'});};
 try{
  assert.equal((await db.listCollections().toArray()).length,0,'random DB must start empty');await db.collection('test_identity').insertOne({_id:nonce,kind:'swagger-guard-disposable'});markerCreated=true;await guard();
  fixture=http.createServer(async(req,res)=>{try{const id=Number(req.url.slice(1));if(downloadHook){const hook=downloadHook;downloadHook=null;await hook(id);}const source=sources.get(id)||{tag:'Synthetic',basePath:''};const paths={};for(let n=0;n<3;n++)paths['/fixture-'+id+'-'+(source.stable?'stable':version)+'-'+n]={get:{tags:[source.tag],summary:'Synthetic '+version+' '+n,responses:{200:{description:'OK'}}}};res.setHeader('content-type','application/json');res.end(JSON.stringify({swagger:'2.0',info:{title:'Synthetic',version:String(version++)},tags:[{name:source.tag}],basePath:source.basePath,paths}));}catch{res.statusCode=500;res.end('{}');}});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
  const port=await freePort(),configPath=path.join(dir,'config.json');await fs.writeFile(configPath,JSON.stringify({port,host:'127.0.0.1',db:{connectString:uri,options:{dbName}},mail:{enable:false},closeRegister:true,timeout:15000}));
  child=spawn(process.execPath,['--require',path.join(__dirname,'fixtures/swagger-write-gate.cjs'),'server/app.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,YAPI_CONFIG:configPath,YAPI_SYNC_TEST_NONCE:nonce,YAPI_LLM_BASE_URL:'',YAPI_LLM_API_KEY:'',YAPI_LLM_MODEL:''},stdio:['ignore','ignore','ignore','ipc']});child.on('message',m=>{events.push(m);const key=m.event+':'+m.project;if(pending.has(key)){pending.get(key)(m);pending.delete(key);}});
  const waitEvent=(event,id)=>Promise.race([new Promise(r=>pending.set(event+':'+id,r)),delay(12000).then(()=>{throw Error('fixture barrier timeout '+event);})]);
  const base='http://127.0.0.1:'+port;let ready=false;for(let n=0;n<100;n++){if(child.exitCode!==null)break;try{if((await fetch(base+'/api/user/status')).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready,'isolated application failed startup');
  const cookieFor=(uid,salt)=>'_yapi_uid='+uid+'; _yapi_token='+jwt.sign({uid},salt,{expiresIn:'5m'});
  let next=100;
  for(const scenario of ['success','success-good','success-merge','default-category-revoke','new-category-revoke','basepath-revoke','before-run','download-revoke','between-writes','disabled','account-delete','project-delete','replace-cron','failed-replacement','token-invalid']){
   await guard();const id=++next,uid=1000+id,salt=crypto.randomBytes(16).toString('hex');
   const boundary={'between-writes':'interface','default-category-revoke':'default-category','new-category-revoke':'new-category','basepath-revoke':'basepath'}[scenario];
   const success=scenario.startsWith('success'),extended=scenario.includes('category')||scenario==='basepath-revoke'||scenario==='success-good'||scenario==='success-merge';
   const source={tag:scenario==='new-category-revoke'||scenario==='default-category-revoke'||scenario==='success-good'?'NewSynthetic':'Synthetic',basePath:extended?'/synthetic-'+id:'',stable:scenario==='success-good'||scenario==='success-merge'};sources.set(id,source);
   const mode=scenario==='new-category-revoke'||scenario==='success-good'?'good':scenario==='basepath-revoke'||scenario==='success-merge'?'merge':'normal';
   await db.collection('user').insertOne({_id:uid,role:'member',username:'Synthetic',email:uid+'@invalid.test',passsalt:salt,password:'unused',type:'site'});
   await db.collection('group').insertOne({_id:id,uid:1,group_name:'Synthetic',type:'public',members:[]});
   await db.collection('project').insertOne({_id:id,uid:1,group_id:id,name:'Synthetic',project_type:'private',members:[{uid,role:extended?'owner':'dev'}],env:[],basepath:''});
   await db.collection('token').insertOne({_id:id,project_id:id,token:crypto.randomBytes(12).toString('hex')});
   const params={project_id:id,is_sync_open:true,sync_mode:mode,sync_cron:'*/5 * * * * *',sync_json_url:'http://127.0.0.1:'+fixture.address().port+'/'+id};
   const apiPost=async(endpoint,data)=>(await fetch(base+endpoint,{method:'POST',headers:{cookie:cookieFor(uid,salt),'content-type':'application/json'},body:JSON.stringify(data)})).json();
   const post=data=>apiPost('/api/plugin/autoSync/save',data);
   // Let the real allocator assign category IDs; raw per-scenario IDs can collide with prior generated categories.
   if(scenario!=='default-category-revoke')assert.equal((await apiPost('/api/interface/add_cat',{project_id:id,name:'Synthetic'})).errcode,0);
   const revoke=async()=>{await guard();await db.collection('project').updateOne({_id:id},{$set:{members:[]}});};
   if(scenario==='download-revoke')downloadHook=revoke;
   if(scenario==='token-invalid')downloadHook=async()=>{await guard();await db.collection('token').updateOne({project_id:id},{$set:{token:crypto.randomBytes(12).toString('hex')}});};
   let armed;if(boundary){armed=waitEvent('armed',id);child.send({action:'arm',project:id,boundary});await armed;}
   const writeEvent=boundary?waitEvent('after-write',id):null;const saved=post(params);
   if(writeEvent){const event=await writeEvent;assert.equal(event.errcode,0);assert.equal(event.boundary,boundary);await revoke();child.send({action:'resume'});}
   assert.equal((await saved).errcode,0,'save configuration route business code');
   const initial=await db.collection('interface_auto_sync').findOne({project_id:id});assert.ok(initial);assert.equal(initial.uid,uid);
   const count=()=>db.collection('interface').countDocuments({project_id:id});let expected=await count();
   if(['download-revoke','token-invalid','default-category-revoke','new-category-revoke','basepath-revoke'].includes(scenario)){assert.equal(expected,0);assert.equal(initial.old_swagger_content,undefined);if(scenario==='token-invalid'){assert.ok(events.some(e=>e.event==='http-rejected'&&e.project===id&&e.path==='/api/interface/add'&&e.errcode===40011),'actual token-only route rejects rotated token');await eventually(async()=>await db.collection('log').countDocuments({typeid:id,content:/Swagger 导入失败.*请登录/})>0);}}
   else if(scenario==='between-writes'){assert.equal(expected,1);assert.equal(initial.old_swagger_content,undefined);}
   else {assert.equal(expected,3,scenario+' initial interface writes');assert.ok(initial.old_swagger_content);}
   const categories=()=>db.collection('interface_cat').find({project_id:id}).sort({name:1}).toArray();
   const interfaceTitles=async()=>(await db.collection('interface').find({project_id:id}).sort({path:1}).toArray()).map(i=>i.title);
   const initialTitles=await interfaceTitles();
   const categorySnapshot=await categories(),projectSnapshot=await db.collection('project').findOne({_id:id});
   if(boundary==='default-category'){assert.deepEqual(categorySnapshot.map(c=>c.name),['默认分类']);assert.equal(categorySnapshot[0].uid,uid);}
   if(boundary==='new-category')assert.deepEqual(categorySnapshot.map(c=>c.name),['NewSynthetic','Synthetic']);
   if(boundary==='basepath')assert.deepEqual(categorySnapshot.map(c=>c.name),['Synthetic']);
   if(extended)assert.equal(projectSnapshot.basepath,boundary==='default-category'||boundary==='new-category'?'':source.basePath);
   if(scenario==='success-good')assert.deepEqual(categorySnapshot.map(c=>c.name),['NewSynthetic','Synthetic']);
   if(scenario==='success-merge')assert.deepEqual(categorySnapshot.map(c=>c.name),['Synthetic']);
   if(scenario==='before-run')await revoke();
   if(scenario==='disabled')await db.collection('interface_auto_sync').updateOne({project_id:id},{$set:{is_sync_open:false}});
   if(scenario==='account-delete')await db.collection('user').deleteOne({_id:uid});
   if(scenario==='project-delete')await db.collection('project').deleteOne({_id:id});
   if(scenario==='replace-cron')await db.collection('interface_auto_sync').updateOne({project_id:id},{$set:{sync_cron:'*/7 * * * * *'}});
   if(scenario==='failed-replacement'){const failed=await post({...params,id:initial._id,sync_cron:'invalid'});assert.notEqual(failed.errcode,0);}
   if(scenario==='token-invalid')await db.collection('token').deleteOne({project_id:id});
   // Two full five-second periods; canceled callbacks must not write, and token failures must not advance hash.
   await delay(10500);await guard();const final=await db.collection('interface_auto_sync').findOne({project_id:id});
   if(success){if(source.stable){assert.equal(await count(),3,'good/merge updates existing paths without duplication');assert.notDeepEqual(await interfaceTitles(),initialTitles,'good/merge persisted refreshed fields');}else assert.ok(await count()>=6);assert.notEqual(final.old_swagger_content,initial.old_swagger_content);assert.equal((await post({...params,id:initial._id,is_sync_open:false})).errcode,0);}
   else {assert.equal(await count(),expected,scenario+' no later interface writes');if(final)assert.equal(final.old_swagger_content,initial.old_swagger_content,scenario+' hash unchanged');assert.ok(await db.collection('log').countDocuments({typeid:id,content:/自动同步接口状态:失败/})>0);}
   assert.deepEqual(await categories(),categorySnapshot,scenario+' categories unchanged across later ticks');
   if(scenario!=='project-delete')assert.equal((await db.collection('project').findOne({_id:id})).basepath,projectSnapshot.basepath,scenario+' basepath unchanged across later ticks');
   console.log('Swagger synthetic scenario passed: '+scenario);
  }
 }finally{
  if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
  if(fixture)await new Promise(r=>fixture.close(r));
  if(markerCreated){await guard();await connection.dropDatabase();}await connection.close();await fs.rm(dir,{recursive:true,force:true});
 }
});
