const logModel = require('../models/log.js');
const yapi = require('../yapi.js');
const baseController = require('./base.js');
const groupModel = require('../models/group');
const projectModel = require('../models/project');
const interfaceModel = require('../models/interface');

class logController extends baseController {
  constructor(ctx) {
    super(ctx);
    this.Model = yapi.getInst(logModel);
    this.groupModel = yapi.getInst(groupModel);
    this.projectModel = yapi.getInst(projectModel);
    this.interfaceModel = yapi.getInst(interfaceModel);
    this.schemaMap = {
      listByUpdate: {
        '*type': 'string',
        '*typeid': 'number',
        apis: [
          {
            method: 'string',
            path: 'string'
          }
        ]
      }
    };
  }

  /**
   * 获取动态列表
   * @interface /log/list
   * @method GET
   * @category log
   * @foldnumber 10
   * @param {Number} typeid 动态类型id， 不能为空
   * @param {Number} [page] 分页页码
   * @param {Number} [limit] 分页大小
   * @returns {Object}
   * @example /log/list
   */

  async list(ctx) {
    let typeid = ctx.request.query.typeid,
      page = ctx.request.query.page || 1,
      limit = ctx.request.query.limit || 10,
      type = ctx.request.query.type,
      selectValue = ctx.request.query.selectValue;
    if (!typeid) {
      return (ctx.body = yapi.commons.resReturn(null, 400, 'typeid不能为空'));
    }
    if (!type) {
      return (ctx.body = yapi.commons.resReturn(null, 400, 'type不能为空'));
    }
    typeid = Number(typeid);
    if (!Number.isSafeInteger(typeid) || typeid <= 0 || !['group', 'project'].includes(type)) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '动态类型或ID有误'));
    }
    try {
      if (type === 'group') {
        if (!(await this.groupModel.get(typeid))) {
          return (ctx.body = yapi.commons.resReturn(null, 404, '分组不存在'));
        }
        const includeGroup = (await this.checkAuth(typeid, 'group', 'view')) === true;
        let projectList = await this.projectModel.list(typeid);
        let projectIds = [],
          projectDatas = {};
        for (let i in projectList) {
          const project = projectList[i];
          if (project.project_type === 'public' ||
              (await this.checkAuth(project._id, 'project', 'view')) === true) {
            projectDatas[project._id] = project;
            projectIds.push(project._id);
          }
        }
        let projectLogList = await this.Model.listWithPagingByGroup(
          typeid,
          projectIds,
          page,
          limit,
          includeGroup
        );
        projectLogList.forEach((item, index) => {
          item = item.toObject();
          if (item.type === 'project') {
            item.content =
              `在 <a href="/project/${item.typeid}">${projectDatas[item.typeid].name}</a> 项目: ` +
              item.content;
          }
          projectLogList[index] = item;
        });
        let total = await this.Model.listCountByGroup(typeid, projectIds, includeGroup);
        ctx.body = yapi.commons.resReturn({
          list: projectLogList,
          total: Math.ceil(total / limit)
        });
      } else if (type === "project") {
        const project = await this.projectModel.getBaseInfo(typeid, '_id project_type');
        if (!project) return (ctx.body = yapi.commons.resReturn(null, 404, '项目不存在'));
        if (project.project_type !== 'public' &&
            (await this.checkAuth(typeid, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
        }
        let result = await this.Model.listWithPaging(typeid, type, page, limit, selectValue);
        let count = await this.Model.listCount(typeid, type, selectValue);

        ctx.body = yapi.commons.resReturn({
          total: Math.ceil(count / limit),
          list: result
        });
      }
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }
  /**
   * 获取特定cat_id下最新修改的动态信息
   * @interface /log/list_by_update
   * @method post
   * @category log
   * @foldnumber 10
   * @param {Number} typeid 动态类型id， 不能为空
   * @returns {Object}
   * @example /log/list
   */

  async listByUpdate(ctx) {
    let params = ctx.params;

    try {
      let { typeid, type, apis } = params;
      typeid = Number(typeid);
      if (type !== 'project' || !Number.isSafeInteger(typeid) || typeid <= 0) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '动态类型或ID有误'));
      }
      let projectDatas = await this.projectModel.getBaseInfo(typeid, '_id basepath project_type');
      if (!projectDatas) return (ctx.body = yapi.commons.resReturn(null, 404, '项目不存在'));
      if (projectDatas.project_type !== 'public' &&
          (await this.checkAuth(typeid, 'project', 'view')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
      }
      let list = [];
      let basePath = projectDatas.toObject().basepath;

      for (let i = 0; i < apis.length; i++) {
        let api = apis[i];
        if (basePath) {
          api.path = api.path.indexOf(basePath) === 0 ? api.path.substr(basePath.length) : api.path;
        }
        let interfaceIdList = await this.interfaceModel.getByPath(
          typeid,
          api.path,
          api.method,
          '_id'
        );

        for (let j = 0; j < interfaceIdList.length; j++) {
          let interfaceId = interfaceIdList[j];
          let id = interfaceId.id;
          let result = await this.Model.listWithCatid(typeid, type, id);

          list = list.concat(result);
        }
      }

      // let result = await this.Model.listWithCatid(typeid, type, catId);
      ctx.body = yapi.commons.resReturn(list);
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }
}

module.exports = logController;
