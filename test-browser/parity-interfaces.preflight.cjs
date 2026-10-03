'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const FIXTURE_SHA = 'df5dd7dea9fd9b4eba357a38fc29af43cce9bdbe31c8a90d7d3bfb96e82e2a2a';
const docker = args => execFileSync('docker', args, {encoding:'utf8',timeout:15000});
const inspect = name => JSON.parse(docker(['inspect',name]))[0];
module.exports = async function preflight() {
 const network=JSON.parse(docker(['network','inspect','parity-fast-interfaces']))[0];assert.equal(network.Internal,true,'Application network must be internal');
 for(const [version,port] of [['old',4184],['new',4185]]) {
  const database='parity_fast_interfaces_'+version;
  const app=inspect('parity-fast-interfaces-'+version), mongo=inspect('parity-fast-interfaces-mongo-'+version), proxy=inspect('parity-fast-interfaces-proxy-'+version);
  for(const service of [app,mongo]) {assert.equal(service.State.Running,true);assert.deepEqual(Object.keys(service.NetworkSettings.Networks),['parity-fast-interfaces']);assert.equal(service.Mounts.some(m=>m.Destination.includes('docker.sock')),false);}
  const configMount=app.Mounts.find(m=>m.Destination==='/app/config.json');assert(configMount&&!configMount.RW);const config=JSON.parse(fs.readFileSync(configMount.Source,'utf8'));assert.equal(config.db.DATABASE,database);assert.equal(config.db.servername,'parity-fast-interfaces-mongo-'+version);assert.equal(config.mail.enable,false);
  assert.equal(proxy.State.Running,true);assert.deepEqual(proxy.HostConfig.PortBindings[port+'/tcp'],[{HostIp:'127.0.0.1',HostPort:String(port)}]);
  const script=`const m=db.getCollection('_ui_parity_fixture').findOne({_id:'parity-fast-interfaces-v1'});print(JSON.stringify(m));`;
  const marker=JSON.parse(docker(['exec','parity-fast-interfaces-mongo-'+version,version==='old'?'mongo':'mongosh',database,'--quiet','--eval',script]).trim());
  assert(marker);assert.equal(marker.synthetic,true);assert.equal(marker.database,database);assert.equal(marker.run,'interfaces_20261003');assert.equal(marker.state,'seeded');assert.equal(marker.fixtureSha256,FIXTURE_SHA);
 }
};
if(require.main===module)module.exports().then(()=>console.log('Verified isolated parity_fast_interfaces old/new identities and loopback ports.')).catch(error=>{console.error(error.message);process.exitCode=1;});
