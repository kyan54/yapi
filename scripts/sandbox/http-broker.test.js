'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createBroker, addressClass, validateRules} = require('../../server/sandbox/http-broker');
const job = {networkScope:{projectId:'p1',userId:'u1',headers:{api:{'x-context':'scoped'}}}};
const rule = {id:'api',projectIds:['p1'],userIds:['u1'],origin:'https://api.example',paths:['/allowed'],methods:['GET','POST'],headers:['content-type','x-test'],contextHeaders:['x-context'],privateAddresses:[]};
const answer = {status:200,data:{ok:true}};
function broker(j = job, r = rule, extra = {}) {
  return createBroker(j, [r], {lookup: async () => [{address:'93.184.216.34',family:4}],transport: async () => answer,...extra});
}
test('deny absent scope/rules, cross-project/user/origin/path/method and forged scope/options', async () => {
  await assert.rejects(createBroker(job).request({url:'https://api.example/allowed'}), /DISABLED/);
  await assert.rejects(broker({}).request({url:'https://api.example/allowed'}), /DISABLED/);
  for (const scope of [{projectId:'p2',userId:'u1'},{projectId:'p1',userId:'u2'}]) await assert.rejects(broker({networkScope:scope}).request({url:'https://api.example/allowed'}), /DENIED/);
  for (const request of [{url:'https://evil.example/allowed'},{url:'https://api.example/other'},{url:'https://api.example/allowed',method:'DELETE'},{url:'https://api.example/allowed',scope:{projectId:'p1'}},{url:'https://api.example/allowed',socketPath:'/tmp/foo'},{url:'https://user:pass@api.example/allowed'}]) await assert.rejects(broker().request(request), /DENIED/);
});
test('only original scope and exact explicit headers are used; no host env/header inheritance', async () => {
  const original = structuredClone(job); let sent = 0;
  const b = broker(original, rule, {transport: async (url, options) => {sent++; assert.deepEqual({...options.headers},{'x-test':'value','x-context':'scoped'}); return answer;}});
  original.networkScope.headers.api['x-context'] = 'changed';
  assert.deepEqual(await b.request({url:'https://api.example/allowed',headers:{'x-test':'value'}}), answer);
  assert.equal(sent,1);
  for (const headers of [{authorization:'secret'},{host:'evil.example'},{'x-test':'a\r\nb'},{'x-test':42}]) await assert.rejects(broker().request({url:'https://api.example/allowed',headers}), /DENIED/);
});
test('DNS is validated and pinned; mixed public/private, metadata and alternate encodings fail', async () => {
  let lookups = 0;
  const b = broker(job, rule, {lookup: async () => {lookups++; return [{address:'93.184.216.34',family:4}];},transport: async (url, options) => {
    await new Promise((resolve,reject) => options.lookup(url.hostname, {}, (error, address, family) => {try {assert.equal(address,'93.184.216.34'); assert.equal(family,4); resolve();} catch (e) {reject(e);}})); return answer;
  }});
  await b.request({url:'https://api.example/allowed'}); assert.equal(lookups,1);
  for (const address of ['127.0.0.1','10.0.0.1','169.254.169.254','100.100.100.200','::ffff:127.0.0.1','fd00:ec2::254','fe80::1','2002:7f00:1::']) {
    let sent = false;
    await assert.rejects(broker(job,rule,{lookup: async () => [{address:'93.184.216.34',family:4},{address,family:address.includes(':')?6:4}],transport: async () => {sent=true;}}).request({url:'https://api.example/allowed'}), /DENIED/);
    assert.equal(sent,false);
  }
  assert.equal(addressClass('2130706433'),'forbidden');
  assert.equal(addressClass('2001:4860:4860::8888'),'public');
  assert.equal(addressClass('2001:db8::1'),'forbidden');
  assert.equal(addressClass('2001::1'),'forbidden');
  assert.equal(addressClass('168.63.129.16'),'forbidden');
});
test('private destinations require an exact scoped rule address; metadata can never be enabled', async () => {
  const extra = {lookup: async () => [{address:'10.0.0.7',family:4}]};
  assert.deepEqual(await broker(job,{...rule,privateAddresses:['10.0.0.7']},extra).request({url:'https://api.example/allowed'}),answer);
  await assert.rejects(broker(job,{...rule,privateAddresses:['10.0.0.8']},extra).request({url:'https://api.example/allowed'}), /DENIED/);
  for (const address of ['169.254.169.254','100.100.100.200','fd00:ec2::254']) assert.throws(() => validateRules([{...rule,privateAddresses:[address]}]), /CONFIG/);
});
test('request sizes, count and cancellation are bounded', async () => {
  await assert.rejects(broker().request({url:'https://api.example/allowed',method:'POST',data:'x'.repeat(65537)}), /DENIED/);
  const b = broker(); for (let i=0;i<8;i++) await b.request({url:'https://api.example/allowed'});
  await assert.rejects(b.request({url:'https://api.example/allowed'}), /REQUEST_LIMIT/);
  const closed = broker(); closed.close(); await assert.rejects(closed.request({url:'https://api.example/allowed'}),/DENIED/);
});
test('DNS stalls hit a wall deadline without initiating transport', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let sent = false;
  const pending = assert.rejects(broker(job,rule,{lookup: () => new Promise(()=>{}),transport: async () => {sent=true;}}).request({url:'https://api.example/allowed'}), /TIMEOUT/);
  t.mock.timers.tick(2501); await pending; assert.equal(sent,false); t.mock.timers.reset();
});
test('real host transport bounds response, rejects redirects and returns JSON', async () => {
  let redirected = 0;
  const server = http.createServer((req,res) => {
    if (req.url === '/redirect') res.writeHead(302,{location:'/target'}).end();
    else if (req.url === '/target') {redirected++; res.end('unexpected');}
    else if (req.url === '/large') res.end('x'.repeat(262145));
    else res.setHeader('content-type','application/json'),res.end('{"ok":true}');
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const b = createBroker(job,[{...rule,origin,paths:['/allowed','/redirect','/large'],privateAddresses:['127.0.0.1']}]);
  try {
    assert.deepEqual((await b.request({url:origin+'/allowed'})).data,{ok:true});
    await assert.rejects(b.request({url:origin+'/redirect'}), /REDIRECT/);
    await assert.rejects(b.request({url:origin+'/large'}), /RESPONSE_LIMIT/);
    assert.equal(redirected,0);
  } finally {b.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
});
