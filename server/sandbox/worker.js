'use strict';
// Run ONLY inside the disposable restricted container. node:vm is compatibility machinery,
// NOT the security boundary. Assume scripts can compromise this entire container.
const vm = require('node:vm');
const crypto = require('node:crypto');
const {LIMIT, parse, validateJob, fail} = require('./protocol');
const excluded = new Set(['assert', 'Random', 'Mock', 'utils', 'console', 'Promise', 'setTimeout', 'clearTimeout', 'context', 'log', 'storage', 'promise']);
// Interactive bounded framing lets the same async script await host responses without replay.
const readline = require('node:readline');
const lines = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
let job, inputSize = 0, nextId = 0;
const pending = new Map();
let start;
const ready = new Promise(resolve => {start = resolve;});
const write = frame => process.stdout.write(JSON.stringify(frame) + '\n');
process.stdin.on('data', chunk => {inputSize += chunk.length; if (inputSize > LIMIT * 4) process.exit(1);});
lines.on('line', line => {
  try {
    const frame = parse(line);
    if (!job) {
      if (frame.type !== 'job') throw fail('SCRIPT_INVALID_JOB');
      job = validateJob(frame.job); start(); return;
    }
    if (frame.type !== 'httpResult' || frame.id !== job.id || frame.version !== 1 || !pending.has(frame.requestId)) throw fail('SCRIPT_INVALID_BROKER_FRAME');
    const waiter = pending.get(frame.requestId); pending.delete(frame.requestId);
    if (frame.error) waiter.reject(fail(frame.error));
    else if (frame.response.status < 200 || frame.response.status >= 300) {
      const error = fail('ERR_BAD_RESPONSE'); error.response = frame.response; waiter.reject(error);
    } else waiter.resolve(frame.response);
  } catch (_) {process.exit(1);}
});
function request(config, optional) {
  config = typeof config === 'string' ? {...optional, url:config} : {...config};
  if (Object.keys(config).some(k => !['url','method','headers','data','params'].includes(k))) return Promise.reject(fail('SCRIPT_NETWORK_UNSUPPORTED_OPTION'));
  if (config.params) {
    const url = new URL(config.url);
    for (const [key,value] of Object.entries(config.params)) url.searchParams.append(key, String(value));
    config.url = url.href; delete config.params;
  }
  config.method = String(config.method || 'GET').toUpperCase();
  if (config.headers) config.headers = Object.fromEntries(Object.entries(config.headers).map(([k,v]) => [k.toLowerCase(),v]));
  if (config.data !== null && typeof config.data === 'object') config.headers = {'content-type':'application/json',...config.headers};
  const requestId = ++nextId;
  if (requestId > 8) return Promise.reject(fail('SCRIPT_NETWORK_REQUEST_LIMIT'));
  return new Promise((resolve,reject) => {
    pending.set(requestId,{resolve,reject});
    write({type:'http',version:1,id:job.id,requestId,request:config});
  });
}
const axios = Object.assign(request, {request});
for (const method of ['get','head','delete','options']) axios[method] = (url, config) => request({...config,url,method});
for (const method of ['post','put','patch']) axios[method] = (url, data, config) => request({...config,url,data,method});
axios.create = () => {throw fail('SCRIPT_NETWORK_UNSUPPORTED_OPTION');};
(async () => {
  await ready;
  let response;
  const logs = [];
  try {
    const writes = []; let logSize = 0;
    const log = (...args) => {
      const line = args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ');
      logSize += Buffer.byteLength(line);
      if (logSize > 65536 || logs.length >= 256) throw fail('SCRIPT_OUTPUT_LIMIT');
      logs.push(line);
    };
    const utils = {
      _: require('underscore'), CryptoJS: require('crypto-js'), jsrsasign: require('jsrsasign'), axios,
      base64: value => Buffer.from(String(value)).toString('base64'),
      unbase64: value => Buffer.from(String(value), 'base64').toString()
    };
    for (const name of ['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512']) utils[name] = value => crypto.createHash(name).update(value).digest('hex');
    const storageData = Object.assign(Object.create(null), job.storage || {});
    const storage = {
      getItem: key => storageData[key],
      setItem: (key, value) => {
        if (typeof key !== 'string' || key.length > 1024 || ['__proto__', 'constructor', 'prototype'].includes(key) || writes.length >= 256) throw fail('SCRIPT_INVALID_STORAGE_WRITE');
        storageData[key] = value; writes.push({key, value});
      }
    };
    const context = Object.assign({}, job.context, {assert: require('node:assert'), Random: require('mockjs').Random, Mock: require('mockjs'), utils, log, console: {log, info: log, warn: log, error: log}, storage, setTimeout, clearTimeout});
    context.context = context;
    const scope = vm.createContext(context);
    // Async wrapper preserves Safeify top-level await/return and normal global mutations.
    const completion = new vm.Script('(async function(){\n' + job.script + '\n}).call(this)').runInContext(scope, {timeout: 3000});
    await completion;
    if (context.promise && typeof context.promise.then === 'function') await context.promise;
    const output = {};
    Object.keys(context).forEach(key => {if (!excluded.has(key) && typeof context[key] !== 'function') output[key] = context[key];});
    response = {version: 1, id: job.id, context: output, logs, writes};
    if (Buffer.byteLength(JSON.stringify(response)) > LIMIT) throw fail('SCRIPT_OUTPUT_LIMIT');
  } catch (error) {
    response = {version: 1, id: job.id, error: String(error && (error.code || error.message) || 'SCRIPT_FAILED').slice(0, 4096), logs};
  }
  process.stdout.write(JSON.stringify({type:'result', version:1, id:job.id, result:response}) + '\n', () => process.exit(0));
})().catch(() => process.exit(1));
