const schedule = require('node-schedule');
const openController = require('controllers/open.js');
const projectModel = require('models/project.js');
const syncModel = require('./syncModel.js');
const tokenModel = require('models/token.js');
const yapi = require('yapi.js')
const sha = require('sha.js');
const md5 = require('md5');
const { getToken } = require('utils/token');
const jobMap = new Map();

class syncUtils {

    constructor(ctx) {
        yapi.commons.log("-------------------------------------swaggerSyncUtils constructor-----------------------------------------------");
        this.ctx = ctx;
        this.openController = yapi.getInst(openController);
        this.syncModel = yapi.getInst(syncModel);
        this.tokenModel = yapi.getInst(tokenModel)
        this.projectModel = yapi.getInst(projectModel);
        // Startup has no caller to await it, so keep a handled promise for errors.
        this.ready = this.init().catch(error => {
            yapi.commons.log('初始化自动同步任务失败: ' + error.message, 'error');
        });
    }

    //初始化定时任务
    async init() {
        let allSyncJob = await this.syncModel.listAll();
        await Promise.all(allSyncJob.filter(item => item.is_sync_open).map(item =>
            this.addSyncJob(item.project_id, item.sync_cron, item.sync_json_url, item.sync_mode, item.uid)
        ));
    }

    /**
     * 新增同步任务.
     * @param {*} projectId 项目id
     * @param {*} cronExpression cron表达式,针对定时任务
     * @param {*} swaggerUrl 获取swagger的地址
     * @param {*} syncMode 同步模式
     * @param {*} uid 用户id
     */
    async addSyncJob(projectId, cronExpression, swaggerUrl, syncMode, uid) {
        const run = async () => {
            try {
                // Derive the token with the scheduled owner's uid on every run.
                const projectToken = await this.getProjectToken(projectId, uid);
                if (!projectToken) throw new Error('获取项目 token 失败');
                return await this.syncInterface(projectId, swaggerUrl, syncMode, uid, projectToken);
            } catch (error) {
                return this.reportSyncFailure(error, syncMode, uid, projectId);
            }
        };

        try {
            if (!swaggerUrl) throw new Error('缺少 Swagger URL');
            const scheduleItem = schedule.scheduleJob(cronExpression, run);
            if (!scheduleItem) throw new Error('无效的自动同步 cron 表达式');

            // Do not replace a working job with node-schedule's null result.
            this.deleteSyncJob(projectId);
            jobMap.set(String(projectId), scheduleItem);
            await run();
            return scheduleItem;
        } catch (error) {
            await this.reportSyncFailure(error, syncMode, uid, projectId);
            return null;
        }
    }

    //同步接口
    async syncInterface(projectId, swaggerUrl, syncMode, uid, projectToken) {
        yapi.commons.log('定时器触发, syncJsonUrl:' + swaggerUrl + ",合并模式:" + syncMode);
        try {
            const project = await this.projectModel.get(projectId);
            // Only a confirmed missing project permits deleting its saved job.
            // A rejected database query is transient and must retain the job.
            if (!project) {
                await this.syncModel.delByProjectId(projectId);
                this.deleteSyncJob(projectId);
                throw new Error('项目:' + projectId + '不存在');
            }

            const oldSyncJob = await this.syncModel.getByProjectId(projectId);
            if (!oldSyncJob || oldSyncJob.is_sync_open === false) {
                this.deleteSyncJob(projectId);
                if (!oldSyncJob) throw new Error('项目:' + projectId + '的自动同步配置不存在');
                return { errcode: 0, skipped: true };
            }

            const swaggerContent = await this.getSwaggerContent(swaggerUrl);
            if (!swaggerContent || typeof swaggerContent !== 'object' || Array.isArray(swaggerContent)) {
                throw new Error('数据格式出错，请检查 Swagger JSON');
            }
            const newSwaggerJsonData = JSON.stringify(swaggerContent);
            const hash = md5(newSwaggerJsonData);
            if (oldSyncJob.old_swagger_content === hash) {
                const updated = await this.syncModel.upById(oldSyncJob._id, {
                    last_sync_time: yapi.commons.time()
                });
                if (updated && (updated.n === 0 || updated.ok === 0)) {
                    throw new Error('更新自动同步时间失败，配置可能已删除');
                }
                return { errcode: 0, unchanged: true };
            }

            const requestObj = {
                params: {
                    type: 'swagger',
                    json: newSwaggerJsonData,
                    project_id: projectId,
                    merge: syncMode,
                    token: projectToken
                }
            };
            await this.openController.importData(requestObj);
            const result = requestObj.body;
            if (!result || result.errcode === undefined || result.errcode === null) {
                throw new Error('Swagger 导入未返回有效结果');
            }
            if (result.errcode !== 0 && result.errcode !== '0') {
                throw new Error('Swagger 导入失败 (' + result.errcode + '): ' + (result.errmsg || '未知错误'));
            }

            // Do not pass a Mongoose document to the update helper or overwrite
            // concurrent configuration changes with the pre-import snapshot.
            const updated = await this.syncModel.upById(oldSyncJob._id, {
                last_sync_time: yapi.commons.time(),
                old_swagger_content: hash
            });
            if (updated && (updated.n === 0 || updated.ok === 0)) {
                throw new Error('更新自动同步状态失败，配置可能已删除');
            }
            await this.saveSyncLog(0, syncMode, result.errmsg, uid, projectId);
            return result;
        } catch (error) {
            return this.reportSyncFailure(error, syncMode, uid, projectId);
        }
    }

