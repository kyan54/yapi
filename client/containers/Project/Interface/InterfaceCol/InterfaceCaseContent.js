import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { withRouter } from 'react-router';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { message, Tooltip, Input } from 'antd';
import {
  fetchInterfaceColList,
  setColData,
  fetchCaseData,
  fetchCaseList
} from '../../../../reducer/modules/interfaceCol';
import { Postman } from '../../../../components';

import './InterfaceCaseContent.scss';

@connect(
  state => {
    return {
      interfaceColList: state.interfaceCol.interfaceColList,
      currColId: state.interfaceCol.currColId,
      currCaseId: state.interfaceCol.currCaseId,
      currCase: state.interfaceCol.currCase,
      isShowCol: state.interfaceCol.isShowCol,
      currProject: state.project.currProject,
      curUid: state.user.uid
    };
  },
  {
    fetchInterfaceColList,
    fetchCaseData,
    setColData,
    fetchCaseList
  }
)
@withRouter
export default class InterfaceCaseContent extends Component {
  static propTypes = {
    match: PropTypes.object,
    interfaceColList: PropTypes.array,
    fetchInterfaceColList: PropTypes.func,
    fetchCaseData: PropTypes.func,
    setColData: PropTypes.func,
    fetchCaseList: PropTypes.func,
    history: PropTypes.object,
    currColId: PropTypes.number,
    currCaseId: PropTypes.number,
    currCase: PropTypes.object,
    isShowCol: PropTypes.bool,
    currProject: PropTypes.object,
    curUid: PropTypes.number
  };

  state = {
    isEditingCasename: true,
    editCasename: '',
    caseLoading: true,
    caseLoadError: '',
    loadedCaseId: null,
    caseEnv: []
  };

  constructor(props) {
    super(props);
  }

  getColId(colList, currCaseId) {
    let currColId = 0;
    colList.forEach(col => {
      col.caseList.forEach(caseItem => {
        if (+caseItem._id === +currCaseId) {
          currColId = col._id;
        }
      });
    });
    return currColId;
  }

  async componentWillMount() {
    const initial = {};
    this.initialLoad = initial;
    try {
      const result = await this.props.fetchInterfaceColList(this.props.match.params.id);
      if (this.initialLoad !== initial) return;
      const list = result.payload.data.data || [];
      const first = list.find(col => col.caseList && col.caseList.length);
      const caseId = +this.props.match.params.actionId || +this.props.currCaseId ||
        (first && first.caseList[0]._id);
      await this.loadCase(caseId, this.getColId(list, caseId));
    } catch (_) {
      if (this.initialLoad === initial) this.setState({ caseLoading: false, caseLoadError: '加载测试用例失败，请刷新重试' });
    }
  }

  componentWillReceiveProps(nextProps) {
    const oldCaseId = this.props.match.params.actionId;
    const newCaseId = nextProps.match.params.actionId;
    if (oldCaseId !== newCaseId) {
      this.initialLoad = null;
      this.loadCase(newCaseId, this.getColId(nextProps.interfaceColList, newCaseId));
    }
  }

  loadCase = async (caseId, currColId) => {
    const load = {};
    this.activeCaseLoad = load;
    this.activeCaseSave = null;
    this.setState({ caseLoading: true, caseLoadError: '', loadedCaseId: null, caseEnv: [] });
    this.props.setColData({ currCaseId: +caseId, currColId, isShowCol: false, currCase: {}, caseLoad: load });
    try {
      if (!caseId) throw new Error('不存在的case');
      const result = await this.props.fetchCaseData(caseId, load);
      if (this.activeCaseLoad !== load) return;
      const response = result.payload.data;
      const current = response.data;
      if (response.errcode !== 0 || !current || !current._id || !current.interface_id) {
        throw new Error(response.errmsg || '来源接口不存在');
      }
      const env = await axios.get('/api/project/get_env', {
        params: { project_id: current.source_project_id || current.project_id }
      });
      if (this.activeCaseLoad !== load) return;
      if (env.data.errcode !== 0) throw new Error(env.data.errmsg || '加载环境失败');
      this.setState({ caseLoading: false, loadedCaseId: +caseId, caseEnv: env.data.data.env || [], editCasename: current.casename });
    } catch (error) {
      if (this.activeCaseLoad !== load) return;
      this.setState({ caseLoading: false, caseLoadError: error.message || '加载测试用例失败，请刷新重试' });
    }
  };

