import React, { Component } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import './index.scss';
import { Icon, Layout, Tooltip, message, Row, Popconfirm, Empty, Button } from 'antd';
const { Content, Sider } = Layout;
import ProjectEnvContent from './ProjectEnvContent.js';
import { connect } from 'react-redux';
import { updateEnv, getProject, getEnv } from '../../../../reducer/modules/project';
import EasyDragSort from '../../../../components/EasyDragSort/EasyDragSort.js';

@connect(
  state => {
    return {
      projectMsg: state.project.currProject
    };
  },
  {
    updateEnv,
    getProject,
    getEnv
  }
)
class ProjectEnv extends Component {
  static propTypes = {
    projectId: PropTypes.number,
    updateEnv: PropTypes.func,
    getProject: PropTypes.func,
    projectMsg: PropTypes.object,
    onOk: PropTypes.func,
    inline: PropTypes.bool,
    getEnv: PropTypes.func
  };

  constructor(props) {
    super(props);
    this.state = {
      env: [],
      canEdit: false,
      loadFailed: false,
      saving: false,
      savedPendingRefresh: false,
      _id: null,
      currentEnvMsg: {},
      delIcon: null,
      currentKey: -2
    };
  }

  initState(curdata, id) {
    let newValue = {};
    newValue['env'] = [].concat(curdata);
    newValue['_id'] = id;
    this.setState({
      ...this.state,
      ...newValue
    });
  }

  async componentWillMount() {
    this._isMounted = true;
    await this.loadLocalProject();
  }

  isInline = () => this.props.inline || typeof this.props.onOk === 'function';

  readLocalProject = async () => {
    const res = await axios.get('/api/project/get', { params: { id: this.props.projectId } });
    if (!res.data || res.data.errcode !== 0 || !res.data.data) {
      throw new Error('环境加载失败，请重试');
    }
    return res.data.data;
  };

  loadLocalProject = async () => {
    try {
      const project = await this.readLocalProject();
      if (!this._isMounted) return;
      const env = Array.isArray(project.env) ? project.env : [];
      this.initState(env, project._id);
      this.handleClick(env.length ? 0 : -1, env[0] || {});
      this.setState({ canEdit: ['admin', 'owner', 'dev'].includes(project.role), loadFailed: false });
    } catch (err) {
      if (this._isMounted) this.setState({ loadFailed: true });
      message.error('环境加载失败，请重试');
    }
  };

  canMutate = () => this.state.canEdit && !this.saving && !this.savedReceipt;

  componentWillUnmount() {
    this._isMounted = false;
  }

  handleClick = (key, data) => {
    this.setState({
      currentEnvMsg: data,
      currentKey: key
    });
  };

  // 增加环境变量项
  addParams = (name, data) => {
    if (!this.canMutate()) return;
    let newValue = {};
    data = { name: '新环境', domain: '', header: [] };
    newValue[name] = [].concat(data, this.state[name]);
    this.setState(newValue);
    this.handleClick(0, data);
  };

  // 删除提示信息
  showConfirm(key, name) {
    if (!this.canMutate()) return;
    let assignValue = this.delParams(key, name);
    this.onSave(assignValue);
  }

  // 删除环境变量项
  delParams = (key, name) => {
    let curValue = this.state.env;
    let newValue = {};
    newValue[name] = curValue.filter((val, index) => {
      return index !== key;
    });
    this.setState(newValue);
    this.handleClick(newValue[name].length ? 0 : -1, newValue[name][0] || {});
    newValue['_id'] = this.state._id;
    return newValue;
  };

  enterItem = key => {
    this.setState({ delIcon: key });
  };

  // 保存设置
  async onSave(assignValue, index) {
    if (!this.canMutate()) return false;
    this.saving = true;
    this.setState({ saving: true });
    try {
      const res = await this.props.updateEnv(assignValue);
      if (!res.payload || !res.payload.data || res.payload.data.errcode !== 0) {
        message.error('环境设置不成功，请重试');
        return false;
      }
      this.savedReceipt = { assignValue, index };
      if (this._isMounted) this.setState({ ...assignValue, savedPendingRefresh: true });
      return await this.refreshSaved();
    } catch (err) {
      message.error('环境设置不成功，请重试');
      return false;
    } finally {
      this.saving = false;
      if (this._isMounted) this.setState({ saving: false });
    }
  }

