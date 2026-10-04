'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const startServer = require('../server/utils/start-server');

test('listener stays closed until database connects, then waits for listening', async () => {
  let connect; let calls = 0; let completed = false;
  const connection = new Promise(resolve => {connect = resolve;});
  const server = new EventEmitter();
  server.setTimeout = timeout => assert.equal(timeout, 1234);
  const app = {listen(port, host) {calls++; assert.equal(port, 3000); assert.equal(host, '127.0.0.1'); return server;}};
  const pending = startServer({app, connection, port:3000, host:'127.0.0.1', timeout:1234}).then(value => {completed=true; return value;});
  await Promise.resolve(); assert.equal(calls, 0); assert.equal(completed, false);
  connect(); await Promise.resolve(); assert.equal(calls, 1); assert.equal(completed, false);
  server.emit('listening'); assert.equal(await pending, server);
});
test('initial database failure never opens a listener', async () => {
  let calls = 0;
  await assert.rejects(startServer({app:{listen(){calls++;}},connection:Promise.reject(new Error('DB unavailable'))}), /DB unavailable/);
  assert.equal(calls, 0);
});
test('listener failure rejects startup rather than announcing ready', async () => {
  const server = new EventEmitter();
  const pending = startServer({app:{listen(){return server;}},connection:Promise.resolve()});
  await Promise.resolve(); server.emit('error', new Error('address unavailable'));
  await assert.rejects(pending, /address unavailable/);
});
