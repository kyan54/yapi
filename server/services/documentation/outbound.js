'use strict';
const {activeSchema}=require('./schema-mode');
const {createHash}=require('node:crypto');
const {toDocumentationDTO}=require('./read-service');
function redactText(value) {
  return value
    .replace(/\b(Bearer|Basic)\s+[^\s<>"']+/gi,'$1 [REDACTED]')
    .replace(/\b(authorization|cookie|set-cookie|password|passwd|secret|access[_-]?token|api[_-]?key|token)\s*[:=]\s*[^\s<>;,]+/gi,'$1=[REDACTED]')
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g,'[REDACTED_KEY]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[REDACTED_EMAIL]')
    .replace(/https?:\/\/[^\s<>"')]+/gi,url=>{try{const u=new URL(url);u.username='';u.password='';if(u.search)u.search='?[REDACTED]';return u.toString();}catch{return '[REDACTED_URL]';}});
}
function schemaView(value,depth=0) {
  if(depth>30)return {omitted:'schema nesting limit'};
  if(typeof value==='boolean')return value;
  if(!value||typeof value!=='object'||Array.isArray(value))return {omitted:'invalid schema'};
  const out={};
  for(const key of ['type','format','required','minLength','maxLength','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minItems','maxItems','uniqueItems','minProperties','maxProperties']) {
    if(Object.prototype.hasOwnProperty.call(value,key))out[key]=value[key];
  }
  for(const key of ['title','description'])if(typeof value[key]==='string')out[key]=redactText(value[key]);
  // Never transmit raw examples/defaults/literal values, extension annotations,
  // external ref URLs or patterns. They may contain credentials or personal data.
  if(value.enum)out.allowedValueCount=Array.isArray(value.enum)?value.enum.length:0;
  if(Object.prototype.hasOwnProperty.call(value,'const'))out.constantValueOmitted=true;
  if(value.$ref)out.referenceOmitted=true;
  for(const key of ['properties','patternProperties','$defs','definitions','dependentSchemas']) {
    if(value[key]&&typeof value[key]==='object'&&!Array.isArray(value[key]))out[key]=Object.fromEntries(Object.entries(value[key]).map(([name,item])=>[redactText(name),schemaView(item,depth+1)]));
  }
  for(const key of ['items','additionalProperties','contains','not','if','then','else']) {
    if(Object.prototype.hasOwnProperty.call(value,key))out[key]=Array.isArray(value[key])?value[key].map(item=>schemaView(item,depth+1)):schemaView(value[key],depth+1);
  }
  for(const key of ['allOf','anyOf','oneOf','prefixItems'])if(Array.isArray(value[key]))out[key]=value[key].map(item=>schemaView(item,depth+1));
  return out;
}
function outboundPayload(document) {
  const dto=toDocumentationDTO(document);
  const result={format:'yapi.ai-description-context.v1',redacted:true};
  for(const key of ['_id','project_id','title','path','method','status','markdown','req_body_type','res_body_type']) {
    if(dto[key]!==undefined)result[key]=typeof dto[key]==='string'?redactText(dto[key]):dto[key];
  }
  // Send one textual representation only; raw legacy HTML may hide outbound
  // links, scripts or sensitive markup. User reviews the exact payload below.
  if(!result.markdown && dto.desc)result.markdown=redactText(dto.desc.replace(/<[^>]*>/g,''));
  for(const key of ['req_query','req_headers','req_params','req_body_form']) {
    if(dto[key])result[key]=dto[key].map(item=>Object.fromEntries(Object.entries(item).map(([name,value])=>[name,typeof value==='string'?redactText(value):value])));
  }
  for(const field of ['req_body_other','res_body']) {
    if(activeSchema(dto,field)){try{result[field]=schemaView(JSON.parse(dto[field]));}catch{result[field]={omitted:'invalid or non-JSON schema'};}}
    else if(dto[field])result[field]={omitted:'raw examples and response bodies are not transmitted'};
  }
  return result;
}
function payloadHash(payload,providerInfo) {return createHash('sha256').update(JSON.stringify({payload,provider:providerInfo})).digest('hex');}
module.exports={outboundPayload,payloadHash,redactText,schemaView};
