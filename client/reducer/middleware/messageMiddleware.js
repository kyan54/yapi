import { message } from 'antd';

export default () => next => action => {
  if (!action) {
    return;
  }
  if (action.error) {
    message.error((action.payload && action.payload.message) || '服务器错误');
    action.errorMessageHandled = true;
  } else if (
    action.payload &&
    action.payload.data &&
    action.payload.data.errcode &&
    action.payload.data.errcode !== 40011
  ) {
    message.error(action.payload.data.errmsg);
    const error = new Error(action.payload.data.errmsg);
    error.errorMessageHandled = true;
    throw error;
  }
  return next(action);
};
