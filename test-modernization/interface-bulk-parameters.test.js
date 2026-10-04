'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const parse = require('../client/containers/Project/Interface/InterfaceList/parseBulkParameters');
test('bulk parameters reject malformed lines atomically with original line numbers', () => {
  const current = [{name:'original',required:'0',desc:'Keep metadata'}];
  for (const text of ['valid:one\nmissing', 'valid:one\n:value', 'valid:one\n  :value']) {
    assert.deepEqual(parse(text,current,{}),{invalidLine:2});
    assert.deepEqual(current,[{name:'original',required:'0',desc:'Keep metadata'}]);
  }
});
test('bulk parsing preserves colon values, metadata and blank-line row alignment', () => {
  const current=[{name:'before',required:'0',desc:'first'},{name:'second',required:'1',desc:'second'}];
  const parsed=parse('\nurl:https://example.invalid/a:b\n\nlabel:中文\n',current,{});
  assert.deepEqual(parsed.values,[{name:'url',required:'0',desc:'first',example:'https://example.invalid/a:b'},{name:'label',required:'1',desc:'second',example:'中文'}]);
  assert.equal(current[0].name,'before');
});
test('empty import produces an array and extra rows use the requested parameter template', () => {
  assert.deepEqual(parse('\n  \n',[],{}),{values:[]});
  assert.deepEqual(parse('upload:',[],{type:'text',required:'1'}),{values:[{type:'text',required:'1',name:'upload',example:''}]});
});
