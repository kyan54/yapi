import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { formatTime } from 'client/common.js';
import { Form, Switch, Button, Icon, Tooltip, message, Input, Select, Alert } from 'antd';
import {handleSwaggerUrlData} from 'client/reducer/modules/project';
const FormItem = Form.Item;
const Option = Select.Option;
import axios from 'axios';

// layout
const formItemLayout = {
  labelCol: {
    lg: { span: 5 },
    xs: { span: 24 },
    sm: { span: 10 }
  },
  wrapperCol: {
    lg: { span: 16 },
    xs: { span: 24 },
    sm: { span: 12 }
  },
  className: 'form-item'
};
const tailFormItemLayout = {
  wrapperCol: {
    sm: {
      span: 16,
      offset: 11
    }
  }
};

@connect(
  state => {
    return {
      projectMsg: state.project.currProject
    };
  },
  {
    handleSwaggerUrlData
  }
)
@Form.create()
export default class ProjectInterfaceSync extends Component {
  static propTypes = {
    form: PropTypes.object,
    match: PropTypes.object,
    projectId: PropTypes.number,
    projectMsg: PropTypes.object,
    handleSwaggerUrlData: PropTypes.func
  };

  constructor(props) {
    super(props);
    this.state = {
      sync_data: { is_sync_open: false },
      saving: false,
      savedPending: false,
      syncStatus: '',
      ready: false,
      loading: false,
      loadError: ''
    };
  }

  readGeneration = 0;
  readyProject = null;
  dirty = false;
  markDirty = () => { this.dirty = true; };

  canEdit = () => ['admin', 'owner', 'dev'].includes(this.props.projectMsg.role);

  handleSubmit = () => {
    if (this.saving || this.state.savedPending || !this.state.ready || this.state.loading || this.readyProject !== this.props.projectId || !this.canEdit()) return;
    const operation = {};
    this.saveOperation = operation;
    this.saving = true;
    this.setState({ saving: true });
    const projectId = this.props.projectId;
    const generation = ++this.readGeneration;
    const captured = { ...this.state.sync_data };
    const isCurrent = () => this.mounted && this.props.projectId === projectId && this.readGeneration === generation;
    this.props.form.validateFields(async (err, values) => {
      try {
        if (err || !isCurrent()) return;
        const params = { ...values, project_id: projectId,
          is_sync_open: captured.is_sync_open === true };
        if (captured._id) params.id = captured._id;
        const res = await axios.post('/api/plugin/autoSync/save', params);
        if (!isCurrent()) return;
        if (res.data.errcode !== 0) {
          this.setState({ loadError: res.data.errmsg || '同步设置未保存' });
          message.error(res.data.errmsg || '同步设置未保存');
          return;
        }
        this.setState({ savedPending: true });
        this.dirty = false;
        const loaded = await this.getSyncData();
        if (!this.mounted || this.props.projectId !== projectId || this.saveOperation !== operation) return;
        if (loaded) message.success('保存成功');
        else message.error('已保存，但加载失败，请重新加载');
      } catch (error) {
        if (isCurrent()) message.error('同步设置保存失败，请重试');
      } finally {
        if (this.saveOperation === operation) {
          this.saving = false;
          if (this.mounted && this.props.projectId === projectId) this.setState({ saving: false });
        }
      }
    });
  };

  validSwaggerUrl = async (rule, value, callback) => {
    if (!value) return callback();
    try {
      const res = await this.props.handleSwaggerUrlData(value);
      const body = res && res.payload && res.payload.data;
      if (!body || body.errcode !== 0 || !body.data || typeof body.data !== 'object' ||
          (!body.data.swagger && !body.data.openapi)) return callback('swagger地址不正确');
      callback();
    } catch (error) {
      callback('swagger地址不正确');
    }
  };

  componentDidMount() {
    this.mounted = true;
    this.getSyncData();
  }

