'use strict';
const {numericId}=require('./read-service');
function fail(code){throw Object.assign(Error(code),{code});}
function paging(cursor,limit){
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('INVALID_ID');
}
function createDiscovery({db,authorize}) {
  async function allowed(principal,projectId){numericId(projectId);if(await authorize({principal,projectId,scope:'docs.read'})!==true)fail('FORBIDDEN');}
  return {
    async listProjects({principal}) {
      if(!principal||!Array.isArray(principal.projects)||principal.projects.length>100)fail('FORBIDDEN');
      const result=[];
      for(const projectId of principal.projects){
        numericId(projectId);
        if(await authorize({principal,projectId,scope:'docs.read'})===true){
          const project=await db.collection('project').findOne({_id:projectId},{projection:{_id:1,name:1,group_id:1}});
          if(project)result.push(project);
        }
      }
      return result;
    },
    async listCategories({principal,projectId,cursor=0,limit=50}) {
      paging(cursor,limit);await allowed(principal,projectId);
      return db.collection('interface_cat').find({project_id:projectId,_id:{$gt:cursor}},{projection:{_id:1,project_id:1,name:1}}).sort({_id:1}).limit(limit).toArray();
    },
    async listInterfaces({principal,projectId,cursor=0,limit=50,query=''}) {
      paging(cursor,limit);await allowed(principal,projectId);
      if(typeof query!=='string'||query.length>100)fail('INVALID_ID');
      const filter={project_id:projectId,_id:{$gt:cursor}};
      if(query){const literal=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');filter.$or=[{title:{$regex:literal,$options:'i'}},{path:{$regex:literal,$options:'i'}}];}
      return db.collection('interface').find(filter,{projection:{_id:1,project_id:1,catid:1,title:1,path:1,method:1,status:1}}).sort({_id:1}).limit(limit).toArray();
    }
  };
}
module.exports={createDiscovery};
