'use strict';
const LIMIT = 1024 * 1024;
const TIMEOUT = 10000;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function fail(code) { const error = new Error(code); error.code = code; return error; }
function parse(text) {
  if (Buffer.byteLength(text) > LIMIT) throw fail('SCRIPT_OUTPUT_LIMIT');
  return JSON.parse(text, (key, value) => {
    if (forbidden.has(key)) throw fail('SCRIPT_INVALID_KEY');
    return value;
  });
}
function validateJob(job) {
  if (!job || job.version !== 1 || !/^[a-f0-9]{32}$/.test(job.id) || typeof job.script !== 'string' || !job.context || typeof job.context !== 'object' || Array.isArray(job.context)) throw fail('SCRIPT_INVALID_JOB');
  if (Buffer.byteLength(JSON.stringify(job)) > LIMIT) throw fail('SCRIPT_INPUT_LIMIT');
  return job;
}
module.exports = { LIMIT, TIMEOUT, forbidden, fail, parse, validateJob };
