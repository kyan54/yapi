'use strict';

const {createHash} = require('node:crypto');
const {plain} = require('./store');
const {snapshot}=require('./description-edits');
const {createRevisionStore,version:readVersion}=require('./revision-store');
const {meaningfulChange}=require('./semantic-change');
const {TRANSIENT_FIELDS,contentSnapshotPredicate}=require('./collaboration-state');

// Ownership, edit locks and revision metadata are not interface content. Never
// trust an imported/request-supplied user ID as authenticated audit identity.
const RESERVED = new Set(['_id', 'id', 'project_id', 'uid', ...TRANSIENT_FIELDS, '__v',
  'docs_history', 'docs_revision', 'docs_revision_head', 'add_time', '__proto__', 'constructor', 'prototype']);
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function undefinedAsNull(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(undefinedAsNull);
  if (value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, undefinedAsNull(item)]));
  }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
function hash(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }

async function castPatch(model, raw, data) {
  const document = model.hydrate(raw);
  const paths = Object.keys(data).filter(path => !RESERVED.has(path) &&
    !path.startsWith('$') && !path.includes('.') &&
    (model.schema.path(path) || Object.hasOwn(model.schema.nested, path)));
  for (const path of paths) document.set(path, undefinedAsNull(data[path]));
  // A legacy document can lack unrelated required fields. Update validation
  // must only examine supplied paths, like the old runValidators update.
  await document.validate(paths);
  const cast = document.toObject({depopulate: true, getters: false, virtuals: false, transform: false, minimize: false});
  return Object.fromEntries(paths.map(path => [path, cast[path]]));
}

async function writeLegacyInterface(model, id, data, {now = () => new Date(), maxAttempts = 4, revisions = model.db.collection('documentation_revisions')} = {}) {
  // Preserve numeric-ID query casting, but never pass an object/operator filter
  // from an API parameter into the native collection.
  if (typeof id !== 'number' && typeof id !== 'string') fail('INVALID_ID');
  const interfaceId = model.schema.path('_id').cast(id);
  if (!Number.isSafeInteger(interfaceId) || interfaceId < 1) fail('INVALID_ID');
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('INVALID_INPUT');
  const revisionStore=createRevisionStore(revisions);
  const createdAt = now().toISOString();
  const input = {...data, up_time: Math.floor(Date.parse(createdAt) / 1000)};
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const raw = await model.collection.findOne({_id: interfaceId});
    if (!raw) return {n: 0, nModified: 0, ok: 1};
    const version = readVersion(raw);
    const patch = await castPatch(model, raw, input);
    if(!meaningfulChange(raw,patch))return {n:1,nModified:0,ok:1};
    if (version === Number.MAX_SAFE_INTEGER) fail('VERSION_OVERFLOW');
    const updated = {...raw, ...patch, docs_revision: version + 1};
    const before = plain(raw), after = plain(updated);
    const revision = {
      kind: 'legacy-write', source: 'legacy-model-up', interfaceId, projectId: raw.project_id,
      parentVersion: version, version: version + 1,
      baseHash: hash(before), resultHash: hash(after),
      before: {desc: before.desc, markdown: before.markdown, descriptionSnapshot:snapshot(before)},
      after: {desc: after.desc, markdown: after.markdown, descriptionSnapshot:snapshot(after)},
      actorId: null, createdAt, restoredFromVersion: null
    };
    const head=await revisionStore.prepare(raw,revision);
    // Native single-document CAS keeps every unknown/BSON plugin field intact.
    // Retry over the latest state for legacy last-writer behavior; each winner
    // appends exactly once and cannot erase an intervening revision.
    const result = await model.collection.updateOne({
      _id: interfaceId, project_id: raw.project_id,
      $expr: contentSnapshotPredicate(raw)
    }, {$set: {...patch, docs_revision: version + 1, docs_revision_head:head}, $unset:{docs_history:''}});
    if (result.matchedCount === 1) {
      return {n: 1, nModified: result.modifiedCount || 0, ok: result.acknowledged ? 1 : 0};
    }
  }
  fail('VERSION_CONFLICT');
}

module.exports = {writeLegacyInterface};
