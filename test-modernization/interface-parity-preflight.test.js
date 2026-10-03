'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../test-browser/parity-interfaces.preflight.cjs'), 'utf8');
const hashes={old:'ce73f1215865a63ad8225d2bb0b987ddf7d774b3f00226f2d9a9d9ed640f4189',new:'ae82ee50c4e4d13c079fd8053019e70d3e3feb04c372df0ef50ad11e58227089'};
function fixture(overrides = {}) {
  const module = {exports:{}};
  const network = {'parity-fast-interfaces':{NetworkID:'isolated'}};
  const names=['old','new'].flatMap(v=>['parity-fast-interfaces-'+v,'parity-fast-interfaces-mongo-'+v,'parity-fast-interfaces-proxy-'+v]);
  const mockDocker = (command, args) => {
    if (args[0] === 'network') return JSON.stringify([{Id:'isolated',Internal: overrides.internal !== false,Containers:Object.fromEntries(names.map(n=>[n,{Name:n}]))}]);
    const name=args[1],version=String(name).endsWith('old')?'old':'new',proxy=String(name).includes('-proxy-');
    const port=version==='old'?4184:4185;
    if(args[0]==='inspect')return JSON.stringify([{State:{Running:true},NetworkSettings:{Networks:proxy?{...network,'parity-fast-interfaces-front':{}}:network},Mounts:[{Destination:proxy?'/proxy.cjs':'/app/config.json',Source:version,RW:false}],Config:{Cmd:proxy?['node','/proxy.cjs']:['node','server/app.js'],WorkingDir:'/app/vendor',Env:overrides.env||[]},HostConfig:{PortBindings:{[port+'/tcp']:[{HostIp:overrides.host||'127.0.0.1',HostPort:String(port)}]}}}]);
    if(proxy)return overrides.upstream?'wrong-upstream':version;
    return JSON.stringify({_id:'parity-fast-interfaces-v1',synthetic:true,corePresent:overrides.core!==false,run:overrides.run||'interfaces_20261003',database:args[3],state:'seeded',fixtureSha256:'df5dd7dea9fd9b4eba357a38fc29af43cce9bdbe31c8a90d7d3bfb96e82e2a2a'});
  };
  const mockRequire = name => {
    if(name==='node:child_process')return {execFileSync:mockDocker};
    if(name==='node:crypto')return {createHash:()=>({update:value=>({digest:()=>hashes[value]||'bad-hash'})})};
    if(name==='node:fs')return {readFileSync:version=>JSON.stringify({db:{DATABASE:overrides.database||'parity_fast_interfaces_'+version,servername:'parity-fast-interfaces-mongo-'+version,port:27017,...(overrides.connectString?{connectString:'mongodb://unrelated/db'}:{})},mail:{enable:false}})};
    return require(name);
  };
  vm.runInNewContext(source,{module,require:mockRequire,console});
  return module.exports;
}
test('parity preflight accepts exact isolated synthetic identity',async()=>{await fixture()();});
for(const [name,change] of [['external network',{internal:false}],['public binding',{host:'0.0.0.0'}],['unrelated database',{database:'other_database'}],['wrong run',{run:'other_run'}],['missing core fixture',{core:false}],['wrong deployed upstream',{upstream:true}],['connectString override',{connectString:true}],['YAPI_CONFIG override',{env:['YAPI_CONFIG=/other/config.json']}],['NODE_OPTIONS preload',{env:['NODE_OPTIONS=--require=/other.js']}]] ) {
 test('parity preflight refuses '+name,async()=>{await assert.rejects(fixture(change)());});
}
