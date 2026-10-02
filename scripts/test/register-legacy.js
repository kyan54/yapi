'use strict';
// Preserve the original AVA assertion cases while running them on Node's
// maintained test runner. No source tests are deleted, renamed, or skipped.
const assert=require('node:assert/strict');
const test=require('node:test');
const Module=require('node:module');
const path=require('node:path');
const original=Module._load;
const root=path.resolve(__dirname,'../../test')+path.sep;
function legacy(title,body){return test(title,async()=>body({
  is:(actual,expected,message)=>assert.strictEqual(actual,expected,message),
  deepEqual:(actual,expected,message)=>assert.deepStrictEqual(actual,expected,message),
  true:(value,message)=>assert.strictEqual(value,true,message),
  false:(value,message)=>assert.strictEqual(value,false,message),
  truthy:(value,message)=>assert.ok(value,message)
}));}
legacy.skip=(title,body)=>test.skip(title,body);
Module._load=function(request,parent,...args){
  if(request==='ava'&&parent&&parent.filename.startsWith(root))return legacy;
  return original.call(this,request,parent,...args);
};
(require('@babel/register').default || require('@babel/register'))({extensions:[".js",".jsx"],babelrc:false,configFile:false,cache:false,presets:[['@babel/preset-env',{targets:{node:'current'},modules:'commonjs'}]]});
