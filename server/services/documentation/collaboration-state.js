'use strict';

// These three top-level fields are edit-session coordination, never content.
// Do not broaden this list: unknown plugin fields and business metadata must
// remain part of the exact BSON comparison, including writes without a version.
const TRANSIENT_FIELDS = Object.freeze(['edit_uid', 'edit_lock_token', 'edit_lock_expires_at']);
function withoutCollaboration(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !TRANSIENT_FIELDS.includes(key)));
}
function contentSnapshotPredicate(raw) {
  return {$eq: [
    {$arrayToObject: {$filter: {
      input: {$objectToArray: '$$ROOT'}, as: 'field',
      cond: {$not: [{$in: ['$$field.k', {$literal: TRANSIENT_FIELDS}]}]}
    }}},
    {$literal: withoutCollaboration(raw)}
  ]};
}
module.exports = {TRANSIENT_FIELDS, withoutCollaboration, contentSnapshotPredicate};
