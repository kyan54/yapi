export const REQUEST_MODE = {
  SERVER: 'server',
  BROWSER: 'browser'
};

const STORAGE_KEY = 'YAPI_REQUEST_MODE';

export function getRequestMode() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === REQUEST_MODE.BROWSER || value === REQUEST_MODE.SERVER) {
      return value;
    }
  } catch (e) {}
  return REQUEST_MODE.SERVER;
}

export function setRequestMode(mode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch (e) {}
}
