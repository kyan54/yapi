import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Icon, Modal, Input, message, Spin, Alert, Button, Row, Menu, Col, Popover, Tooltip } from 'antd';
import { autobind } from 'core-decorators';
import axios from 'axios';
import { withRouter } from 'react-router-dom';
const { TextArea } = Input;
const Search = Input.Search;
import UsernameAutoComplete from '../../../components/UsernameAutoComplete/UsernameAutoComplete.js';
import GuideBtns from '../../../components/GuideBtns/GuideBtns.js';
import { fetchNewsData } from '../../../reducer/modules/news.js';
import {
  fetchGroupList,
  setCurrGroup
} from '../../../reducer/modules/group.js';
import { actionData, resourceId, routeGroupId } from '../navigation';

import './GroupList.scss';

const tip = (
  <div className="title-container">
    <h3 className="title">欢迎使用 YApi ~</h3>
    <p>
      这里的 <b>“个人空间”</b>{' '}
      是你自己才能看到的分组，你拥有这个分组的全部权限，可以在这个分组里探索 YApi 的功能。
    </p>
  </div>
);

export class GroupList extends Component {
  static propTypes = {
    groupList: PropTypes.array,
    currGroup: PropTypes.object,
    fetchGroupList: PropTypes.func,
    setCurrGroup: PropTypes.func,
    match: PropTypes.object,
    history: PropTypes.object,
    location: PropTypes.object,
    curUserRole: PropTypes.string,
    curUserRoleInGroup: PropTypes.string,
    studyTip: PropTypes.number,
    study: PropTypes.bool,
    fetchNewsData: PropTypes.func
  };

