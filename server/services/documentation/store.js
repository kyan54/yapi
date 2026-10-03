'use strict';
const {randomUUID} = require('node:crypto');
const {createProposal,previewProposal,acceptProposal,restoreDescriptionSnapshot} = require('./proposals');
const {FIELDS,snapshot}=require('./description-edits');
const {numericId} = require('./read-service');
const {createRevisionStore}=require('./revision-store');
const {meaningfulChange}=require('./semantic-change');
function fail(code) {const error=new Error(code);error.code=code;throw error;}
function plain(raw) {
  const result=JSON.parse(JSON.stringify(raw));
  delete result.docs_history;
  delete result.docs_revision;
  delete result.docs_revision_head;
  result.version=raw.docs_revision || 0;
  result.desc=typeof raw.desc==='string' ? raw.desc : '';
  result.markdown=typeof raw.markdown==='string' ? raw.markdown : '';
  return result;
}
function createStore({interfaces,proposals,revisions,now=()=>new Date().toISOString()}) {
  const revisionStore=createRevisionStore(revisions);
  async function current(projectId,interfaceId) {
    numericId(projectId);numericId(interfaceId);
    const raw=await interfaces.findOne({_id:interfaceId,project_id:projectId});
    if(!raw) fail('NOT_FOUND');
    return raw;
  }
  async function commit(raw,applied) {
    const fields={desc:applied.document.desc,markdown:applied.document.markdown};
    for(const field of FIELDS) {
      if(JSON.stringify(applied.document[field])!==JSON.stringify(raw[field]))fields[field]=applied.document[field];
    }
    if(!meaningfulChange(raw,fields))return {document:plain(raw),revision:null,unchanged:true};
    const head=await revisionStore.prepare(raw,applied.revision);
    Object.assign(fields,{docs_revision:applied.document.version,docs_revision_head:head,up_time:Math.floor(Date.parse(applied.revision.createdAt)/1000)});
    // Exact BSON snapshot comparison detects every intervening legacy write,
    // including writers that do not update docs_revision. Current pointer and
    // description update are ONE atomic single-document operation: no replica
    // set transaction is assumed. Explicit IDs also guard the intended target.
    const result=await interfaces.updateOne({_id:raw._id,project_id:raw.project_id,$expr:{$eq:['$$ROOT',{$literal:raw}]}},{$set:fields,$unset:{docs_history:''}});
    if(result.matchedCount!==1) fail('VERSION_CONFLICT');
    return applied;
  }
  return {
    async get(projectId,interfaceId) {return plain(await current(projectId,interfaceId));},
    async propose(projectId,interfaceId,changes,actorId,unresolved=[]) {
      const raw=await current(projectId,interfaceId);
      const proposal=createProposal(plain(raw),changes,{actorId,now:now()});
      const record={...proposal,_id:randomUUID(),unresolved};
      await proposals.insertOne(record);
      return {id:record._id,...proposal,unresolved};
    },
    async saveProposal(projectId,interfaceId,baseDocument,changes,actorId,unresolved=[]) {
      // Preserve the exact pre-provider snapshot; never silently rebase output
      // after a slow provider response over a concurrent manual/Swagger edit.
      if(baseDocument._id!==interfaceId || baseDocument.project_id!==projectId) fail('TARGET_MISMATCH');
      const proposal=createProposal(baseDocument,changes,{actorId,now:now()});
      previewProposal(plain(await current(projectId,interfaceId)),proposal);
      const record={...proposal,_id:randomUUID(),unresolved};
      await proposals.insertOne(record);
      return {id:record._id,...proposal,unresolved};
    },
    async accept(projectId,interfaceId,proposalId,actorId) {
      if(typeof proposalId!=='string' || !/^[a-f0-9-]{36}$/.test(proposalId)) fail('INVALID_ID');
      const record=await proposals.findOne({_id:proposalId,projectId,interfaceId});
      if(!record) fail('NOT_FOUND');
      const {_id,unresolved,...proposal}=record;
      const raw=await current(projectId,interfaceId);
      return commit(raw,acceptProposal(plain(raw),proposal,{actorId,now:now()}));
    },
    async history(projectId,interfaceId,options) {
      return revisionStore.history(await current(projectId,interfaceId),options);
    },
    async restore(projectId,interfaceId,version,actorId,expectedVersion) {
      if(!Number.isSafeInteger(version) || version<0) fail('INVALID_ID');
      if(!Number.isSafeInteger(expectedVersion) || expectedVersion<0) fail('INVALID_INPUT');
      const raw=await current(projectId,interfaceId);
      if(plain(raw).version!==expectedVersion) fail('VERSION_CONFLICT');
      const target=await revisionStore.target(raw,version);
      const document=plain(raw);
      const audit={actorId,now:now()};
      const applied=restoreDescriptionSnapshot(document,target,audit,version);
      return commit(raw,applied);
    }
  };
}
module.exports={createStore,plain};
