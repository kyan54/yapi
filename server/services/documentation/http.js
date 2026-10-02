'use strict';
const {toDocumentationDTO,numericId}=require('./read-service');
const {createProvider}=require('./provider');
const {outboundPayload,payloadHash}=require('./outbound');
const {createGenerationGate}=require('./generation-gate');
const MarkdownIt=require('markdown-it');
const renderer=new MarkdownIt({html:false,linkify:false,typographer:false});
function id(value) {
  if(typeof value==='string' && /^[1-9][0-9]*$/.test(value)) value=Number(value);
  return numericId(value);
}
function createDocumentationMiddleware({authenticate,authorize,store,provider,providerInfo}) {
  const gate=createGenerationGate();
  return async function documentation(ctx,next) {
    if(!ctx.path.startsWith('/api/documentation/')) return next();
    ctx.set('Cache-Control','no-store');
    const action=ctx.path.slice('/api/documentation/'.length);
    const readonly=['get','history'].includes(action);
    if(!['get','history','proposal','accept','restore'].includes(action) || ctx.method!==(readonly?'GET':'POST')) {
      ctx.status=404;ctx.body={errcode:404,errmsg:'NOT_FOUND',data:null};return;
    }
    try {
      if(!readonly && (ctx.get('X-YApi-Docs-Intent')!=='review' || (ctx.get('Origin') && ctx.get('Origin')!==ctx.protocol+'://'+ctx.host))) {
        ctx.status=403;ctx.body={errcode:403,errmsg:'INVALID_REQUEST_ORIGIN',data:null};return;
      }
      const user=await authenticate(ctx);
      if(!user) {ctx.status=401;ctx.body={errcode:401,errmsg:'LOGIN_REQUIRED',data:null};return;}
      const params=readonly ? ctx.query : ctx.request.body;
      const projectId=id(params.projectId),interfaceId=id(params.interfaceId);
      const principal={userId:user._id,projects:[projectId],scopes:['docs.read','docs.edit']};
      if(await authorize({principal,projectId,scope:readonly?'docs.read':'docs.edit'})!==true) {
        ctx.status=403;ctx.body={errcode:403,errmsg:'FORBIDDEN',data:null};return;
      }
      let data;
      if(action==='get') {
        const document=await store.get(projectId,interfaceId);
        const dto=toDocumentationDTO(document);
        const outbound=outboundPayload(document);
        data={document:{...dto,version:document.version},provider:providerInfo,outbound,payloadHash:payloadHash(outbound,providerInfo)};
      } else if(action==='history') {
        const options={};
        for(const key of ['limit','cursor']) if(params[key]!==undefined) {
          if(typeof params[key]!=='string'||!/^([0-9]+)$/.test(params[key])||!Number.isSafeInteger(Number(params[key]))) throw Object.assign(Error('INVALID_INPUT'),{code:'INVALID_INPUT'});
          options[key]=Number(params[key]);
          if(key==='limit'&&(options[key]<1||options[key]>100)) throw Object.assign(Error('INVALID_INPUT'),{code:'INVALID_INPUT'});
        }
        data=await store.history(projectId,interfaceId,options);
      } else if(action==='proposal') {
        if(!provider) throw Object.assign(Error('PROVIDER_NOT_CONFIGURED'),{code:'PROVIDER_NOT_CONFIGURED'});
        if(params.approvedForTransmission!==true) throw Object.assign(Error('TRANSMISSION_NOT_APPROVED'),{code:'TRANSMISSION_NOT_APPROVED'});
        const document=await store.get(projectId,interfaceId);
        const outbound=outboundPayload(document);
        const hash=payloadHash(outbound,providerInfo);
        if(params.payloadHash!==hash) throw Object.assign(Error('PAYLOAD_CHANGED'),{code:'PAYLOAD_CHANGED'});
        data=await gate({userId:user._id,projectId,interfaceId,requestId:params.requestId,hash},async()=>{
          const output=await provider.propose({document:outbound,approvedForTransmission:true});
          // Provider has no authority to submit HTML. Render Markdown with raw
          // HTML disabled; user approval is bound to the exact outbound payload.
          return store.saveProposal(projectId,interfaceId,document,{markdown:output.markdown,desc:renderer.render(output.markdown),...(output.descriptionEdits?{descriptionEdits:output.descriptionEdits}:{})},user._id,output.unresolved);
        });
      } else if(action==='accept') {
        data=await store.accept(projectId,interfaceId,params.proposalId,user._id);
      } else {
        data=await store.restore(projectId,interfaceId,params.version,user._id);
      }
      ctx.body={errcode:0,data};
    } catch(error) {
      const codes={DESCRIPTION_CONFLICT:409,INVALID_REQUEST_ID:400,IDEMPOTENCY_CONFLICT:409,GENERATION_IN_PROGRESS:409,RATE_LIMITED:429,PAYLOAD_CHANGED:409,INVALID_ID:400,VERSION_CONFLICT:409,NOT_FOUND:404,TARGET_MISMATCH:403,PROVIDER_NOT_CONFIGURED:503,TRANSMISSION_NOT_APPROVED:403,HISTORY_CAPACITY:409,INVALID_INPUT:400,PROVIDER_FAILED:502,INVALID_PROVIDER_RESPONSE:502,PROVIDER_RESPONSE_TOO_LARGE:502,DOCUMENT_TOO_LARGE:413};
      const status=codes[error.code] || 500;
      ctx.status=status;ctx.body={errcode:status,errmsg:codes[error.code]?error.code:'DOCUMENTATION_FAILED',data:null};
    }
  };
}
function fromApplication(yapi) {
  const mongoose=require('mongoose');
  const BaseController=require('../../controllers/base');
  const {createAccess}=require('./access');
  const {createStore}=require('./store');
  let middleware;
  return async(ctx,next)=>{
    if(!ctx.path.startsWith('/api/documentation/')) return next();
    if(!middleware) {
      const db=mongoose.connection.db;
      if(!db) {ctx.status=503;ctx.body={errcode:503,errmsg:'DATABASE_UNAVAILABLE',data:null};return;}
      let provider=null,providerInfo={configured:false,baseURL:null,model:null};
      if(process.env.YAPI_LLM_BASE_URL && process.env.YAPI_LLM_MODEL && process.env.YAPI_LLM_API_KEY) {
        try {
          provider=createProvider({baseURL:process.env.YAPI_LLM_BASE_URL,model:process.env.YAPI_LLM_MODEL,apiKey:process.env.YAPI_LLM_API_KEY});
          providerInfo={configured:true,baseURL:process.env.YAPI_LLM_BASE_URL,model:process.env.YAPI_LLM_MODEL};
        } catch(error) { /* Invalid config stays disabled without exposing secrets. */ }
      }
      middleware=createDocumentationMiddleware({
        authenticate:async context=>{const controller=new BaseController(context);return await controller.checkLogin(context)===true ? controller.$user : null;},
        authorize:createAccess({db}),
        store:createStore({interfaces:db.collection('interface'),proposals:db.collection('documentation_proposals'),revisions:db.collection('documentation_revisions')}),
        provider,providerInfo
      });
    }
    return middleware(ctx,next);
  };
}
module.exports={createDocumentationMiddleware,fromApplication};
