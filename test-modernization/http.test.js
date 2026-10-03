'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const Koa=require('koa');
const {createDocumentationMiddleware}=require('../server/services/documentation/http');
const fixture=require('./fixtures/interface.json');
async function host(overrides={}) {
  const events=[];const app=new Koa();
  app.use(async(ctx,next)=>{if(ctx.method==='POST'){let text='';for await(const chunk of ctx.req)text+=chunk;ctx.request.body=JSON.parse(text || '{}');}await next();});
  app.use(createDocumentationMiddleware({authenticate:async()=>({_id:9}),authorize:async()=>true,
    store:{get:async()=>({...fixture,version:0}),saveProposal:async(...args)=>{events.push(args);return{id:'proposal',changes:args[3]};},accept:async()=>{events.push('accept');return{};},history:async()=>({revisions:[],currentVersion:0}),restore:async()=>({})},
    provider:{propose:async()=>({markdown:'<script>bad()</script>\n\n[link](javascript:alert(1))',unresolved:['Unknown auth']})},
    providerInfo:{configured:true,baseURL:'https://synthetic.invalid/v1',model:'synthetic'},...overrides}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  return{events,url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
const params={projectId:11,interfaceId:17};
async function post(h,action,body,headers={}) {return fetch(h.url+'/api/documentation/'+action,{method:'POST',headers:{'content-type':'application/json','X-YApi-Docs-Intent':'review',...headers},body:JSON.stringify(body)});}
test('real HTTP proposal endpoint escapes provider HTML, requires approval and never autoaccepts',async()=>{
  const h=await host();try{
    let response=await post(h,'proposal',params);assert.equal(response.status,403);assert.equal(h.events.length,0);
    const review=await (await fetch(h.url+'/api/documentation/get?projectId=11&interfaceId=17')).json();
    response=await post(h,'proposal',{...params,approvedForTransmission:true,payloadHash:review.data.payloadHash,requestId:'12345678-1234-1234-1234-123456789abc'});assert.equal(response.status,200);
    const body=await response.json();assert.equal(body.errcode,0);assert.equal(body.data.changes.desc.includes('<script>'),false);
    assert.equal(body.data.changes.desc.includes('href="javascript:'),false);assert.equal(h.events.length,1);assert.notEqual(h.events[0],'accept');
  }finally{await h.close();}
});
test('HTTP auth ACL and CSRF failures prevent store/provider use',async()=>{
  for(const overrides of [{authenticate:async()=>null},{authorize:async()=>false}]){
    const h=await host(overrides);try{const response=await post(h,'proposal',{...params,approvedForTransmission:true});assert.ok([401,403].includes(response.status));assert.equal(h.events.length,0);}finally{await h.close();}
  }
  const h=await host();try{
    assert.equal((await post(h,'accept',{...params,proposalId:'x'},{Origin:'https://evil.invalid'})).status,403);
    assert.equal((await post(h,'accept',{...params,proposalId:'x'},{'X-YApi-Docs-Intent':''})).status,403);
    assert.equal(h.events.length,0);
  }finally{await h.close();}
});
test('GET DTO hides credentials and absent provider reports disabled accurately',async()=>{
  const h=await host({provider:null,providerInfo:{configured:false,baseURL:null,model:null}});try{
    const response=await fetch(h.url+'/api/documentation/get?projectId=11&interfaceId=17');const text=await response.text();
    assert.equal(text.includes('SYNTHETIC_SECRET'),false);assert.equal(JSON.parse(text).data.provider.configured,false);
    assert.equal((await post(h,'proposal',{...params,approvedForTransmission:true})).status,503);
  }finally{await h.close();}
});
test('HTTP generated field descriptions apply only after explicit acceptance to original unredacted schema',async()=>{
 const {createStore}=require('../server/services/documentation/store');const copy=v=>JSON.parse(JSON.stringify(v));
 let raw={_id:17,project_id:11,path:'/test',method:'GET',desc:'old',markdown:'old',req_query:[{name:'page',desc:'wrong',required:'1'}],res_body_is_json_schema:true,res_body:'{"type":"object","properties":{"id":{"type":"string","default":"PRIVATE_LITERAL","enum":["a","b"]}}}'};
 const proposals=new Map(),revisions=new Map();const store=createStore({revisions:{insertOne:async value=>revisions.set(value._id,copy(value)),findOne:async query=>copy(revisions.get(query._id))},interfaces:{findOne:async()=>copy(raw),updateOne:async(query,update)=>{assert.deepEqual(query.$expr.$eq[1].$literal,raw);raw={...raw,...copy(update.$set)};for(const key of Object.keys(update.$unset||{}))delete raw[key];return{matchedCount:1};}},proposals:{insertOne:async value=>proposals.set(value._id,copy(value)),findOne:async query=>copy(proposals.get(query._id))}});
 const descriptionEdits=[{field:'req_query',index:0,desc:'Page number'},{field:'res_body',pointer:'/properties/id/description',description:'<script>Untrusted text</script>'}];
 const h=await host({store,provider:{propose:async({document})=>{assert.equal(JSON.stringify(document).includes('PRIVATE_LITERAL'),false);assert.equal(document.res_body.properties.id.default,undefined);return{markdown:'Improved',unresolved:[],descriptionEdits};}}});
 try {
  const review=await(await fetch(h.url+'/api/documentation/get?projectId=11&interfaceId=17')).json();
  const result=await(await post(h,'proposal',{...params,approvedForTransmission:true,payloadHash:review.data.payloadHash,requestId:'12345678-1234-1234-1234-123456789abc'})).json();
  assert.deepEqual(result.data.changes.descriptionEdits,descriptionEdits);assert.equal(raw.req_query[0].desc,'wrong');
  assert.equal((await post(h,'accept',{...params,proposalId:result.data.id})).status,200);
  assert.equal(raw.req_query[0].desc,'Page number');const schema=JSON.parse(raw.res_body);assert.equal(schema.properties.id.default,'PRIVATE_LITERAL');assert.deepEqual(schema.properties.id.enum,['a','b']);assert.equal(schema.properties.id.description,'<script>Untrusted text</script>');
  assert.equal((await post(h,'restore',{...params,version:0,expectedVersion:raw.docs_revision})).status,200);assert.equal(JSON.parse(raw.res_body).properties.id.description,undefined);
 } finally {await h.close();}
});
test('history HTTP forwards bounded numeric cursor/limit and rejects malformed pagination', async()=>{
 const calls=[];
 const h=await host({store:{history:async(projectId,interfaceId,options)=>{calls.push({projectId,interfaceId,options});return{revisions:[],currentVersion:100,nextCursor:49,hasMore:true};}}});
 try {
  const response=await fetch(h.url+'/api/documentation/history?projectId=11&interfaceId=17&cursor=50&limit=1');
  assert.equal(response.status,200);assert.equal((await response.json()).data.nextCursor,49);
  assert.deepEqual(calls,[{projectId:11,interfaceId:17,options:{cursor:50,limit:1}}]);
  for(const query of ['cursor=-1','cursor=x','cursor=1.5','limit=0','limit=101','limit=1&limit=2']) {
   assert.equal((await fetch(h.url+'/api/documentation/history?projectId=11&interfaceId=17&'+query)).status,400,query);
  }
 } finally {await h.close();}
});

test('restore HTTP strictly requires reviewed current version and forwards it unchanged',async()=>{const calls=[];const h=await host({store:{restore:async(...args)=>{calls.push(args);throw Object.assign(Error('VERSION_CONFLICT'),{code:'VERSION_CONFLICT'});}}});try{for(const expectedVersion of[undefined,null,-1,1.2,'1',true,Number.MAX_SAFE_INTEGER+1]){assert.equal((await post(h,'restore',{...params,version:0,expectedVersion})).status,400);}assert.equal(calls.length,0);assert.equal((await post(h,'restore',{...params,version:0,expectedVersion:3})).status,409);assert.deepEqual(calls,[[11,17,0,9,3]]);}finally{await h.close();}});
