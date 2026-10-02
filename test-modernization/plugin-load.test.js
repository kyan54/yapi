'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
test('every bundled server plugin controller loads with supported dependencies before database startup',()=>{
  const root=path.resolve(__dirname,'..');
  const files=[];
  function collect(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,item.name);if(item.isDirectory())collect(name);else if(/controller\.js$/i.test(item.name))files.push(name);}}
  collect(path.join(root,'exts'));
  assert.ok(files.length>0);
  const script=`process.env.NODE_PATH=${JSON.stringify(path.join(root,'server'))};require('module').Module._initPaths();require(${JSON.stringify(path.join(root,'util-polyfill'))});const yapi=require('yapi.js');yapi.emitHook=()=>{};for(const file of ${JSON.stringify(files)})require(file);`;
  execFileSync(process.execPath,['-e',script],{cwd:root,timeout:15000,stdio:'pipe'});
  assert.ok(require.resolve('jsondiffpatch/formatters/styles/html.css'));
  assert.ok(require.resolve('jsondiffpatch/formatters/styles/annotated.css'));
});
