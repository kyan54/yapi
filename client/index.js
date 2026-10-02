import './styles/common.scss';
import './styles/theme.less';
import { ConfigProvider } from 'antd';
import 'antd/dist/reset.css';
import './plugin';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './Application';
import { Provider } from 'react-redux';
import createStore from './reducer/create';

// 由于 antd 组件的默认文案是英文，所以需要修改为中文
import zhCN from 'antd/locale/zh_CN';

const store = createStore();

createRoot(document.getElementById('yapi')).render(
  <Provider store={store}>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#2395f1', fontSize: 13, borderRadius: 4 }, components: { Layout: { headerBg: '#32363a', headerHeight: 56, headerPadding: 0, siderBg: '#fff' } } }}>
      <App />
    </ConfigProvider>
  </Provider>
);
