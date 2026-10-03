'use strict';

const { createHash } = require('node:crypto');
const annotations = require('./description-edits');
const {withoutCollaboration} = require('./collaboration-state');

// Reference contract only: no authentication, HTML sanitization, or database writes.
// The persistence adapter must load trusted proposals/revisions, authorize actors,
// and atomically CAS (version AND content hash) with an append-only revision insert.
// Never accept caller-supplied proposal/revision objects as an authorization grant.
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function canonical(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== 'object' || ancestors.has(value)) {
    fail('INVALID_INPUT', 'Expected acyclic plain JSON data');
  }
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) {
    fail('INVALID_INPUT', 'Expected plain JSON objects');
  }
  const keys = Reflect.ownKeys(value).filter(key => !(array && key === 'length'));
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor) ||
        ['__proto__', 'constructor', 'prototype'].includes(key)) {
      fail('INVALID_INPUT', 'Unsupported JSON property');
    }
  }
  if (array && (keys.length !== value.length ||
      keys.some((key, index) => key !== String(index)))) {
    fail('INVALID_INPUT', 'Expected a dense JSON array');
  }
  ancestors.add(value);
  const result = array
    ? '[' + keys.map(key => canonical(value[key], ancestors)).join(',') + ']'
    : '{' + keys.sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], ancestors)).join(',') + '}';
  ancestors.delete(value);
  return result;
}

function copy(value) { return JSON.parse(canonical(value)); }
function hash(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function integer(value, minimum, name) {
  if (!Number.isSafeInteger(value) || value < minimum) fail('INVALID_INPUT', 'Invalid ' + name);
}
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_INPUT', 'Expected ' + name + ' object');
  }
}
function exact(value, keys, name) {
  object(value, name);
  if (Object.keys(value).sort().join(',') !== keys.slice().sort().join(',')) {
    fail('INVALID_INPUT', 'Unexpected or missing ' + name + ' fields');
  }
}
function description(value, mode='proposal') {
  object(value, 'description');
  const optional = mode==='snapshot' ? 'descriptionSnapshot' : 'descriptionEdits';
  exact(value, ['desc', 'markdown', ...(Object.prototype.hasOwnProperty.call(value, optional)?[optional]:[])], 'description');
  if (Object.prototype.hasOwnProperty.call(value, optional)) annotations.validateEdits(value[optional], {snapshot:mode==='snapshot'});
  if (typeof value.desc !== 'string' || typeof value.markdown !== 'string') {
    fail('INVALID_INPUT', 'desc and markdown must both be strings');
  }
  // Both legacy representations must be supplied together. This does not verify
  // render equivalence or sanitize HTML; the editor/renderer owns those policies.
  return { desc: value.desc, markdown: value.markdown, ...(Object.prototype.hasOwnProperty.call(value, optional)?{[optional]:value[optional]}:{}) };
}
function documentInput(value) {
  const document = withoutCollaboration(copy(value));
  object(document, 'document');
  integer(document._id, 1, 'interface ID');
  integer(document.project_id, 1, 'project ID');
  integer(document.version, 0, 'version');
  description({ desc: document.desc, markdown: document.markdown });
  return document;
}
function metadataInput(value) {
  const metadata = copy(value);
  exact(metadata, ['actorId', 'now'], 'metadata');
  integer(metadata.actorId, 1, 'actor ID');
  if (typeof metadata.now !== 'string' || !Number.isFinite(Date.parse(metadata.now)) ||
      new Date(metadata.now).toISOString() !== metadata.now) {
    fail('INVALID_INPUT', 'now must be an explicit canonical ISO timestamp');
  }
  return metadata;
}
function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('INVALID_INPUT', 'Invalid content hash');
  }
}
function proposalInput(value) {
  const proposal = copy(value);
  exact(proposal, ['kind', 'interfaceId', 'projectId', 'baseVersion', 'baseHash',
    'changes', 'createdBy', 'createdAt'], 'proposal');
  if (proposal.kind !== 'description') fail('INVALID_INPUT', 'Unsupported proposal kind');
  integer(proposal.interfaceId, 1, 'interface ID');
  integer(proposal.projectId, 1, 'project ID');
  integer(proposal.baseVersion, 0, 'base version');
  digest(proposal.baseHash);
  description(proposal.changes);
  metadataInput({ actorId: proposal.createdBy, now: proposal.createdAt });
  return proposal;
}
function checkBase(document, proposal) {
  if (document._id !== proposal.interfaceId || document.project_id !== proposal.projectId) {
    fail('TARGET_MISMATCH', 'Proposal belongs to another interface or project');
  }
  if (document.version !== proposal.baseVersion || hash(document) !== proposal.baseHash) {
    fail('VERSION_CONFLICT', 'Document changed since proposal creation');
  }
}

