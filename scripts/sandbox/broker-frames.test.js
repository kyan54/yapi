'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const childProcess = require('node:child_process');
const id = 'a'.repeat(32);
async function fakeDocker(t, scenario, input = {}) {
  let sends = 0;
  t.mock.method(childProcess,'spawn', (_cmd,args) => {
    const child = new EventEmitter(); child.stderr = new EventEmitter();
    if (args[0] === 'rm') {queueMicrotask(() => child.emit('close',0)); return child;}
    child.stdout = new EventEmitter(); child.stdin = new EventEmitter();
    child.kill = () => {queueMicrotask(() => child.emit('close',137));};
    child.stdin.end = () => {queueMicrotask(() => child.emit('close',0));};
    child.stdin.write = text => {sends++; queueMicrotask(() => scenario(JSON.parse(text), child, sends));};
    return child;
  });
  delete require.cache[require.resolve('../../server/sandbox/orchestrator')];
  const {execute} = require('../../server/sandbox/orchestrator');
  try {return await execute({version:1,id,script:'await utils.axios.get("https://example.com")',context:{},...input});}
  finally {t.mock.restoreAll(); delete require.cache[require.resolve('../../server/sandbox/orchestrator')];}
}
function emit(child, frame) {child.stdout.emit('data',Buffer.from(JSON.stringify(frame)+'\n'));}
function result(child) {emit(child,{type:'result',version:1,id,result:{version:1,id,context:{ok:true},logs:[],writes:[]}});}
test('stdio awaits broker result and strips original trusted scope from container job', async t => {
  const response = await fakeDocker(t,(frame,child,count) => {
    if (count === 1) {
      assert.equal(frame.type,'job'); assert.equal(frame.job.networkScope,undefined);
      emit(child,{type:'http',version:1,id,requestId:1,request:{url:'https://example.com'}});
    } else {
      assert.equal(frame.type,'httpResult'); assert.equal(frame.error,'SCRIPT_NETWORK_DISABLED'); result(child);
    }
  },{networkScope:{projectId:'p1',userId:'u1',headers:{api:{secret:'never sent to worker'}}}});
  assert.deepEqual(response.context,{ok:true});
});
test('host rejects forged job identity, scope-bearing frames and duplicate request IDs', async t => {
  for (const kind of ['identity','scope','duplicate','earlyResult']) {
    await assert.rejects(fakeDocker(t,(frame,child,count) => {
      if (count !== 1) return;
      const request = {type:'http',version:1,id,requestId:1,request:{url:'https://example.com'}};
      if (kind === 'identity') request.id = 'b'.repeat(32);
      if (kind === 'scope') request.networkScope = {projectId:'p1'};
      emit(child,request);
      if (kind === 'duplicate') emit(child,request);
      if (kind === 'earlyResult') result(child);
    }), /SCRIPT_RESPONSE_SCOPE_MISMATCH|SCRIPT_INVALID_BROKER_FRAME/);
  }
});
