'use strict';
const {activeSchema}=require('./schema-mode');
const {isDeepStrictEqual}=require('node:util');
const IGNORED=new Set(['up_time','edit_uid','docs_history','docs_revision','docs_revision_head','__v']);
// Compare parsed schema objects only if parsing cannot round a numeric token.
function exactNumbers(text) {
  const normalize=token=>{
    const match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
    if(!match||token.length>128)throw Error('unsafe numeric token');
    let digits=(match[2]+(match[3]||'')).replace(/^0+/,'');
    if(!digits)return '0';
    let exponent=BigInt(match[4]||'0')-BigInt((match[3]||'').length);
    while(digits.endsWith('0')){digits=digits.slice(0,-1);exponent++;}
    return match[1]+digits+'e'+exponent;
  };
  for(const token of text.match(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)||[]) {
    if(token[0]!== '"'&&(!Number.isFinite(Number(token))||normalize(token)!==normalize(JSON.stringify(Number(token)))))throw Error('inexact numeric token');
  }
}
function comparable(field,value,document) {
  if((['res_body','req_body_other'].includes(field)&&activeSchema(document,field))&&typeof value==='string') {
    try{exactNumbers(value);return JSON.parse(value);}catch{return value;}
  }
  return value;
}
function meaningfulChange(raw,patch) {
  const next={...raw,...patch};
  return Object.keys(patch).some(field=>!IGNORED.has(field)&&!isDeepStrictEqual(comparable(field,raw[field],raw),comparable(field,patch[field],next)));
}
module.exports={meaningfulChange};
