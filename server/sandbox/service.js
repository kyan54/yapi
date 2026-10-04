'use strict';
const http = require('node:http');
const fs = require('node:fs');
const {execute} = require('./orchestrator');
const {validateRules} = require('./http-broker');
const rulesFile = process.env.YAPI_SCRIPT_HTTP_RULES_FILE;
const rules = rulesFile ? validateRules(JSON.parse(fs.readFileSync(rulesFile, 'utf8'))) : [];
const {LIMIT, parse, validateJob} = require('./protocol');
const socket = process.env.YAPI_ISOLATED_RUNNER_SOCKET;
if (!socket || !socket.startsWith('/')) throw new Error('ISOLATED_RUNNER_REQUIRED');
process.umask(0o077);
let running = 0;
let unhealthy = false;
const server = http.createServer(async (req, res) => {
  if (req.url !== '/v1/execute' || req.method !== 'POST') {res.writeHead(404).end(); return;}
  if (unhealthy || running >= 2) {res.writeHead(503).end(); return;}
  running++;
  let job;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > LIMIT) throw new Error('SCRIPT_INPUT_LIMIT');
      chunks.push(chunk);
    }
    job = validateJob(parse(Buffer.concat(chunks).toString()));
    const result = await execute(job, rules);
    res.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify(result));
  } catch (error) {
    if (error.code === 'SCRIPT_CLEANUP_FAILED') {unhealthy = true; console.error('SCRIPT_CLEANUP_FAILED: stopped accepting jobs; operator must verify container cleanup before restart');}
    res.writeHead(400, {'content-type': 'application/json'}).end(JSON.stringify({version: 1, id: job && job.id, error: error.code || 'ISOLATED_RUNNER_FAILED'}));
  } finally {running--;}
});
server.requestTimeout = 15000;
server.headersTimeout = 5000;
server.listen(socket, () => fs.chmodSync(socket, 0o600));
