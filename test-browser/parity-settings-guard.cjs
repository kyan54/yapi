'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const run='fast_settings',network='parity-fast-settings-internal';
const hashes={old:'314a88a5a636d861a86e13401ef8fba5b918e709cd65c5bd92d3920e22f00711',new:'031fd6559b6bf12fedb27f33869beee07b6eaa3247956c415242db0908ffc2f6'};
function expected(version){assert.ok(['old','new'].includes(version));const stem='parity-fast-settings-'+version;return{origin:'http://127.0.0.1:'+(version==='old'?4188:4189),proxy:stem+'-proxy',app:stem+'-web',mongo:stem+'-mongo',database:'parity_fast_settings_'+version+'_r2',hash:hashes[version]};}
function validateIdentity(version,origin,body,headers,hostname,challenge){
 const e=expected(version);assert.equal(origin,e.origin,'only reserved disposable origins are permitted');assert.equal(headers.get('x-parity-settings-proxy'),e.proxy);assert.equal(headers.get('x-parity-settings-upstream'),e.app);assert.equal(body.challenge,challenge);assert.equal(body.version,version);assert.equal(body.run,run);assert.equal(body.appHostname,hostname);assert.equal(body.appPort,3000);assert.equal(body.configuredDbHost,e.mongo);assert.equal(body.configuredDatabase,e.database);assert.equal(body.connectedDatabase,e.database);assert.deepEqual(body.marker,{_id:'yapi-ui-parity-v1',database:e.database,run,synthetic:true,state:'seeded',fixtureSha256:e.hash});
}
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:10000,maxBuffer:1024*1024}).trim();
const inspect=name=>JSON.parse(docker('inspect',name))[0];
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function checkScript(container,target,filename){
 const item=container.Mounts.find(x=>x.Destination===target);assert.ok(item&&!item.RW,'guard/proxy script must be read-only mounted');assert.equal(docker('exec',container.Id,'sha256sum',target).split(/\s/)[0],digest(path.join(__dirname,filename)),'running guard script bytes differ');assert.ok(fs.statSync(item.Source).mtimeMs<=Date.parse(container.State.StartedAt),'restart container after changing mounted code');
}
async function globalSetup(config){
 const results=[];
 for(const project of config.projects){
  const version=project.name,e=expected(version);assert.equal(project.use.baseURL,e.origin,'refusing arbitrary loopback origin');
  const proxy=inspect(e.proxy),app=inspect(e.app),mongo=inspect(e.mongo);for(const c of[proxy,app,mongo])assert.equal(c.State.Running,true);
  const port=new URL(e.origin).port;assert.deepEqual(proxy.HostConfig.PortBindings[port+'/tcp'],[{HostIp:'127.0.0.1',HostPort:port}]);
  assert.ok(proxy.NetworkSettings.Networks[network]);assert.deepEqual(Object.keys(app.NetworkSettings.Networks),[network]);assert.deepEqual(Object.keys(mongo.NetworkSettings.Networks),[network]);assert.equal(JSON.parse(docker('network','inspect',network))[0].Internal,true);
  for(const c of[app,mongo])assert.ok(!c.Mounts.some(m=>m.Source.includes('docker.sock')));
  const env=c=>Object.fromEntries(c.Config.Env.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}));for(const c of[proxy,app]){assert.equal(env(c).PARITY_SETTINGS_VERSION,version);assert.equal(env(c).PARITY_SETTINGS_RUN,run);}
  assert.deepEqual(app.Config.Cmd,['node','--require','/parity-settings-identity.cjs','server/app.js']);assert.deepEqual(proxy.Config.Cmd,['node','/proxy.cjs']);checkScript(proxy,'/proxy.cjs','parity-settings-proxy.cjs');checkScript(app,'/parity-settings-identity.cjs','parity-settings-identity.cjs');
  const dbConfig=JSON.parse(docker('exec',e.app,'cat','/app/config.json')).db;assert.equal(dbConfig.DATABASE,e.database);assert.equal(dbConfig.servername,e.mongo);assert.equal(dbConfig.port,27017);assert.ok(!dbConfig.connectString,'alternate database URI not allowed');
  for(const [from,to,container]of[[e.proxy,e.app,app],[e.app,e.mongo,mongo]]){const ip=docker('exec',from,'node','-e',`require('dns').lookup(${JSON.stringify(to)},(err,address)=>{if(err)process.exit(1);console.log(address)})`);assert.equal(ip,container.NetworkSettings.Networks[network].IPAddress);}
  const challenge=crypto.randomBytes(16).toString('hex');const response=await fetch(e.origin+'/__parity_settings_identity?challenge='+challenge,{redirect:'error',signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);const body=await response.json();validateIdentity(version,e.origin,body,response.headers,app.Config.Hostname,challenge);
  results.push({version,origin:e.origin,proxyId:proxy.Id,appId:app.Id,mongoId:mongo.Id,database:body.connectedDatabase,marker:body.marker});
 }
 if(process.env.SETTINGS_GUARD_REPORT)fs.writeFileSync(process.env.SETTINGS_GUARD_REPORT,JSON.stringify(results,null,2)+'\n');
 console.log('Settings guard verified reserved origin → own proxy → own app connection → seeded synthetic run for '+results.map(x=>x.version).join('/'));
}
module.exports=globalSetup;module.exports.validateIdentity=validateIdentity;module.exports.expected=expected;
