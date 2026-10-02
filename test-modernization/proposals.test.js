'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createProposal, previewProposal, acceptProposal, restoreRevision } =
  require('../server/services/documentation/proposals');

const {snapshot:annotationSnapshot}=require('../server/services/documentation/description-edits');
const audit = { actorId: 7, now: '2026-10-02T00:00:00.000Z' };
const changes = { desc: '<p>Reviewed documentation</p>', markdown: 'Reviewed documentation' };
function fixture() {
  return {
    _id: 31, project_id: 4, version: 0,
    desc: '<p>Original</p>', markdown: 'Original', path: '/users', method: 'GET',
    req_query: [{ name: 'limit', required: '0', desc: 'Page size' }],
    res_body: '{"type":"object"}', res_body_is_json_schema: true
  };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function rejects(fn, code = 'INVALID_INPUT') {
  assert.throws(fn, error => error.code === code);
}

test('proposal creation records explicit author and full base snapshot hash', () => {
  const document = fixture();
  const proposal = createProposal(document, changes, audit);
  assert.equal(proposal.interfaceId, 31);
  assert.equal(proposal.projectId, 4);
  assert.equal(proposal.baseVersion, 0);
  assert.match(proposal.baseHash, /^[a-f0-9]{64}$/);
  assert.equal(proposal.createdBy, audit.actorId);
  assert.equal(proposal.createdAt, audit.now);
  assert.deepEqual(proposal.changes, changes);
});

test('only paired description strings are accepted, even for empty descriptions', () => {
  const invalid = [null, [], {}, { desc: 'x' }, { markdown: 'x' },
    { desc: 'x', markdown: null }, { desc: false, markdown: 'x' },
    { ...changes, path: '/admin' }, { ...changes, method: 'POST' },
    { ...changes, req_query: [] }, { ...changes, res_body: '{}' },
    { ...changes, 'req_query.0.desc': 'Change a field' },
    { ...changes, version: 99 }, { ...changes, project_id: 9 }];
  invalid.forEach(value => rejects(() => createProposal(fixture(), value, audit)));
  assert.deepEqual(createProposal(fixture(), { desc: '', markdown: '' }, audit).changes,
    { desc: '', markdown: '' });
});

test('preview changes descriptions only and never consumes a version', () => {
  const document = fixture();
  const preview = previewProposal(document, createProposal(document, changes, audit));
  assert.deepEqual(preview, { ...document, ...changes });
  preview.req_query[0].name = 'independent';
  assert.equal(document.req_query[0].name, 'limit');
});

test('accept appends a new revision result without mutating frozen inputs', () => {
  const document = freeze(fixture());
  const proposal = freeze(createProposal(document, freeze({ ...changes }), freeze({ ...audit })));
  const result = acceptProposal(document, proposal, audit);
  assert.deepEqual(result.document, { ...document, ...changes, version: 1 });
  assert.equal(result.revision.kind, 'accept');
  assert.equal(result.revision.parentVersion, 0);
  assert.equal(result.revision.version, 1);
  assert.equal(result.revision.baseHash, proposal.baseHash);
  assert.equal(result.revision.resultHash, createProposal(result.document, changes, audit).baseHash);
  assert.deepEqual(result.revision.before, { desc: '<p>Original</p>', markdown: 'Original', descriptionSnapshot:annotationSnapshot(document) });
  assert.deepEqual(result.revision.after, {...changes,descriptionSnapshot:annotationSnapshot(result.document)});
  assert.equal(result.revision.restoredFromVersion, null);
  assert.equal(result.revision.actorId, audit.actorId);
  assert.equal(result.revision.createdAt, audit.now);
  result.document.req_query[0].name = 'new copy';
  result.revision.after.desc = 'independent';
  assert.equal(document.req_query[0].name, 'limit');
  assert.equal(result.document.desc, changes.desc);
  assert.equal(proposal.changes.desc, changes.desc);
});

test('two proposals from the same version conflict after one acceptance', () => {
  const document = fixture();
  const first = createProposal(document, changes, audit);
  const second = createProposal(document, { desc: 'Other', markdown: 'Other' }, audit);
  const accepted = acceptProposal(document, first, audit);
  rejects(() => acceptProposal(accepted.document, second, audit), 'VERSION_CONFLICT');
  rejects(() => previewProposal(accepted.document, first), 'VERSION_CONFLICT');
});

test('full hash detects legacy writes even without a version increment', () => {
  const document = fixture();
  const proposal = createProposal(document, changes, audit);
  const edits = [
    value => { value.path = '/admin'; },
    value => { value.method = 'DELETE'; },
    value => { value.req_query[0].desc = 'Out-of-band field edit'; },
    value => { value.res_body = '{"type":"array"}'; },
    value => { value.markdown = 'Legacy edit'; },
    value => { value.desc = '<p>Legacy HTML edit</p>'; },
    value => { value.extra = 'New semantic metadata'; },
    value => { delete value.res_body_is_json_schema; }
  ];
  for (const edit of edits) {
    const modified = fixture();
    edit(modified);
    rejects(() => acceptProposal(modified, proposal, audit), 'VERSION_CONFLICT');
    rejects(() => previewProposal(modified, proposal), 'VERSION_CONFLICT');
  }
});

test('canonical hashes do not depend on object key insertion order', () => {
  const document = fixture();
  const reversed = Object.fromEntries(Object.entries(document).reverse());
  reversed.req_query = [{ desc: 'Page size', required: '0', name: 'limit' }];
  const proposal = createProposal(document, changes, audit);
  assert.equal(createProposal(reversed, changes, audit).baseHash, proposal.baseHash);
  assert.equal(acceptProposal(reversed, proposal, audit).document.version, 1);
});

test('proposals cannot cross interface or project boundaries', () => {
  const document = fixture();
  const proposal = createProposal(document, changes, audit);
  rejects(() => acceptProposal({ ...document, _id: 32 }, proposal, audit), 'TARGET_MISMATCH');
  rejects(() => previewProposal({ ...document, project_id: 5 }, proposal), 'TARGET_MISMATCH');
});

test('proposal payloads are revalidated at preview and accept boundaries', () => {
  const document = fixture();
  const original = createProposal(document, changes, audit);
  const invalid = [
    { ...original, changes: { ...changes, path: '/admin' } },
    { ...original, method: 'POST' },
    { ...original, kind: 'schema' },
    { ...original, baseHash: 'bad' },
    { ...original, baseVersion: -1 },
    { ...original, createdBy: '7' },
    { ...original, createdAt: 'yesterday' }
  ];
  invalid.forEach(proposal => {
    rejects(() => previewProposal(document, proposal));
    rejects(() => acceptProposal(document, proposal, audit));
  });
});

test('IDs, versions, documents and audit metadata are strict and never defaulted', () => {
  for (const key of ['_id', 'project_id']) {
    for (const value of [0, -1, '1', 1.5, null, Number.MAX_SAFE_INTEGER + 1]) {
      rejects(() => createProposal({ ...fixture(), [key]: value }, changes, audit));
    }
  }
  for (const version of [-1, '0', null, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    rejects(() => createProposal({ ...fixture(), version }, changes, audit));
  }
  for (const metadata of [undefined, {}, { actorId: 7 }, { now: audit.now },
    { ...audit, actorId: 0 }, { ...audit, now: '2026-10-02' },
    { ...audit, now: '2026-02-30T00:00:00.000Z' }, { ...audit, role: 'admin' }]) {
    rejects(() => createProposal(fixture(), changes, metadata));
    rejects(() => acceptProposal(fixture(), createProposal(fixture(), changes, audit), metadata));
  }
  const missing = fixture();
  delete missing.version;
  rejects(() => createProposal(missing, changes, audit));
});

test('non-JSON data, accessors, prototype keys, sparse arrays and cycles are rejected', () => {
  const cycle = {};
  cycle.self = cycle;
  const invalid = [undefined, () => {}, BigInt(1), Infinity, NaN, new Date(audit.now),
    cycle, [ , 'hole'], JSON.parse('{"__proto__":{"polluted":true}}'),
    Object.defineProperty({}, 'hidden', { value: 1 }), { [Symbol('hidden')]: 1 }];
  invalid.forEach(extra => rejects(() => createProposal({ ...fixture(), extra }, changes, audit)));
  let getterCalled = false;
  const accessor = Object.defineProperty({}, 'desc', {
    enumerable: true, get() { getterCalled = true; return 'x'; }
  });
  rejects(() => createProposal(fixture(), accessor, audit));
  assert.equal(getterCalled, false);
});

test('restoring a historical revision creates a new version and preserves current semantics', () => {
  const original = fixture();
  const first = acceptProposal(original, createProposal(original, changes, audit), audit);
  const second = acceptProposal(first.document, createProposal(first.document,
    { desc: '<p>Second</p>', markdown: 'Second' }, audit), audit);
  const current = { ...second.document, path: '/v2/users', method: 'POST' };
  const snapshot = JSON.stringify(first.revision);
  const restored = restoreRevision(freeze(current), freeze(first.revision), audit);
  assert.deepEqual(restored.document, { ...current, ...changes, version: 3 });
  assert.equal(restored.revision.kind, 'restore');
  assert.equal(restored.revision.parentVersion, 2);
  assert.equal(restored.revision.restoredFromVersion, 1);
  assert.deepEqual(restored.revision.before, { desc: '<p>Second</p>', markdown: 'Second', descriptionSnapshot:annotationSnapshot(current) });
  assert.deepEqual(restored.revision.after, {...changes,descriptionSnapshot:annotationSnapshot(restored.document)});
  assert.equal(restored.revision.baseHash, createProposal(current, changes, audit).baseHash);
  assert.equal(JSON.stringify(first.revision), snapshot);
  const restoredAgain = restoreRevision(restored.document, restored.revision, audit);
  assert.equal(restoredAgain.document.version, 4);
});

test('restore rejects mismatched, future, malformed and semantic-field revisions', () => {
  const document = fixture();
  const accepted = acceptProposal(document, createProposal(document, changes, audit), audit);
  rejects(() => restoreRevision(document, accepted.revision, audit), 'VERSION_CONFLICT');
  rejects(() => restoreRevision({ ...accepted.document, _id: 99 }, accepted.revision, audit), 'TARGET_MISMATCH');
  rejects(() => restoreRevision({ ...accepted.document, project_id: 99 }, accepted.revision, audit), 'TARGET_MISMATCH');
  const invalid = [
    { ...accepted.revision, after: { ...changes, method: 'DELETE' } },
    { ...accepted.revision, parentVersion: 1 },
    { ...accepted.revision, restoredFromVersion: 1 },
    { ...accepted.revision, kind: 'restore', restoredFromVersion: 2 },
    { ...accepted.revision, baseHash: '' },
    { ...accepted.revision, actorId: null },
    { ...accepted.revision, extra: true }
  ];
  invalid.forEach(revision => rejects(() => restoreRevision(accepted.document, revision, audit)));
  rejects(() => restoreRevision(accepted.document, accepted.revision, {}));
});

test('version overflow is rejected rather than losing integer precision', () => {
  const document = { ...fixture(), version: Number.MAX_SAFE_INTEGER };
  const proposal = createProposal(document, changes, audit);
  rejects(() => acceptProposal(document, proposal, audit), 'VERSION_OVERFLOW');
  const first = fixture();
  const revision = acceptProposal(first, createProposal(first, changes, audit), audit).revision;
  rejects(() => restoreRevision(document, revision, audit), 'VERSION_OVERFLOW');
});
