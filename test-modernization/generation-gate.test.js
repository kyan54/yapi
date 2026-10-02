'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createGenerationGate}=require('../server/services/documentation/generation-gate');
const request={userId:9,projectId:11,interfaceId:17,requestId:'12345678-1234-1234-1234-123456789abc',hash:'hash'};
test('repeat requests share one provider operation and conflicting idempotency fails',async()=>{
  const run=createGenerationGate();let calls=0;let release;
  const operation=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
  const one=run(request,operation),two=run(request,operation);await Promise.resolve();
  assert.equal(calls,1);
  await assert.rejects(run({...request,hash:'other'},operation),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(run({...request,requestId:'22345678-1234-1234-1234-123456789abc'},operation),{code:'GENERATION_IN_PROGRESS'});
  release('result');assert.deepEqual(await Promise.all([one,two]),['result','result']);assert.equal(await run(request,operation),'result');assert.equal(calls,1);
});
test('per-user rate and cache capacity bounded, arbitrary request ids rejected',async()=>{
  const run=createGenerationGate({maxPerMinute:1});
  await run(request,async()=>1);
  await assert.rejects(run({...request,requestId:'22345678-1234-1234-1234-123456789abc'},async()=>2),{code:'RATE_LIMITED'});
  await assert.rejects(run({...request,requestId:{}},async()=>2),{code:'INVALID_REQUEST_ID'});
});
