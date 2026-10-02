'use strict';
const {randomUUID}=require('node:crypto');
const {snapshot}=require('./description-edits');
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
function version(raw) {
  const value=raw.docs_revision===undefined?0:raw.docs_revision;
  if(!Number.isSafeInteger(value)||value<0)fail('INVALID_REVISION');
  return value;
}
function identity(raw) {return {interfaceId:raw._id,projectId:raw.project_id,ownerId:raw.uid===undefined?null:raw.uid};}
function baseline(raw,after) {return {version:0,parentVersion:null,kind:'baseline',actorId:null,createdAt:null,after:after||{desc:raw.desc||'',markdown:raw.markdown||'',descriptionSnapshot:snapshot(raw)}};}
function embedded(raw) {
  const history=raw.docs_history===undefined?[]:raw.docs_history;
  if(!Array.isArray(history)||history.length!==version(raw))fail('INVALID_REVISION');
  for(let i=0;i<history.length;i++) {
    const item=history[i];
    if(!item||item.version!==i+1||item.parentVersion!==i||item.interfaceId!==raw._id||item.projectId!==raw.project_id||!item.before||!item.after)fail('INVALID_REVISION');
  }
  return [baseline(raw,history.length?history[0].before:undefined),...history];
}
function publicRevision(row) {
  const {_id,parentId,ownerId,...item}=row;
  return {...item,fieldHistoryAvailable:Array.isArray(item.after.descriptionSnapshot)};
}
function createRevisionStore(revisions) {
  if(!revisions||typeof revisions.insertOne!=='function'||typeof revisions.findOne!=='function')fail('REVISION_STORE_REQUIRED');
  async function walk(raw,visit) {
    const current=version(raw);
    if(!own(raw,'docs_revision_head')) {
      const rows=embedded(raw);
      for(let i=rows.length-1;i>=0;i--)visit(rows[i]);
      return;
    }
    if(own(raw,'docs_history'))fail('INVALID_REVISION');
    let id=raw.docs_revision_head;
    for(let expected=current;expected>=0;expected--) {
      if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))fail('INVALID_REVISION');
      const row=await revisions.findOne({_id:id,...identity(raw)});
      if(!row||row._id!==id||row.interfaceId!==raw._id||row.projectId!==raw.project_id||row.ownerId!==identity(raw).ownerId||row.version!==expected||row.parentVersion!==(expected?expected-1:null)||!row.after)fail('INVALID_REVISION');
      if(expected===0&&(row.parentId!==null||row.kind!=='baseline'))fail('INVALID_REVISION');
      visit(row);id=row.parentId;
    }
  }
  return {
    async prepare(raw,revision) {
      if(version(raw)===Number.MAX_SAFE_INTEGER)fail('VERSION_OVERFLOW');
      if(revision.version!==version(raw)+1||revision.parentVersion!==version(raw)||revision.interfaceId!==raw._id||revision.projectId!==raw.project_id)fail('INVALID_REVISION');
      let parentId=raw.docs_revision_head;
      if(!own(raw,'docs_revision_head')) {
        parentId=null;
        for(const row of embedded(raw)) {
          const record={...row,...identity(raw),_id:randomUUID(),parentId};
          await revisions.insertOne(record);parentId=record._id;
        }
      } else {
        // Validate the committed lineage before extending it. Unreachable
        // prepared records are never promoted by a query on version alone.
        await walk(raw,()=>{});
      }
      const record={...revision,...identity(raw),_id:randomUUID(),parentId};
      await revisions.insertOne(record);
      return record._id;
    },
    async history(raw,{limit=50,cursor}={}) {
      if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor!==undefined&&(!Number.isSafeInteger(cursor)||cursor<0||cursor>version(raw)))fail('INVALID_INPUT');
      const start=cursor===undefined?version(raw):cursor,items=[];
      await walk(raw,row=>{if(row.version<=start&&items.length<limit)items.push(publicRevision(row));});
      const nextCursor=items.length&&items[items.length-1].version>0?items[items.length-1].version-1:null;
      return {revisions:items,currentVersion:version(raw),nextCursor,hasMore:nextCursor!==null};
    },
    async target(raw,targetVersion) {
      let target;
      await walk(raw,row=>{if(row.version===targetVersion)target=row.after;});
      if(!target)fail('NOT_FOUND');return target;
    }
  };
}
module.exports={createRevisionStore,version};
