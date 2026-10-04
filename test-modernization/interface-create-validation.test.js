'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
function load(name){
 const file=path.resolve(__dirname,'../client/containers/Project/Interface/InterfaceList',name+'.js');const {code}=require('@babel/core').transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[['@babel/preset-env',{targets:{node:'current'},modules:'commonjs'}],['@babel/preset-react',{runtime:'classic'}]]});
 class Component{constructor(props){this.props=props;}setState(value){this.state={...this.state,...value};}}
 const m=new Module(file,module);m.filename=file;m.require=id=>id==='react'?{PureComponent:Component}:id==='prop-types'?require('prop-types'):id==='antd'?{Form:{Item(){},create:()=>C=>C},Select:{Option(){}},message:{error(){}}}:id.endsWith('variable.js')?{HTTP_METHOD:{GET:{}}}:{};m._compile(code,file);return m.exports.default;
}
for(const name of ['AddInterfaceForm','AddInterfaceCatForm']){
 const Form=load(name),event={preventDefault(){}};
 function setup({sync=false}={}){const state={current:true,pending:[],submits:[],validations:0};let finishValidation,finishSave;const form=new Form({form:{validateFields(callback){state.validations++;finishValidation=callback;if(sync)callback(null,{title:'synthetic'});},resetFields(){}},captureSubmission:()=>{const context=state;return()=>context.current;},onPendingChange:value=>state.pending.push(value),onSubmit:values=>{state.submits.push(values);return new Promise(resolve=>finishSave=resolve);}});return {form,state,validate:(err,values={title:'synthetic'})=>finishValidation(err,values),save:()=>finishSave()};}
 test(name+' reserves pending ownership before validation and suppresses rapid repeat',async()=>{const h=setup();const first=h.form.handleSubmit(event);await h.form.handleSubmit(event);assert.deepEqual(h.state.pending,[true]);assert.equal(h.form.state.submitting,true);assert.equal(h.state.validations,1);h.validate(null);await Promise.resolve();assert.equal(h.state.submits.length,1);h.save();await first;assert.deepEqual(h.state.pending,[true,false]);});
 test(name+' late validation after unmount never submits or clears a new form pending state',async()=>{const h=setup();const pending=h.form.handleSubmit(event);h.form.componentWillUnmount();h.validate(null);await pending;assert.equal(h.state.submits.length,0);assert.deepEqual(h.state.pending,[true]);});
 test(name+' changed project or modal generation rejects old validation callback',async()=>{const h=setup();const pending=h.form.handleSubmit(event);h.state.current=false;h.validate(null);await pending;assert.equal(h.state.submits.length,0);assert.deepEqual(h.state.pending,[true]);});
 test(name+' validation error releases pending and retry succeeds',async()=>{const h=setup();const first=h.form.handleSubmit(event);h.validate({title:'required'});await first;assert.equal(h.state.submits.length,0);assert.equal(h.form.state.submitting,false);const retry=h.form.handleSubmit(event);h.validate(null);await Promise.resolve();h.save();await retry;assert.equal(h.state.submits.length,1);assert.deepEqual(h.state.pending,[true,false,true,false]);});
 test(name+' synchronous local validation still submits and waits for server promise',async()=>{const h=setup({sync:true});const pending=h.form.handleSubmit(event);await Promise.resolve();assert.equal(h.state.submits.length,1);assert.equal(h.form.state.submitting,true);h.save();await pending;assert.equal(h.form.state.submitting,false);});
 test(name+' synchronous validation exception releases guard without posting',async()=>{const h=setup();h.form.props.form.validateFields=()=>{throw Error('synthetic validation failure');};await h.form.handleSubmit(event);assert.equal(h.state.submits.length,0);assert.equal(h.form.state.submitting,false);assert.deepEqual(h.state.pending,[true,false]);});
}