  savePostmanRef = postman => {
    this.postman = postman;
  };

  componentWillUnmount() {
    this.initialLoad = null;
    this.activeCaseLoad = null;
    this.activeCaseSave = null;
  }

  updateCase = async () => {
    if (this.activeCaseSave) return;
    const {
      case_env,
      req_params,
      req_query,
      req_headers,
      req_body_type,
      req_body_form,
      req_body_other,
      test_script,
      enable_script,
      test_res_body,
      test_res_header
    } = this.postman.state;

    const { editCasename: casename } = this.state;
    const { _id: id } = this.props.currCase;
    let params = {
      id,
      casename,
      case_env,
      req_params,
      req_query,
      req_headers,
      req_body_type,
      req_body_form,
      req_body_other,
      test_script,
      enable_script,
      test_res_body,
      test_res_header
    };

    const save = { id };
    this.activeCaseSave = save;
    const isCurrent = () => this.activeCaseSave === save &&
      this.props.currCase._id === id &&
      (!this.props.match.params.actionId || +this.props.match.params.actionId === id);
    try {
      const res = await axios.post('/api/col/up_case', params);
      if (!isCurrent()) return;
      if (res.data.errcode !== 0) {
        message.error(res.data.errmsg || '更新失败，请重试');
        return;
      }
      if (this.props.currCase.casename !== casename) {
        this.props.fetchInterfaceColList(this.props.match.params.id);
      }
      message.success('更新成功');
      this.props.fetchCaseData(id);
    } catch (_) {
      if (isCurrent()) message.error('更新失败，请重试');
    } finally {
      if (this.activeCaseSave === save) this.activeCaseSave = null;
    }
  };

  triggerEditCasename = () => {
    this.setState({
      isEditingCasename: true,
      editCasename: this.props.currCase.casename
    });
  };
  cancelEditCasename = () => {
    this.setState({
      isEditingCasename: false,
      editCasename: this.props.currCase.casename
    });
  };

  render() {
    const { currCase, currProject } = this.props;
    const { isEditingCasename, editCasename } = this.state;

    if (this.state.caseLoading) return <div className="case-content">正在加载测试用例…</div>;
    if (this.state.caseLoadError) return <div className="case-content" role="alert">{this.state.caseLoadError}</div>;
    if (+currCase._id !== this.state.loadedCaseId) return null;

    const data = Object.assign(
      {},
      currCase,
      {
        env: this.state.caseEnv,
        pre_script: currProject.pre_script,
        after_script: currProject.after_script
      },
      { _id: currCase._id }
    );

    return (
      <div style={{ padding: '6px 0' }} className="case-content">
        <div className="case-title">
          {!isEditingCasename && (
            <Tooltip title="点击编辑" placement="bottom">
              <div className="case-name" onClick={this.triggerEditCasename}>
                {currCase.casename}
              </div>
            </Tooltip>
          )}

          {isEditingCasename && (
            <div className="edit-case-name">
              <Input
                value={editCasename}
                onChange={e => this.setState({ editCasename: e.target.value })}
                style={{ fontSize: 18 }}
              />
            </div>
          )}
          <span className="inter-link" style={{ margin: '0px 8px 0px 6px', fontSize: 12 }}>
            <Link
              className="text"
              to={`/project/${currCase.source_project_id || currCase.project_id}/interface/api/${currCase.interface_id}`}
            >
              对应接口
            </Link>
          </span>
        </div>
        <div>
          {Object.keys(currCase).length > 0 && (
            <Postman
              data={data}
              type="case"
              saveTip="更新保存修改"
              save={this.updateCase}
              ref={this.savePostmanRef}
              interfaceId={currCase.interface_id}
              projectId={currCase.project_id}
              curUid={this.props.curUid}
            />
          )}
        </div>
      </div>
    );
  }
}