    async reportSyncFailure(error, syncMode, uid, projectId) {
        const message = error && error.message ? error.message : String(error);
        yapi.commons.log('自动同步项目:' + projectId + '失败: ' + message, 'error');
        try {
            await this.saveSyncLog(1, syncMode, message, uid, projectId);
        } catch (logError) {
            yapi.commons.log('保存自动同步日志失败: ' + logError.message, 'error');
        }
        return { errcode: 1, errmsg: message };
    }

    getSyncJob(projectId) {
        return jobMap.get(String(projectId));
    }

    deleteSyncJob(projectId) {
        let jobItem = jobMap.get(String(projectId));
        if (jobItem) {
            jobItem.cancel();
        }
        jobMap.delete(String(projectId));
    }

    /**
     * 记录同步日志
     * @param {*} errcode 
     * @param {*} syncMode 
     * @param {*} moremsg 
     * @param {*} uid 
     * @param {*} projectId 
     */
    saveSyncLog(errcode, syncMode, moremsg, uid, projectId) {
        return yapi.commons.saveLog({
            content: '自动同步接口状态:' + (errcode == 0 ? '成功,' : '失败,') + "合并模式:" + this.getSyncModeName(syncMode) + ",更多信息:" + moremsg,
            type: 'project',
            uid: uid,
            username: "自动同步用户",
            typeid: projectId
        });
    }

    /**
     * 获取项目token,因为导入接口需要鉴权.
     * @param {*} project_id 项目id
     * @param {*} uid 用户id
     */
    async getProjectToken(project_id, uid) {
        try {
            let data = await this.tokenModel.get(project_id);
            let token;
            if (!data) {
                let passsalt = yapi.commons.randStr();
                token = sha('sha1')
                    .update(passsalt)
                    .digest('hex')
                    .substr(0, 20);

                await this.tokenModel.save({ project_id, token });
            } else {
                token = data.token;
            }

            token = getToken(token, uid);

            return token;
        } catch (err) {
            yapi.commons.log('获取项目:' + project_id + ' token 失败: ' + err.message, 'error');
            return "";
        }
    }

    getUid(uid) {
        return parseInt(uid, 10);
    }

    /**
     * 转换合并模式的值为中文.
     * @param {*} syncMode 合并模式
     */
    getSyncModeName(syncMode) {
        if (syncMode == 'good') {
            return '智能合并';
        } else if (syncMode == 'normal') {
            return '普通模式';
        } else if (syncMode == 'merge') {
            return '完全覆盖';
        }
        return '';
    }

    async getSwaggerContent(swaggerUrl) {
        const axios = require('axios');
        try {
            // Private-network Swagger URLs are an intentional deployment feature.
            const response = await axios.get(swaggerUrl, { timeout: 30000 });
            if (!response || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
                throw new Error('http status "' + (response && response.status) + '"');
            }
            return response.data;
        } catch (error) {
            const detail = error.response ? 'http status "' + error.response.status + '"' : error.message;
            throw new Error('获取 Swagger 数据失败，请确认 swaggerUrl 是否正确: ' + detail);
        }
    }

}

module.exports = syncUtils;