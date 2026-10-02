'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {EventEmitter} = require('node:events');
const sandbox = require('../../server/utils/sandbox');
const {LIMIT, parse, validateJob} = require('../../server/sandbox/protocol');
const {dockerArgs, IMAGE} = require('../../server/sandbox/orchestrator');
async function withRunner(handler, fn) {
  const original = http.request;
  const old = process.env.YAPI_ISOLATED_RUNNER_SOCKET;
  process.env.YAPI_ISOLATED_RUNNER_SOCKET = '/test/isolated.sock';
  http.request = (options, callback) => {
    assert.equal(options.socketPath, '/test/isolated.sock');
    const req = new EventEmitter();
    req.destroy = error => {req.emit('error', error); req.emit('close');};
    req.end = body => queueMicrotask(() => {
      const response = new EventEmitter(); response.statusCode = 200;
      callback(response);
      handler(JSON.parse(body), {end: text => {
        response.emit('data', Buffer.from(text)); response.emit('end'); req.emit('close');
      }});
    });
    return req;
  };
  try {await fn();} finally {
    http.request = original;
    if (old === undefined) delete process.env.YAPI_ISOLATED_RUNNER_SOCKET; else process.env.YAPI_ISOLATED_RUNNER_SOCKET = old;
  }
}
test('fails closed only when an actual script needs execution', async () => {
  const old = process.env.YAPI_ISOLATED_RUNNER_SOCKET; delete process.env.YAPI_ISOLATED_RUNNER_SOCKET;
  try {
    assert.deepEqual(await sandbox({mockJson: {ok: true}}, ''), {mockJson: {ok: true}});
    await assert.rejects(sandbox({}, 'process.exit()'), /ISOLATED_RUNNER_REQUIRED/);
  } finally {if (old !== undefined) process.env.YAPI_ISOLATED_RUNNER_SOCKET = old;}
});
test('replays only scoped logs and storage operations and returns changes', async () => {
  const logs = []; const writes = [];
  await withRunner((job, res) => {
    assert.equal(job.context.assert, undefined); assert.equal(job.storage.x, 1);
    res.end(JSON.stringify({version: 1, id: job.id, context: {mockJson: {value: 2}}, logs: ['ok'], writes: [{key: 'x', value: 3}]}));
  }, async () => {
    const output = await sandbox({assert, mockJson: {}, log: line => logs.push(line), storage: {_sandboxData: {x: 1}, setItem: (...args) => writes.push(args)}}, 'mockJson.value=2');
    assert.deepEqual(output.mockJson, {value: 2}); assert.equal(output.assert, assert);
  });
  assert.deepEqual(logs, ['ok']); assert.deepEqual(writes, [['x', 3]]);
});
test('rejects response from another job before replaying effects', async () => {
  let writes = 0;
  await withRunner((job, res) => res.end(JSON.stringify({version: 1, id: '0'.repeat(32), context: {}, logs: [], writes: [{key: 'x', value: 3}]})), async () => {
    await assert.rejects(sandbox({storage: {setItem: () => writes++}}, '1'), /SCRIPT_RESPONSE_SCOPE_MISMATCH/);
  });
  assert.equal(writes, 0);
});
test('rejects excessive output and prototype keys', async () => {
  await withRunner((job, res) => res.end('a'.repeat(LIMIT + 1)), async () => {
    await assert.rejects(sandbox({}, '1'), /SCRIPT_OUTPUT_LIMIT/);
  });
  assert.throws(() => parse('{"__proto__":{}}'), /SCRIPT_INVALID_KEY/);
  assert.throws(() => validateJob({version: 1, id: '0'.repeat(32), context: {}, script: 'a'.repeat(LIMIT)}), /SCRIPT_INPUT_LIMIT/);
});
test('fixed docker command confines resources, privileges, filesystem and network', () => {
  const args = dockerArgs('yapi-script-test');
  for (const flag of ['--read-only', '--cap-drop', '--security-opt', '--pids-limit', '--memory', '--memory-swap', '--cpus', '--user']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--network') + 1], 'none');
  assert.ok(args.includes(IMAGE)); assert.ok(!args.includes('-v')); assert.ok(!args.includes('--privileged'));
});
test('absolute client wall deadline bounds an unresponsive service', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  try {
    await withRunner(() => {}, async () => {
      const pending = assert.rejects(sandbox({}, '1'), /SCRIPT_TIMEOUT/);
      await Promise.resolve();
      t.mock.timers.tick(12001);
      await pending;
    });
  } finally {t.mock.timers.reset();}
});
test('invalid effect list cannot partially replay storage', async () => {
  let writes = 0;
  await withRunner((job, res) => res.end(JSON.stringify({version: 1, id: job.id, context: {}, logs: [], writes: [{key: 'valid', value: 1}, {key: 3, value: 2}]})), async () => {
    await assert.rejects(sandbox({storage: {setItem: () => writes++}}, '1'), /SCRIPT_INVALID_STORAGE_WRITE/);
  });
  assert.equal(writes, 0);
});
test('only separately minted authenticated scope reaches the broker; script context cannot grant it', async () => {
  const {create} = require('../../server/sandbox/trusted-scope');
  const capability = create(9,11);
  await withRunner((job,res) => {
    assert.deepEqual(job.networkScope,{userId:'9',projectId:'11'});
    assert.equal(job.context.networkScope,undefined);
    res.end(JSON.stringify({version:1,id:job.id,context:{networkScope:{userId:'1',projectId:'1'}},logs:[],writes:[]}));
  }, async () => {
    const input={networkScope:{userId:'attacker',projectId:'attacker'}};
    const result=await sandbox(input,'1',capability);
    assert.deepEqual(result.networkScope,input.networkScope);
    await assert.rejects(sandbox({},'1',{userId:'9',projectId:'11'}),/SCRIPT_INVALID_SCOPE/);
  });
  await withRunner((job,res) => {
    assert.equal(job.networkScope,undefined);
    res.end(JSON.stringify({version:1,id:job.id,context:{},logs:[],writes:[]}));
  }, () => sandbox({networkScope:{userId:'9',projectId:'11'}},'1'));
});
