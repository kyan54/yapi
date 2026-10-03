'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../test-browser/parity-interfaces.preflight.cjs'), 'utf8');
function fixture(overrides = {}) {
  const module = {exports:{}};
  const network = {'parity-fast-interfaces':{}};
  const mockDocker = (command, args) => {
    if (args[0] === 'network') return JSON.stringify([{Internal: overrides.internal !== false}]);
    const name = args[1], version = String(name).endsWith('old') ? 'old' : 'new';
    const port = version === 'old' ? 4184 : 4185;
    if (args[0] === 'inspect') return JSON.stringify([{State:{Running:true},NetworkSettings:{Networks:network},Mounts:[{Destination:'/app/config.json',Source:version,RW:false}],HostConfig:{PortBindings:{[port+'/tcp']:[{HostIp:overrides.host || '127.0.0.1',HostPort:String(port)}]}}}]);
    const db = args[3];
    return JSON.stringify({_id:'parity-fast-interfaces-v1',synthetic:true,run:overrides.run || 'interfaces_20261003',database:db,state:'seeded',fixtureSha256:'df5dd7dea9fd9b4eba357a38fc29af43cce9bdbe31c8a90d7d3bfb96e82e2a2a'});
  };
  const mockRequire = name => name === 'node:child_process' ? {execFileSync:mockDocker} : name === 'node:fs' ? {readFileSync:version=>JSON.stringify({db:{DATABASE:overrides.database || 'parity_fast_interfaces_'+version,servername:'parity-fast-interfaces-mongo-'+version},mail:{enable:false}})} : require(name);
  vm.runInNewContext(source,{module,require:mockRequire,console});
  return module.exports;
}
test('parity preflight accepts exact isolated synthetic identity',async()=>{await fixture()();});
for(const [name,change] of [['external network',{internal:false}],['public binding',{host:'0.0.0.0'}],['unrelated database',{database:'other_database'}],['wrong run',{run:'other_run'}]]) {
  test('parity preflight refuses '+name,async()=>{await assert.rejects(fixture(change)());});
}
