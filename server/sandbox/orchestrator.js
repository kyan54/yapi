'use strict';
// TRUSTED service, deployed outside the app. Never load this module in the app process.
const {StringDecoder} = require('node:string_decoder');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { LIMIT, TIMEOUT, fail, parse, validateJob } = require('./protocol');
const {createBroker} = require('./http-broker');
const IMAGE = 'yapi-script-runner:node24-v1';
function dockerArgs(name) {
  return ['run', '--rm', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '32', '--memory', '128m', '--memory-swap', '128m', '--cpus', '0.5', '--user', '65532:65532', '--log-driver', 'none', '-i', IMAGE, 'node', '--max-old-space-size=64', '/runner/worker.js'];
}
async function execute(job, rules = []) {
  validateJob(job);
  const broker = createBroker(job, rules);
  const workerJob = {...job}; delete workerJob.networkScope;
  const name = 'yapi-script-' + randomBytes(16).toString('hex');
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn('docker', dockerArgs(name), {stdio: ['pipe', 'pipe', 'pipe'], env: {PATH: process.env.PATH}});
      let size = 0, stderrSize = 0, pending = '', result, outstanding = 0, done = false;
      const seen = new Set(); const decoder = new StringDecoder('utf8');
      const stop = error => {if (done) return; done = true; broker.close(); child.kill('SIGKILL'); reject(error);};
      const timer = setTimeout(() => stop(fail('SCRIPT_TIMEOUT')), TIMEOUT);
      child.once('error', error => {clearTimeout(timer); stop(error);});
      child.stdout.on('data', chunk => {
        size += chunk.length;
        if (size > LIMIT) {stop(fail('SCRIPT_OUTPUT_LIMIT')); return;}
        pending += decoder.write(chunk);
        try {
          let index;
          while ((index = pending.indexOf('\n')) >= 0) {
            const frame = parse(pending.slice(0,index)); pending = pending.slice(index+1);
            if (done || result || frame.version !== 1 || frame.id !== job.id) throw fail('SCRIPT_RESPONSE_SCOPE_MISMATCH');
            if (frame.type === 'http') {
              if (!Number.isSafeInteger(frame.requestId) || frame.requestId < 1 || seen.has(frame.requestId) || seen.size >= 8 || Object.keys(frame).some(k => !['type','version','id','requestId','request'].includes(k))) throw fail('SCRIPT_INVALID_BROKER_FRAME');
              seen.add(frame.requestId); outstanding++;
              broker.request(frame.request).then(response => ({response}), error => ({error: error.code || 'SCRIPT_NETWORK_FAILED'})).then(payload => {
                outstanding--;
                if (!done && !child.stdin.destroyed) child.stdin.write(JSON.stringify({type:'httpResult', version:1, id:job.id, requestId:frame.requestId, ...payload}) + '\n');
              }).catch(stop);
            } else if (frame.type === 'result' && outstanding === 0) {
              result = frame.result;
              if (!result || result.id !== job.id || result.version !== 1) throw fail('SCRIPT_RESPONSE_SCOPE_MISMATCH');
              child.stdin.end();
            } else throw fail('SCRIPT_INVALID_BROKER_FRAME');
          }
        } catch (error) {stop(error);}
      });
      child.stderr.on('data', chunk => {stderrSize += chunk.length; if (stderrSize > LIMIT) stop(fail('SCRIPT_OUTPUT_LIMIT'));});
      child.stdin.on('error', () => {});
      child.once('close', code => {
        clearTimeout(timer); broker.close();
        if (done) return;
        done = true;
        if (code !== 0 || !result || pending) reject(fail('SCRIPT_RUNNER_EXIT'));
        else resolve(result);
      });
      child.stdin.write(JSON.stringify({type:'job', job:workerJob}) + '\n');
    });
  } finally {
    broker.close();
    // Killing the CLI alone does not reliably kill its container.
    await cleanupContainer(name);

  }
}
async function cleanupContainer(name) {
  // --rm and an explicit rm -f can race after a killed CLI. Docker reports
  // "removal ... already in progress" before the container actually vanishes.
  // Retry only that known transient state; do not mistake it for confirmed
  // removal or weaken fail-closed handling of daemon/permission failures.
  for (let attempt = 0; attempt < 5; attempt++) {
    const outcome = await new Promise((resolve, reject) => {
      const cleanup = spawn('docker', ['rm', '-f', name], {stdio:['ignore','ignore','pipe'],env:{PATH:process.env.PATH}});
      let diagnostic='';
      cleanup.stderr.on('data', chunk => {diagnostic=(diagnostic+chunk.toString()).slice(0,4096);});
      const timer=setTimeout(()=>{cleanup.kill('SIGKILL');reject(fail('SCRIPT_CLEANUP_FAILED'));},3000);
      cleanup.once('error',()=>{clearTimeout(timer);reject(fail('SCRIPT_CLEANUP_FAILED'));});
      cleanup.once('close',code=>{clearTimeout(timer);resolve({code,diagnostic});});
    });
    if(outcome.code===0 || /No such container/i.test(outcome.diagnostic)) return;
    if(!/removal.*in progress|already.*remov/i.test(outcome.diagnostic)) {
      const error=fail('SCRIPT_CLEANUP_FAILED'); error.cleanupDiagnostic=outcome.diagnostic; throw error;
    }
    await new Promise(resolve=>setTimeout(resolve,50*(attempt+1)));
  }
  throw fail('SCRIPT_CLEANUP_FAILED');
}
module.exports = {execute, dockerArgs, IMAGE, cleanupContainer};
