'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const reconcile=require('../client/containers/Project/Interface/InterfaceList/reconcilePathParameters');
test('renamed and removed placeholders discard stale names and metadata',()=>{
 const before=[{name:'before',desc:'old description',example:'old example'}];
 assert.deepEqual(reconcile('/records/{after}',before),[{name:'after',desc:'',example:''}]);
 assert.deepEqual(reconcile('/records',before),[]);
 assert.equal(before[0].name,'before');
});
test('unchanged placeholders retain live unsaved metadata in path order',()=>{
 const current=[{name:'first',desc:'fresh draft',example:'42'},{name:'second',desc:'second'}];
 assert.deepEqual(reconcile('/records/:second/{first}',current),[current[1],current[0]]);
 assert.notEqual(reconcile('/records/{first}',current)[0],current[0]);
});
