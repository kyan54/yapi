'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes} = require('node:crypto');
const {execute} = require('../../server/sandbox/orchestrator');
const enabled = process.env.YAPI_SANDBOX_DOCKER_TEST === '1';
function run(script, context = {}, storage = {}) {return execute({version: 1, id: randomBytes(16).toString('hex'), script, context, storage});}
test('isolated Mock, assertions, async pre/post helpers and storage work', {skip: !enabled}, async () => {
  const result = await run('assert.equal(status, 200); mockJson.id = Random.integer(1,1); requestHeader.signature = utils.CryptoJS.SHA256("abc").toString(); context.responseData.ok = true; log("tested"); storage.setItem("counter", storage.getItem("counter")+1); promise = new Promise(resolve => setTimeout(() => { query.done = true; resolve(); }, 10));', {status: 200, mockJson: {}, requestHeader: {}, responseData: {}, query: {}}, {counter: 2});
  assert.equal(result.error, undefined); assert.equal(result.context.mockJson.id, 1); assert.equal(result.context.query.done, true);
  assert.equal(result.context.responseData.ok, true); assert.equal(result.context.requestHeader.signature.length, 64);
  assert.deepEqual(result.logs, ['tested']); assert.deepEqual(result.writes, [{key: 'counter', value: 3}]);
});
test('CPU loops, output floods and async hangs are bounded', {skip: !enabled, timeout: 40000}, async () => {
  const loop = await run('while(true) {}'); assert.match(loop.error, /timed out|TIMEOUT/);
  const flood = await run('log("x".repeat(70000))'); assert.equal(flood.error, 'SCRIPT_OUTPUT_LIMIT');
  await assert.rejects(run('await new Promise(() => {})'), /SCRIPT_RUNNER_EXIT|SCRIPT_TIMEOUT/);
});
test('network helper is explicit; escaped script still sees no host secrets, mounts, privileges or network', {skip: !enabled}, async () => {
  const network = await run('await utils.axios.get("https://example.com")'); assert.equal(network.error, 'SCRIPT_NETWORK_DISABLED');
  // Deliberately use a vm escape: vm is not relied upon as the security boundary.
  const probe = await run('const p = this.constructor.constructor("return process")(); const fs = p.getBuiltinModule("fs"); assert.equal(p.getuid(),65532); assert.equal(p.env.YAPI_SECRET,undefined); assert.equal(fs.existsSync("/var/run/docker.sock"),false); assert.throws(()=>fs.writeFileSync("/runner/escape","x")); const net = p.getBuiltinModule("os").networkInterfaces(); assert.deepEqual(Object.keys(net),["lo"]); mockJson.confined=true;', {mockJson: {}});
  assert.equal(probe.error, undefined); assert.equal(probe.context.mockJson.confined, true);
});

test('legacy sandbox mutation contract executes in isolation', {skip: !enabled}, async () => {
  const result = await run('a=2', {a: 1});
  assert.equal(result.error, undefined); assert.deepEqual(result.context, {a: 2});
});

test('scoped axios broker awaits in the same script with no replay and no container network', {skip: !enabled, timeout:20000}, async () => {
  const http = require('node:http');
  const received = [];
  const receiver = http.createServer((req,res) => {
    let body = '';
    req.on('data', chunk => {body += chunk;});
    req.on('end', () => {received.push({url:req.url,body,headers:req.headers}); res.setHeader('content-type','application/json'); res.end(JSON.stringify({ok:true,sequence:received.length}));});
  });
  await new Promise(resolve => receiver.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + receiver.address().port;
  const rules = [{id:'fixture',projectIds:['p1'],userIds:['u1'],origin,paths:['/fixture'],methods:['POST'],headers:['content-type'],contextHeaders:['x-scoped'],privateAddresses:['127.0.0.1']}];
  const networkScope = {projectId:'p1',userId:'u1',headers:{fixture:{'x-scoped':'synthetic-only'}}};
  const script = 'counter++; const first = await utils.axios.post(destination+"/fixture", {counter}, {headers:{"Content-Type":"application/json"}}); assert.equal(first.data.sequence,1); const second = await utils.axios({url:destination+"/fixture",method:"POST",data:"second"}); assert.equal(second.data.sequence,2); assert.equal(counter,1); assert.equal(context.networkScope,undefined); storage.setItem("completed",true); mockJson.ok=first.data.ok;';
  const input = {version:1,id:randomBytes(16).toString('hex'),script,context:{destination:origin,counter:0,mockJson:{}},networkScope};
  try {
    const result = await execute(input,rules);
    assert.equal(result.error,undefined); assert.equal(result.context.counter,1); assert.equal(result.context.mockJson.ok,true);
    assert.deepEqual(result.writes,[{key:'completed',value:true}]);
    assert.equal(received.length,2); assert.equal(received[0].body,'{"counter":1}'); assert.equal(received[0].headers['x-scoped'],'synthetic-only');
    const denied = await execute({...input,id:randomBytes(16).toString('hex'),networkScope:{projectId:'p2',userId:'u1'}},rules);
    assert.equal(denied.error,'SCRIPT_NETWORK_DENIED'); assert.equal(received.length,2);
  } finally {receiver.closeAllConnections(); await new Promise(resolve => receiver.close(resolve));}
});