  componentDidUpdate(previousProps) {
    if (previousProps.projectId !== this.props.projectId) {
      this.readGeneration++;
      this.readyProject = null;
      this.dirty = false;
      this.saving = false;
      this.saveOperation = null;
      this.props.form.resetFields();
      this.setState({ sync_data: { is_sync_open: false }, ready: false, loading: false, saving: false, savedPending: false, syncStatus: '', loadError: '' });
      this.getSyncData();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.readGeneration++;
    this.readyProject = null;
  }

  getSyncData = async () => {
    if (this.dirty && !this.state.savedPending) {
      this.setState({ loadError: '有未保存的修改，请先保存；草稿已保留。' });
      return false;
    }
    const projectId = this.props.projectId;
    const generation = ++this.readGeneration;
    const current = () => this.mounted && this.props.projectId === projectId && this.readGeneration === generation;
    this.setState({ loading: true });
    try {
      const result = await axios.get('/api/plugin/autoSync/get?project_id=' + projectId);
      if (!current()) return false;
      if (result.data.errcode !== 0) throw new Error(result.data.errmsg || '同步配置加载失败');
      const data = result.data.data || { is_sync_open: false };
      const history = await axios.get('/api/log/list', { params: {
        type: 'project', typeid: projectId, selectValue: '自动同步接口状态', limit: 1
      } });
      if (!current()) return false;
      if (!history.data || history.data.errcode !== 0) throw new Error('同步状态加载失败');
      const latest = history.data.data && history.data.data.list && history.data.data.list[0];
      if (this.dirty) return false;
      this.readyProject = projectId;
      this.setState({ ready: true, sync_data: data, syncStatus: latest ? latest.content : '', loadError: '', savedPending: false });
      this.props.form.setFieldsValue({ sync_mode: data.sync_mode,
        sync_json_url: data.sync_json_url || '', sync_cron: data.sync_cron || '*/10 * * * *' });
      return true;
    } catch (error) {
      if (current()) this.setState({ loadError: error.message || '同步配置加载失败' });
      return false;
    } finally {
      if (current()) this.setState({ loading: false });
    }
  };

  // 是否开启
  onChange = v => {
    this.markDirty();
    let sync_data = { ...this.state.sync_data };
    sync_data.is_sync_open = v;
    this.setState({
      sync_data: sync_data
    });
  };

  sync_cronCheck(rule, value, callback) {
    if (!value) return callback();
    const fields = value.trim().split(/\s+/);
    if (fields.length !== 5) return callback('不支持秒级别或不完整的设置，请输入五段 cron 表达式');
    if (!fields.every(field => /^[\dA-Za-z*/,\-]+$/.test(field))) return callback('cron表达式不正确');
    callback();
  }

  render() {
    const { getFieldDecorator } = this.props.form;
    const disabled = !this.state.ready || this.readyProject !== this.props.projectId || this.state.loading || !this.canEdit() || this.state.saving || this.state.savedPending;
    return (
      <div className="m-panel">
        {this.state.syncStatus.includes('自动同步接口状态:失败') && <Alert type="error" message={this.state.syncStatus} />}
        {this.state.loadError && <Alert type="error" message={this.state.loadError} />}
        {this.state.savedPending && <div role="status">已保存，但加载尚未完成。</div>}
        {(this.state.loadError || this.state.savedPending) && <Button disabled={this.state.loading || this.state.saving} onClick={this.getSyncData}>重新加载</Button>}
        {!this.canEdit() && <Alert type="info" message="没有自动同步编辑权限" />}
        {this.state.loading && <div role="status">正在加载同步设置…</div>}
        <Form>
          <FormItem
            label="是否开启自动同步"
            {...formItemLayout}
          >
            <Switch
              disabled={disabled}
              checked={this.state.sync_data.is_sync_open === true}
              onChange={this.onChange}
              checkedChildren="开"
              unCheckedChildren="关"
            />
            {this.state.sync_data.last_sync_time != null ? (<div>上次更新时间:<span className="logtime">{formatTime(this.state.sync_data.last_sync_time)}</span></div>) : null}
          </FormItem>

          <div>
            <FormItem {...formItemLayout} label={
              <span className="label">
                数据同步&nbsp;
                <Tooltip
                  title={
                    <div>
                      <h3 style={{ color: 'white' }}>普通模式</h3>
                      <p>不导入已存在的接口</p>
                      <br />
                      <h3 style={{ color: 'white' }}>智能合并</h3>
                      <p>
                        已存在的接口，将合并返回数据的 response，适用于导入了 swagger
                        数据，保留对数据结构的改动
                      </p>
                      <br />
                      <h3 style={{ color: 'white' }}>完全覆盖</h3>
                      <p>不保留旧数据，完全使用新数据，适用于接口定义完全交给后端定义</p>
                    </div>
                  }
                >
                  <Icon type="question-circle-o" />
                </Tooltip>{' '}
              </span>
            }>
              {getFieldDecorator('sync_mode', {
                initialValue: this.state.sync_data.sync_mode,
                rules: [
                  {
                    required: true,
                    message: '请选择同步方式!'
                  }
                ]
              })(

                <Select disabled={disabled} onChange={this.markDirty}>
                  <Option value="normal">普通模式</Option>
                  <Option value="good">智能合并</Option>
                  <Option value="merge">完全覆盖</Option>
                </Select>
              )}
            </FormItem>

            <FormItem {...formItemLayout} label="项目的swagger json地址">
              {getFieldDecorator('sync_json_url', {
                rules: [
                  {
                    required: true,
                    message: '输入swagger地址'
                  },
                  {
                    validator: this.validSwaggerUrl
                  }
                ],
                validateTrigger: 'onBlur',
                initialValue: this.state.sync_data.sync_json_url
              })(<Input disabled={disabled} onChange={this.markDirty} />)}
            </FormItem>

            <FormItem {...formItemLayout} label={<span>类cron风格表达式(默认10分钟更新一次)&nbsp;<a href="https://blog.csdn.net/shouldnotappearcalm/article/details/89469047">参考</a></span>}>
              {getFieldDecorator('sync_cron', {
                rules: [
                  {
                    required: true,
                    message: '输入node-schedule的类cron表达式!'
                  },
                  {
                    validator: this.sync_cronCheck
                  }
                ],
                initialValue: this.state.sync_data.sync_cron ? this.state.sync_data.sync_cron : '*/10 * * * *'
              })(<Input disabled={disabled} onChange={this.markDirty} />)}
            </FormItem>
          </div>
          <FormItem {...tailFormItemLayout}>
            <Button type="primary" htmlType="submit" icon="save" size="large" onClick={this.handleSubmit} disabled={disabled} loading={this.state.saving}>
              保存
            </Button>
          </FormItem>
        </Form>
      </div>
    );
  }
}
