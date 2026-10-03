'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateIdentity,expected}=require('../test-browser/parity-collections-guard.cjs');
function fixture(version='new'){
 const e=expected(version),challenge='0123456789abcdef0123456789abcdef';
 return{e,challenge,headers:new Headers({'x-parity-collections-proxy':e.proxy,'x-parity-collections-upstream':e.app}),body:{challenge,version,run:'fastb1003',appHostname:'synthetic-app-container',appPort:3000,configuredDbHost:e.mongo,configuredDatabase:e.database,connectedDatabase:e.database,marker:{_id:'yapi-ui-parity-v1',database:e.database,run:'fastb1003',synthetic:true,state:'seeded',fixtureSha256:e.hash}}};
}
test('collections guard accepts both exact disposable identity chains',()=>{
 for(const v of ['old','new']){const f=fixture(v);validateIdentity(v,f.e.origin,f.body,f.headers,'synthetic-app-container',f.challenge);}
});
for(const [name,mutate]of [
 ['arbitrary localhost',f=>f.e.origin='http://127.0.0.1:4175'],
 ['wrong proxy',f=>f.headers.set('x-parity-collections-proxy','shared-proxy')],
 ['wrong upstream',f=>f.headers.set('x-parity-collections-upstream','shared-app')],
 ['replayed challenge',f=>f.body.challenge='stale'],
 ['wrong app',f=>f.body.appHostname='shared-app'],
 ['alternate configured DB',f=>f.body.configuredDatabase='shared'],
 ['actual connection differs',f=>f.body.connectedDatabase='shared'],
 ['foreign Mongo host',f=>f.body.configuredDbHost='shared-mongo'],
 ['marker absent',f=>delete f.body.marker],
 ['marker run differs',f=>f.body.marker.run='another-task'],
 ['marker not synthetic',f=>f.body.marker.synthetic=false],
 ['unseeded DB',f=>f.body.marker.state='claimed'],
 ['fixture differs',f=>f.body.marker.fixtureSha256='unexpected']
])test('collections guard refuses '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>validateIdentity('new',f.e.origin,f.body,f.headers,'synthetic-app-container',f.challenge));});
