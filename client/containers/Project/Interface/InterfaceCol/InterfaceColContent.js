import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { withRouter } from 'react-router';
import { Link } from 'react-router-dom';
//import constants from '../../../../constants/variable.js'
import { Tooltip, Icon,Input, Button, Row, Col, Spin, Modal, message, Select, Switch } from 'antd';
import {
  fetchInterfaceColList,
  fetchCaseList,
  setColData,
  fetchCaseEnvList
} from '../../../../reducer/modules/interfaceCol';

import { getToken, getEnv } from '../../../../reducer/modules/project';

import AceEditor from 'client/components/AceEditor/AceEditor';



import axios from 'axios';
import CaseReport from './CaseReport.js';
import _ from 'underscore';
import produce from 'immer';
import {InsertCodeMap} from 'client/components/Postman/Postman.js'
import { REQUEST_MODE, getRequestMode, setRequestMode } from 'client/utils/requestMode';

const plugin = require('client/plugin.js');
const {
  handleParams,
  crossRequest,
  handleCurrDomain,
  checkNameIsExistInArray
} = require('common/postmanLib.js');
const { handleParamsValue, json_parse, ArrayToObject } = require('common/utils.js');
import CaseEnv from 'client/components/CaseEnv';
import Label from '../../../../components/Label/Label.js';

const Option = Select.Option;
const createContext = require('common/createContext')

import copy from 'copy-to-clipboard';

const defaultModalStyle = {
  top: 10
}

function handleReport(json) {
  try {
    return JSON.parse(json);
  } catch (e) {
    return {};
  }
}

@connect(
  state => {
    return {
      interfaceColList: state.interfaceCol.interfaceColList,
      currColId: state.interfaceCol.currColId,
      currCaseId: state.interfaceCol.currCaseId,
      isShowCol: state.interfaceCol.isShowCol,
      isRander: state.interfaceCol.isRander,
      currCaseList: state.interfaceCol.currCaseList,
      currProject: state.project.currProject,
      token: state.project.token,
      envList: state.interfaceCol.envList,
      curProjectRole: state.project.currProject.role,
      projectEnv: state.project.projectEnv,
      curUid: state.user.uid
    };
  },
  {
    fetchInterfaceColList,
    fetchCaseList,
    setColData,
    getToken,
    getEnv,
    fetchCaseEnvList
  }
)
@withRouter

class InterfaceColContent extends Component {
  static propTypes = {
    match: PropTypes.object,
    interfaceColList: PropTypes.array,
    fetchInterfaceColList: PropTypes.func,
    fetchCaseList: PropTypes.func,
    setColData: PropTypes.func,
    history: PropTypes.object,
    currCaseList: PropTypes.array,
    currColId: PropTypes.number,
    currCaseId: PropTypes.number,
    isShowCol: PropTypes.bool,
    isRander: PropTypes.bool,
    currProject: PropTypes.object,
    getToken: PropTypes.func,
    token: PropTypes.string,
    curProjectRole: PropTypes.string,
    getEnv: PropTypes.func,
    projectEnv: PropTypes.object,
    fetchCaseEnvList: PropTypes.func,
    envList: PropTypes.array,
    curUid: PropTypes.number
  };

  constructor(props) {
    super(props);
    this.reports = {};
    this.records = {};
    this.state = {
      rows: [],
      reports: {},
      visible: false,
      curCaseid: null,
      requestMode: getRequestMode(),

      advVisible: false,
      curScript: '',
      enableScript: false,
      autoVisible: false,
      mode: 'html',
      email: false,
      download: false,
      currColEnvObj: {},
      collapseKey: '1',
      commonSettingModalVisible: false,
      commonSettingSaving: false,
      running: false,
      commonSetting: {
        checkHttpCodeIs200: false,
        checkResponseField: {
          name: 'code',
          value: '0',
          enable: false
        },
        checkResponseSchema: false,
        checkScript:{
          enable: false,
          content: ''
        }
      }
    };
    this.onRow = this.onRow.bind(this);
    this.onMoveRow = this.onMoveRow.bind(this);
  }

