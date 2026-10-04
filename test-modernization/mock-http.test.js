'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Koa=require('koa');
const yapi=require('../server/yapi');
const Project=require('../server/models/project');
const Interface=require('../server/models/interface');
const middleware=require('../server/middleware/mockServer');
const {generate}=require('../server/utils/schema-faker.mjs');
const original={getInst:yapi.getInst,commons:yapi.commons,emitHook:yapi.emitHook};
test.after(()=>Object.assign(yapi,original));
async function host(){
  const record={_id:17,project_id:11,path:'/orders/{id}',method:'GET',res_body_type:'json',res_body_is_json_schema:true,res_body:JSON.stringify({type:'object',properties:{id:{type:'integer',enum:[42]}}})};
  yapi.getInst=klass=>{
    if(klass===Project)return{get:async()=>({_id:11,basepath:'',is_mock_open:false})};
    if(klass===Interface)return{getByPath:async()=>[],getByQueryPath:async()=>[],getVar:async()=>[record],get:async()=>record};
    throw Error('Unexpected model');
  };
  yapi.commons={json_parse:JSON.parse,schemaToJson:generate,log:()=>{},resReturn:(data,errcode,errmsg)=>({data,errcode,errmsg})};
  yapi.emitHook=async()=>{};
  const app=new Koa();app.use(middleware);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  return{url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('real Mock HTTP works without Origin and retains dynamic params and schema generation',async()=>{
  const h=await host();try{const response=await fetch(h.url+'/mock/11/orders/123');assert.equal(response.status,200);assert.deepEqual(await response.json(),{id:42});assert.equal(response.headers.get('access-control-allow-origin'),null);}finally{await h.close();}
});
test('Mock CORS reflects present origin with Vary and preflight omits absent requested headers',async()=>{
  const h=await host();try{
    let response=await fetch(h.url+'/mock/11/orders/123',{headers:{Origin:'https://client.example.invalid'}});assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'https://client.example.invalid');assert.equal(response.headers.get('vary'),'Origin');
    response=await fetch(h.url+'/mock/11/not-defined',{method:'OPTIONS',headers:{Origin:'https://client.example.invalid','Access-Control-Request-Method':'GET'}});assert.equal(response.status,200);assert.equal(await response.text(),'ok');assert.equal(response.headers.get('access-control-allow-headers'),null);
  }finally{await h.close();}
});
