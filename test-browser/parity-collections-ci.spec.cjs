'use strict';
// New-runtime CI evidence only. Never starts an old vm2 runtime or changes Docker security.
// Requires the existing modernization workflow's disposable MongoDB, built worker image,
// and trusted host-side service. Missing CI prerequisites FAIL rather than skip.
const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const http=require('node:http'),net=require('node:net'),{spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto'),mongoose=require('mongoose'),sha1=require('sha1');
const root=path.resolve(__dirname,'..'),children=[],requests=[];
let connection,directory,echo,echoOrigin,apps,sequence=1000,dbName;
test.describe.configure({mode:'default'});
test.beforeAll(async()=>{
  if(process.env.CI!=='true')throw Error('CI_ONLY: requires the existing disposable GitHub runner; do not execute on a user Mac');
  const uri=new URL(process.env.YAPI_TEST_MONGO_URI||'http://missing.invalid');
  if(uri.protocol!=='mongodb:'||uri.hostname!=='127.0.0.1'||uri.username||uri.password)throw Error('DISPOSABLE_LOOPBACK_MONGO_REQUIRED');
  const socket=process.env.YAPI_ISOLATED_RUNNER_SOCKET;
  if(!socket||!path.isAbsolute(socket)||!(await fs.stat(socket)).isSocket())throw Error('EXISTING_ISOLATED_RUNNER_REQUIRED');
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'yapi-collections-ci-'));
  dbName='yapi_ci_collections_'+randomUUID().replaceAll('-','');
  connection=await mongoose.createConnection(process.env.YAPI_TEST_MONGO_URI,{dbName,serverSelectionTimeoutMS:15000}).asPromise();
  const db=connection.db;
  await db.collection('_ci_fixture').insertOne({_id:dbName,synthetic:true});
  await db.collection('user').insertOne({_id:9,role:'admin',username:'Synthetic CI runner admin',email:'runner-ci@example.invalid',passsalt:'ci-only-salt',password:sha1('synthetic-ci-password'+sha1('ci-only-salt')),type:'site',study:true});
  await db.collection('group').insertOne({_id:8,uid:9,group_name:'Synthetic CI group',type:'public',members:[],custom_field1:{name:'',enable:false}});
  echo=http.createServer((req,res)=>{requests.push({path:req.url,pre:req.headers['x-ci-pre']||null});res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,pre:req.headers['x-ci-pre']||null,path:req.url}));});
  await new Promise(r=>echo.listen(0,'127.0.0.1',r));echoOrigin='http://127.0.0.1:'+echo.address().port;
  const allowedSocket=path.join(directory,'allowed.sock'),rulesPath=path.join(directory,'rules.json');
  // One fixed synthetic project is granted one loopback GET path. No wildcards/external destinations.
  await fs.writeFile(rulesPath,JSON.stringify([{id:'ci-fixed',projectIds:['1002'],userIds:['9'],origin:echoOrigin,paths:['/allowed'],methods:['GET'],headers:[],contextHeaders:[],privateAddresses:['127.0.0.1']}]),{mode:0o600});
  const service=launch(['server/sandbox/service.js'],{...process.env,YAPI_ISOLATED_RUNNER_SOCKET:allowedSocket,YAPI_SCRIPT_HTTP_RULES_FILE:rulesPath});
  await ready(async()=>{try{return(await fs.stat(allowedSocket)).isSocket();}catch{return false;}},service,'trusted allowlist service');
  apps={default:await app('default',socket),missing:await app('missing',null),allowed:await app('allowed',allowedSocket),disabled:await app('disabled',socket,false)};
});
function launch(args,env){const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});child.diagnostic='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{child.diagnostic=(child.diagnostic+b).slice(-3000);});children.push(child);return child;}
async function ready(check,child,label){for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(label+' exited');if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error(label+' startup timeout');}
async function app(name,socket,scriptEnable=true){const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const config=path.join(directory,name+'.json');await fs.writeFile(config,JSON.stringify({port,host:'127.0.0.1',scriptEnable,timeout:10000,db:{connectString:process.env.YAPI_TEST_MONGO_URI,options:{dbName}},mail:{enable:false},closeRegister:true,versionNotify:false}));const env={...process.env,YAPI_CONFIG:config};delete env.YAPI_SCRIPT_HTTP_RULES_FILE;delete env.YAPI_LLM_API_KEY;delete env.YAPI_LLM_BASE_URL;if(socket)env.YAPI_ISOLATED_RUNNER_SOCKET=socket;else delete env.YAPI_ISOLATED_RUNNER_SOCKET;const child=launch(['server/app.js'],env),origin='http://127.0.0.1:'+port;await ready(async()=>{try{return(await fetch(origin+'/api/user/status')).ok;}catch{return false;}},child,name+' app');return origin;}
test.afterAll(async()=>{
  for(const child of children.reverse())if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
  if(echo){echo.closeAllConnections();await new Promise(r=>echo.close(r));}
  if(connection){const marker=await connection.db.collection('_ci_fixture').findOne({_id:dbName,synthetic:true});if(marker&&/^yapi_ci_collections_[a-f0-9]{32}$/.test(dbName))await connection.dropDatabase();await connection.close();}
  if(directory)await fs.rm(directory,{recursive:true,force:true});
});
async function fixture(page,projectId){const id=projectId||++sequence;const data={_id:id,uid:9,group_id:8,name:'Synthetic CI '+id,project_type:'private',members:[],env:[{name:'echo',domain:echoOrigin,header:[],global:[]}],basepath:'',tag:[],switch_notice:false,pre_script:'',after_script:'',is_mock_open:false,project_mock_script:''};await connection.db.collection('project').insertOne(data);await connection.db.collection('interface_cat').insertOne({_id:id,uid:9,project_id:id,name:'Synthetic CI category'});await connection.db.collection('interface').insertOne({_id:id,uid:9,project_id:id,catid:id,title:'Synthetic CI request',path:'/echo',method:'GET',status:'done',req_params:[],req_query:[],req_headers:[],req_body_type:'raw',req_body_other:'',req_body_is_json_schema:false,res_body_type:'json',res_body_is_json_schema:false,res_body:'{"ok":true}',pre_script:'',after_script:''});page.ciProject=id;await login(page,apps.default);return id;}
async function login(page,origin){await page.context().clearCookies();await page.goto(origin+'/login');await page.getByPlaceholder('Email',{exact:true}).fill('runner-ci@example.invalid');await page.getByPlaceholder('Password',{exact:true}).fill('synthetic-ci-password');await page.getByRole('button',{name:/^登\s*录$/}).click();await expect(page).toHaveURL(/\/group/);}
async function api(page,origin,url,data){const response=data===undefined?await page.request.get(origin+url):await page.request.post(origin+url,{data});expect(response.status()).toBe(200);const result=await response.json();expect(result.errcode,url).toBe(0);return result.data;}
async function editor(page,locator,text){await locator.locator('textarea').focus();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(text);if(text)await expect(locator.locator('.ace_content')).toContainText(text);}
async function save(page){await expect(page.getByText('保存成功',{exact:true})).toHaveCount(0,{timeout:10000});const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/project/up'&&r.request().method()==='POST');await page.getByRole('button',{name:/^保\s*存$/}).click();expect((await(await wait).json()).errcode).toBe(0);await expect(page.getByText('保存成功',{exact:true})).toBeVisible();}
async function scripts(page,id,pre,post=''){await page.goto(apps.default+`/project/${id}/setting`);await page.getByRole('tab',{name:'请求配置',exact:true}).click();await editor(page,page.locator('.request-editor').first(),pre);await editor(page,page.locator('.request-editor').last(),post);await save(page);await page.reload();await page.getByRole('tab',{name:'请求配置',exact:true}).click();await expect(page.locator('.request-editor').first().locator('.ace_content')).toContainText(pre);const stored=await connection.db.collection('project').findOne({_id:id});expect(stored.pre_script).toBe(pre);expect(stored.after_script).toBe(post);}
async function runView(page,origin,id){await page.goto(origin+`/project/${id}/interface/api/${id}`);await page.getByRole('tab',{name:'运行',exact:true}).click();await expect(page.getByRole('button',{name:/^发\s*送$/})).toBeEnabled();}
async function send(page){const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/interface/proxy');await page.getByRole('button',{name:/^发\s*送$/}).click();const response=await wait;expect(response.status()).toBe(200);return response.json();}
async function mockSettings(page,id,script,enabled=true){await page.goto(apps.default+`/project/${id}/setting`);await page.getByRole('tab',{name:'全局mock脚本',exact:true}).click();await editor(page,page.locator('.ace_editor').first(),script);const toggle=page.getByRole('switch');if((await toggle.getAttribute('aria-checked')==='true')!==enabled)await toggle.click();}
async function mockEnvironment(page,id,origin){await api(page,apps.default,'/api/project/up',{id,env:[{name:'mock',domain:origin+'/mock/'+id,header:[],global:[]}]});}
async function visibleFailure(page,error){await expect(page.locator('.pretty-editor-body')).toContainText(error);await expect(page.getByRole('button',{name:/^发\s*送$/})).toBeEnabled();}
async function shot(page,info,name){await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true});}
test.afterEach(async({page},info)=>{if(!page.ciProject||!connection)return;const p=await connection.db.collection('project').findOne({_id:page.ciProject},{projection:{_id:1,pre_script:1,after_script:1,is_mock_open:1,project_mock_script:1,env:1}});await info.attach('synthetic-config-db-readback',{body:JSON.stringify(p),contentType:'application/json'});});

