import React, { PureComponent as Component } from 'react';
import PropTypes from 'prop-types';
import { Form, Input, Button, message } from 'antd';
const FormItem = Form.Item;
function hasErrors(fieldsError) {
  return Object.keys(fieldsError).some(field => fieldsError[field]);
}
class AddInterfaceForm extends Component {
  static propTypes = {
    form: PropTypes.object,
    onSubmit: PropTypes.func,
    onCancel: PropTypes.func,
    onPendingChange: PropTypes.func,
    catdata: PropTypes.object
  };
  state = { submitting: false };
  submitting = false;
  disposed = false;
  componentWillUnmount() { this.disposed = true; }

  handleSubmit = (e) => {
    e.preventDefault();
    if (this.submitting) return;
    this.submitting = true;
    this.props.form.validateFields(async (err, values) => {
      if (err) {
        this.submitting = false;
        return;
      }
      this.setState({ submitting: true });
      if (this.props.onPendingChange) this.props.onPendingChange(true);
      try {
        await this.props.onSubmit(values);
      } catch (error) {
        if (this.disposed) return;
        const response = error.response && error.response.data;
        message.error((response && response.errmsg) || '分类提交失败，请重试');
      } finally {
        this.submitting = false;
        if (!this.disposed) {
          this.setState({ submitting: false });
          if (this.props.onPendingChange) this.props.onPendingChange(false);
        }
      }
    });
  }

  render() {
    const { getFieldDecorator, getFieldsError } = this.props.form;
    const formItemLayout = {
      labelCol: {
        xs: { span: 24 },
        sm: { span: 6 }
      },
      wrapperCol: {
        xs: { span: 24 },
        sm: { span: 14 }
      }
    };

    return (
      <Form onSubmit={this.handleSubmit}>
        {this.state.submitting && <p role="status" style={{ textAlign: 'center' }}>正在提交，请稍候；完成后可关闭。</p>}
        <FormItem {...formItemLayout} label="分类名">
          {getFieldDecorator('name', {
            rules: [
              {
                required: true,
                message: '请输入分类名称!'
              }
            ],
            initialValue: this.props.catdata ? this.props.catdata.name || null : null
          })(<Input placeholder="分类名称" />)}
        </FormItem>
        <FormItem {...formItemLayout} label="备注">
          {getFieldDecorator('desc', {
            initialValue: this.props.catdata ? this.props.catdata.desc || null : null
          })(<Input placeholder="备注" />)}
        </FormItem>

        <FormItem className="catModalfoot" wrapperCol={{ span: 24, offset: 8 }}>
          <Button disabled={this.state.submitting} onClick={this.props.onCancel} style={{ marginRight: '10px' }}>
            取消
          </Button>
          <Button type="primary" htmlType="submit" loading={this.state.submitting} disabled={this.state.submitting || hasErrors(getFieldsError())}>
            提交
          </Button>
        </FormItem>
      </Form>
    );
  }
}

export default Form.create()(AddInterfaceForm);
