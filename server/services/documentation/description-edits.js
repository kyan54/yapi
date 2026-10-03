'use strict';
const {activeSchema}=require('./schema-mode');
// Only annotation locations discovered in the ORIGINAL trusted document may be
// changed. Provider schema views are redacted and must never be persisted.
const PARAM_FIELDS = ['req_query','req_headers','req_params','req_body_form'];
const SCHEMA_FIELDS = ['req_body_other','res_body'];
const FIELDS = [...PARAM_FIELDS,...SCHEMA_FIELDS];
const own = (v,k) => Object.prototype.hasOwnProperty.call(v,k);
const forbidden = new Set(['__proto__','prototype','constructor']);
const fail = (code='INVALID_INPUT') => {const e=new Error(code);e.code=code;throw e;};
const escape = s => s.replace(/~/g,'~0').replace(/\//g,'~1');
const object = v => v && typeof v==='object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
function safe(value, depth=0) {
  if(depth>60) fail();
  if(value && typeof value==='object') for(const key of Object.keys(value)) {
    if(forbidden.has(key)) fail();
    safe(value[key],depth+1);
  }
}
function validateEdits(edits,{snapshot=false}={}) {
  if(!Array.isArray(edits) || edits.length>(snapshot?2000:200) || Buffer.byteLength(JSON.stringify(edits))>256*1024) fail();
  const seen=new Set();
  for(const edit of edits) {
    if(!object(edit)) fail();
    const parameter=PARAM_FIELDS.includes(edit.field);
    const keys=parameter?['field','index','desc']:['field','pointer','description'];
    if(snapshot && parameter)keys.push('name');
    if(Object.keys(edit).sort().join(',')!==keys.sort().join(',')) fail();
    if(!parameter && !SCHEMA_FIELDS.includes(edit.field)) fail();
    const value=parameter?edit.desc:edit.description;
    if(!(snapshot && value===null) && (typeof value!=='string' || value.length>8000)) fail();
    if(parameter) {
      if(!Number.isSafeInteger(edit.index)||edit.index<0||edit.index>10000)fail();
      if(snapshot && typeof edit.name!=='string')fail();
    } else {
      if(typeof edit.pointer!=='string'||edit.pointer.length>4096||!edit.pointer.startsWith('/')||!edit.pointer.endsWith('/description'))fail();
      for(const part of edit.pointer.slice(1).split('/')) {
        if(/~(?![01])/g.test(part)||forbidden.has(part.replace(/~1/g,'/').replace(/~0/g,'~')))fail();
      }
    }
    const identity=edit.field+':'+(parameter?edit.index:edit.pointer);
    if(seen.has(identity))fail();seen.add(identity);
  }
  return edits;
}
// JSON.parse/stringify can silently round large/precise schema numeric bounds.
// Refuse such input rather than changing validation semantics while annotating.
function assertExactNumbers(raw) {
  function normalized(token) {
    const match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
    if(!match || token.length>128)fail();
    let digits=(match[2]+(match[3]||'')).replace(/^0+/,'');
    if(!digits)return '0';
    let exponent=BigInt(match[4]||'0')-BigInt((match[3]||'').length);
    while(digits.endsWith('0')){digits=digits.slice(0,-1);exponent++;}
    return match[1]+digits+'e'+exponent;
  }
  const tokens=raw.match(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)||[];
  for(const token of tokens)if(token[0]!=='"') {
    const number=Number(token);
    if(!Number.isFinite(number)||normalized(token)!==normalized(JSON.stringify(number)))fail();
  }
}
function inventory(document) {
  const locations=new Map(),schemas={};let count=0;
  function add(field,path,node,key,name) {
    if(++count>2000)fail();
    const value=own(node,key)?node[key]:null;
    if(value!==null && typeof value!=='string')fail();
    locations.set(field+':'+path,{field,path,node,key,value,name});
  }
  for(const field of PARAM_FIELDS) {
    if(document[field]===undefined)continue;
    if(!Array.isArray(document[field]))fail();
    document[field].forEach((node,index)=>{if(!object(node)||typeof node.name!=='string')fail();add(field,index,node,'desc',node.name);});
  }
  function walk(field,node,path,depth) {
    if(depth>40)fail();
    if(typeof node==='boolean')return;
    if(!object(node))return;
    // Never follow any reference. Remote-ref nodes cannot be edited at all.
    if(typeof node.$ref==='string' && !node.$ref.startsWith('#'))return;
    add(field,path+'/description',node,'description');
    for(const key of ['properties','patternProperties','$defs','definitions','dependentSchemas']) {
      if(object(node[key]))for(const name of Object.keys(node[key]))walk(field,node[key][name],path+'/'+key+'/'+escape(name),depth+1);
    }
    for(const key of ['items','additionalItems','additionalProperties','unevaluatedProperties','unevaluatedItems','contains','not','if','then','else','propertyNames']) {
      if(own(node,key)) {
        if(Array.isArray(node[key]))node[key].forEach((item,index)=>walk(field,item,path+'/'+key+'/'+index,depth+1));
        else walk(field,node[key],path+'/'+key,depth+1);
      }
    }
    for(const key of ['allOf','anyOf','oneOf','prefixItems'])if(Array.isArray(node[key]))node[key].forEach((item,index)=>walk(field,item,path+'/'+key+'/'+index,depth+1));
    // draft-04 schema dependencies (array dependencies are semantic, not schemas).
    if(object(node.dependencies))for(const name of Object.keys(node.dependencies))if(object(node.dependencies[name]))walk(field,node.dependencies[name],path+'/dependencies/'+escape(name),depth+1);
  }
  for(const field of SCHEMA_FIELDS) {
    if(!activeSchema(document,field))continue;
    // Newly created legacy interfaces enable Schema mode before any body exists.
    // An absent/empty body has no annotations; keep its stored bytes unchanged.
    if(document[field]===undefined || document[field]==='')continue;
    if(typeof document[field]!=='string'||Buffer.byteLength(document[field])>1024*1024)fail();
    assertExactNumbers(document[field]);
    try{schemas[field]=JSON.parse(document[field]);}catch{fail();}
    safe(schemas[field]);walk(field,schemas[field],'',0);
  }
  return {locations,schemas};
}
function snapshot(document) {
  const {locations}=inventory(document);
  return validateEdits([...locations.values()].map(v=>PARAM_FIELDS.includes(v.field)?{field:v.field,index:v.path,name:v.name,desc:v.value}:{field:v.field,pointer:v.path,description:v.value}),{snapshot:true});
}
function applyEdits(document,edits,{snapshot:restoring=false}={}) {
  validateEdits(edits,{snapshot:restoring});
  const result=clone(document),{locations,schemas}=inventory(result),changed=new Set();
  for(const edit of edits) {
    const parameter=PARAM_FIELDS.includes(edit.field);
    const location=locations.get(edit.field+':'+(parameter?edit.index:edit.pointer));
    if(!location || (restoring && parameter && location.name!==edit.name))fail(restoring?'DESCRIPTION_CONFLICT':'INVALID_INPUT');
    const value=parameter?edit.desc:edit.description;
    if(value===location.value)continue;
    if(value===null)delete location.node[location.key];else location.node[location.key]=value;
    changed.add(edit.field);
  }
  for(const field of SCHEMA_FIELDS)if(changed.has(field))result[field]=JSON.stringify(schemas[field]);
  return result;
}
module.exports={FIELDS,PARAM_FIELDS,SCHEMA_FIELDS,validateEdits,snapshot,applyEdits};