  async handleColIdChange(newColId){
    this.activeRun = null;
    this.commonSettingIdentity = null;
    this.loadedCollectionId = null;
    this.savedCommonSetting = null;
    const load = {};
    this.activeCollectionLoad = load;
    this.reports = {};
    this.records = {};
    this.setState({ running: false, loadingCollection: true, commonSetting: this.ruleSettings({}), rows: [], commonSettingModalVisible: false, visible: false, advVisible: false });
    this.props.setColData({
      currColId: +newColId,
      collectionLoad: load,
      currCaseList: [],
      envList: [],
      isShowCol: true,
      isRander: false
    });

    try {
      const result = await this.props.fetchCaseList(newColId, load);
      if (this.activeCollectionLoad !== load) return;
      const payload = result && !result.error && result.payload && result.payload.data;
      if (!payload || payload.errcode !== 0 || !payload.colData || !Array.isArray(payload.data)) throw new Error('load failed');
      const environments = await this.props.fetchCaseEnvList(newColId, load);
      if (this.activeCollectionLoad !== load) return;
      const envPayload = environments && !environments.error && environments.payload && environments.payload.data;
      if (!envPayload || envPayload.errcode !== 0 || !Array.isArray(envPayload.data)) throw new Error('load failed');
      this.reports = handleReport(payload.colData.test_report);
      this.savedCommonSetting = this.ruleSettings(payload.colData);
      this.loadedCollectionId = Number(newColId);
      this.setState({ commonSetting: this.ruleSettings(this.savedCommonSetting) });
      this.changeCollapseClose();
      this.handleColdata(payload.data);
    } catch (_) {
      if (this.activeCollectionLoad === load) message.error('加载测试集合失败，请刷新重试');
    } finally {
      if (this.activeCollectionLoad === load) this.setState({ loadingCollection: false });
    }
  }

  isCurrentCollectionLoaded = () => Boolean(this.loadedCollectionId &&
    !this.state.loadingCollection &&
    this.loadedCollectionId === Number(this.props.currColId) &&
    this.loadedCollectionId === Number(this.props.match.params.actionId || this.props.currColId));

  async componentWillMount() {
    const result = await this.props.fetchInterfaceColList(this.props.match.params.id);
    await this.props.getToken(this.props.match.params.id);
    let { currColId } = this.props;
    const params = this.props.match.params;
    const { actionId } = params;
    this.currColId = currColId = +actionId || result.payload.data.data[0]._id;
    // this.props.history.push('/project/' + params.id + '/interface/col/' + currColId);
    if (currColId && currColId != 0) {
      await this.handleColIdChange(currColId)
    }

  }

  // 更新分类简介
  handleChangeInterfaceCol = (desc, name) => {
    let params = {
      col_id: this.props.currColId,
      name: name,
      desc: desc
    };

    axios.post('/api/col/up_col', params).then(async res => {
      if (res.data.errcode) {
        return message.error(res.data.errmsg);
      }
      let project_id = this.props.match.params.id;
      await this.props.fetchInterfaceColList(project_id);
      message.success('接口集合简介更新成功');
    });
  };

  // 整合header信息
  handleReqHeader = (project_id, req_header, case_env) => {
    let envItem = _.find(this.props.envList, item => {
      return item._id === project_id;
    });

    let currDomain = handleCurrDomain(envItem && envItem.env, case_env);
    let header = currDomain.header;
    header.forEach(item => {
      if (!checkNameIsExistInArray(item.name, req_header)) {
        // item.abled = true;
        item = {
          ...item,
          abled: true
        };
        req_header.push(item);
      }
    });
    return req_header;
  };

  handleColdata = (rows, currColEnvObj = {}) => {
    let that = this;
    let newRows = produce(rows, draftRows => {
      draftRows.map(item => {
        item.id = item._id;
        item._test_status = item.test_status;
        if(currColEnvObj[item.source_project_id || item.project_id]){
          item.case_env =currColEnvObj[item.source_project_id || item.project_id];
        }
        item.req_headers = that.handleReqHeader(item.source_project_id || item.project_id, item.req_headers, item.case_env);
        return item;
      });
    });
    this.setState({ rows: newRows });
  };

  componentWillUnmount() {
    this.latestOrderSave = null;
    this.activeCollectionLoad = null;
    this.activeRun = null;
  }

  executeTests = async () => {
    if (this.activeRun || !this.isCurrentCollectionLoaded()) return;
    const run = { colId: this.props.currColId };
    this.activeRun = run;
    this.reports = {};
    this.records = {};
    this.setState({ running: true });
    const rows = this.state.rows.map(row => ({ ...row, test_status: undefined }));
    this.setState({ rows });
    try {
    for (let i = 0, l = rows.length, curitem; i < l; i++) {
      if (this.activeRun !== run) return;

      let envItem = _.find(this.props.envList, item => {
        return item._id === (rows[i].source_project_id || rows[i].project_id);
      });

      curitem = Object.assign(
        {},
        rows[i],
        {
          env: envItem ? envItem.env : [],
          runColId: run.colId,
          runToken: run,
          pre_script: this.props.currProject.pre_script,
          after_script: this.props.currProject.after_script
        },
        { test_status: 'loading' }
      );
      const loadingRow = curitem;
      const caseId = curitem._id;
      this.setState(state => ({ rows: state.rows.map(row => row._id === caseId ? loadingRow : row) }));
      let status = 'error',
        result;
      try {
        result = await this.handleTest(curitem);

        if (result.code === 400) {
          status = 'error';
        } else if (result.code === 0) {
          status = 'ok';
        } else if (result.code === 1) {
          status = 'invalid';
        }
      } catch (e) {
        console.error(e);
        status = 'error';
        result = e && e.code === 'MISSING_CASE_OUTPUT'
          ? { code: 400, msg: e.message, validRes: [{ message: e.message }], caseId: curitem._id }
          : e;
      }

      if (this.activeRun !== run) return;
      //result.body = result.data;
      this.reports[curitem._id] = result;
      this.records[curitem._id] = {
        status: result.status,
        params: result.params,
        body: result.res_body
      };

      // React 19 batches Promise continuations. Updating from the pre-request
      // rows snapshot would restore completed earlier rows to "loading".
      this.setState(state => ({ rows: state.rows.map(row => row._id === caseId ? { ...row, test_status: status } : row) }));
    }
    const saved = await axios.post('/api/col/up_col', {
      col_id: run.colId,
      test_report: JSON.stringify(this.reports)
    });
    if (this.activeRun === run && saved.data.errcode !== 0) message.error(saved.data.errmsg || '保存测试报告失败');
    } catch (_) {
      if (this.activeRun === run) message.error('保存测试报告失败，请重试');
    } finally {
      if (this.activeRun === run) {
        this.activeRun = null;
        this.setState({ running: false });
      }
    }
  };

