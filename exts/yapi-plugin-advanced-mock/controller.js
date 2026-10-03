const baseController = require('controllers/base.js');
const advModel = require('./advMockModel.js');
const yapi = require('yapi.js');
const caseModel = require('./caseModel.js');
const userModel = require('models/user.js');
const interfaceModel = require('models/interface.js');
const config = require('./index.js');

function numericId(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

class advMockController extends baseController {
  constructor(ctx) {
    super(ctx);
    this.Model = yapi.getInst(advModel);
    this.caseModel = yapi.getInst(caseModel);
    this.userModel = yapi.getInst(userModel);
    this.interfaceModel = yapi.getInst(interfaceModel);
  }

  // Always resolve the live interface before checking its project permission.
  // A project supplied by the caller is only a consistency check, never authority.
  async interfaceContext(ctx, interfaceId, action, projectId) {
    const id = numericId(interfaceId);
    const requestedProject = projectId === undefined ? undefined : numericId(projectId);
    if (!id || requestedProject === null) {
      ctx.body = yapi.commons.resReturn(null, 408, 'interface_id 或 project_id 参数有误');
      return null;
    }
    const target = await this.interfaceModel.get(id);
    if (!target || !numericId(target.project_id)) {
      ctx.body = yapi.commons.resReturn(null, 404, '接口不存在');
      return null;
    }
    if (requestedProject !== undefined && requestedProject !== Number(target.project_id)) {
      ctx.body = yapi.commons.resReturn(null, 40033, '接口不属于该项目');
      return null;
    }
    if ((await this.checkAuth(Number(target.project_id), 'project', action)) !== true) {
      ctx.body = yapi.commons.resReturn(null, 40033, '没有权限');
      return null;
    }
    return target;
  }

  async caseContext(ctx, caseId, action) {
    const id = numericId(caseId);
    if (!id) {
      ctx.body = yapi.commons.resReturn(null, 408, 'id 参数有误');
      return null;
    }
    const target = await this.caseModel.get({ _id: id });
    if (!target) {
      ctx.body = yapi.commons.resReturn(null, 404, '期望不存在');
      return null;
    }
    const api = await this.interfaceContext(ctx, target.interface_id, action, target.project_id);
    return api ? target : null;
  }

  async getMock(ctx) {
    const target = await this.interfaceContext(ctx, ctx.query.interface_id, 'view');
    if (!target) return;
    const mockData = await this.Model.get(target._id);
    if (!mockData) {
      return (ctx.body = yapi.commons.resReturn(null, 408, 'mock脚本不存在'));
    }
    return (ctx.body = yapi.commons.resReturn(mockData));
  }

  async upMock(ctx) {
    const params = ctx.request.body;
    try {
      if (!numericId(params.project_id)) {
        return (ctx.body = yapi.commons.resReturn(null, 408, 'project_id 参数有误'));
      }
      const target = await this.interfaceContext(ctx, params.interface_id, 'edit', params.project_id);
      if (!target) return;
      const data = {
        interface_id: target._id,
        mock_script: params.mock_script || '',
        project_id: target.project_id,
        uid: this.getUid(),
        enable: params.enable === true
      };
      const mockData = await this.Model.get(target._id);
      const result = mockData ? await this.Model.up(data) : await this.Model.save(data);
      return (ctx.body = yapi.commons.resReturn(result));
    } catch (e) {
      return (ctx.body = yapi.commons.resReturn(null, 400, e.message));
    }
  }

  async list(ctx) {
    try {
      const target = await this.interfaceContext(ctx, ctx.query.interface_id, 'view');
      if (!target) return;
      const result = await this.caseModel.list(target._id);
      for (let i = 0; i < result.length; i++) {
        const userinfo = await this.userModel.findById(result[i].uid);
        result[i] = result[i].toObject();
        result[i].username = userinfo ? userinfo.username : '';
      }
      ctx.body = yapi.commons.resReturn(result);
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 400, err.message);
    }
  }

  async getCase(ctx) {
    const target = await this.caseContext(ctx, ctx.query.id, 'view');
    if (!target) return;
    ctx.body = yapi.commons.resReturn(target);
  }

  async saveCase(ctx) {
    const params = ctx.request.body;
    const interfaceId = numericId(params.interface_id);
    const projectId = numericId(params.project_id);
    if (!interfaceId || !projectId) {
      return (ctx.body = yapi.commons.resReturn(null, 408, 'interface_id 或 project_id 参数有误'));
    }
    let target;
    if (params.id !== undefined && params.id !== null && params.id !== '') {
      target = await this.caseContext(ctx, params.id, 'edit');
      if (!target) return;
      if (Number(target.interface_id) !== interfaceId || Number(target.project_id) !== projectId) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '期望不属于该接口或项目'));
      }
    } else if (!(await this.interfaceContext(ctx, interfaceId, 'edit', projectId))) {
      return;
    }
    if (!params.res_body) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '请输入 Response Body'));
    }
    const data = {
      interface_id: interfaceId,
      project_id: projectId,
      ip_enable: params.ip_enable,
      name: params.name,
      params: params.params || [],
      uid: this.getUid(),
      code: params.code || 200,
      delay: params.delay || 0,
      headers: params.headers || [],
      up_time: yapi.commons.time(),
      res_body: params.res_body,
      ip: params.ip
    };
    data.code = isNaN(data.code) ? 200 : +data.code;
    data.delay = isNaN(data.delay) ? 0 : +data.delay;
    if (config.httpCodes.indexOf(data.code) === -1) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '非法的 httpCode'));
    }
    const findRepeatParams = {
      project_id: projectId,
      interface_id: interfaceId,
      ip_enable: data.ip_enable
    };
    if (data.params && typeof data.params === 'object' && Object.keys(data.params).length > 0) {
      for (const key of Object.keys(data.params)) {
        findRepeatParams['params.' + key] = { $eq: data.params[key] };
      }
    }
    if (data.ip_enable) findRepeatParams.ip = data.ip;
    const repeat = await this.caseModel.get(findRepeatParams);
    if (repeat && (!target || Number(repeat._id) !== Number(target._id))) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '已存在的期望'));
    }
    let result;
    if (target) {
      data.id = target._id;
      result = await this.caseModel.up(data, { project_id: projectId, interface_id: interfaceId });
    } else {
      result = await this.caseModel.save(data);
    }
    return (ctx.body = yapi.commons.resReturn(result));
  }

  async delCase(ctx) {
    const target = await this.caseContext(ctx, ctx.request.body.id, 'edit');
    if (!target) return;
    const result = await this.caseModel.del(target._id,
      { project_id: target.project_id, interface_id: target.interface_id });
    return (ctx.body = yapi.commons.resReturn(result));
  }

  async hideCase(ctx) {
    const target = await this.caseContext(ctx, ctx.request.body.id, 'edit');
    if (!target) return;
    const result = await this.caseModel.up({ id: target._id, case_enable: ctx.request.body.enable },
      { project_id: target.project_id, interface_id: target.interface_id });
    return (ctx.body = yapi.commons.resReturn(result));
  }
}

module.exports = advMockController;
