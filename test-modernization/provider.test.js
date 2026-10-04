'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createProvider} = require('../server/services/documentation/provider');
function provider(fetchImpl) {return createProvider({baseURL:'https://provider.example.invalid/v1',model:'synthetic-model',apiKey:'SYNTHETIC_KEY',fetchImpl});}
function response(content) {return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}));}
test('provider sends only approved bounded docs to configured compatible endpoint', async()=>{
  let count=0;
  const client=provider(async(url, options)=>{
    count++;
    assert.equal(url,'https://provider.example.invalid/v1/chat/completions');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.authorization,'Bearer SYNTHETIC_KEY');
    const body=JSON.parse(options.body);
    assert.equal(body.model,'synthetic-model');
    assert.equal(body.messages[1].content,'{"title":"synthetic"}');
    return response({markdown:'Improved documentation.',unresolved:['Unspecified errors']});
  });
  await assert.rejects(client.propose({document:{},approvedForTransmission:false}),{code:'TRANSMISSION_NOT_APPROVED'});
  assert.equal(count,0);
  assert.deepEqual(await client.propose({document:{title:'synthetic'},approvedForTransmission:true}),{markdown:'Improved documentation.',unresolved:['Unspecified errors']});
  assert.equal(count,1);
});
test('unapproved and oversized data never contact provider',async()=>{
  const client=provider(()=>assert.fail('network call forbidden'));
  await assert.rejects(client.propose({document:{},approvedForTransmission:'true'}),{code:'TRANSMISSION_NOT_APPROVED'});
  await assert.rejects(client.propose({document:{text:'x'.repeat(150000)},approvedForTransmission:true}),{code:'DOCUMENT_TOO_LARGE'});
});
test('invalid endpoint credentials, insecure transport, query and fragment fail config',()=>{
  for (const baseURL of ['http://provider.invalid/v1','https://u:p@provider.invalid/v1','https://provider.invalid/v1?key=x','https://provider.invalid/v1#key']) {
    assert.throws(()=>createProvider({baseURL,model:'test',apiKey:'test'}),{code:'INVALID_PROVIDER_URL'});
  }
});
test('semantic modification keys and malformed response fail closed',async()=>{
  for (const output of [{markdown:'x',unresolved:[],path:'/changed'},{markdown:1,unresolved:[]},{markdown:'x',unresolved:[{}]}]) {
    await assert.rejects(provider(async()=>response(output)).propose({document:{},approvedForTransmission:true}),{code:'INVALID_PROVIDER_RESPONSE'});
  }
});
test('provider transport errors never reveal key or document body',async()=>{
  const client=provider(async()=>{throw Error('SYNTHETIC_KEY PRIVATE_DOC');});
  await assert.rejects(client.propose({document:{},approvedForTransmission:true}), error=>error.message==='PROVIDER_FAILED');
});
test('non-success and unbounded response bodies rejected',async()=>{
  await assert.rejects(provider(async()=>new Response('secret',{status:401})).propose({document:{},approvedForTransmission:true}),{code:'PROVIDER_FAILED'});
  await assert.rejects(provider(async()=>new Response('x'.repeat(300000))).propose({document:{},approvedForTransmission:true}),{code:'PROVIDER_RESPONSE_TOO_LARGE'});
});
test('provider accepts bounded annotation edits but rejects semantic or oversized edits',async()=>{
 const descriptionEdits=[{field:'req_query',index:0,desc:'Page number'},{field:'res_body',pointer:'/properties/id/description',description:'Identifier'}];
 const output={markdown:'New description',unresolved:[],descriptionEdits};
 assert.deepEqual(await provider(async()=>response(output)).propose({document:{},approvedForTransmission:true}),output);
 for(const edits of [[{field:'res_body',pointer:'/properties/id/type',description:'integer'}],[{field:'req_query',index:0,desc:'x',required:true}],Array(201).fill(descriptionEdits[0]),[{field:'res_body',pointer:'/__proto__/description',description:'x'}]]) {
  await assert.rejects(provider(async()=>response({...output,descriptionEdits:edits})).propose({document:{},approvedForTransmission:true}),{code:'INVALID_PROVIDER_RESPONSE'});
 }
});