  handleTest = async interfaceData => {
    let requestParams = {};
    let options = handleParams(interfaceData, this.handleValue, requestParams);

    let result = {
      code: 400,
      msg: '数据异常',
      validRes: []
    };

    await plugin.emitHook('before_col_request', Object.assign({}, options, {
      type: 'col',
      caseId: options.caseId,
      projectId: interfaceData.project_id,
      interfaceId: interfaceData.interface_id
    }));

    try {
      let data = await crossRequest(
        options,
        interfaceData.pre_script,
        interfaceData.after_script,
        createContext(this.props.curUid, this.props.match.params.id, interfaceData.interface_id, {
          caseId: interfaceData._id,
          colId: interfaceData.runColId || this.props.currColId,
          requestMode: this.state.requestMode
        })
      );
      if (interfaceData.runToken && this.activeRun !== interfaceData.runToken) return { code: 400, msg: '测试已取消' };
      options.taskId = this.props.curUid;
      let res = (data.res.body = json_parse(data.res.body));
      result = {
        ...options,
        ...result,
        res_header: data.res.header,
        res_body: res,
        status: data.res.status,
        statusText: data.res.statusText
      };

      await plugin.emitHook('after_col_request', result, {
        type: 'col',
        caseId: options.caseId,
        projectId: interfaceData.project_id,
        interfaceId: interfaceData.interface_id
      });

      if (options.data && typeof options.data === 'object') {
        requestParams = {
          ...requestParams,
          ...options.data
        };
      }

      let validRes = [];

      let responseData = Object.assign(
        {},
        {
          status: data.res.status,
          body: res,
          header: data.res.header,
          statusText: data.res.statusText
        }
      );

      // 断言测试
      await this.handleScriptTest(interfaceData, responseData, validRes, requestParams);

      if (validRes.length === 0) {
        result.code = 0;
        result.validRes = [
          {
            message: '验证通过'
          }
        ];
      } else if (validRes.length > 0) {
        result.code = 1;
        result.validRes = validRes;
      }
    } catch (data) {
      result = {
        ...options,
        ...result,
        res_header: data.header,
        res_body: data.body || data.message,
        status: 0,
        statusText: data.message,
        code: 400,
        validRes: [
          {
            message: data.message
          }
        ]
      };
    }

    result.params = requestParams;
    return result;
  };

  //response, validRes
  // 断言测试
  handleScriptTest = async (interfaceData, response, validRes, requestParams) => {
    // 是否启动断言
    try {
      let test = await axios.post('/api/col/run_script', {
        response: response,
        records: this.records,
        script: interfaceData.enable_script ? interfaceData.test_script : '',
        params: requestParams,
        case_id: interfaceData._id,
        col_id: interfaceData.runColId || this.props.currColId,
        interface_id: interfaceData.interface_id
      });
      if (test.data.errcode !== 0) {
        const logs = test.data.data && Array.isArray(test.data.data.logs)
          ? test.data.data.logs : [test.data.errmsg || '验证请求失败'];
        logs.forEach(item => {
          validRes.push({ message: item });
        });
      }
    } catch (err) {
      validRes.push({
        message: 'Error: ' + err.message
      });
    }
  };

  handleValue = (val, global) => {
    let globalValue = ArrayToObject(global);
    let context = Object.assign({}, { global: globalValue }, this.records);
    return handleParamsValue(val, context);
  };

  handleRequestModeChange = checked => {
    const requestMode = checked ? REQUEST_MODE.SERVER : REQUEST_MODE.BROWSER;
    setRequestMode(requestMode);
    this.setState({ requestMode });
  };

  arrToObj = (arr, requestParams) => {
    arr = arr || [];
    const obj = {};
    arr.forEach(item => {
      if (item.name && item.enable && item.type !== 'file') {
        obj[item.name] = this.handleValue(item.value);
        if (requestParams) {
          requestParams[item.name] = obj[item.name];
        }
      }
    });
    return obj;
  };

