'use strict';
// Host never evaluates script text. Only an explicitly configured isolated runner may execute it.
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { LIMIT, TIMEOUT, fail, parse, validateJob } = require('../sandbox/protocol');
const reserved = new Set(['assert', 'Random', 'Mock', 'utils', 'console', 'Promise', 'setTimeout', 'context', 'log', 'storage', 'networkScope']);
// Configuration check only: it does not probe service liveness or reserve a worker.
function getConfiguredSocket() {
  const socketPath = process.env.YAPI_ISOLATED_RUNNER_SOCKET;
  if (!socketPath || !socketPath.startsWith('/')) throw fail('ISOLATED_RUNNER_REQUIRED');
  return socketPath;
}
module.exports = async function sandboxFn(context = {}, script, networkScope) {
  if (!script) return context;
  const socketPath = getConfiguredSocket();
  const data = {};
  Object.keys(context).forEach(key => { if (!reserved.has(key)) data[key] = context[key]; });
  const job = validateJob(parse(JSON.stringify({version: 1, id: randomBytes(16).toString('hex'), script, context: data, ...(networkScope ? {networkScope: require('../sandbox/trusted-scope').read(networkScope)} : {}), storage: context.storage && context.storage._sandboxData || {}})));
  const body = JSON.stringify(job);
  const result = await new Promise((resolve, reject) => {
    const req = http.request({socketPath, path: '/v1/execute', method: 'POST', headers: {'content-type': 'application/json', 'content-length': Buffer.byteLength(body)}}, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > LIMIT) req.destroy(fail('SCRIPT_OUTPUT_LIMIT')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => {
        try {
          const response = parse(Buffer.concat(chunks).toString());
          if (response.id !== job.id || response.version !== 1) throw fail('SCRIPT_RESPONSE_SCOPE_MISMATCH');
          if (res.statusCode !== 200 || response.error) {
            if (Array.isArray(response.logs) && response.logs.length <= 256 && response.logs.every(line => typeof line === 'string') && typeof context.log === 'function') {
              for (const line of response.logs) context.log(line);
            }
            throw fail(response.error || 'ISOLATED_RUNNER_FAILED');
          }
          resolve(response);
        } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => req.destroy(fail('SCRIPT_TIMEOUT')), TIMEOUT + 2000);
    req.once('close', () => clearTimeout(timer));
    req.once('error', reject);
    req.end(body);
  });
  if (!result.context || typeof result.context !== 'object' || Array.isArray(result.context) || !Array.isArray(result.logs) || !Array.isArray(result.writes) || result.writes.length > 256) throw fail('SCRIPT_INVALID_RESPONSE');
  // Validate the entire response before replaying any permitted effect.
  for (const write of result.writes) {
    if (!write || typeof write.key !== 'string' || write.key.length > 1024) throw fail('SCRIPT_INVALID_STORAGE_WRITE');
  }
  for (const line of result.logs) if (typeof line !== 'string') throw fail('SCRIPT_INVALID_LOG');
  const output = {};
  Object.keys(context).forEach(key => { output[key] = context[key]; });
  Object.keys(result.context).forEach(key => { if (!reserved.has(key)) output[key] = result.context[key]; });
  for (const line of result.logs) if (typeof context.log === 'function') context.log(line);
  for (const write of result.writes) if (context.storage && typeof context.storage.setItem === 'function') await context.storage.setItem(write.key, write.value);
  return output;
};

module.exports.getConfiguredSocket = getConfiguredSocket;
