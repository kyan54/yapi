// Action promises resolve before React has necessarily committed connected props.
export function resourceId(value) {
  const text = String(value == null ? '' : value);
  const id = Number(text);
  return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(id) ? id : null;
}

export function actionData(action) {
  if (action && action.error) throw action.payload || new Error('加载失败，请重试');
  const body = action && action.payload && action.payload.data;
  if (!body || body.errcode) throw new Error((body && body.errmsg) || '加载失败，请重试');
  return body.data;
}

export function routeGroupId(props) {
  // A withRouter under the outer /group route may inherit a match without groupId.
  const pathname = props.location && props.location.pathname;
  if (pathname) {
    const match = pathname.match(/^\/group(?:\/([^/]+))?\/?$/);
    return match ? match[1] : undefined;
  }
  return props.match && props.match.params && props.match.params.groupId;
}
