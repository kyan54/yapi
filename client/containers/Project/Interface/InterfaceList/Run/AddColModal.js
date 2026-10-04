import React, { PureComponent as Component } from 'react';
import { connect } from 'react-redux';
import { Modal, Collapse, Row, Col, Input, message, Button, Icon } from 'antd';
import PropTypes from 'prop-types';
import axios from 'axios';
import { withRouter } from 'react-router';
import { fetchInterfaceColList } from '../../../../../reducer/modules/interfaceCol';

const { TextArea } = Input;
const Panel = Collapse.Panel;

@connect(
  state => ({
    interfaceColList: state.interfaceCol.interfaceColList
  }),
  {
    fetchInterfaceColList
  }
)
@withRouter
export default class AddColModal extends Component {
  static propTypes = {
    visible: PropTypes.bool,
    saving: PropTypes.bool,
    interfaceColList: PropTypes.array,
    fetchInterfaceColList: PropTypes.func,
    match: PropTypes.object,
    onOk: PropTypes.func,
    onCancel: PropTypes.func,
    caseName: PropTypes.string
  };

  state = {
    visible: false,
    addColName: '',
    addColDesc: '',
    id: 0,
    caseName: ''
  };

  constructor(props) {
    super(props);
  }

  componentWillMount() {
    this.props.fetchInterfaceColList(this.props.match.params.id);
    this.setState({ caseName: this.props.caseName });
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.match.params.id !== this.props.match.params.id) {
      this.createdCollection = null;
      this.setState({ id: 0, collectionRefreshPending: false });
    }
    if (!this.createdCollection && !nextProps.interfaceColList.some(col => col._id === this.state.id)) this.setState({ id: nextProps.interfaceColList.length ? nextProps.interfaceColList[0]._id : 0 });
    if ((!this.props.visible && nextProps.visible) || nextProps.caseName !== this.props.caseName) {
      this.setState({ caseName: nextProps.caseName });
    }
  }

  addCol = async () => {
    if (this.addingCol) return;
    if (!this.createdCollection && !this.state.addColName.trim()) return message.error('请输入集合名称');
    this.addingCol = true;
    this.setState({ addingCol: true });
    try {
      const project_id = this.props.match.params.id;
      if (!this.createdCollection) {
        const { addColName: name, addColDesc: desc } = this.state;
        const res = await axios.post('/api/col/add_col', { name, desc, project_id });
        if (res.data.errcode !== 0) return message.error(res.data.errmsg);
        this.createdCollection = { id: res.data.data._id, projectId: project_id };
        this.setState({ id: res.data.data._id, collectionRefreshPending: true });
        message.success('添加集合成功');
      }
      const created = this.createdCollection;
      try {
        const refreshed = await this.props.fetchInterfaceColList(created.projectId);
        if (refreshed && refreshed.payload && refreshed.payload.data.errcode !== 0) throw Error('refresh failed');
        if (String(this.props.match.params.id) !== String(created.projectId)) return;
        this.setState({ id: created.id, collectionRefreshPending: false, addColName: '', addColDesc: '' });
        this.createdCollection = null;
      } catch (_) {
        message.error('集合已创建，但列表加载失败，请重试刷新');
      }
    } catch (_) {
      message.error('添加集合失败，请重试');
    } finally {
      this.addingCol = false;
      this.setState({ addingCol: false });
    }
  };

  select = id => {
    this.setState({ id });
  };

  render() {
    const { interfaceColList = [] } = this.props;
    const { id } = this.state;
    return (
      <Modal
        className="add-col-modal"
        title="添加到集合"
        visible={this.props.visible}
        confirmLoading={this.props.saving}
        closable={!this.props.saving}
        keyboard={!this.props.saving}
        maskClosable={false}
        onOk={() => this.props.onOk(id, this.state.caseName)}
        onCancel={this.props.onCancel}
      >
        <Row gutter={6} className="modal-input">
          <Col span="5">
            <div className="label">接口用例名：</div>
          </Col>
          <Col span="15">
            <Input
              placeholder="请输入接口用例名称"
              value={this.state.caseName}
              onChange={e => this.setState({ caseName: e.target.value })}
            />
          </Col>
        </Row>
        <p>请选择添加到的集合：</p>
        <ul className="col-list">
          {interfaceColList.length ? (
            interfaceColList.map(col => (
              <li
                key={col._id}
                className={`col-item ${col._id === id ? 'selected' : ''}`}
                onClick={() => this.select(col._id)}
              >
                <Icon type="folder-open" style={{ marginRight: 6 }} />
                {col.name}
              </li>
            ))
          ) : (
            <span>暂无集合，请添加！</span>
          )}
        </ul>
        <Collapse>
          <Panel header="添加新集合">
            <Row gutter={6} className="modal-input">
              <Col span="5">
                <div className="label">集合名：</div>
              </Col>
              <Col span="15">
                <Input
                  placeholder="请输入集合名称"
                  value={this.state.addColName}
                  onChange={e => this.setState({ addColName: e.target.value })}
                />
              </Col>
            </Row>
            <Row gutter={6} className="modal-input">
              <Col span="5">
                <div className="label">简介：</div>
              </Col>
              <Col span="15">
                <TextArea
                  rows={3}
                  placeholder="请输入集合描述"
                  value={this.state.addColDesc}
                  onChange={e => this.setState({ addColDesc: e.target.value })}
                />
              </Col>
            </Row>
            <Row type="flex" justify="end">
              <Button style={{ float: 'right' }} type="primary" loading={this.state.addingCol} onClick={this.addCol}>
                {this.state.collectionRefreshPending ? '重试刷新' : '添 加'}
              </Button>
            </Row>
          </Panel>
        </Collapse>
      </Modal>
    );
  }
}
