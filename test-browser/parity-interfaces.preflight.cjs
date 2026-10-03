'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const PROXY_SHA={old:'ce73f1215865a63ad8225d2bb0b987ddf7d774b3f00226f2d9a9d9ed640f4189',new:'ae82ee50c4e4d13c079fd8053019e70d3e3feb04c372df0ef50ad11e58227089'};
const { execFileSync } = require('node:child_process');
const FIXTURE_SHA = 'df5dd7dea9fd9b4eba357a38fc29af43cce9bdbe31c8a90d7d3bfb96e82e2a2a';
const docker = args => execFileSync('docker', args, {encoding:'utf8',timeout:15000});
const inspect = name => JSON.parse(docker(['inspect',name]))[0];
module.exports = async function preflight() {
 const network=JSON.parse(docker(['network','inspect','parity-fast-interfaces']))[0];assert.equal(network.Internal,true,'Application network must be internal');
 const expectedNames=['old','new'].flatMap(v=>['parity-fast-interfaces-'+v,'parity-fast-interfaces-mongo-'+v,'parity-fast-interfaces-proxy-'+v]).sort();assert.deepEqual(Object.values(network.Containers).map(c=>c.Name).sort(),expectedNames,'Unexpected isolated network participant');
 for(const [version,port] of [['old',4184],['new',4185]]) {
  const database='parity_fast_interfaces_'+version;
  const app=inspect('parity-fast-interfaces-'+version), mongo=inspect('parity-fast-interfaces-mongo-'+version), proxy=inspect('parity-fast-interfaces-proxy-'+version);
  for(const service of [app,mongo]) {assert.equal(service.State.Running,true);assert.equal(service.NetworkSettings.Networks['parity-fast-interfaces'].NetworkID,network.Id);assert.deepEqual(Object.keys(service.NetworkSettings.Networks),['parity-fast-interfaces']);assert.equal(service.Mounts.some(m=>m.Destination.includes('docker.sock')),false);}
  const configMount=app.Mounts.find(m=>m.Destination==='/app/config.json');assert(configMount&&!configMount.RW);const config=JSON.parse(fs.readFileSync(configMount.Source,'utf8'));assert.equal(config.db.DATABASE,database);assert.equal(config.db.servername,'parity-fast-interfaces-mongo-'+version);assert.equal(config.mail.enable,false);assert.deepEqual(Object.keys(config.db).sort(),['DATABASE','port','servername']);assert.equal(config.db.port,27017);assert.deepEqual(app.Config.Cmd,['node','server/app.js']);assert.equal(app.Config.WorkingDir,'/app/vendor');
  for(const service of [app,proxy])assert.equal(service.Config.Env.some(e=>/^(YAPI_|MONGO|DATABASE|DB_|NODE_OPTIONS=|NODE_PATH=)/.test(e)),false,'Runtime config override forbidden');
  assert.equal(proxy.State.Running,true);assert.deepEqual(proxy.Config.Cmd,['node','/proxy.cjs']);assert.deepEqual(Object.keys(proxy.NetworkSettings.Networks).sort(),['parity-fast-interfaces','parity-fast-interfaces-front']);assert.equal(proxy.NetworkSettings.Networks['parity-fast-interfaces'].NetworkID,network.Id);const proxyMount=proxy.Mounts.find(m=>m.Destination==='/proxy.cjs');assert(proxyMount&&!proxyMount.RW);const deployed=docker(['exec','parity-fast-interfaces-proxy-'+version,'cat','/proxy.cjs']);assert.equal(crypto.createHash('sha256').update(deployed).digest('hex'),PROXY_SHA[version],'Deployed proxy upstream script mismatch');assert.deepEqual(proxy.HostConfig.PortBindings[port+'/tcp'],[{HostIp:'127.0.0.1',HostPort:String(port)}]);
  const script=`const m=db.getCollection('_ui_parity_fixture').findOne({_id:'parity-fast-interfaces-v1'});if(m)m.corePresent=db.getCollection('group').countDocuments({_id:901000})===1&&db.getCollection('project').countDocuments({_id:901001,group_id:901000})===1&&db.getCollection('interface').countDocuments({_id:901016,project_id:901001})===1;print(JSON.stringify(m));`;
  const marker=JSON.parse(docker(['exec','parity-fast-interfaces-mongo-'+version,version==='old'?'mongo':'mongosh',database,'--quiet','--eval',script]).trim());
  assert(marker);assert.equal(marker.synthetic,true);assert.equal(marker.corePresent,true,'Core synthetic fixture records missing');assert.equal(marker.database,database);assert.equal(marker.run,'interfaces_20261003');assert.equal(marker.state,'seeded');assert.equal(marker.fixtureSha256,FIXTURE_SHA);
 }
};
if(require.main===module)module.exports().then(()=>console.log('Verified isolated parity_fast_interfaces old/new identities and loopback ports.')).catch(error=>{console.error(error.message);process.exitCode=1;});
