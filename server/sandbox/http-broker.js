'use strict';
// Trusted service only. Worker input is hostile, including purported scope and DNS hints.
const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const {fail} = require('./protocol');
const MAX_BODY = 65536, MAX_RESPONSE = 262144, MAX_CALLS = 8, DEADLINE = 2500;
const plain = x => x && typeof x === 'object' && !Array.isArray(x);
const denied = () => {throw fail('SCRIPT_NETWORK_DENIED');};
const dangerousHeaders = /^(host|connection|content-length|transfer-encoding|upgrade|proxy-.*|te|trailer|expect)$/i;
function addressClass(address) {
  if (net.isIP(address) === 4) {
    if (address === '168.63.129.16') return 'forbidden';
    const [a,b,c] = address.split('.').map(Number);
    if (a === 0 || a === 169 && b === 254 || a >= 224 || a === 100 && b >= 64 && b <= 127) return 'forbidden';
    if (a === 10 || a === 127 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168) return 'private';
    if (a === 192 && (b === 0 || b === 2) || a === 198 && (b === 18 || b === 19 || b === 51) || a === 203 && b === 0 && c === 113) return 'forbidden';
    return 'public';
  }
  if (net.isIP(address) === 6) {
    const normalized = new URL('http://[' + address + ']').hostname.slice(1,-1).toLowerCase();
    if (normalized === '::1' || /^f[cd]/.test(normalized)) return normalized === 'fd00:ec2::254' ? 'forbidden' : 'private';
    // Restrict IPv6 to ordinary global unicast. Reject mapped IPv4, transition/tunnel and reserved ranges.
    if (!/^[23][0-9a-f]{3}:/.test(normalized) || /^(2002:|3fff:)/.test(normalized)) return 'forbidden';
    if (normalized.startsWith('2001:')) {
      const second = parseInt(normalized.split(':')[1] || '0',16);
      if (second < 0x200 || second === 0xdb8) return 'forbidden';
    }
    return 'public';
  }
  return 'forbidden';
}
function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length > 100) throw fail('SCRIPT_NETWORK_CONFIG');
  const ids = new Set();
  for (const rule of rules) {
    if (!plain(rule) || typeof rule.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(rule.id) || ids.has(rule.id)) throw fail('SCRIPT_NETWORK_CONFIG');
    ids.add(rule.id);
    for (const field of ['projectIds','userIds','paths','methods','headers','contextHeaders','privateAddresses']) {
      if (!Array.isArray(rule[field]) || !rule[field].every(x => typeof x === 'string') || rule[field].includes('*')) throw fail('SCRIPT_NETWORK_CONFIG');
    }
    const url = new URL(rule.origin);
    if (!['http:','https:'].includes(url.protocol) || url.origin !== rule.origin || url.username || url.password) throw fail('SCRIPT_NETWORK_CONFIG');
    if (!rule.projectIds.length || !rule.userIds.length || !rule.paths.length || !rule.methods.length || rule.paths.some(x => !x.startsWith('/') || x.includes('?') || x.includes('#')) || rule.methods.some(x => !['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(x))) throw fail('SCRIPT_NETWORK_CONFIG');
    if ([...rule.headers,...rule.contextHeaders].some(x => !/^[a-z0-9-]+$/.test(x) || dangerousHeaders.test(x)) || rule.privateAddresses.some(x => addressClass(x) !== 'private')) throw fail('SCRIPT_NETWORK_CONFIG');
  }
  return rules;
}
function transport(url, options, body, signal) {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, {...options, signal, agent: false, maxHeaderSize: 16384}, res => {
      const chunks = []; let size = 0;
      if (res.statusCode >= 300 && res.statusCode < 400) {reject(fail('SCRIPT_NETWORK_REDIRECT')); res.destroy(); req.destroy(); return;}
      res.on('data', chunk => {size += chunk.length; if (size > MAX_RESPONSE) {reject(fail('SCRIPT_NETWORK_RESPONSE_LIMIT')); req.destroy();} else chunks.push(chunk);});
      res.on('error', reject);
      res.on('end', () => {
        let data = Buffer.concat(chunks).toString('utf8');
        try {data = JSON.parse(data);} catch (_) { /* Axios-compatible text fallback. */ }
        resolve({status: res.statusCode, statusText: res.statusMessage, headers: res.headers, data});
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}
function createBroker(job, rules = [], dependencies = {}) {
  rules = validateRules(JSON.parse(JSON.stringify(rules)));
  const scope = JSON.parse(JSON.stringify(job.networkScope || null));
  const lookup = dependencies.lookup || (host => dns.lookup(host, {all: true, verbatim: true}));
  const send = dependencies.transport || transport;
  let calls = 0; const controllers = new Set(); let closed = false;
  async function request(input) {
    if (closed) denied();
    if (++calls > MAX_CALLS) throw fail('SCRIPT_NETWORK_REQUEST_LIMIT');
    if (!scope || !rules.length) throw fail('SCRIPT_NETWORK_DISABLED');
    if (!plain(input) || Object.keys(input).some(x => !['url','method','headers','data'].includes(x)) || typeof input.url !== 'string' || input.url.length > 4096) denied();
    let url;
    try {url = new URL(input.url);} catch (_) {denied();}
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash) denied();
    const method = input.method || 'GET';
    const rule = rules.find(r => r.projectIds.includes(scope.projectId) && r.userIds.includes(scope.userId) && r.origin === url.origin && r.paths.includes(url.pathname) && r.methods.includes(method));
    if (!rule) denied();
    const headers = Object.create(null);
    if (input.headers !== undefined && !plain(input.headers)) denied();
    for (const [name,value] of Object.entries(input.headers || {})) {
      if (name !== name.toLowerCase() || !rule.headers.includes(name) || dangerousHeaders.test(name) || typeof value !== 'string' || /[\r\n]/.test(value)) denied();
      headers[name] = value;
    }
    // Context headers are explicit per-rule grants from the original authenticated job only.
    const contextHeaders = scope.headers && scope.headers[rule.id] || {};
    if (!plain(contextHeaders)) denied();
    for (const [name,value] of Object.entries(contextHeaders)) {
      if (!rule.contextHeaders.includes(name) || typeof value !== 'string' || /[\r\n]/.test(value)) denied();
      headers[name] = value;
    }
    if (Buffer.byteLength(JSON.stringify(headers)) > 8192) denied();
    let body;
    if (input.data !== undefined) body = typeof input.data === 'string' ? input.data : JSON.stringify(input.data);
    if (body !== undefined && (typeof body !== 'string' || Buffer.byteLength(body) > MAX_BODY || ['GET','HEAD'].includes(method))) denied();
    const controller = new AbortController(); controllers.add(controller);
    let timer;
    try {
      return await Promise.race([
        new Promise((_, reject) => {timer = setTimeout(() => {controller.abort(); reject(fail('SCRIPT_NETWORK_TIMEOUT'));}, DEADLINE);}),
        (async () => {
          const hostname = url.hostname.replace(/^\[|\]$/g,'');
          const addresses = net.isIP(hostname) ? [{address: hostname, family: net.isIP(hostname)}] : await lookup(hostname);
          if (closed || controller.signal.aborted || !Array.isArray(addresses) || !addresses.length || addresses.length > 32) denied();
          for (const item of addresses) {
            const kind = addressClass(item.address);
            if (kind === 'forbidden' || kind === 'private' && !rule.privateAddresses.includes(item.address) || net.isIP(item.address) !== item.family) denied();
          }
          const chosen = addresses[0];
          // Pin validated DNS result into the connection; preserve URL host for TLS verification.
          return send(url, {method, headers, lookup: (_host, options, cb) => options.all ? cb(null, [chosen]) : cb(null, chosen.address, chosen.family)}, body, controller.signal);
        })()
      ]);
    } catch (error) {throw fail(error.code && /^SCRIPT_NETWORK_/.test(error.code) ? error.code : 'SCRIPT_NETWORK_FAILED');}
    finally {clearTimeout(timer); controllers.delete(controller);}
  }
  return {request, close() {closed = true; for (const c of controllers) c.abort();}};
}
module.exports = {createBroker, validateRules, addressClass, transport, MAX_CALLS};