  state = {
    addGroupModalVisible: false,
    newGroupName: '',
    newGroupDesc: '',
    currGroupName: '',
    currGroupDesc: '',
    groupList: [],
    loading: true,
    loadError: '',
    owner_uids: []
  };

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    this.mounted = true;
    this.loadGroupList();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.groupList !== this.props.groupList) {
      this.groups = this.props.groupList;
      this.setState({ groupList: this.groups });
    }
    if (routeGroupId(prevProps) !== routeGroupId(this.props)) {
      this.pendingGroupId = null;
      this.selectRouteGroup();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.selectionVersion++;
  }

  selectionVersion = 0;
  listVersion = 0;
  groups = null;

  loadGroupList = async () => {
    const version = ++this.listVersion;
    this.setState({ loading: true, loadError: '' });
    try {
      const groups = actionData(await this.props.fetchGroupList());
      if (!this.mounted || version !== this.listVersion) return;
      if (!Array.isArray(groups)) throw new Error('分组列表格式错误');
      this.groups = groups;
      this.setState({ groupList: groups });
      await this.selectRouteGroup();
    } catch (error) {
      if (this.mounted && version === this.listVersion) {
        this.setState({ loading: false, loadError: error.message || '分组加载失败' });
      }
    }
  };

  selectRouteGroup = async () => {
    const version = ++this.selectionVersion;
    if (!this.groups) return;
    const requested = routeGroupId(this.props);
    const id = resourceId(requested);
    if (!requested) {
      const first = this.groups.find(group => resourceId(group._id));
      this.setState({ loading: false, loadError: '' });
      if (first) this.props.history.replace(`/group/${first._id}`);
      return;
    }
    if (!id) {
      this.setState({ loading: false, loadError: '无效的分组 ID' });
      return;
    }
    const isCurrent = () => this.mounted && version === this.selectionVersion &&
      resourceId(routeGroupId(this.props)) === id;
    this.setState({ loading: true, loadError: '' });
    try {
      // A direct URL is authoritative even if this group is absent from the list.
      const group = actionData(await this.props.setCurrGroup({ _id: id }, { isCurrent }));
      if (!isCurrent()) return;
      if (!group || resourceId(group._id) !== id) throw new Error('分组信息格式错误');
      this.setState({ loading: false });
    } catch (error) {
      if (isCurrent()) this.setState({ loading: false, loadError: error.message || '分组加载失败' });
    }
  };

  @autobind
  showModal() {
    this.setState({
      addGroupModalVisible: true
    });
  }
  @autobind
  hideModal() {
    this.setState({
      newGroupName: '',
      group_name: '',
      owner_uids: [],
      addGroupModalVisible: false
    });
  }
  @autobind
  async addGroup() {
    const { newGroupName: group_name, newGroupDesc: group_desc, owner_uids } = this.state;
    const res = await axios.post('/api/group/add', { group_name, group_desc, owner_uids });
    if (!this.mounted) return;
    if (!res.data.errcode) {
      this.setState({
        newGroupName: '',
        group_name: '',
        owner_uids: [],
        addGroupModalVisible: false
      });
      await this.loadGroupList();
      const id = resourceId(routeGroupId(this.props));
      if (this.mounted && id) this.props.fetchNewsData(id, 'group', 1, 10);
    } else {
      message.error(res.data.errmsg);
    }
  }
  @autobind
  async editGroup() {
    const { currGroupName: group_name, currGroupDesc: group_desc } = this.state;
    const id = this.props.currGroup._id;
    const res = await axios.post('/api/group/up', { group_name, group_desc, id });
    if (!this.mounted) return;
    if (res.data.errcode) {
      message.error(res.data.errmsg);
    } else {
      await this.loadGroupList();
      if (this.mounted && resourceId(routeGroupId(this.props)) === resourceId(id)) {
        this.props.fetchNewsData(id, 'group', 1, 10);
      }
    }
  }
  @autobind
  inputNewGroupName(e) {
    this.setState({ newGroupName: e.target.value });
  }
  @autobind
  inputNewGroupDesc(e) {
    this.setState({ newGroupDesc: e.target.value });
  }

  @autobind
  selectGroup(e) {
    const id = resourceId(e.key);
    if (!id || id === this.pendingGroupId || id === resourceId(routeGroupId(this.props))) return;
    if (!this.groups || !this.groups.some(group => resourceId(group._id) === id)) return;
    // Invalidate the old request immediately, including before the router commits.
    this.selectionVersion++;
    this.pendingGroupId = id;
    this.props.history.replace(`/group/${id}`);
    this.props.fetchNewsData(id, 'group', 1, 10);
  }

  @autobind
  onUserSelect(uids) {
    this.setState({
      owner_uids: uids
    });
  }

  @autobind
  searchGroup(e, value) {
    const v = value || e.target.value;
    const { groupList } = this.props;
    if (v === '') {
      this.setState({ groupList });
    } else {
      this.setState({
        groupList: groupList.filter(group => new RegExp(v, 'i').test(group.group_name))
      });
    }
  }


  render() {
    const { currGroup } = this.props;
    return (
      <div className="m-group">
        {!this.props.study ? <div className="study-mask" /> : null}
        <div className="group-bar">
          <div className="curr-group">
            <div className="curr-group-name">
              <span className="name">{currGroup.group_name}</span>
              <Tooltip title="添加分组">
                <a className="editSet">
                  <Icon className="btn" type="folder-add" onClick={this.showModal} />
                </a>
              </Tooltip>
            
            </div>
            <div className="curr-group-desc">简介: {currGroup.group_desc}</div>
          </div>

          <div className="group-operate">
            <div className="search">
              <Search
                placeholder="搜索分类"
                onChange={this.searchGroup}
                onSearch={v => this.searchGroup(null, v)}
              />
            </div>
          </div>
          {this.state.loadError && <Alert type="error" message={this.state.loadError}
            action={<Button onClick={this.loadGroupList}>重试</Button>} />}
          {!this.state.loading && !this.state.loadError && this.state.groupList.length === 0 &&
            <div role="status">暂无分组</div>}
          {this.state.loading && <Spin style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'center'
          }} />}
          <Menu
            className="group-list"
            mode="inline"
            onClick={this.selectGroup}
            selectedKeys={[`${currGroup._id}`]}
          >
            {this.state.groupList.map(group => {
              if (group.type === 'private') {
                return (
                  <Menu.Item
                    key={`${group._id}`}
                    className="group-item"
                    style={{ zIndex: this.props.studyTip === 0 ? 3 : 1 }}
                  >
                    <Icon type="user" />
                    <Popover
                      overlayClassName="popover-index"
                      content={<GuideBtns />}
                      title={tip}
                      placement="right"
                      visible={this.props.studyTip === 0 && !this.props.study}
                    >
                      {group.group_name}
                    </Popover>
                  </Menu.Item>
                );
              } else {
                return (
                  <Menu.Item key={`${group._id}`} className="group-item">
                    <Icon type="folder-open" />
                    {group.group_name}
                  </Menu.Item>
                );
              }
            })}
          </Menu>
        </div>
        {this.state.addGroupModalVisible ? (
          <Modal
            title="添加分组"
            visible={this.state.addGroupModalVisible}
            onOk={this.addGroup}
            onCancel={this.hideModal}
            className="add-group-modal"
          >
            <Row gutter={6} className="modal-input">
              <Col span="5">
                <div className="label">分组名：</div>
              </Col>
              <Col span="15">
                <Input placeholder="请输入分组名称" onChange={this.inputNewGroupName} />
              </Col>
            </Row>
            <Row gutter={6} className="modal-input">
              <Col span="5">
                <div className="label">简介：</div>
              </Col>
              <Col span="15">
                <TextArea rows={3} placeholder="请输入分组描述" onChange={this.inputNewGroupDesc} />
              </Col>
            </Row>
            <Row gutter={6} className="modal-input">
              <Col span="5">
                <div className="label">组长：</div>
              </Col>
              <Col span="15">
                <UsernameAutoComplete callbackState={this.onUserSelect} />
              </Col>
            </Row>
          </Modal>
        ) : (
          ''
        )}
      </div>
    );
  }
}

export default connect(
  state => ({
    groupList: state.group.groupList,
    currGroup: state.group.currGroup,
    curUserRole: state.user.role,
    curUserRoleInGroup: state.group.currGroup.role || state.group.role,
    studyTip: state.user.studyTip,
    study: state.user.study
  }),
  {
    fetchGroupList,
    setCurrGroup,
    fetchNewsData
  }
)(withRouter(GroupList));
