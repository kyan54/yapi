import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Input, Button, message, Icon, Card, Alert, Modal, Switch, Row, Col, Tooltip } from 'antd';
import { fetchNewsData } from '../../../reducer/modules/news.js';
import {
  changeGroupMsg,
  fetchGroupList,
  fetchGroupMsg,
  deleteGroup
} from '../../../reducer/modules/group.js';
const { TextArea } = Input;
import { trim } from '../../../common.js';
import { withRouter } from 'react-router-dom';
import { actionData, resourceId, routeGroupId } from '../navigation';
import './GroupSetting.scss';
const confirm = Modal.confirm;

export class GroupSetting extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currGroupDesc: '',
      currGroupName: '',
      showDangerOptions: false,
      custom_field1_name: '',
      custom_field1_enable: false,
      custom_field1_rule: false,
      loadError: ''
    };
  }

  static propTypes = {
    currGroup: PropTypes.object,
    curUserRole: PropTypes.string,
    changeGroupMsg: PropTypes.func,
    fetchGroupList: PropTypes.func,
    fetchGroupMsg: PropTypes.func,
    fetchNewsData: PropTypes.func,
    deleteGroup: PropTypes.func,
    groupList: PropTypes.array,
    location: PropTypes.object,
    history: PropTypes.object,
    match: PropTypes.object
  };

  initState(props) {
    const customField = props.currGroup.custom_field1 || {};
    this.setState({
      currGroupName: props.currGroup.group_name,
      currGroupDesc: props.currGroup.group_desc,
      custom_field1_name: customField.name,
      custom_field1_enable: customField.enable
    });
  }

  // 修改分组名称
  changeName = e => {
    this.setState({
      currGroupName: e.target.value
    });
  };
  // 修改分组描述
  changeDesc = e => {
    this.setState({
      currGroupDesc: e.target.value
    });
  };

  // 修改自定义字段名称
  changeCustomName = e => {
    let custom_field1_rule = this.state.custom_field1_enable ? !e.target.value : false;
    this.setState({
      custom_field1_name: e.target.value,
      custom_field1_rule
    });
  };

  // 修改开启状态
  changeCustomEnable = e => {
    let custom_field1_rule = e ? !this.state.custom_field1_name : false;
    this.setState({
      custom_field1_enable: e,
      custom_field1_rule
    });
  };

  componentDidMount() {
    this.mounted = true;
    this.initState(this.props);
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  isCurrentGroup(id) {
    return this.mounted && resourceId(routeGroupId(this.props)) === resourceId(id);
  }

  // 点击“查看危险操作”按钮
  toggleDangerOptions = () => {
    // console.log(this.state.showDangerOptions);
    this.setState({
      showDangerOptions: !this.state.showDangerOptions
    });
  };

  // 编辑分组信息
  editGroup = async () => {
    const id = this.props.currGroup._id;
    if (this.state.custom_field1_rule) {
      return;
    }
    this.setState({ loadError: '' });
    try {
      actionData(await this.props.changeGroupMsg({
        group_name: this.state.currGroupName,
        group_desc: this.state.currGroupDesc,
        custom_field1: {
          name: this.state.custom_field1_name,
          enable: this.state.custom_field1_enable
        },
        id
      }));
      if (!this.isCurrentGroup(id)) return;
      const groups = actionData(await this.props.fetchGroupList());
      if (!this.isCurrentGroup(id)) return;
      if (!Array.isArray(groups)) throw new Error('分组列表格式错误');
      actionData(await this.props.fetchGroupMsg(id, { isCurrent: () => this.isCurrentGroup(id) }));
      if (!this.isCurrentGroup(id)) return;
      message.success('修改成功！');
      this.props.fetchNewsData(id, 'group', 1, 10);
    } catch (error) {
      if (this.isCurrentGroup(id)) this.setState({ loadError: error.message || '分组保存失败' });
    }
  };

  // 删除后由新路由选择分组，不读取尚未提交的 Redux props。
  deleteGroup = async () => {
    const id = this.props.currGroup._id;
    this.setState({ loadError: '' });
    try {
      actionData(await this.props.deleteGroup({ id }));
      if (!this.isCurrentGroup(id)) return;
      const groups = actionData(await this.props.fetchGroupList());
      if (!this.isCurrentGroup(id)) return;
      if (!Array.isArray(groups)) throw new Error('分组列表格式错误');
      const next = groups.find(group => resourceId(group._id) && resourceId(group._id) !== resourceId(id));
      message.success('删除成功');
      this.props.history.replace(next ? `/group/${next._id}` : '/group');
    } catch (error) {
      if (this.isCurrentGroup(id)) this.setState({ loadError: error.message || '分组删除失败' });
    }
  };

  // 删除分组的二次确认
  showConfirm = () => {
    const that = this;
    confirm({
      title: '确认删除 ' + that.props.currGroup.group_name + ' 分组吗？',
      content: (
        <div style={{ marginTop: '10px', fontSize: '13px', lineHeight: '25px' }}>
          <Alert
            message="警告：此操作非常危险,会删除该分组下面所有项目和接口，并且无法恢复!"
            type="warning"
          />
          <div style={{ marginTop: '16px' }}>
            <p>
              <b>请输入分组名称确认此操作:</b>
            </p>
            <Input id="group_name" />
          </div>
        </div>
      ),
      onOk() {
        const groupName = trim(document.getElementById('group_name').value);
        if (that.props.currGroup.group_name !== groupName) {
          message.error('分组名称有误');
          return new Promise((resolve, reject) => {
            reject('error');
          });
        } else {
          that.deleteGroup();
        }
      },
      iconType: 'delete',
      onCancel() {}
    });
  };

  componentDidUpdate(prevProps) {
    if (prevProps.currGroup._id !== this.props.currGroup._id) {
      this.initState(this.props);
      this.setState({ showDangerOptions: false, loadError: '' });
    }
  }

  render() {
    return (
      <div className="m-panel card-panel card-panel-s panel-group">
        {this.state.loadError && <Alert type="error" message={this.state.loadError} />}
        <Row type="flex" justify="space-around" className="row" align="middle">
          <Col span={4} className="label">
            分组名：
          </Col>
          <Col span={20}>
            <Input
              size="large"
              placeholder="请输入分组名称"
              value={this.state.currGroupName}
              onChange={this.changeName}
            />
          </Col>
        </Row>
        <Row type="flex" justify="space-around" className="row" align="middle">
          <Col span={4} className="label">
            简介：
          </Col>
          <Col span={20}>
            <TextArea
              size="large"
              rows={3}
              placeholder="请输入分组描述"
              value={this.state.currGroupDesc}
              onChange={this.changeDesc}
            />
          </Col>
        </Row>
        <Row type="flex" justify="space-around" className="row" align="middle">
          <Col span={4} className="label">
            接口自定义字段&nbsp;
            <Tooltip title={'可以在接口中添加 额外字段 数据'}>
              <Icon type="question-circle-o" style={{ width: '10px' }} />
            </Tooltip> ：
          </Col>
          <Col span={12} style={{ position: 'relative' }}>
            <Input
              placeholder="请输入自定义字段名称"
              style={{ borderColor: this.state.custom_field1_rule ? '#f5222d' : '' }}
              value={this.state.custom_field1_name}
              onChange={this.changeCustomName}
            />
            <div
              className="custom-field-rule"
              style={{ display: this.state.custom_field1_rule ? 'block' : 'none' }}
            >
              自定义字段名称不能为空
            </div>
          </Col>
          <Col span={2} className="label">
            开启：
          </Col>
          <Col span={6}>
            <Switch
              checked={this.state.custom_field1_enable}
              checkedChildren="开"
              unCheckedChildren="关"
              onChange={this.changeCustomEnable}
            />
          </Col>
        </Row>
        <Row type="flex" justify="center" className="row save">
          <Col span={4} className="save-button">
            <Button className="m-btn btn-save" icon="save" type="primary" onClick={this.editGroup}>
              保 存
            </Button>
          </Col>
        </Row>
        {/* 只有超级管理员能删除分组 */}
        {this.props.curUserRole === 'admin' ? (
          <Row type="flex" justify="center" className="danger-container">
            <Col span={24} className="title">
              <h2 className="content">
                <Icon type="exclamation-circle-o" /> 危险操作
              </h2>
              <Button onClick={this.toggleDangerOptions}>
                查 看<Icon type={this.state.showDangerOptions ? 'up' : 'down'} />
              </Button>
            </Col>
            {this.state.showDangerOptions ? (
              <Card hoverable={true} className="card-danger" style={{ width: '100%' }}>
                <div className="card-danger-content">
                  <h3>删除分组</h3>
                  <p>分组一旦删除，将无法恢复数据，请慎重操作！</p>
                  <p>只有超级管理员有权限删除分组。</p>
                </div>
                <Button type="danger" ghost className="card-danger-btn" onClick={this.showConfirm}>
                  删除
                </Button>
              </Card>
            ) : null}
          </Row>
        ) : null}
      </div>
    );
  }
}

export default connect(
  state => {
    return {
      groupList: state.group.groupList,
      currGroup: state.group.currGroup,
      curUserRole: state.user.role
    };
  },
  {
    changeGroupMsg,
    fetchGroupList,
    fetchGroupMsg,
    fetchNewsData,
    deleteGroup
  }
)(withRouter(GroupSetting));
