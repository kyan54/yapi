const baseController = require('controllers/base.js');
const yapi = require('yapi.js');
const syncModel = require('../syncModel.js');
const projectModel = require('models/project.js');
const interfaceSyncUtils = require('../interfaceSyncUtils.js');

function numericId(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

class syncController extends baseController {
  constructor(ctx) {
    super(ctx);
    this.syncModel = yapi.getInst(syncModel);
    this.projectModel = yapi.getInst(projectModel);
    this.interfaceSyncUtils = yapi.getInst(interfaceSyncUtils);
  }

  async projectContext(ctx, projectId, action) {
    const id = numericId(projectId);
    if (!id) {
      ctx.body = yapi.commons.resReturn(null, 408, '项目Id参数有误');
      return null;
    }
    const project = await this.projectModel.get(id);
    if (!project) {
      ctx.body = yapi.commons.resReturn(null, 404, '项目不存在');
      return null;
    }
    if ((await this.checkAuth(id, 'project', action)) !== true) {
      ctx.body = yapi.commons.resReturn(null, 405, '没有权限');
      return null;
    }
    return project;
  }

  async upSync(ctx) {
    try {
      const requestBody = ctx.request.body;
      const projectId = numericId(requestBody.project_id);
      if (!projectId) {
        return (ctx.body = yapi.commons.resReturn(null, 408, '项目Id参数有误'));
      }
      let target;
      if (requestBody.id !== undefined && requestBody.id !== null && requestBody.id !== '') {
        const id = numericId(requestBody.id);
        if (!id) return (ctx.body = yapi.commons.resReturn(null, 408, 'id 参数有误'));
        target = await this.syncModel.get(id);
        if (!target) return (ctx.body = yapi.commons.resReturn(null, 404, '同步任务不存在'));
        if (Number(target.project_id) !== projectId) {
          return (ctx.body = yapi.commons.resReturn(null, 405, '同步任务不属于该项目'));
        }
      }
      const project = await this.projectContext(ctx, target ? target.project_id : projectId, 'edit');
      if (!project) return;
      // Configuring a job captures the authenticated editor as its owner. Later
      // scheduled runs retain that saved UID; request-body UIDs are never trusted.
      const uid = numericId(this.getUid());
      if (!uid) return (ctx.body = yapi.commons.resReturn(null, 405, '没有权限'));
      const data = {
        project_id: projectId,
        uid,
        is_sync_open: requestBody.is_sync_open === true,
        sync_cron: requestBody.sync_cron,
        sync_json_url: requestBody.sync_json_url,
        sync_mode: requestBody.sync_mode
      };
      if (!target) target = await this.syncModel.getByProjectId(projectId);
      let result;
      if (target) {
        data.id = target._id;
        result = await this.syncModel.up(data, { project_id: projectId });
      } else {
        data.add_time = yapi.commons.time();
        result = await this.syncModel.save(data);
      }
      if (data.is_sync_open) {
        const job = await this.interfaceSyncUtils.addSyncJob(projectId, data.sync_cron, data.sync_json_url, data.sync_mode, uid);
        if (job === null) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '同步配置已保存，但新定时任务未启动；已有任务会保留，请检查 cron 和 Swagger URL'));
        }
      } else {
        this.interfaceSyncUtils.deleteSyncJob(projectId);
      }
      return (ctx.body = yapi.commons.resReturn(result));
    } catch (err) {
      return (ctx.body = yapi.commons.resReturn(null, 400, err.message));
    }
  }

  async getSync(ctx) {
    try {
      const project = await this.projectContext(ctx, ctx.query.project_id, 'view');
      if (!project) return;
      const result = await this.syncModel.getByProjectId(Number(project._id));
      return (ctx.body = yapi.commons.resReturn(result));
    } catch (err) {
      return (ctx.body = yapi.commons.resReturn(null, 400, err.message));
    }
  }
}

module.exports = syncController;
