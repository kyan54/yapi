import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import InterfaceEditForm from './InterfaceEditForm.js';
import {
  updateInterfaceData,
  fetchInterfaceListMenu,
  fetchInterfaceData
} from '../../../../reducer/modules/interface.js';
import { getProject } from '../../../../reducer/modules/project.js';
import axios from 'axios';
import { message, Modal, Alert } from 'antd';
import './Edit.scss';
import { withRouter, Link } from 'react-router-dom';
import ProjectTag from '../../Setting/ProjectMessage/ProjectTag.js';

@connect(
  state => {
    return {
      curdata: state.inter.curdata,
      currProject: state.project.currProject
    };
  },
  {
    updateInterfaceData,
    fetchInterfaceListMenu,
    fetchInterfaceData,
    getProject
  }
)
class InterfaceEdit extends Component {
  static propTypes = {
    curdata: PropTypes.object,
    currProject: PropTypes.object,
    updateInterfaceData: PropTypes.func,
    fetchInterfaceListMenu: PropTypes.func,
    fetchInterfaceData: PropTypes.func,
    match: PropTypes.object,
    switchToView: PropTypes.func,
    getProject: PropTypes.func
  };

  constructor(props) {
    super(props);
    const { curdata, currProject } = this.props;
    this.state = {
      mockUrl:
        location.protocol +
        '//' +
        location.hostname +
        (location.port !== '' ? ':' + location.port : '') +
        `/mock/${currProject._id}${currProject.basepath}${curdata.path}`,
      curdata: {},
      status: 0,
      lockLost: false,
      collaborationWarning: '',
      initialError: '',
      visible: false
      // tag: []
    };
  }

  onSubmit = async params => {
    params.id = this.props.match.params.actionId;
    let result = await axios.post('/api/interface/up', params);
    this.props.fetchInterfaceListMenu(this.props.currProject._id).then();
    this.props.fetchInterfaceData(params.id).then();
    if (result.data.errcode === 0) {
      this.props.updateInterfaceData(params);
      message.success('保存成功');
    } else {
      message.error(result.data.errmsg);
    }
  };

  componentWillUnmount() {
    this.disposed = true;
    clearTimeout(this.editLoadTimer);
    try { if (this.WebSocket) this.WebSocket.close(); } catch (_) {}
  }

  componentDidMount() {
    const domain = location.hostname + (location.port !== '' ? ':' + location.port : '');
    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
    let initData = false;
    const failed = reason => {
      if (this.disposed) return;
      clearTimeout(this.editLoadTimer);
      this.setState(state => state.status === 1
        ? { lockLost: true, collaborationWarning: reason }
        : { status: 3, initialError: reason });
    };
    this.editLoadTimer = setTimeout(() => {
      if (!initData) failed('协作连接超时，无法确认编辑锁。请重新打开编辑页面。');
    }, 3000);
    try {
      const socket = new WebSocket(wsProtocol + '://' + domain +
        '/api/interface/solve_conflict?id=' + this.props.match.params.actionId);
      this.WebSocket = socket;
      socket.onmessage = event => {
        if (this.disposed) return;
        initData = true;
        clearTimeout(this.editLoadTimer);
        let result;
        try { result = JSON.parse(event.data); } catch (_) {
          failed('协作服务响应无效，请重新打开编辑页面。');
          return;
        }
        if (result.errno === 0 || result.readOnly === true) {
          this.setState({ curdata: result.data, status: 1, lockLost: false,
            collaborationWarning: result.readOnly ? result.errmsg : '' });
        } else if (result.errno === 423) {
          this.setState({ curdata: result.data, status: 2 });
        } else {
          failed(result.errmsg || '无法取得编辑锁，请重新打开编辑页面。');
        }
      };
      socket.onerror = () => failed('协作连接失败，无法确认编辑锁。请重新打开编辑页面。');
      socket.onclose = () => failed('协作连接已断开，编辑锁不可用。请重新打开编辑页面后再保存。');
    } catch (_) {
      failed('协作连接失败，无法确认编辑锁。请重新打开编辑页面。');
    }
  }

  onTagClick = () => {
    this.setState(state => ({
      visible: true,
      tagSession: (state.tagSession || 0) + 1
    }));
  };

  handleOk = async () => {
    let { tag } = this.tag.state;
    tag = tag.filter(val => {
      return val.name !== '';
    });

    let id = this.props.currProject._id;
    let params = {
      id,
      tag
    };
    let result = await axios.post('/api/project/up_tag', params);

    if (result.data.errcode === 0) {
      await this.props.getProject(id);
      message.success('保存成功');
      this.setState({ visible: false });
    } else {
      message.error(result.data.errmsg);
    }
  };

  handleCancel = () => {
    this.setState({
      visible: false
    });
  };

  tagSubmit = tagRef => {
    this.tag = tagRef;

    // this.setState({tag})
  };

  render() {
    const { cat, basepath, switch_notice, tag } = this.props.currProject;
    return (
      <div className="interface-edit">
        {this.state.collaborationWarning && <Alert type="warning" showIcon title={this.state.collaborationWarning} />}
        {this.state.status === 3 && <Alert type="error" showIcon title={this.state.initialError} />}
        {this.state.status === 1 ? (
          <InterfaceEditForm
            cat={cat}
            mockUrl={this.state.mockUrl}
            basepath={basepath}
            noticed={switch_notice}
            onSubmit={this.onSubmit}
            saveDisabled={this.state.lockLost}
            curdata={this.state.curdata}
            onTagClick={this.onTagClick}
          />
        ) : null}
        {this.state.status === 2 ? (
          <div style={{ textAlign: 'center', fontSize: '14px', paddingTop: '10px' }}>
            {this.state.curdata.uid ? <Link to={'/user/profile/' + this.state.curdata.uid}>
              <b>{this.state.curdata.username}</b>
            </Link> : <b>{this.state.curdata.username}</b>}
            <span>正在编辑该接口，请稍后再试...</span>
          </div>
        ) : null}
        {this.state.status === 0 && '正在加载，请耐心等待...'}

        <Modal
          title="Tag 设置"
          width={680}
          visible={this.state.visible}
          onOk={this.handleOk}
          onCancel={this.handleCancel}
          okText="保存"
        >
          <div className="tag-modal-center">
            {this.state.visible ? (
              <ProjectTag key={this.state.tagSession} tagMsg={(tag || []).map(item => ({ ...item }))} ref={this.tagSubmit} />
            ) : null}
          </div>
        </Modal>
      </div>
    );
  }
}

export default withRouter(InterfaceEdit);