  onRow(row) {
    return { rowId: row.id, onMove: this.onMoveRow, onDrop: this.onDrop };
  }

  onDrop = () => {
    const changes = this.state.rows.map((item, index) => ({ id: item._id, index }));
    const projectId = this.props.match.params.id;
    const colId = this.props.currColId;
    const save = {};
    this.latestOrderSave = save;
    // Keep snapshots in user-action order, even when a previous response is slow.
    this.orderSave = (this.orderSave || Promise.resolve()).catch(() => {}).then(async () => {
      const res = await axios.post('/api/col/up_case_index', changes);
      if (res.data.errcode !== 0) throw new Error(res.data.errmsg || '保存排序失败');
      if (this.latestOrderSave === save && this.props.currColId === colId) {
        await this.props.fetchInterfaceColList(projectId);
      }
    }).catch(error => {
      if (this.latestOrderSave === save && this.props.currColId === colId) {
        message.error(error.message || '保存排序失败，请重试');
      }
    });
    return this.orderSave;
  };
  onMoveRow({ sourceRowId, targetRowId }) {
    const rows = [...this.state.rows];
    const source = rows.findIndex(row => row.id === sourceRowId);
    const target = rows.findIndex(row => row.id === targetRowId);
    if (source < 0 || target < 0 || source === target) return;
    rows.splice(target, 0, rows.splice(source, 1)[0]);

    if (rows) {
      this.setState({ rows });
    }
  }

  onChangeTest = d => {
    
    this.setState({
      commonSetting: {
        ...this.state.commonSetting,
        checkScript: {
          ...this.state.commonSetting.checkScript,
          content: d.text
        }
      }
    });
  };

  onChangeScriptEnable = enable => {
    this.setState({ commonSetting: {
      ...this.state.commonSetting,
      checkScript: { ...this.state.commonSetting.checkScript, enable }
    } });
  };

  handleInsertCode = code => {
    this.aceEditor.editor.insertCode(code);
  };

  async componentWillReceiveProps(nextProps) {
    let newColId = !isNaN(nextProps.match.params.actionId) ? +nextProps.match.params.actionId : 0;

    if (newColId && ((this.currColId && newColId !== this.currColId) || nextProps.isRander)) {
      this.currColId = newColId;
      this.handleColIdChange(newColId)
    }
  }

  // 测试用例环境面板折叠
  changeCollapseClose = key => {
    if (key) {
      this.setState({
        collapseKey: key
      });
    } else {
      this.setState({
        collapseKey: '1',
        currColEnvObj: {}
      });
    }
  };

  openReport = id => {
    if (!this.reports[id]) {
      return message.warn('还没有生成报告');
    }
    this.setState({ visible: true, curCaseid: id });
  };

  openAdv = id => {
    let findCase = _.find(this.props.currCaseList, item => item.id === id);

    this.setState({
      enableScript: findCase.enable_script,
      curScript: findCase.test_script,
      advVisible: true,
      curCaseid: id
    });
  };

  handleScriptChange = d => {
    this.setState({ curScript: d.text });
  };

  handleAdvCancel = () => {
    this.setState({ advVisible: false });
  };

  handleAdvOk = async () => {
    const { curCaseid, enableScript, curScript } = this.state;
    const res = await axios.post('/api/col/up_case', {
      id: curCaseid,
      test_script: curScript,
      enable_script: enableScript
    });
    if (res.data.errcode === 0) {
      message.success('更新成功');
    }
    this.setState({ advVisible: false });
    let currColId = this.currColId;
    this.props.setColData({
      currColId: +currColId,
      isShowCol: true,
      isRander: false
    });
    await this.props.fetchCaseList(currColId);

    this.handleColdata(this.props.currCaseList);
  };

  handleCancel = () => {
    this.setState({ visible: false });
  };

  currProjectEnvChange = (envName, project_id) => {
    let currColEnvObj = {
      ...this.state.currColEnvObj,
      [project_id]: envName
    };
    this.setState({ currColEnvObj });
   // this.handleColdata(this.props.currCaseList, envName, project_id);
   this.handleColdata(this.props.currCaseList,currColEnvObj);
  };

  autoTests = () => {
    this.setState({ autoVisible: true, currColEnvObj: {}, collapseKey: '' });
  };

  handleAuto = () => {
    this.setState({
      autoVisible: false,
      email: false,
      download: false,
      mode: 'html',
      currColEnvObj: {},
      collapseKey: ''
    });
  };

  copyUrl = url => {
    copy(url);
    message.success('已经成功复制到剪切板');
  };

  modeChange = mode => {
    this.setState({ mode });
  };

  emailChange = email => {
    this.setState({ email });
  };

  downloadChange = download => {
    this.setState({ download });
  };

  handleColEnvObj = envObj => {
    let str = '';
    for (let key in envObj) {
      str += envObj[key] ? `&env_${key}=${envObj[key]}` : '';
    }
    return str;
  };