  refreshSaved = async () => {
    if (!this.savedReceipt || this.refreshing) return false;
    this.refreshing = true;
    try {
      const project = await this.readLocalProject();
      // Inline source projects must never replace the route project's Redux state.
      if (!this.isInline()) {
        for (const read of [this.props.getProject, this.props.getEnv]) {
          const res = await read(this.props.projectId);
          if (!res.payload || !res.payload.data || res.payload.data.errcode !== 0) {
            throw new Error('refresh failed');
          }
        }
      }
      if (!this._isMounted) return false;
      const { index } = this.savedReceipt;
      this.savedReceipt = null;
      const env = Array.isArray(project.env) ? project.env : [];
      this.setState({ env, savedPendingRefresh: false, canEdit: ['admin', 'owner', 'dev'].includes(project.role) });
      message.success('修改成功! ');
      if (this.props.onOk && Number.isInteger(index)) this.props.onOk(env, index);
      return true;
    } catch (err) {
      message.error('已保存，但加载失败，请重新加载');
      return false;
    } finally {
      this.refreshing = false;
    }
  };

  // Only confirmed persistence and refresh may close the inline editor.
  onSubmit = async (value, index) => {
    const assignValue = { env: [].concat(this.state.env), _id: this.state._id };
    assignValue.env.splice(index, 1, value.env);
    return await this.onSave(assignValue, index);
  };

  // 动态修改环境名称
  handleInputChange = (value, currentKey) => {
    if (!this.canMutate()) return;
    let newValue = [].concat(this.state.env);
    newValue[currentKey].name = value || '新环境';
    this.setState({ env: newValue });
  };

  // 侧边栏拖拽
  handleDragMove = name => {
    return (data, from, to) => {
      if (!this.canMutate()) return;
      let newValue = {
        [name]: data
      };
      this.setState(newValue);
      newValue['_id'] = this.state._id;
      this.handleClick(to, newValue[name][to]);
      this.onSave(newValue);
    };
  };

  render() {
    const { env, currentKey, canEdit, loadFailed, saving, savedPendingRefresh } = this.state;
    if (loadFailed) return <Button onClick={this.loadLocalProject}>重新加载环境</Button>;
    if (!canEdit) return <Empty description="没有源项目环境编辑权限" />;

    const envSettingItems = env.map((item, index) => {
      return (
        <Row
          key={index}
          className={'menu-item ' + (index === currentKey ? 'menu-item-checked' : '')}
          onClick={() => this.handleClick(index, item)}
          onMouseEnter={() => this.enterItem(index)}
        >
          <span className="env-icon-style">
            <span className="env-name" style={{ color: item.name === '新环境' && '#2395f1' }}>
              {item.name}
            </span>
            <Popconfirm
              title="您确认删除此环境变量?"
              onConfirm={e => {
                e.stopPropagation();
                this.showConfirm(index, 'env');
              }}
              okText="确定"
              cancelText="取消"
            >
              <Icon
                type="delete"
                className="interface-delete-icon"
                style={{
                  display: this.state.delIcon == index && env.length - 1 !== 0 ? 'block' : 'none'
                }}
              />
            </Popconfirm>
          </span>
        </Row>
      );
    });

    return (
      <div className="m-env-panel">
        {savedPendingRefresh && <div role="status">已保存，但加载尚未完成。
          <Button onClick={this.refreshSaved}>重新加载</Button>
        </div>}
        <Layout className="project-env">
          <Sider width={195} style={{ background: '#fff' }}>
            <div style={{ height: '100%', borderRight: 0 }}>
              <Row className="first-menu-item menu-item">
                <div className="env-icon-style">
                  <h3>
                    环境列表&nbsp;<Tooltip placement="top" title="在这里添加项目的环境配置">
                      <Icon type="question-circle-o" />
                    </Tooltip>
                  </h3>
                  <Tooltip title="添加环境变量">
                    <Icon type="plus" onClick={() => this.addParams('env')} />
                  </Tooltip>
                </div>
              </Row>
              <EasyDragSort data={() => env} onChange={this.handleDragMove('env')}>
                {envSettingItems}
              </EasyDragSort>
            </div>
          </Sider>
          <Layout className="env-content">
            <Content style={{ background: '#fff', padding: 24, margin: 0, minHeight: 280 }}>
              {currentKey < 0 ? (
                <Empty description="暂无环境配置">
                  <Button type="primary" onClick={() => this.addParams('env')}>添加环境</Button>
                </Empty>
              ) : <ProjectEnvContent
                disabled={saving || savedPendingRefresh}
                projectMsg={this.state.currentEnvMsg}
                onSubmit={e => this.onSubmit(e, currentKey)}
                handleEnvInput={e => this.handleInputChange(e, currentKey)}
              />}
            </Content>
          </Layout>
        </Layout>
      </div>
    );
  }
}

export default ProjectEnv;
