/**
 * Created by gxl.gao on 2017/10/25.
 */
import React, { Component } from 'react';
// import PropTypes from 'prop-types'
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Alert, Button, Spin } from 'antd';
class StatisChart extends Component {
  static propTypes = {};

  constructor(props) {
    super(props);
    this.state = {
      showLoading: true,
      loadError: false,
      chartDate: {
        mockCount: 0,
        mockDateList: []
      }
    };
  }

  componentDidMount() {
    this.mounted = true;
    this.getMockData();
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  // 获取mock 请求次数信息
  async getMockData() {
    const request = this.request = (this.request || 0) + 1;
    this.setState({ showLoading: true, loadError: false });
    try {
      const result = await axios.get('/api/plugin/statismock/get');
      if (!this.mounted || request !== this.request) return;
      const data = result.data && result.data.data;
      if (result.data.errcode !== 0 || !data || !Number.isFinite(data.mockCount) || !Array.isArray(data.mockDateList)) {
        throw new Error('Invalid statistics response');
      }
      this.setState({ showLoading: false, chartDate: data });
    } catch (error) {
      if (!this.mounted || request !== this.request) return;
      this.setState({ showLoading: false, loadError: true });
    }
  }

  render() {
    const width = 1050;
    const { mockCount, mockDateList } = this.state.chartDate;

    return (
      <div>
        {this.state.loadError && (
          <Alert type="error" showIcon message="Mock 统计加载失败"
            description="请重试；如果仍然失败，请联系管理员检查统计服务。"
            action={<Button onClick={() => this.getMockData()}>重试</Button>} />
        )}
        <Spin spinning={this.state.showLoading}>
          <div className="statis-chart-content">
            <h3 className="statis-title">mock 接口访问总数为：{mockCount.toLocaleString()}</h3>
            <div className="statis-chart">
              <LineChart
                width={width}
                height={300}
                data={mockDateList}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis dataKey="_id" />
                <YAxis />
                <CartesianGrid strokeDasharray="7 3" />
                <Tooltip />
                <Legend />
                <Line
                  name="mock统计值"
                  type="monotone"
                  dataKey="count"
                  stroke="#8884d8"
                  dot={false}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </div>
            <div className="statis-footer">过去3个月mock接口调用情况</div>
          </div>
        </Spin>
      </div>
    );
  }
}

export default StatisChart;
