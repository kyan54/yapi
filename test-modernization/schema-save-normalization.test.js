'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const normalize = require('../client/containers/Project/Interface/InterfaceList/normalizeSchema');

test('interface save serializes both boolean roots without treating false as failure', () => {
  assert.equal(normalize('false'), 'false');
  assert.equal(normalize('true'), 'true');
  assert.ok(normalize('false'));
});

test('interface save preserves typeless references, compositions, empty schemas, null and union types', () => {
  for (const schema of [{}, { $ref: '#/$defs/item', $defs: { item: { type: 'string' } } },
    { anyOf: [{ type: 'string' }, { type: 'integer' }] }, { not: { type: 'null' } },
    { type: 'null' }, { type: ['string', 'null'], 'x-extension': { preserve: true } }]) {
    assert.deepEqual(JSON.parse(normalize(JSON.stringify(schema))), schema);
  }
});

test('interface save retains legacy implicit types and all unrelated schema fields', () => {
  assert.deepEqual(JSON.parse(normalize('{properties:{id:{type:"integer",minimum:1}},required:["id"],extra:{keep:true}}')),
    { type: 'object', properties: { id: { type: 'integer', minimum: 1 } }, required: ['id'], extra: { keep: true } });
  assert.deepEqual(JSON.parse(normalize('{items:{type:"string"},minItems:1}')), { type: 'array', items: { type: 'string' }, minItems: 1 });
  assert.deepEqual(JSON.parse(normalize('{type:"OBJECT",additionalProperties:false}')), { type: 'object', additionalProperties: false });
});

test('interface save rejects malformed JSON, non-schema roots and invalid type declarations', () => {
  for (const value of ['', '{broken', 'null', '[]', '42', '"false"', '{type:42}', '{type:"unknown"}',
    '{type:[]}', '{type:["string",null]}', '{type:["string","unknown"]}', '{type:["string","string"]}']) {
    assert.equal(normalize(value), false, value);
  }
});

test('both request and response save paths use the same schema normalizer', () => {
  const source = fs.readFileSync(path.join(__dirname, '../client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js'), 'utf8');
  assert.match(source, /import checkIsJsonSchema from '\.\/normalizeSchema'/);
  assert.match(source, /values\.req_body_other = checkIsJsonSchema\(values\.req_body_other, \{ preserveFormatting: true \}\)/);
  assert.match(source, /values\.res_body = checkIsJsonSchema\(values\.res_body, \{ preserveFormatting: true \}\)/);
});
