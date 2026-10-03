'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const React=require('react');
const ok=()=>({payload:{data:{errcode:0,data:{_id:901001}}}});
function load(file,notices){
 const {code}=require('@babel/core').transformSync(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{babelrc:false,configFile:false,presets:[['@babel/preset-env',{targets:{node:'24'},modules:'commonjs'}],['@babel/preset-react',{runtime:'automatic'}]],plugins:[['@babel/plugin-proposal-decorators',{legacy:true}],['@babel/plugin-transform-class-properties',{loose:true}]]});
 const module={exports:{}};
 new Function('module','exports','require',code)(module,module.exports,name=>{
  if(name==='react-redux')return{connect:()=>C=>C};
  if(name==='antd')return{Form:{create:()=>C=>C,Item:()=>null},message:Object.fromEntries(['success','error'].map(kind=>[kind,text=>notices.push({kind,text})]))};
  if(name.includes('reducer/modules/project'))return{};
  if(/AceEditor|\.scss$/.test(name))return{};
  return require(name);
 });
 return module.exports.default;
}
for(const [name,file,method,draft]of [
 ['request','client/containers/Project/Setting/ProjectRequest/ProjectRequest.js','updateProjectScript',{pre_script:'// request draft\nvar a=1;',after_script:'// response draft\nvar b=2;'}],
 ['mock','client/containers/Project/Setting/ProjectMock/index.js','updateProjectMock',{project_mock_script:'// mock draft',is_mock_open:true}]
]){
 for(const [mode,save]of [['business',async()=>({payload:{data:{errcode:40011,errmsg:'synthetic denial'}}})],['network action',async()=>({error:true,payload:new Error('synthetic network failure')})],['rejected',async()=>{throw new Error('synthetic rejection')}],['empty action',async()=>undefined]])test(`project script ${name}: ${mode} preserves draft and retry saves exact source`,async()=>{
  const notices=[],C=load(file,notices),writes=[];let refreshes=0;
  const props={projectId:901001,[method]:async data=>{writes.push(structuredClone(data));return save()},getProject:async()=>{refreshes++;return ok()}};
  const component=new C(props);component.state=structuredClone(draft);component.setState=x=>Object.assign(component.state,x);await component.handleSubmit();
  assert.deepEqual(Object.fromEntries(Object.entries(component.state).filter(([k])=>k!=='saveReceipt')),draft);assert.equal(refreshes,0);assert.equal(notices.filter(x=>x.kind==='success').length,0);assert.equal(notices.filter(x=>x.kind==='error').length,1);
  props[method]=async data=>{writes.push(structuredClone(data));return ok()};await component.handleSubmit();
  assert.deepEqual(writes,[{id:901001,...draft},{id:901001,...draft}]);assert.deepEqual(Object.fromEntries(Object.entries(component.state).filter(([k])=>k!=='saveReceipt')),draft);assert.equal(refreshes,1);assert.equal(notices.filter(x=>x.kind==='success').length,1);
 });
 for(const [mode,refresh]of [['error action',async()=>({error:true,payload:new Error('synthetic refresh error')})],['nonzero errcode',async()=>({payload:{data:{errcode:40011}}})],['empty data',async()=>({payload:{data:{errcode:0}}})],['rejected',async()=>{throw new Error('synthetic refresh rejection')}],['success',async()=>ok()]])test(`project script ${name}: saved response with refresh ${mode} reports the two outcomes accurately`,async()=>{
  const notices=[],C=load(file,notices);let writes=0,refreshes=0;
  const component=new C({projectId:901001,[method]:async()=>{writes++;return ok()},getProject:async()=>{refreshes++;return refresh()}});component.state=structuredClone(draft);component.setState=x=>Object.assign(component.state,x);await component.handleSubmit();
  assert.equal(writes,1);assert.equal(refreshes,1);assert.deepEqual(Object.fromEntries(Object.entries(component.state).filter(([k])=>k!=='saveReceipt')),draft);assert.deepEqual(notices.filter(x=>x.kind==='success').map(x=>x.text),['保存成功']);assert.deepEqual(notices.filter(x=>x.kind==='error').map(x=>x.text),mode==='success'?[]:['保存成功，但刷新项目失败，请刷新页面']);
 });
}

for(const[name,file,method]of [['mock','client/containers/Project/Setting/ProjectMock/index.js','updateProjectMock'],['request','client/containers/Project/Setting/ProjectRequest/ProjectRequest.js','updateProjectScript']])for(const kind of ['business','network','40011','unhandled','success','refresh'])test(`joint middleware ${name} ${kind} emits one error and preserves receipt`,async()=>{const notices=[],C=load(file,notices),middleware=load('client/reducer/middleware/messageMiddleware.js',notices)() (action=>action);const failing=()=>{if(kind==='unhandled')throw Error('unhandled');return middleware(kind==='network'?{error:true,payload:Error('Network Error')}:{payload:{data:{errcode:kind==='40011'?40011:400,errmsg:'Synthetic rejected save',errorMessageHandled:true}}});};const component=new C({projectId:901001,[method]:async()=>['success','refresh'].includes(kind)?middleware(ok()):failing(),getProject:async()=>kind==='refresh'?failing():middleware(ok())});component.state={};component.setState=x=>Object.assign(component.state,x);await component.handleSubmit();assert.equal(notices.filter(x=>x.kind==='error').length,kind==='success'?0:1);assert.equal(notices.filter(x=>x.kind==='success').length,['success','refresh'].includes(kind)?1:0);if(kind==='refresh')assert.match(component.state.saveReceipt,/保存成功，但刷新/);});