  ruleSettings = data => ({
    checkHttpCodeIs200: Boolean(data.checkHttpCodeIs200),
    checkResponseSchema: Boolean(data.checkResponseSchema),
    checkResponseField: { name: 'code', value: '0', enable: false, ...data.checkResponseField },
    checkScript: { enable: false, content: '', ...data.checkScript }
  });

  handleCommonSetting = async () => {
    if (this.savingCommonSetting) return;
    const identity = this.commonSettingIdentity;
    const colId = identity && identity.colId;
    if (!identity || !this.isCurrentCommonSetting(identity)) return;
    const setting = this.ruleSettings(this.state.commonSetting);
    this.savingCommonSetting = true;
    this.setState({ commonSettingSaving: true });
    try {
      const res = await axios.post('/api/col/up_col', { col_id: colId, ...setting });
      if (!this.isCurrentCommonSetting(identity)) return;
      if (res.data.errcode !== 0) return message.error(res.data.errmsg || '保存通用规则失败');
      this.savedCommonSetting = this.ruleSettings(setting);
      this.setState({ commonSettingModalVisible: false });
      message.success('配置测试集成功');
    } catch (_) {
      if (this.isCurrentCommonSetting(identity)) message.error('保存通用规则失败，请重试');
    } finally {
      this.savingCommonSetting = false;
      this.setState({ commonSettingSaving: false });
    }
  };

  isCurrentCommonSetting = identity => Boolean(identity &&
    this.commonSettingIdentity === identity &&
    Number(this.props.currColId) === identity.colId &&
    Number(this.props.match.params.actionId || this.props.currColId) === identity.colId &&
    this.loadedCollectionId === identity.colId);

  cancelCommonSetting = () => {
    if (this.savingCommonSetting) return;
    this.commonSettingIdentity = null;
    this.setState({ commonSettingModalVisible: false,
      commonSetting: this.ruleSettings(this.savedCommonSetting || this.state.commonSetting) });
  };

  openCommonSetting = () => {
    const colId = Number(this.props.currColId);
    if (!this.isCurrentCollectionLoaded() || this.loadedCollectionId !== colId ||
      Number(this.props.match.params.actionId || colId) !== colId) return;
    this.commonSettingIdentity = { colId };
    this.setState({ commonSettingModalVisible: true,
      commonSetting: this.ruleSettings(this.savedCommonSetting || this.state.commonSetting) });
  };

  changeCommonFieldSetting = (key)=>{
    return (e)=>{
      let value = e;
      if(typeof e === 'object' && e){
        value = e.target.value;
      }
      let {checkResponseField} = this.state.commonSetting;
      this.setState({
        commonSetting: {
          ...this.state.commonSetting,
          checkResponseField: {
            ...checkResponseField,
            [key]: value
          }
        }
      })
    }
  }
  
