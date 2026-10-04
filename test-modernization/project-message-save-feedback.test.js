'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function load(file,overrides={}){
 const {code}=require('@babel/core').transformSync(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{babelrc:false,configFile:false,presets:[['@babel/preset-env',{targets:{node:'24'},modules:'commonjs'}],['@babel/preset-react',{runtime:'automatic'}]],plugins:[['@babel/plugin-proposal-decorators',{legacy:true}],['@babel/plugin-transform-class-properties',{loose:true}]]});
 const module={exports:{}};new Function('module','exports','require',code)(module,module.exports,name=>{
  if(overrides[name])return overrides[name];
  if(name==='react-redux')return {connect:()=>C=>C};
  if(name==='react-router')return {withRouter:C=>C};
  if(name==='antd')return {Form:{create:()=>C=>C},Input:{},Select:{},Radio:{},Modal:{},message:{success(){},error(){}}};
  if(name.includes('common'))return {htmlFilter:x=>x};
  if(name.startsWith('.'))return {};
  return require(name);
 });return module.exports;
}
for(const exit of ['unmount','project switch'])test('basic Save group refresh cannot overwrite destination after '+exit,async()=>{
 let release;const held=new Promise(resolve=>release=resolve),group=load('client/reducer/modules/group.js',{axios:{get:()=>held}}),C=load('client/containers/Project/Setting/ProjectMessage/ProjectMessage.js').default;
 let refresh,validation;const oldGroup={_id:81,role:'owner',group_name:'Old group'},destination={currGroup:{_id:82,group_name:'Destination'},role:'guest',field:{name:'New field',enable:true}};
 const c=new C({projectId:11,projectMsg:{_id:11,group_id:81,name:'Old project'},groupList:[oldGroup],form:{validateFields:callback=>{validation=callback(null,{desc:'Synthetic draft'});}},updateProject:async()=>({payload:{data:{errcode:0}}}),fetchGroupMsg:(id,meta)=>{assert.equal(id,81);refresh=group.fetchGroupMsg(id,meta);},getProject:async()=>({payload:{data:{errcode:0,data:{_id:11}}}}),setBreadcrumb(){}});
 c.tag={state:{tag:[]}};c.setState=next=>Object.assign(c.state,next);c.componentDidMount();c.handleOk({preventDefault(){}});await validation;assert.ok(refresh);assert.equal(refresh.meta.isCurrent(),true);
 const current={...refresh,payload:{data:{errcode:0,data:oldGroup}}};assert.equal(group.default(destination,current).currGroup._id,81);
 if(exit==='unmount')c.componentWillUnmount();else{const previous=c.props;c.props={...previous,projectId:12};c.componentDidUpdate(previous);}
 release({data:{errcode:0,data:oldGroup}});const late={...refresh,payload:await refresh.payload};assert.equal(late.meta.isCurrent(),false);assert.strictEqual(group.default(destination,late),destination);
});

for(const current of [true,false])for(const kind of ['success','business','network'])test('basic Save scoped action '+kind+' current='+current,async()=>{
 const {scopedAction}=load('client/containers/Project/Setting/ProjectMessage/ProjectMessage.js');
 const action={type:'SAVE',payload:kind==='network'?Promise.reject(Error('Synthetic network')):Promise.resolve({data:{errcode:kind==='business'?400:0}})};
 const result=await scopedAction(action,{isCurrent:()=>current});
 if(!current)assert.deepEqual(result,{type:'PROJECT_SETTINGS_IGNORED'});else if(kind==='network'){assert.equal(result.error,true);assert.match(result.payload.message,/Synthetic network/);}else{assert.equal(result.type,'SAVE');assert.equal(result.payload.data.errcode,kind==='business'?400:0);}
});
