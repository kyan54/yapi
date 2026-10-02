'use strict';
const {redactText}=require('./outbound');
const SENSITIVE=/password|passwd|secret|token|authorization|cookie|session|api[-_]?key|private[-_]?key|credential/i;
function redactProse(value) {
  return redactText(value)
    .replace(/\b(password|secret|token|api[_-]?key)\s+(?:is|为|是)\s+[^\s<>;,]+/gi,'$1 is [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED_TOKEN]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{15,}|AKIA[A-Z0-9]{16})\b/g,'[REDACTED_KEY]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[REDACTED_PRIVATE_KEY]');
}
function redactMcpDocumentation(dto) {
  const redactions=[];
  const note=(path,reason)=>redactions.push({path,reason});
  function prose(value,path){const next=redactProse(value);if(next!==value)note(path,'Recognized credential or personal-data pattern');return next;}
  function literal(value,path,sensitive){
    if(sensitive){note(path,'Literal data on a potentially secret-bearing field');return undefined;}
    function unsafeNested(item) {
      if (Array.isArray(item)) return item.some(unsafeNested);
      if (item && typeof item === 'object') return Object.entries(item).some(([key,child]) => SENSITIVE.test(key) || unsafeNested(child));
      return typeof item === 'string' && redactProse(item) !== item;
    }
    if (unsafeNested(value)) { note(path,'Nested literal data contains sensitive keys or recognized sensitive values'); return undefined; }
    const text=JSON.stringify(value);
    if(redactProse(text)!==text){note(path,'Literal data contains a recognized credential or personal-data pattern');return undefined;}
    return value;
  }
  function schema(value,path,sensitive=false,depth=0){
    if(depth>30){note(path,'Nesting limit');return {};}
    if(typeof value==='boolean')return value;
    if(!value||typeof value!=='object'||Array.isArray(value)){note(path,'Invalid schema node');return {};}
    const output={};
    for(const [key,item]of Object.entries(value)){
      const pointer=path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1');
      if(['properties','patternProperties','$defs','definitions','dependentSchemas'].includes(key)&&item&&typeof item==='object'&&!Array.isArray(item)){
        output[key]={};for(const [name,child]of Object.entries(item)){
          if(['__proto__','constructor','prototype'].includes(name)){note(pointer+'/'+name,'Unsafe property name');continue;}
          output[key][name]=schema(child,pointer+'/'+name,sensitive||SENSITIVE.test(name),depth+1);
        }
      }else if(['items','additionalProperties','contains','not','if','then','else'].includes(key)){
        output[key]=Array.isArray(item)?item.map((child,index)=>schema(child,pointer+'/'+index,sensitive,depth+1)):schema(item,pointer,sensitive,depth+1);
      }else if(['allOf','anyOf','oneOf','prefixItems'].includes(key)&&Array.isArray(item))output[key]=item.map((child,index)=>schema(child,pointer+'/'+index,sensitive,depth+1));
      else if(['default','example','examples','enum','const'].includes(key)){const retained=literal(item,pointer,sensitive);if(retained!==undefined)output[key]=retained;}
      else if(['description','title'].includes(key)&&typeof item==='string')output[key]=prose(item,pointer);
      else if(key==='$ref'&&typeof item==='string'){if(item.startsWith('#/'))output[key]=item;else note(pointer,'External reference URL omitted');}
      else if(['type','required','format','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','pattern','minItems','maxItems','uniqueItems','minProperties','maxProperties','readOnly','writeOnly','nullable','$schema'].includes(key)){
        const retained=literal(item,pointer,false);if(retained!==undefined)output[key]=retained;
      }else note(pointer,'Unknown schema annotation or extension omitted');
    }
    return output;
  }
  const result={...dto};
  for(const key of ['title','path','desc','markdown'])if(typeof result[key]==='string')result[key]=prose(result[key],'/'+key);
  for(const key of ['req_query','req_headers','req_params','req_body_form'])if(result[key])result[key]=result[key].map((item,index)=>{
    const next={...item};if(typeof next.desc==='string')next.desc=prose(next.desc,'/'+key+'/'+index+'/desc');
    note('/'+key+'/'+index+'/value','Runtime values and examples are not exposed');return next;
  });
  for(const [field,flag]of [['req_body_other','req_body_is_json_schema'],['res_body','res_body_is_json_schema']]){
    if(result[field]===undefined)continue;
    if(result[flag]===true){try{result[field]=JSON.stringify(schema(JSON.parse(result[field]),'/'+field));}catch{delete result[field];note('/'+field,'Unparseable schema omitted');}}
    else{delete result[field];note('/'+field,'Raw request/response example omitted');}
  }
  result.redactionPolicy='yapi.mcp-redaction.v1';result.redactions=redactions;
  return result;
}
function redactDiscovery(records) {
  return records.map(record=>{
    const result={...record},redactions=[];
    for(const key of ['name','title','path'])if(typeof result[key]==='string'){
      const value=redactProse(result[key]);if(value!==result[key])redactions.push({path:'/'+key,reason:'Recognized credential or personal-data pattern'});result[key]=value;
    }
    return {...result,redactionPolicy:'yapi.mcp-redaction.v1',redactions};
  });
}
module.exports={redactMcpDocumentation,redactProse,redactDiscovery};
