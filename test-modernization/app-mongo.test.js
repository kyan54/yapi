'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const net=require('node:net');const {spawn}=require('node:child_process');
const http=require('node:http');
const mongoose=require('mongoose');const jwt=require('jsonwebtoken');
const {createStore}=require('../server/services/documentation/store');
const fixture=require('./fixtures/interface.json');
async function port(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
test('real application HTTP on modern Mongo: session auth, docs, legacy writes, history and restore',{
  skip:!process.env.YAPI_TEST_MONGO_URI && 'Requires disposable MongoDB for actual app HTTP integration',timeout:60000
},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yapi-http-'));
  const dbName='yapi_modernization_test_http_'+process.pid+'_'+Date.now();
  const connection=await mongoose.createConnection(process.env.YAPI_TEST_MONGO_URI,{dbName,serverSelectionTimeoutMS:15000}).asPromise();
  let child;let log='';
  try{
    const db=connection.db;
    await db.collection('user').insertOne({_id:9,role:'admin',username:'Synthetic admin',email:'synthetic@example.invalid',passsalt:'synthetic-only-salt',password:'not-used',type:'site'});
    await db.collection('group').insertOne({_id:8,uid:9,group_name:'Synthetic group',type:'public',members:[]});
    await db.collection('project').insertOne({_id:11,uid:9,group_id:8,name:'Synthetic project',project_type:'private',members:[],env:[],basepath:''});
    await db.collection('interface_cat').insertOne({_id:13,uid:9,project_id:11,name:'Synthetic category'});
    await db.collection('interface').insertOne({...fixture,uid:9});
    const listen=await port();const configPath=path.join(dir,'config.json');
    await fs.writeFile(configPath,JSON.stringify({port:listen,host:'127.0.0.1',timeout:10000,db:{connectString:process.env.YAPI_TEST_MONGO_URI,options:{dbName}},mail:{enable:false},closeRegister:true}));
    child=spawn(process.execPath,['server/app.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,YAPI_CONFIG:configPath,YAPI_LLM_BASE_URL:'',YAPI_LLM_MODEL:'',YAPI_LLM_API_KEY:''},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
    const url='http://127.0.0.1:'+listen;
    let ready=false;
    for(let count=0;count<100;count++){if(child.exitCode!==null)break;try{const response=await fetch(url+'/api/user/status');if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
    assert.ok(ready,'actual application failed startup: '+log.slice(-3000));
    assert.equal((await fetch(url+'/api/documentation/get?projectId=11&interfaceId=17')).status,401);
    const cookie='_yapi_uid=9; _yapi_token='+jwt.sign({uid:9},'synthetic-only-salt',{expiresIn:'5m'});
    const headers={cookie,'content-type':'application/json','X-YApi-Docs-Intent':'review'};
    let response=await fetch(url+'/api/documentation/get?projectId=11&interfaceId=17',{headers});
    let payload=await response.json();assert.equal(payload.errcode,0);assert.equal(payload.data.document._id,17);assert.equal(payload.data.provider.configured,false);
    // Creating synthetic proposal bypasses an unavailable real provider only;
    // acceptance still runs the real authenticated HTTP and Mongo CAS paths.
    const store=createStore({interfaces:db.collection('interface'),proposals:db.collection('documentation_proposals'),revisions:db.collection('documentation_revisions')});
    const proposal=await store.propose(11,17,{desc:'<p>Reviewed</p>',markdown:'Reviewed'},9);
    response=await fetch(url+'/api/documentation/accept',{method:'POST',headers,body:JSON.stringify({projectId:11,interfaceId:17,proposalId:proposal.id})});payload=await response.json();assert.equal(payload.errcode,0,JSON.stringify(payload));
    assert.equal((await db.collection('interface').findOne({_id:17})).docs_revision,1);
    response=await fetch(url+'/api/interface/up',{method:'POST',headers,body:JSON.stringify({id:17,title:'Manual synthetic update'})});payload=await response.json();assert.equal(payload.errcode,0,JSON.stringify(payload));
    assert.equal((await db.collection('interface').findOne({_id:17})).docs_revision,2);
    response=await fetch(url+'/api/documentation/restore',{method:'POST',headers,body:JSON.stringify({projectId:11,interfaceId:17,version:0})});payload=await response.json();assert.equal(payload.errcode,0,JSON.stringify(payload));
    const final=await db.collection('interface').findOne({_id:17});assert.equal(final.docs_revision,3);assert.equal(final.title,'Manual synthetic update');assert.equal(final.markdown,fixture.markdown);assert.equal(final.docs_history,undefined);assert.equal(typeof final.docs_revision_head,'string');assert.deepEqual((await store.history(11,17)).revisions.map(row=>row.version),[3,2,1,0]);
    // Exercise actual bundled plugin writes, not only controller/module loading.
    async function pluginPost(endpoint,data) {
      const response=await fetch(url+'/api/plugin/'+endpoint,{method:'POST',headers,body:JSON.stringify(data)});
      const result=await response.json();assert.equal(result.errcode,0,endpoint+': '+JSON.stringify(result));return result.data;
    }
    await pluginPost('advmock/save',{project_id:11,interface_id:17,enable:false,mock_script:'mockJson.fixture = 1;'});
    await pluginPost('advmock/save',{project_id:11,interface_id:17,enable:false,mock_script:'mockJson.fixture = 2;'});
    assert.equal((await db.collection('adv_mock').findOne({interface_id:17})).mock_script,'mockJson.fixture = 2;');
    const expectation=await pluginPost('advmock/case/save',{project_id:11,interface_id:17,name:'Synthetic expectation',ip_enable:false,params:{},res_body:'{"ok":true}'});
    assert.ok(Number.isSafeInteger(expectation._id));
    await pluginPost('advmock/case/save',{id:expectation._id,project_id:11,interface_id:17,name:'Updated expectation',ip_enable:false,params:{},res_body:'{"ok":false}'});
    await pluginPost('advmock/case/hide',{id:expectation._id,enable:false});
    assert.equal((await db.collection('adv_mock_case').findOne({_id:expectation._id})).case_enable,false);
    await pluginPost('advmock/case/del',{id:expectation._id});
    assert.equal(await db.collection('adv_mock_case').countDocuments({_id:expectation._id}),0);
    const sync=await pluginPost('autoSync/save',{project_id:11,uid:999,is_sync_open:false,sync_cron:'0 0 * * *',sync_json_url:'https://synthetic.invalid/swagger.json',sync_mode:'normal'});
    await pluginPost('autoSync/save',{id:sync._id,project_id:11,uid:999,is_sync_open:false,sync_cron:'0 1 * * *',sync_json_url:'https://synthetic.invalid/swagger.json',sync_mode:'normal'});
    const config=await db.collection('interface_auto_sync').findOne({_id:sync._id});assert.equal(config.uid,9);assert.equal(config.sync_cron,'0 1 * * *');
    // Real configured private-network Swagger URL → immediate scheduled job →
    // normal authenticated import endpoints → persisted interface update.
    let summary='Synthetic scheduled API';
    const source=http.createServer((request,response)=>{
      const spec={
        swagger:'2.0',info:{title:'Synthetic sync source',version:'1.0'},basePath:'',
        tags:[{name:'Synthetic category'}],
        paths:{'/scheduled-fixture':{get:{
          tags:['Synthetic category'],summary,
          responses:{'200':{description:'OK',schema:{type:'object',properties:{id:{type:'integer'}}}}}
        }}}
      };
      response.setHeader('content-type','application/json');response.end(JSON.stringify(spec));
    });
    await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
    try {
      const sync_json_url='http://127.0.0.1:'+source.address().port+'/swagger.json';
      await pluginPost('autoSync/save',{id:sync._id,project_id:11,is_sync_open:true,sync_cron:'0 0 1 1 *',sync_json_url,sync_mode:'normal'});
      let imported=await db.collection('interface').findOne({project_id:11,path:'/scheduled-fixture'});
      assert.ok(imported,'actual scheduled import must persist an interface');assert.equal(imported.title,summary);assert.ok(Number.isSafeInteger(imported._id));
      summary='Updated scheduled API';
      await pluginPost('autoSync/save',{id:sync._id,project_id:11,is_sync_open:true,sync_cron:'0 0 1 1 *',sync_json_url,sync_mode:'merge'});
      imported=await db.collection('interface').findOne({project_id:11,path:'/scheduled-fixture'});assert.equal(imported.title,summary);
      assert.equal(await db.collection('interface').countDocuments({project_id:11,path:'/scheduled-fixture'}),1);
      assert.ok((await db.collection('interface_auto_sync').findOne({_id:sync._id})).old_swagger_content);
      await pluginPost('autoSync/save',{id:sync._id,project_id:11,is_sync_open:false,sync_cron:'0 0 1 1 *',sync_json_url,sync_mode:'merge'});
    } finally {await new Promise(resolve=>source.close(resolve));}
    await pluginPost('wiki_desc/up',{project_id:11,desc:'<p>first</p>',markdown:'first'});
    await pluginPost('wiki_desc/up',{project_id:11,desc:'<p>second</p>',markdown:'second'});
    assert.equal((await db.collection('wiki').findOne({project_id:11})).markdown,'second');
  }finally{
    if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
    await connection.dropDatabase();await connection.close();await fs.rm(dir,{recursive:true,force:true});
  }
});
