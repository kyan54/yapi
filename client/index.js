import 'antd/dist/reset.css';
import './styles/common.scss';
import './styles/theme.less';
import yapiTheme from './styles/theme';
import { ConfigProvider } from 'antd';
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
    <ConfigProvider locale={zhCN} theme={yapiTheme}>
      <App />
    </ConfigProvider>
  </Provider>
);
