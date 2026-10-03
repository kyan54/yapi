'use strict';
// Apply visibility inside MongoDB before the result limit. Only navigation
// fields leave the database; inaccessible hits cannot consume the ten slots.
function identity({ uid, isAdmin = false } = {}) {
  if (!Number.isSafeInteger(uid) || uid < 1) throw new Error('Invalid search user');
  return { uid, isAdmin: isAdmin === true };
}
function visibleProjectMatch(uid, prefix = '') {
  return { $or: [
    { [prefix + 'project_type']: { $ne: 'private' } },
    { [prefix + 'uid']: uid },
    { [prefix + 'members.uid']: uid },
    { '_searchGroup.uid': uid },
    { '_searchGroup.members.uid': uid }
  ] };
}
function groupLookup(localField) {
  return { $lookup: { from: 'group', localField, foreignField: '_id', as: '_searchGroup' } };
}
function projectPipeline(keyword, options) {
  const { uid, isAdmin } = identity(options);
  const pipeline = [{ $match: { name: new RegExp(keyword, 'i') } }];
  if (!isAdmin) pipeline.push(groupLookup('group_id'), { $match: visibleProjectMatch(uid) });
  return pipeline.concat([{ $sort: { _id: 1 } }, { $limit: 10 }, { $project: { _id: 1, name: 1, group_id: 1 } }]);
}
function interfacePipeline(keyword, options) {
  const { uid, isAdmin } = identity(options);
  const pipeline = [
    { $match: { $or: [{ title: new RegExp(keyword, 'i') }, { path: new RegExp(keyword, 'i') }] } },
    { $lookup: { from: 'project', localField: 'project_id', foreignField: '_id', as: '_searchProject' } },
    { $unwind: '$_searchProject' }
  ];
  if (!isAdmin) pipeline.push(groupLookup('_searchProject.group_id'), { $match: visibleProjectMatch(uid, '_searchProject.') });
  return pipeline.concat([{ $sort: { _id: 1 } }, { $limit: 10 }, { $project: { _id: 1, title: 1, project_id: 1 } }]);
}
function groupPipeline(keyword, options) {
  const { uid, isAdmin } = identity(options);
  const pipeline = [{ $match: { group_name: new RegExp(keyword, 'i') } }];
  if (!isAdmin) pipeline.push(
    { $lookup: {
      from: 'project', let: { groupId: '$_id' }, as: '_searchSharedProjects',
      pipeline: [
        { $match: { $expr: { $eq: ['$group_id', '$$groupId'] }, $or: [
          { project_type: { $ne: 'private' } }, { uid }, { 'members.uid': uid }
        ] } },
        { $limit: 1 }, { $project: { _id: 1 } }
      ]
    } },
    { $match: { $or: [
      { type: { $ne: 'private' } }, { uid }, { 'members.uid': uid },
      { '_searchSharedProjects.0': { $exists: true } }
    ] } }
  );
  return pipeline.concat([{ $sort: { _id: 1 } }, { $limit: 10 }, { $project: { _id: 1, group_name: 1 } }]);
}
module.exports = { projectPipeline, interfacePipeline, groupPipeline };
