'use strict';
function fail(code){throw Object.assign(Error(code),{code});}
// Process-local bounds complement gateway quotas. Multi-replica deployment needs
// a shared limiter before enabling the provider; idempotency is not a billing guarantee.
function createGenerationGate({clock=Date.now,maxPerMinute=3,maxEntries=1000}={}) {
  const users=new Map(),active=new Set(),requests=new Map();
  return async function run({userId,projectId,interfaceId,requestId,hash},operation) {
    if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/.test(requestId))fail('INVALID_REQUEST_ID');
    const now=clock();
    for(const [id,times] of users)if(!times.some(at=>at>now-60000))users.delete(id);
    for(const [key,entry] of requests)if(entry.expires<=now&&!entry.active)requests.delete(key);
    const key=userId+':'+requestId;
    const prior=requests.get(key);
    const fingerprint=projectId+':'+interfaceId+':'+hash;
    if(prior){if(prior.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT');return prior.promise;}
    const target=projectId+':'+interfaceId;
    if(active.has(target))fail('GENERATION_IN_PROGRESS');
    if(requests.size>=maxEntries)fail('RATE_LIMITED');
    const recent=(users.get(userId)||[]).filter(at=>at>now-60000);
    if(recent.length>=maxPerMinute)fail('RATE_LIMITED');
    recent.push(now);users.set(userId,recent);
    active.add(target);
    const entry={fingerprint,expires:now+300000,active:true};
    // Defer operation so entry exists before any synchronous rejection/re-entry.
    entry.promise=Promise.resolve().then(operation).finally(()=>{entry.active=false;active.delete(target);});
    requests.set(key,entry);
    return entry.promise;
  };
}
module.exports={createGenerationGate};
