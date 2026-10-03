import React, { PureComponent as Component } from 'react';
import GroupList from './GroupList/GroupList.js';
import ProjectList from './ProjectList/ProjectList.js';
import MemberList from './MemberList/MemberList.js';
import GroupLog from './GroupLog/GroupLog.js';
import GroupSetting from './GroupSetting/GroupSetting.js';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Route, Switch, Redirect } from 'react-router-dom';
import { Tabs, Layout, Spin, Alert, Button } from 'antd';
import { resourceId, routeGroupId } from './navigation';
const { Content, Sider } = Layout;
const TabPane = Tabs.TabPane;
import { fetchNewsData } from '../../reducer/modules/news.js';
import './Group.scss';
import axios from 'axios'

export class Group extends Component {
  constructor(props) {
    super(props);

    this.state = { groupId: null, loading: !routeGroupId(props), loadError: '' };
  }

  componentDidMount() {
    this.mounted = true;
    if (!routeGroupId(this.props)) this.loadDefaultGroup();
  }

  componentDidUpdate(prevProps) {
    if (routeGroupId(prevProps) && !routeGroupId(this.props) && !this.state.groupId) {
      this.loadDefaultGroup();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  loadDefaultGroup = async () => {
    this.setState({ loading: true, loadError: '' });
    try {
      const response = await axios.get('/api/group/get_mygroup');
      if (!this.mounted) return;
      const body = response.data;
      if (!body || body.errcode) throw new Error((body && body.errmsg) || '个人空间加载失败');
      const id = resourceId(body.data && body.data._id);
      if (!id) throw new Error('个人空间加载失败');
      // Selecting the group belongs to the route, not this default-URL lookup.
      this.setState({ groupId: id, loading: false });
    } catch (error) {
      if (this.mounted) this.setState({ loading: false, loadError: error.message || '个人空间加载失败' });
    }
  };

  static propTypes = {
    fetchNewsData: PropTypes.func,
    curGroupId: PropTypes.number,
    curUserRole: PropTypes.string,
    currGroup: PropTypes.object,
    curUserRoleInGroup: PropTypes.string,
    match: PropTypes.object,
    location: PropTypes.object
  };
  // onTabClick=(key)=> {
  //   // if (key == 3) {
  //   //   this.props.fetchNewsData(this.props.curGroupId, "group", 1, 10)
  //   // }
  // }
  render() {
    const requested = routeGroupId(this.props);
    if (!requested && this.state.loading) return <Spin />;
    if (!requested && this.state.loadError) return <Alert type="error" message={this.state.loadError}
      action={<Button onClick={this.loadDefaultGroup}>重试</Button>} />;
    const groupReady = resourceId(requested) && resourceId(requested) === resourceId(this.props.currGroup._id);
    const GroupContent = (
      <Layout style={{ minHeight: 'calc(100vh - 100px)', marginLeft: '24px', marginTop: '24px' }}>
        <Sider style={{ height: '100%' }} width={300}>
          <div className="logo" />
          <GroupList />
        </Sider>
        <Layout>
          <Content
            style={{
              height: '100%',
              margin: '0 24px 0 16px',
              overflow: 'initial',
              backgroundColor: '#fff'
            }}
          >
            {groupReady ? <Tabs type="card" className="m-tab tabs-large" style={{ height: '100%' }}>
              <TabPane tab="项目列表" key="1">
                <ProjectList />
              </TabPane>
              {this.props.currGroup.type === 'public' ? (
                <TabPane tab="成员列表" key="2">
                  <MemberList />
                </TabPane>
              ) : null}
              {['admin', 'owner', 'guest', 'dev'].indexOf(this.props.curUserRoleInGroup) > -1 ||
              this.props.curUserRole === 'admin' ? (
                <TabPane tab="分组动态" key="3">
                  <GroupLog />
                </TabPane>
              ) : (
                ''
              )}
              {(this.props.curUserRole === 'admin' || this.props.curUserRoleInGroup === 'owner') &&
              this.props.currGroup.type !== 'private' ? (
                <TabPane tab="分组设置" key="4">
                  <GroupSetting />
                </TabPane>
              ) : null}
            </Tabs> : <Spin />}
          </Content>
        </Layout>
      </Layout>
    );
    return (
      <div className="projectGround">
        <Switch>
          {this.state.groupId && <Redirect exact from="/group" to={`/group/${this.state.groupId}`} />}
          <Route path="/group/:groupId" render={() => GroupContent} />
        </Switch>
      </div>
    );
  }
}

export default connect(
  state => {
    return {
      curGroupId: state.group.currGroup._id,
      curUserRole: state.user.role,
      curUserRoleInGroup: state.group.currGroup.role || state.group.role,
      currGroup: state.group.currGroup
    };
  },
  {
    fetchNewsData: fetchNewsData
  }
)(Group);
