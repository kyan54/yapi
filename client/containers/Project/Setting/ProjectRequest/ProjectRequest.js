import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Form, Button, message } from 'antd';
const FormItem = Form.Item;
import './project-request.scss';
import AceEditor from 'client/components/AceEditor/AceEditor';
import { updateProjectScript, getProject } from '../../../../reducer/modules/project';

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
    updateProjectScript: (params, meta) => scopedAction(updateProjectScript(params), meta),
    getProject: (id, meta) => scopedAction(getProject(id, meta), meta)
  }
)
@Form.create()
export default class ProjectRequest extends Component {
  static propTypes = {
    projectMsg: PropTypes.object,
    updateProjectScript: PropTypes.func,
    getProject: PropTypes.func,
    projectId: PropTypes.number
  };

  componentWillMount() {
    this.setState({
      pre_script: this.props.projectMsg.pre_script,
      after_script: this.props.projectMsg.after_script
    });
  }

  generation = 0;
  componentDidMount() { this.mounted = true; }
  componentWillUnmount() { this.mounted = false; this.generation++; }
  componentDidUpdate(previous) {
    if (previous.projectId !== this.props.projectId) {
      this.generation++;
      this.setState({ saveReceipt: '', pre_script: this.props.projectMsg.pre_script, after_script: this.props.projectMsg.after_script });
    }
  }

  handleSubmit = async () => {
    if (!this.mounted) return;
    const projectId = this.props.projectId;
    const generation = ++this.generation;
    const isCurrent = () => this.mounted && this.generation === generation && this.props.projectId === projectId;
    this.setState({ saveReceipt: '' });
    let result;
    try {
      result = await this.props.updateProjectScript({
        id: projectId,
        pre_script: this.state.pre_script,
        after_script: this.state.after_script
      }, { isCurrent });
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

  render() {
    const formItemLayout = {
      labelCol: {
        xs: { span: 24 },
        sm: { span: 6 }
      },
      wrapperCol: {
        xs: { span: 24 },
        sm: { span: 16 }
      }
    };

    const tailFormItemLayout = {
      wrapperCol: {
        xs: {
          span: 24,
          offset: 0
        },
        sm: {
          span: 16,
          offset: 8
        }
      }
    };

    const { pre_script, after_script } = this.state;

    return (
      <div className="project-request">
        {this.state.saveReceipt && <div role="status">{this.state.saveReceipt}</div>}
        <Form onSubmit={this.handleSubmit}>
          <FormItem {...formItemLayout} label="Pre-request Script(请求参数处理脚本)">
            <AceEditor
              data={pre_script}
              onChange={editor => this.setState({ pre_script: editor.text })}
              fullScreen={true}
              className="request-editor"
            />
          </FormItem>
          <FormItem {...formItemLayout} label="Pre-response Script(响应数据处理脚本)">
            <AceEditor
              data={after_script}
              onChange={editor => this.setState({ after_script: editor.text })}
              fullScreen={true}
              className="request-editor"
            />
          </FormItem>
          <FormItem {...tailFormItemLayout}>
            <Button onClick={this.handleSubmit} type="primary">
              保存
            </Button>
          </FormItem>
        </Form>
      </div>
    );
  }
}
