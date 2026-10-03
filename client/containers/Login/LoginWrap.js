import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Tabs } from 'antd';
import LoginForm from './Login';
import RegForm from './Reg';
import './Login.scss';
const TabPane = Tabs.TabPane;

@connect(state => ({
  loginWrapActiveKey: state.user.loginWrapActiveKey,
  canRegister: state.user.canRegister
}))
export default class LoginWrap extends Component {
  constructor(props) {
    super(props);
    this.state = { activeKey: String(props.loginWrapActiveKey || "1") };
  }

  static propTypes = {
    form: PropTypes.object,
    loginWrapActiveKey: PropTypes.string,
    canRegister: PropTypes.bool
  };

  render() {
    const { canRegister } = this.props;
    {/** show only login when register is disabled */}
    return (
      <Tabs
        activeKey={this.state.activeKey}
        onChange={activeKey => this.setState({ activeKey })}
        className="login-form"
        tabBarStyle={{ border: 'none' }}
      >
        <TabPane tab="登录" key="1">
          {this.state.activeKey === "1" ? <LoginForm /> : null}
        </TabPane>
        <TabPane tab={"注册"} key="2">
          {canRegister ? (this.state.activeKey === "2" ? <RegForm /> : null) : <div style={{minHeight: 200}}>管理员已禁止注册，请联系管理员</div>}
        </TabPane>
      </Tabs>
    );
  }
}
