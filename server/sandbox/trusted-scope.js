
'use strict';
// Capability is minted by authenticated controllers only, never from script context.
const scopes = new WeakMap();
function create(userId, projectId) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(projectId) || projectId < 1) throw new Error('SCRIPT_INVALID_SCOPE');
  const capability = Object.freeze({});
  scopes.set(capability, Object.freeze({userId:String(userId), projectId:String(projectId)}));
  return capability;
}
function read(capability) {
  if (!scopes.has(capability)) throw new Error('SCRIPT_INVALID_SCOPE');
  return scopes.get(capability);
}
module.exports = {create, read};