function createProposal(value, changes, metadata) {
  const document = documentInput(value);
  const next = description(copy(changes));
  if(next.descriptionEdits) annotations.applyEdits(document, next.descriptionEdits);
  const audit = metadataInput(metadata);
  return {
    kind: 'description', interfaceId: document._id, projectId: document.project_id,
    baseVersion: document.version, baseHash: hash(document), changes: next,
    createdBy: audit.actorId, createdAt: audit.now
  };
}

function previewProposal(value, input) {
  const document = documentInput(value);
  const proposal = proposalInput(input);
  checkBase(document, proposal);
  return { ...annotations.applyEdits(document, proposal.changes.descriptionEdits || []), desc:proposal.changes.desc, markdown:proposal.changes.markdown };
}

function apply(document, next, audit, kind, restoredFromVersion) {
  if (document.version === Number.MAX_SAFE_INTEGER) fail('VERSION_OVERFLOW', 'Version exhausted');
  const annotated = next.descriptionSnapshot
    ? annotations.applyEdits(document,next.descriptionSnapshot,{snapshot:true})
    : annotations.applyEdits(document,next.descriptionEdits || []);
  const updated = { ...annotated, desc:next.desc, markdown:next.markdown, version: document.version + 1 };
  const beforeSnapshot=annotations.snapshot(document),afterSnapshot=annotations.snapshot(updated);
  return {
    document: updated,
    revision: {
      kind, interfaceId: document._id, projectId: document.project_id,
      parentVersion: document.version, version: updated.version,
      baseHash: hash(document), resultHash: hash(updated),
      before: { desc: document.desc, markdown: document.markdown, descriptionSnapshot:beforeSnapshot },
      after: { desc: updated.desc, markdown: updated.markdown, descriptionSnapshot:afterSnapshot }, actorId: audit.actorId, createdAt: audit.now,
      restoredFromVersion
    }
  };
}

function acceptProposal(value, input, metadata) {
  const document = documentInput(value);
  const proposal = proposalInput(input);
  const audit = metadataInput(metadata);
  checkBase(document, proposal);
  return apply(document, proposal.changes, audit, 'accept', null);
}

function restoreRevision(value, input, metadata) {
  const document = documentInput(value);
  const revision = copy(input);
  exact(revision, ['kind', 'interfaceId', 'projectId', 'parentVersion', 'version',
    'baseHash', 'resultHash', 'before', 'after', 'actorId', 'createdAt',
    'restoredFromVersion'], 'revision');
  integer(revision.interfaceId, 1, 'interface ID');
  integer(revision.projectId, 1, 'project ID');
  integer(revision.parentVersion, 0, 'parent version');
  integer(revision.version, 1, 'revision version');
  if (revision.version !== revision.parentVersion + 1 ||
      !['accept', 'restore'].includes(revision.kind)) {
    fail('INVALID_INPUT', 'Invalid revision lineage');
  }
  if (revision.kind === 'accept' && revision.restoredFromVersion !== null) {
    fail('INVALID_INPUT', 'Accept revision cannot have a restore source');
  }
  if (revision.kind === 'restore') {
    integer(revision.restoredFromVersion, 0, 'restore source version');
    if (revision.restoredFromVersion > revision.parentVersion) {
      fail('INVALID_INPUT', 'Invalid restore source version');
    }
  }
  digest(revision.baseHash);
  digest(revision.resultHash);
  description(revision.before, 'snapshot');
  description(revision.after, 'snapshot');
  metadataInput({ actorId: revision.actorId, now: revision.createdAt });
  const audit = metadataInput(metadata);
  if (document._id !== revision.interfaceId || document.project_id !== revision.projectId) {
    fail('TARGET_MISMATCH', 'Revision belongs to another interface or project');
  }
  if (revision.version > document.version) fail('VERSION_CONFLICT', 'Revision is from a future version');
  return apply(document, revision.after, audit, 'restore', revision.version);
}

function restoreDescriptionSnapshot(value, target, metadata, version) {
  const document=documentInput(value);
  integer(version,0,'restore source version');
  if(version>document.version)fail('VERSION_CONFLICT','Future version');
  return apply(document,description(copy(target),'snapshot'),metadataInput(metadata),'restore',version);
}
module.exports = { createProposal, previewProposal, acceptProposal, restoreRevision, restoreDescriptionSnapshot };
