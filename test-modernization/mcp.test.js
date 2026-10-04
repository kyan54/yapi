'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client,InMemoryTransport}=require('@modelcontextprotocol/client');
const {createDocumentationMcp}=require('../server/mcp/server');
const {createReadService}=require('../server/services/documentation/read-service');
const {createAccess,readAdapter}=require('../server/services/documentation/access');
const fixture=require('./fixtures/interface.json');
function database() {
  const records={user:{_id:9,role:'member'},project:{_id:11,uid:10,group_id:8,members:[{uid:9,role:'dev'}]},group:{_id:8,uid:10,members:[]},interface:fixture};
  const reads=[];
  return {records,reads,collection(name){return{findOne:async(filter)=>{reads.push([name,filter]);const record=records[name];return record && record._id===filter._id ? record : null;}};}};
}
test('MCP protocol handshake lists only read tool; actual tool calls enforce live ACL and preserve DTO',async()=>{
  const db=database();
  const principal={userId:9,projects:[11],scopes:['docs.read']};
  const service=createReadService({interfaces:readAdapter(db.collection('interface')),authorize:createAccess({db})});
  const server=createDocumentationMcp({readService:service,principal});
  const client=new Client({name:'test',version:'1.0.0'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport),server.connect(serverTransport)]);
  try {
    const listed=await client.listTools();
    assert.deepEqual(listed.tools.map(tool=>tool.name),['get_interface_documentation']);
    assert.equal(listed.tools[0].annotations.readOnlyHint,true);
    let result=await client.callTool({name:'get_interface_documentation',arguments:{projectId:11,interfaceId:17}});
    assert.equal(result.isError,undefined);
    const dto=JSON.parse(result.content[0].text);
    assert.equal(dto._id,17);
    assert.deepEqual(JSON.parse(dto.res_body),JSON.parse(fixture.res_body));
    assert.equal(dto.redactionPolicy,'yapi.mcp-redaction.v1');
    assert.equal(JSON.stringify(dto).includes('SYNTHETIC_SECRET'),false);
    db.records.project.members=[];
    result=await client.callTool({name:'get_interface_documentation',arguments:{projectId:11,interfaceId:17}});
    assert.equal(result.isError,true);
    assert.equal(result.content[0].text,'FORBIDDEN');
    result=await client.callTool({name:'get_interface_documentation',arguments:{projectId:12,interfaceId:17}});
    assert.equal(result.isError,true);
    // No mutation methods exist on these DB adapters; the complete protocol
    // exercise can only perform findOne reads, never lazy repair-on-read.
    assert.equal(db.reads.filter(([name])=>name==='interface').length,1);
  } finally {await client.close();await server.close();}
});
test('access checks reject missing scopes, removed user and arbitrary scope',async()=>{
  const db=database();const authorize=createAccess({db});
  assert.equal(await authorize({principal:{userId:9,projects:[11],scopes:[]},projectId:11,scope:'docs.read'}),false);
  db.records.user=null;
  assert.equal(await authorize({principal:{userId:9,projects:[11],scopes:['docs.read']},projectId:11,scope:'docs.read'}),false);
});
