import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Route, Switch, Redirect, matchPath } from 'react-router-dom';
import { Subnav } from '../../components/index';
import { fetchGroupMsg } from '../../reducer/modules/group';
import { setBreadcrumb } from '../../reducer/modules/user';
import { getProject } from '../../reducer/modules/project';
import Interface from './Interface/Interface.js';
import Activity from './Activity/Activity.js';
import Setting from './Setting/Setting.js';
import Loading from '../../components/Loading/Loading';
import { Alert, Button } from 'antd';
import { actionData, resourceId } from '../Group/navigation';
import ProjectMember from './Setting/ProjectMember/ProjectMember.js';
import ProjectData from './Setting/ProjectData/ProjectData.js';
const plugin = require('client/plugin.js');
export class Project extends Component {
  static propTypes = {
    match: PropTypes.object,
    curProject: PropTypes.object,
    getProject: PropTypes.func,
    location: PropTypes.object,
    fetchGroupMsg: PropTypes.func,
    setBreadcrumb: PropTypes.func,
    currGroup: PropTypes.object
  };

  constructor(props) {
    super(props);
  }

  state = { loading: true, loadError: '' };
  requestVersion = 0;

  componentDidMount() {
    this.mounted = true;
    this.loadProject();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.match.params.id !== this.props.match.params.id) this.loadProject();
  }

  componentWillUnmount() {
    this.mounted = false;
    this.requestVersion++;
  }

  loadProject = async () => {
    const version = ++this.requestVersion;
    const id = resourceId(this.props.match.params.id);
    const isCurrent = () => this.mounted && version === this.requestVersion &&
      resourceId(this.props.match.params.id) === id;
    this.setState({ loading: true, loadError: '' });
    try {
      if (!id) throw new Error('无效的项目 ID');
      const project = actionData(await this.props.getProject(id, { isCurrent }));
      if (!isCurrent()) return;
      if (!project || resourceId(project._id) !== id || !resourceId(project.group_id)) {
        throw new Error('项目信息格式错误');
      }
      const group = actionData(await this.props.fetchGroupMsg(project.group_id, { isCurrent }));
      if (!isCurrent()) return;
      if (!group || resourceId(group._id) !== resourceId(project.group_id)) throw new Error('分组信息格式错误');
      this.props.setBreadcrumb([
        { name: group.group_name, href: `/group/${group._id}` },
        { name: project.name }
      ]);
      this.setState({ loading: false });
    } catch (error) {
      if (isCurrent()) this.setState({ loading: false, loadError: error.message || '项目加载失败' });
    }
  };

  render() {
    const { match, location } = this.props;
    if (this.state.loadError) return <Alert type="error" message={this.state.loadError}
      action={<Button onClick={this.loadProject}>重试</Button>} />;
    if (this.state.loading || resourceId(this.props.curProject && this.props.curProject._id) !== resourceId(match.params.id)) {
      return <Loading visible />;
    }
    let routers = {
      interface: { name: '接口', path: '/project/:id/interface/:action', component: Interface },
      activity: { name: '动态', path: '/project/:id/activity', component: Activity },
      data: { name: '数据管理', path: '/project/:id/data', component: ProjectData },
      members: { name: '成员管理', path: '/project/:id/members', component: ProjectMember },
      setting: { name: '设置', path: '/project/:id/setting', component: Setting }
    };

    plugin.emitHook('sub_nav', routers);

    let key, defaultName;
    for (key in routers) {
      if (
        matchPath(location.pathname, {
          path: routers[key].path
        }) !== null
      ) {
        defaultName = routers[key].name;
        break;
      }
    }

    // let subnavData = [{
    //   name: routers.interface.name,
    //   path: `/project/${match.params.id}/interface/api`
    // }, {
    //   name: routers.activity.name,
    //   path: `/project/${match.params.id}/activity`
    // }, {
    //   name: routers.data.name,
    //   path: `/project/${match.params.id}/data`
    // }, {
    //   name: routers.members.name,
    //   path: `/project/${match.params.id}/members`
    // }, {
    //   name: routers.setting.name,
    //   path: `/project/${match.params.id}/setting`
    // }];

    let subnavData = [];
    Object.keys(routers).forEach(key => {
      let item = routers[key];
      let value = {};
      if (key === 'interface') {
        value = {
          name: item.name,
          path: `/project/${match.params.id}/interface/api`
        };
      } else {
        value = {
          name: item.name,
          path: item.path.replace(/\:id/gi, match.params.id)
        };
      }
      subnavData.push(value);
    });

    if (this.props.currGroup.type === 'private') {
      subnavData = subnavData.filter(item => {
        return item.name != '成员管理';
      });
    }

    if (this.props.curProject == null || Object.keys(this.props.curProject).length === 0) {
      return <Loading visible />;
    }

    return (
      <div>
        <Subnav default={defaultName} data={subnavData} />
        <Switch>
          <Redirect exact from="/project/:id" to={`/project/${match.params.id}/interface/api`} />
          {/* <Route path={routers.activity.path} component={Activity} />
          
          <Route path={routers.setting.path} component={Setting} />
          {this.props.currGroup.type !== 'private' ?
            <Route path={routers.members.path} component={routers.members.component}/>
            : null
          }

          <Route path={routers.data.path} component={ProjectData} /> */}
          {Object.keys(routers).map(key => {
            let item = routers[key];

            return key === 'members' ? (
              this.props.currGroup.type !== 'private' ? (
                <Route path={item.path} component={item.component} key={key} />
              ) : null
            ) : (
              <Route path={item.path} component={item.component} key={key} />
            );
          })}
        </Switch>
      </div>
    );
  }
}

export default connect(
  state => {
    return {
      curProject: state.project.currProject,
      currGroup: state.group.currGroup
    };
  },
  {
    getProject,
    fetchGroupMsg,
    setBreadcrumb
  }
)(Project);