  render() {
    const currProjectId = this.props.currProject._id;
    const canReorder = ['admin', 'owner', 'dev'].includes(this.props.curProjectRole);
    const columns = [
      {
        property: 'casename',
        header: {
          label: '用例名称'
        },
        props: {
          style: {
            width: '250px'
          }
        },
        cell: {
          formatters: [
            (text, { rowData }) => {
              let record = rowData;
              return (
                <Link to={'/project/' + currProjectId + '/interface/case/' + record._id}>
                  {record.casename.length > 23
                    ? record.casename.substr(0, 20) + '...'
                    : record.casename}
                </Link>
              );
            }
          ]
        }
      },
      {
        header: {
          label: 'key',
          formatters: [
            () => {
              return (
                <Tooltip
                  title={
                    <span>
                      {' '}
                      每个用例都有唯一的key，用于获取所匹配接口的响应数据，例如使用{' '}
                      <a
                        href="https://hellosean1025.github.io/yapi/documents/case.html#%E7%AC%AC%E4%BA%8C%E6%AD%A5%EF%BC%8C%E7%BC%96%E8%BE%91%E6%B5%8B%E8%AF%95%E7%94%A8%E4%BE%8B"
                        className="link-tooltip"
                        target="blank"
                      >
                        {' '}
                        变量参数{' '}
                      </a>{' '}
                      功能{' '}
                    </span>
                  }
                >
                  Key
                </Tooltip>
              );
            }
          ]
        },
        props: {
          style: {
            width: '100px'
          }
        },
        cell: {
          formatters: [
            (value, { rowData }) => {
              return <span>{rowData._id}</span>;
            }
          ]
        }
      },
      {
        property: 'test_status',
        header: {
          label: '状态'
        },
        props: {
          style: {
            width: '100px'
          }
        },
        cell: {
          formatters: [
            (value, { rowData }) => {
              let id = rowData._id;
              let code = this.reports[id] ? this.reports[id].code : 0;
              if (rowData.test_status === 'loading') {
                return (
                  <div>
                    <Spin />
                  </div>
                );
              }

              switch (code) {
                case 0:
                  return (
                    <div>
                      <Tooltip title="Pass">
                        <Icon
                          style={{
                            color: '#00a854'
                          }}
                          type="check-circle"
                        />
                      </Tooltip>
                    </div>
                  );
                case 400:
                  return (
                    <div>
                      <Tooltip title="请求异常">
                        <Icon
                          type="info-circle"
                          style={{
                            color: '#f04134'
                          }}
                        />
                      </Tooltip>
                    </div>
                  );
                case 1:
                  return (
                    <div>
                      <Tooltip title="验证失败">
                        <Icon
                          type="exclamation-circle"
                          style={{
                            color: '#ffbf00'
                          }}
                        />
                      </Tooltip>
                    </div>
                  );
                default:
                  return (
                    <div>
                      <Icon
                        style={{
                          color: '#00a854'
                        }}
                        type="check-circle"
                      />
                    </div>
                  );
              }
            }
          ]
        }
      },
      {
        property: 'path',
        header: {
          label: '接口路径'
        },
        cell: {
          formatters: [
            (text, { rowData }) => {
              let record = rowData;
              return (
                <Tooltip title="跳转到对应接口">
                  <Link to={`/project/${record.source_project_id || record.project_id}/interface/api/${record.interface_id}`}>
                    {record.path.length > 23 ? record.path + '...' : record.path}
                  </Link>
                </Tooltip>
              );
            }
          ]
        }
      },
      {
        header: {
          label: '测试报告'
        },
        props: {
          style: {
            width: '200px'
          }
        },
        cell: {
          formatters: [
            (text, { rowData }) => {
              let reportFun = () => {
                if (!this.reports[rowData.id]) {
                  return null;
                }
                return <Button onClick={() => this.openReport(rowData.id)}>测试报告</Button>;
              };
              return <div className="interface-col-table-action">{reportFun()}</div>;
            }
          ]
        }
      }
    ];
    const { rows } = this.state;
    const localUrl =
      location.protocol +
      '//' +
      location.hostname +
      (location.port !== '' ? ':' + location.port : '');
    let currColEnvObj = this.handleColEnvObj(this.state.currColEnvObj);
    const autoTestsUrl = `/api/open/run_auto_test?id=${this.props.currColId}&token=${
      this.props.token
    }${currColEnvObj ? currColEnvObj : ''}&mode=${this.state.mode}&email=${
      this.state.email
    }&download=${this.state.download}`;

    let col_name = '';
    let col_desc = '';

    for (var i = 0; i < this.props.interfaceColList.length; i++) {
      if (this.props.interfaceColList[i]._id === this.props.currColId) {
        col_name = this.props.interfaceColList[i].name;
        col_desc = this.props.interfaceColList[i].desc;
        break;
      }
    }

    return (
      <div className="interface-col">
        <Modal
            title="通用规则配置"
            visible={this.state.commonSettingModalVisible}
            onOk={this.handleCommonSetting}
            confirmLoading={this.state.commonSettingSaving}
            closable={!this.state.commonSettingSaving}
            keyboard={!this.state.commonSettingSaving}
            maskClosable={false}
            onCancel={this.cancelCommonSetting}
            width={'1000px'}
            style={defaultModalStyle}
          >
          <div className="common-setting-modal">
            <Row className="setting-item">
              <Col className="col-item" span="4">
                <label>检查HttpCode:&nbsp;<Tooltip title={'检查 http code 是否为 200'}>
                  <Icon type="question-circle-o" style={{ width: '10px' }} />
                </Tooltip></label>
              </Col>
              <Col className="col-item"  span="18">
                <Switch onChange={e=>{
                  let {commonSetting} = this.state;
                  this.setState({
                    commonSetting :{
                      ...commonSetting,
                      checkHttpCodeIs200: e
                    }
                  })
                }} checked={this.state.commonSetting.checkHttpCodeIs200}  checkedChildren="开" unCheckedChildren="关" />
              </Col>
            </Row>

            <Row className="setting-item">
              <Col className="col-item"  span="4">
                <label>检查返回json:&nbsp;<Tooltip title={'检查接口返回数据字段值，比如检查 code 是不是等于 0'}>
                  <Icon type="question-circle-o" style={{ width: '10px' }} />
                </Tooltip></label>
              </Col>
              <Col  className="col-item" span="6">
                <Input value={this.state.commonSetting.checkResponseField.name} onChange={this.changeCommonFieldSetting('name')} placeholder="字段名"  />
              </Col>
              <Col  className="col-item" span="6">
                <Input  onChange={this.changeCommonFieldSetting('value')}  value={this.state.commonSetting.checkResponseField.value}   placeholder="值"  />
              </Col>
              <Col  className="col-item" span="6">
                <Switch  onChange={this.changeCommonFieldSetting('enable')}  checked={this.state.commonSetting.checkResponseField.enable}  checkedChildren="开" unCheckedChildren="关"  />
              </Col>
            </Row>

            <Row className="setting-item">
              <Col className="col-item" span="4">
                <label>检查返回数据结构:&nbsp;<Tooltip title={'只有 response 基于 json-schema 方式定义，该检查才会生效'}>
                  <Icon type="question-circle-o" style={{ width: '10px' }} />
                </Tooltip></label>
              </Col>
              <Col className="col-item"  span="18">
                <Switch onChange={e=>{
                  let {commonSetting} = this.state;
                  this.setState({
                    commonSetting :{
                      ...commonSetting,
                      checkResponseSchema: e
                    }
                  })
                }} checked={this.state.commonSetting.checkResponseSchema}  checkedChildren="开" unCheckedChildren="关" />
              </Col>
            </Row>

            <Row className="setting-item">
              <Col className="col-item  " span="4">
                <label>全局测试脚本:&nbsp;<Tooltip title={'在跑自动化测试时，优先调用全局脚本，只有全局脚本通过测试，才会开始跑case自定义的测试脚本'}>
                  <Icon type="question-circle-o" style={{ width: '10px' }} />
                </Tooltip></label>
              </Col>
              <Col className="col-item"  span="14">
                <div><Switch onChange={this.onChangeScriptEnable} checked={this.state.commonSetting.checkScript.enable}  checkedChildren="开" unCheckedChildren="关"  /></div>
                <AceEditor
                  onChange={this.onChangeTest}
                  className="case-script"
                  data={this.state.commonSetting.checkScript.content}
                  ref={aceEditor => {
                    this.aceEditor = aceEditor;
                  }}
                />
              </Col>
              <Col span="6">
                <div className="insert-code">
                  {InsertCodeMap.map(item => {
                    return (
                      <div
                        style={{ cursor: 'pointer' }}
                        className="code-item"
                        key={item.title}
                        onClick={() => {
                          this.handleInsertCode('\n' + item.code);
                        }}
                      >
                        {item.title}
                      </div>
                    );
                  })}
                </div>
              </Col>
            </Row>


          </div>
        </Modal>
        <Row type="flex" justify="center" align="top">
          <Col span={5}>
            <h2
              className="interface-title"
              style={{
                display: 'inline-block',
                margin: '8px 20px 16px 0px'
              }}
            >
              测试集合&nbsp;<a
                target="_blank"
                rel="noopener noreferrer"
                href="https://hellosean1025.github.io/yapi/documents/case.html"
              >
                <Tooltip title="点击查看文档">
                  <Icon type="question-circle-o" />
                </Tooltip>
              </a>
            </h2>
          </Col>
          <Col span={10}>
            <CaseEnv
              envList={this.props.envList}
              currProjectEnvChange={this.currProjectEnvChange}
              envValue={this.state.currColEnvObj}
              collapseKey={this.state.collapseKey}
              changeClose={this.changeCollapseClose}
            />
          </Col>
          <Col span={9}>
            <div
              style={{
                float: 'right',
                paddingTop: '8px'
              }}
            >
              <Tooltip
                title={
                  this.state.requestMode === REQUEST_MODE.SERVER
                    ? '开始测试时由 YApi 服务端代发请求'
                    : '开始测试时由浏览器直接发起请求，目标接口需要支持 CORS'
                }
              >
                <span style={{ marginRight: '12px', display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '8px' }}>请求方式</span>
                  <Switch
                    checked={this.state.requestMode === REQUEST_MODE.SERVER}
                    onChange={this.handleRequestModeChange}
                    checkedChildren="服务端"
                    unCheckedChildren="浏览器"
                  />
                </span>
              </Tooltip>
              {this.props.curProjectRole !== 'guest' && (
                <Tooltip title="在 YApi 服务端跑自动化测试时，请确保 YApi 服务器可以访问到目标测试环境 domain">
                  <Button
                    style={{
                      marginRight: '8px'
                    }}
                    onClick={this.autoTests}
                  >
                    服务端测试
                  </Button>
                </Tooltip>
              )}
              <Button onClick={this.openCommonSetting} disabled={!this.isCurrentCollectionLoaded()} style={{
                      marginRight: '8px'
                    }} >通用规则配置</Button>
              &nbsp;
              <Button type="primary" onClick={this.executeTests} loading={this.state.running} disabled={this.state.running || !this.isCurrentCollectionLoaded()}>
                开始测试
              </Button>
            </div>
          </Col>
        </Row>

        <div className="component-label-wrapper">
          <Label onChange={val => this.handleChangeInterfaceCol(val, col_name)} desc={col_desc} />
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead className="interface-col-table-header"><tr>
            {canReorder && <th scope="col" className="interface-col-order">排序</th>}
            {columns.map((column, index) => <th scope="col" key={index} {...column.props}>{column.header.formatters ? column.header.formatters[0](column.header.label) : column.header.label}</th>)}
          </tr></thead>
          <tbody className="interface-col-table-body">
            {rows.map((row, index) => <tr key={row.id} draggable={canReorder} onDragStart={() => { this.draggedRow = row.id; }} onDragOver={event => event.preventDefault()} onDrop={() => { if (!canReorder) return; this.onMoveRow({ sourceRowId: this.draggedRow, targetRowId: row.id }); this.setState({}, this.onDrop); }}>
              {canReorder && <td className="interface-col-order"><Button aria-label={`上移用例 ${row.casename}`} disabled={index === 0} onClick={() => { this.onMoveRow({ sourceRowId: row.id, targetRowId: rows[index - 1].id }); this.setState({}, this.onDrop); }} icon="arrow-up" /><Button aria-label={`下移用例 ${row.casename}`} disabled={index === rows.length - 1} onClick={() => { this.onMoveRow({ sourceRowId: row.id, targetRowId: rows[index + 1].id }); this.setState({}, this.onDrop); }} icon="arrow-down" /></td>}
              {columns.map((column, columnIndex) => <td key={columnIndex} {...column.props}>{column.cell.formatters[0](row[column.property], { rowData: row })}</td>)}
            </tr>)}
          </tbody>
        </table>
        <Modal
          title="测试报告"
          width="900px"
          style={{
            minHeight: '500px'
          }}
          visible={this.state.visible}
          onCancel={this.handleCancel}
          footer={null}
        >
          <CaseReport {...this.reports[this.state.curCaseid]} />
        </Modal>

        <Modal
          title="自定义测试脚本"
          width="660px"
          style={{
            minHeight: '500px'
          }}
          visible={this.state.advVisible}
          onCancel={this.handleAdvCancel}
          onOk={this.handleAdvOk}
          maskClosable={false}
        >
          <h3>
            是否开启:&nbsp;
            <Switch
              checked={this.state.enableScript}
              onChange={e => this.setState({ enableScript: e })}
            />
          </h3>
          <AceEditor
            className="case-script"
            data={this.state.curScript}
            onChange={this.handleScriptChange}
          />
        </Modal>
        {this.state.autoVisible && (
          <Modal
            title="服务端自动化测试"
            width="780px"
            style={{
              minHeight: '500px'
            }}
            visible={this.state.autoVisible}
            onCancel={this.handleAuto}
            className="autoTestsModal"
            footer={null}
          >
            <Row type="flex" justify="space-around" className="row" align="top">
              <Col span={3} className="label" style={{ paddingTop: '16px' }}>
                选择环境
                <Tooltip title="默认使用测试用例选择的环境">
                  <Icon type="question-circle-o" />
                </Tooltip>
                &nbsp;：
              </Col>
              <Col span={21}>
                <CaseEnv
                  envList={this.props.envList}
                  currProjectEnvChange={this.currProjectEnvChange}
                  envValue={this.state.currColEnvObj}
                  collapseKey={this.state.collapseKey}
                  changeClose={this.changeCollapseClose}
                />
              </Col>
            </Row>
            <Row type="flex" justify="space-around" className="row" align="middle">
              <Col span={3} className="label">
                输出格式：
              </Col>
              <Col span={21}>
                <Select value={this.state.mode} onChange={this.modeChange}>
                  <Option key="html" value="html">
                    html
                  </Option>
                  <Option key="json" value="json">
                    json
                  </Option>
                </Select>
              </Col>
            </Row>
            <Row type="flex" justify="space-around" className="row" align="middle">
              <Col span={3} className="label">
                消息通知
                <Tooltip title={'测试不通过时，会给项目组成员发送消息通知'}>
                  <Icon
                    type="question-circle-o"
                    style={{
                      width: '10px'
                    }}
                  />
                </Tooltip>
                &nbsp;：
              </Col>
              <Col span={21}>
                <Switch
                  checked={this.state.email}
                  checkedChildren="开"
                  unCheckedChildren="关"
                  onChange={this.emailChange}
                />
              </Col>
            </Row>
            <Row type="flex" justify="space-around" className="row" align="middle">
              <Col span={3} className="label">
                下载数据
                <Tooltip title={'开启后，测试数据将被下载到本地'}>
                  <Icon
                    type="question-circle-o"
                    style={{
                      width: '10px'
                    }}
                  />
                </Tooltip>
                &nbsp;：
              </Col>
              <Col span={21}>
                <Switch
                  checked={this.state.download}
                  checkedChildren="开"
                  unCheckedChildren="关"
                  onChange={this.downloadChange}
                />
              </Col>
            </Row>
            <Row type="flex" justify="space-around" className="row" align="middle">
              <Col span={21} className="autoTestUrl">
                <a 
                  target="_blank"
                  rel="noopener noreferrer"
                  href={localUrl + autoTestsUrl} >
                  {autoTestsUrl}
                </a>
              </Col>
              <Col span={3}>
                <Button className="copy-btn" onClick={() => this.copyUrl(localUrl + autoTestsUrl)}>
                  复制
                </Button>
              </Col>
            </Row>
            <div className="autoTestMsg">
              注：访问该URL，可以测试所有用例，请确保YApi服务器可以访问到环境配置的 domain
            </div>
          </Modal>
        )}
      </div>
    );
  }
}

export default InterfaceColContent;
