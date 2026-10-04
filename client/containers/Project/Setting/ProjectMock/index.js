import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Form, Switch, Button, Icon, Tooltip, message } from 'antd';
import AceEditor from '../../../../components/AceEditor/AceEditor';
const FormItem = Form.Item;
import { updateProjectMock, getProject } from '../../../../reducer/modules/project';

const formItemLayout = {
  labelCol: {
    sm: { span: 4 }
  },
  wrapperCol: {
    sm: { span: 16 }
  }
};
const tailFormItemLayout = {
  wrapperCol: {
    sm: {
      span: 16,
      offset: 11
    }
  }
};

// Resolve locally before dispatch so obsolete errors cannot reach message middleware.
export async function scopedAction(action, meta) {
  try {
    const resolved = await action;
    const payload = await resolved.payload;
    return meta.isCurrent() ? { ...resolved, payload } : { type: 'PROJECT_SETTINGS_IGNORED' };
  } catch (error) {
    return meta.isCurrent() ? { type: 'PROJECT_SETTINGS_FAILED', error: true, payload: error } : { type: 'PROJECT_SETTINGS_IGNORED' };
  }
}

@connect(
  state => {
    return {
      projectMsg: state.project.currProject
    };
  },
  {
    updateProjectMock: (params, meta) => scopedAction(updateProjectMock(params), meta),
    getProject: (id, meta) => scopedAction(getProject(id, meta), meta)
  }
)
@Form.create()
export default class ProjectMock extends Component {
  static propTypes = {
    form: PropTypes.object,
    match: PropTypes.object,
    projectId: PropTypes.number,
    updateProjectMock: PropTypes.func,
    projectMsg: PropTypes.object,
    getProject: PropTypes.func
  };

  constructor(props) {
    super(props);
    this.state = {
      is_mock_open: false,
      project_mock_script: ''
    };
  }

  generation = 0;
  componentDidMount() { this.mounted = true; }
  componentWillUnmount() { this.mounted = false; this.generation++; }
  componentDidUpdate(previous) {
    if (previous.projectId !== this.props.projectId) {
      this.generation++;
      this.setState({ saveReceipt: '', project_mock_script: this.props.projectMsg.project_mock_script, is_mock_open: this.props.projectMsg.is_mock_open });
    }
  }

  handleSubmit = async () => {
    if (!this.mounted) return;
    const projectId = this.props.projectId;
    const generation = ++this.generation;
    const isCurrent = () => this.mounted && this.generation === generation && this.props.projectId === projectId;
    this.setState({ saveReceipt: '' });
    let params = {
      id: projectId,
      project_mock_script: this.state.project_mock_script,
      is_mock_open: this.state.is_mock_open
    };

    let result;
    try {
      result = await this.props.updateProjectMock(params, { isCurrent });
    } catch (error) {
      if (!isCurrent()) return;
      if (!error || error.errorMessageHandled !== true) message.error('保存失败，请检查网络后重试');
      return;
    }
    if (!isCurrent()) return;
    if (!result || result.error || !result.payload || !result.payload.data) {
      if (!result || result.errorMessageHandled !== true) message.error('保存失败，请检查网络后重试');
      return;
    }
    if (result.payload.data.errcode === 0) {
      message.success('保存成功');
      try {
        if (!isCurrent()) return;
        const refreshed = await this.props.getProject(projectId, { isCurrent });
        if (!isCurrent()) return;
        if (!refreshed || refreshed.error || !refreshed.payload || !refreshed.payload.data ||
          refreshed.payload.data.errcode !== 0 || !refreshed.payload.data.data) {
          this.setState({ saveReceipt: '保存成功，但刷新项目失败，请刷新页面' });
          if (!refreshed || refreshed.errorMessageHandled !== true) message.error('保存成功，但刷新项目失败，请刷新页面');
        }
      } catch (error) {
        if (!isCurrent()) return;
        this.setState({ saveReceipt: '保存成功，但刷新项目失败，请刷新页面' });
        if (!error || error.errorMessageHandled !== true) message.error('保存成功，但刷新项目失败，请刷新页面');
      }
    } else {
      message.error('保存失败, ' + result.payload.data.errmsg);
    }
  };

  componentWillMount() {
    this.setState({
      is_mock_open: this.props.projectMsg.is_mock_open,
      project_mock_script: this.props.projectMsg.project_mock_script
    });
  }

  // 是否开启
  onChange = v => {
    this.setState({
      is_mock_open: v
    });
  };

  handleMockJsInput = e => {
    this.setState({
      project_mock_script: e.text
    });
  };

  render() {
    return (
      <div className="m-panel">
        {this.state.saveReceipt && <div role="status">{this.state.saveReceipt}</div>}
        <Form>
          <FormItem
            label={
              <span>
                是否开启&nbsp;<a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://hellosean1025.github.io/yapi/documents/project.html#%E5%85%A8%E5%B1%80mock"
                >
                  <Tooltip title="点击查看文档">
                    <Icon type="question-circle-o" />
                  </Tooltip>
                </a>
              </span>
            }
            {...formItemLayout}
          >
            <Switch
              checked={this.state.is_mock_open}
              onChange={this.onChange}
              checkedChildren="开"
              unCheckedChildren="关"
            />
          </FormItem>
          <FormItem label="Mock脚本" {...formItemLayout}>
            <AceEditor
              data={this.state.project_mock_script}
              onChange={this.handleMockJsInput}
              style={{ minHeight: '500px' }}
            />
          </FormItem>
          <FormItem {...tailFormItemLayout}>
            <Button type="primary" htmlType="submit" onClick={this.handleSubmit}>
              保存
            </Button>
          </FormItem>
        </Form>
      </div>
    );
  }
}