test('project_requests-03 configured isolated pre and post scripts execute and missing runner visibly fails',async({page},info)=>{
 const id=await fixture(page,1001);await scripts(page,id,'requestHeader["x-ci-pre"] = "isolated-pre";','responseData.post = "isolated-post";');await runView(page,apps.default,id);const result=await send(page);expect(result.errcode).toBe(0);expect(result.data.res.body).toMatchObject({pre:'isolated-pre',post:'isolated-post'});await expect(page.locator('.pretty-editor-body')).toContainText('isolated-post');await shot(page,info,'configured-pre-post');
 await login(page,apps.missing);await runView(page,apps.missing,id);const before=requests.length,missing=await send(page);expect(missing.errcode).not.toBe(0);await visibleFailure(page,'ISOLATED_RUNNER_REQUIRED');expect(requests.length).toBe(before);await shot(page,info,'missing-runner');await login(page,apps.disabled);await runView(page,apps.disabled,id);const disabled=await send(page);expect(disabled.errcode).not.toBe(0);await visibleFailure(page,'SCRIPT_EXECUTION_DISABLED');expect(requests.length).toBe(before);
});
test('project_requests-04 default deny and scoped allowlist rejection never report request success',async({page},info)=>{
 const id=await fixture(page,1002);await scripts(page,id,`const response = await utils.axios.get(${JSON.stringify(echoOrigin+'/allowed')}); requestHeader["x-ci-pre"] = "broker-allowed";`);await runView(page,apps.default,id);let before=requests.length,result=await send(page);expect(result.errcode).not.toBe(0);await visibleFailure(page,'SCRIPT_NETWORK_DISABLED');expect(requests.length).toBe(before);
 await login(page,apps.allowed);await runView(page,apps.allowed,id);result=await send(page);expect(result.errcode).toBe(0);expect(result.data.res.body.pre).toBe('broker-allowed');expect(requests.slice(before).map(r=>r.path)).toEqual(['/allowed','/echo']);
 await login(page,apps.default);await scripts(page,id,`await utils.axios.get(${JSON.stringify(echoOrigin+'/denied')});`);await login(page,apps.allowed);await runView(page,apps.allowed,id);before=requests.length;result=await send(page);expect(result.errcode).not.toBe(0);await visibleFailure(page,'SCRIPT_NETWORK_DENIED');expect(requests.length).toBe(before);await shot(page,info,'allowlist-denied');
});
test('project_mock-03 actual enabled disabled and missing-runner Mock responses follow capability',async({page},info)=>{
 const id=await fixture(page,1003);await mockSettings(page,id,'mockJson.isolated = "enabled"; delay = 0;');await save(page);await mockEnvironment(page,id,apps.default);await runView(page,apps.default,id);let result=await send(page);expect(result.errcode).toBe(0);expect(result.data.res.body.isolated).toBe('enabled');await expect(page.locator('.pretty-editor-body')).toContainText('enabled');
 await mockSettings(page,id,'mockJson.isolated = "enabled"; delay = 0;',false);await save(page);await runView(page,apps.default,id);result=await send(page);expect(result.errcode).toBe(0);expect(result.data.res.body).toEqual({ok:true});
 await mockSettings(page,id,'mockJson.isolated = "enabled"; delay = 0;');await save(page);await mockEnvironment(page,id,apps.missing);await login(page,apps.missing);await runView(page,apps.missing,id);result=await send(page);expect(result.errcode).toBe(0);expect(result.data.res.body.errcode).not.toBe(0);await visibleFailure(page,'ISOLATED_RUNNER_REQUIRED');expect(result.data.res.body.isolated).toBeUndefined();await shot(page,info,'mock-missing-runner');
});
for(const failure of ['business','network'])test(`project_mock-04 ${failure} save failure preserves draft and execution error can recover`,async({page},info)=>{
 const id=await fixture(page,failure==='business'?1004:1005),script='throw new Error("SYNTHETIC_MOCK_FAILURE");';await mockSettings(page,id,script);let intercepted=false,saveAttempts=0;
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/project/up'&&request.method()==='POST')saveAttempts++;});
 await page.route('**/api/project/up',async route=>{if(!intercepted&&route.request().method()==='POST'){intercepted=true;if(failure==='network')await route.abort('failed');else await route.fulfill({json:{errcode:500,errmsg:'Synthetic rejected save'}});}else await route.continue();});
 await expect(page.locator('.ant-message-success')).toHaveCount(0);
 await page.getByRole('button',{name:/^保\s*存$/}).click();
 // Transport and local fallback may each emit a toast. Require the exact
 // failure-specific error, not a unique generic error element or any toast.
 const expectedError=failure==='business'?'Synthetic rejected save':'Network Error';
 await expect(page.locator('.ant-message-error').filter({hasText:new RegExp('^\s*'+expectedError+'\s*$')}).first()).toBeVisible();
 await expect(page.locator('.ant-message-success')).toHaveCount(0);
 expect(intercepted).toBe(true);expect(saveAttempts).toBe(1);
 const unchanged=await connection.db.collection('project').findOne({_id:id});expect(unchanged.project_mock_script).toBe('');expect(unchanged.is_mock_open).toBe(false);
 await expect(page.locator('.ace_editor .ace_content')).toContainText('SYNTHETIC_MOCK_FAILURE');await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','true');await expect(page.getByRole('button',{name:/^保\s*存$/})).toBeEnabled();
 await shot(page,info,'mock-save-'+failure+'-error');await page.unroute('**/api/project/up');await save(page);expect(saveAttempts).toBe(2);
 const retried=await connection.db.collection('project').findOne({_id:id});expect(retried.project_mock_script).toBe(script);expect(retried.is_mock_open).toBe(true);
 await mockEnvironment(page,id,apps.default);await runView(page,apps.default,id);let result=await send(page);expect(result.errcode).toBe(0);expect(result.data.res.body.errcode).not.toBe(0);await visibleFailure(page,'SYNTHETIC_MOCK_FAILURE');await shot(page,info,'mock-execution-'+failure);
 await mockSettings(page,id,'mockJson.recovered = true; delay = 0;');await save(page);await runView(page,apps.default,id);result=await send(page);expect(result.errcode).toBe(0);expect(result.data.res.body.recovered).toBe(true);expect(result.data.res.body.errcode).toBeUndefined();await expect(page.locator('.pretty-editor-body')).not.toContainText('SYNTHETIC_MOCK_FAILURE');
});
test('runner-03 browser mode refuses scripts and server sandbox failure is visible with retry',async({page},info)=>{
 const id=await fixture(page,1006);await scripts(page,id,'throw new Error("SYNTHETIC_PRE_FAILURE");');await runView(page,apps.default,id);const toggle=page.locator('.url .ant-switch');await toggle.click();let before=requests.length;await page.getByRole('button',{name:/^发\s*送$/}).click();await visibleFailure(page,'ISOLATED_RUNNER_REQUIRED');expect(requests.length).toBe(before);
 await toggle.click();const result=await send(page);expect(result.errcode).not.toBe(0);await visibleFailure(page,'SYNTHETIC_PRE_FAILURE');expect(requests.length).toBe(before);await shot(page,info,'browser-server-script-failures');
 await api(page,apps.default,'/api/project/up',{id,pre_script:'',after_script:''});await runView(page,apps.default,id);const success=await send(page);expect(success.errcode).toBe(0);expect(success.data.res.body.ok).toBe(true);await expect(page.locator('.pretty-editor-body')).not.toContainText('SYNTHETIC_PRE_FAILURE');
});


test('project_requests-03 post-only missing runner sends zero targets while real post failure follows one request',async({page},info)=>{
 const id=await fixture(page,1007);await scripts(page,id,'','throw new Error("SYNTHETIC_POST_FAILURE");');
 await login(page,apps.missing);await runView(page,apps.missing,id);const before=requests.length;let result=await send(page);expect(result.errcode).not.toBe(0);await visibleFailure(page,'ISOLATED_RUNNER_REQUIRED');expect(requests.length).toBe(before);await shot(page,info,'post-only-missing-runner-zero-target');
 await login(page,apps.default);await runView(page,apps.default,id);result=await send(page);expect(result.errcode).not.toBe(0);await visibleFailure(page,'SYNTHETIC_POST_FAILURE');expect(requests.length).toBe(before+1);expect(requests[before].path).toBe('/echo');await shot(page,info,'post-failure-after-target');
 await info.attach('post-only-boundary',{body:JSON.stringify({missingRunnerTargetCount:0,configuredPostFailureTargetCount:1,configurationCheckOnly:true,noRollbackGuarantee:true}),contentType:'application/json'});
});
