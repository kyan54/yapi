'use strict';
const {numericId} = require('./read-service');
const VIEW_ROLES = new Set(['owner','dev','guest']);
const EDIT_ROLES = new Set(['owner','dev']);
// Raw native reads only. Never instantiate legacy models or invoke repair hooks.
function createAccess({db}) {
  return async function authorize({principal,projectId,scope}) {
    numericId(projectId);
    if (!['docs.read','docs.edit'].includes(scope)) return false;
    if (!principal || !Number.isSafeInteger(principal.userId) || principal.userId < 1 ||
        !Array.isArray(principal.scopes) || !principal.scopes.includes(scope) ||
        !Array.isArray(principal.projects) || !principal.projects.includes(projectId)) return false;
    const user = await db.collection('user').findOne({_id:principal.userId},{projection:{_id:1,role:1}});
    if (!user) return false;
    const project = await db.collection('project').findOne({_id:projectId},{projection:{_id:1,uid:1,group_id:1,members:1}});
    if (!project) return false;
    if (user.role === 'admin' || project.uid === user._id) return true;
    const roles = scope === 'docs.read' ? VIEW_ROLES : scope === 'docs.edit' ? EDIT_ROLES : new Set();
    if ((project.members || []).some(member=>member.uid === user._id && roles.has(member.role))) return true;
    const group = await db.collection('group').findOne({_id:project.group_id},{projection:{uid:1,members:1}});
    return !!group && (group.uid === user._id || (group.members || []).some(member=>member.uid === user._id && roles.has(member.role)));
  };
}
function readAdapter(collection) {
  return {findOne(filter) {
    let projection;
    return {select(fields) {projection=Object.fromEntries(fields.split(' ').map(name=>[name,1]));return this;},lean(){return this;},exec(){return collection.findOne(filter,{projection});}};
  }};
}
module.exports={createAccess,readAdapter};
