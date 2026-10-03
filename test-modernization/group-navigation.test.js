'use strict';
// Mounted React 19 + AntD 6 tests in jsdom. Not a substitute for browser/DB E2E.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/project/1/interface/api/1', pretendToBeVisual: true });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLTextAreaElement', 'HTMLInputElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'SVGElement', 'ShadowRoot', 'DocumentFragment', 'getComputedStyle']) Object.defineProperty(global, name, { value: dom.window[name], configurable: true, writable: true });
const NativeMessageChannel = global.MessageChannel;
const channels = [];
global.MessageChannel = class extends NativeMessageChannel { constructor() { super(); channels.push(this); } };
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const originalResolve = Module._resolveFilename;
const originalJS = Module._extensions['.js'];
const originalLoad = Module._load;
Module._load = function(request, parent, ...args) {
  // Keep the navigation components, React, router, Redux, reducers and middleware real.
  // Stub unrelated heavy editor/plugin children, which these tests never exercise.
  if (request === 'client/plugin.js') return { emitHook() {} };
  if (parent && parent.filename.endsWith('/containers/Project/Project.js') &&
      (request.startsWith('./') || request === '../../components/index')) {
    return request === '../../components/index' ? { Subnav: () => null } : { __esModule: true, default: () => null };
  }
  if (/UsernameAutoComplete|GuideBtns|ProjectCard/.test(request)) return { __esModule: true, default: () => null };
  if (parent && parent.filename.endsWith('/containers/Group/Group.js') && /MemberList|GroupLog|GroupSetting/.test(request)) return { __esModule: true, default: () => null };
  return originalLoad.call(this, request, parent, ...args);
};
const antd = require.resolve('antd');
const router = require.resolve('react-router');
Module._resolveFilename = function(request, parent, ...args) {
  const local = parent && !parent.filename.includes('node_modules') && parent.filename.startsWith(root);
  if (request === 'antd-modern') return antd;
  if (request === 'router-modern') return router;
  if (local && request === 'antd') request = path.join(root, 'client/compat/antd.js');
  if (local && ['react-router', 'react-router-dom'].includes(request)) request = path.join(root, 'client/compat/router.js');
  for (const prefix of ['client/', 'common/', 'exts/']) if (request.startsWith(prefix)) request = path.join(root, request);
  return originalResolve.call(this, request, parent, ...args);
};
Module._extensions['.js'] = function(module, filename) {
  if (!filename.startsWith(root) || filename.includes('node_modules') || filename.includes('test-modernization')) return originalJS(module, filename);
  const code = require('@babel/core').transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false, presets: [['@babel/preset-env', { targets: { node: '24' }, modules: 'commonjs' }], ['@babel/preset-react', { runtime: 'automatic' }]], plugins: [['@babel/plugin-proposal-decorators', { legacy: true }], ['@babel/plugin-transform-class-properties', { loose: true }]] }).code;
  module._compile(code, filename);
};
for (const extension of ['.css', '.scss', '.less', '.png', '.jpg', '.svg']) Module._extensions[extension] = module => { module.exports = ''; };
const React = require('react');
const { render, screen, fireEvent, waitFor, cleanup, act, within } = require('@testing-library/react');

const h = React.createElement;
const Ant = require('../client/compat/antd');
const axios = require('axios');
const originalGet = axios.get;
test.after(() => { dom.window.close(); for (const channel of channels) { channel.port1.close(); channel.port2.close(); } global.MessageChannel = NativeMessageChannel; });
test.afterEach(() => { cleanup(); document.body.innerHTML = ''; axios.get = originalGet; });


const { GroupList } = require('../client/containers/Group/GroupList/GroupList');
const { Group } = require('../client/containers/Group/Group');
const { Project } = require('../client/containers/Project/Project');
const groupActions = require('../client/reducer/modules/group');
const projectActions = require('../client/reducer/modules/project');
const { resourceId, routeGroupId } = require('../client/containers/Group/navigation');
const R = require('../client/compat/router');
const { Provider } = require('react-redux');
const { createStore, combineReducers, applyMiddleware } = require('redux');
const promiseMiddleware = require('redux-promise');
const messageMiddleware = require('../client/reducer/middleware/messageMiddleware').default;
const envelope = data => ({ data: { errcode: 0, data } });
const action = data => ({ payload: envelope(data) });
const group = id => ({ _id: id, group_name: `Group ${id}`, group_desc: '', type: 'private', role: 'owner', custom_field1: {} });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function listProps(id = '14', changes = {}) {
  return { groupList: [], currGroup: {}, study: true, studyTip: 1,
    match: { params: {} }, location: { pathname: id == null ? '/group' : `/group/${id}` },
    history: { replace() {}, push() {} }, fetchNewsData() {},
    fetchGroupList: async () => action([group(14), group(20)]),
    setCurrGroup: async value => action(group(value._id)), ...changes };
}
function projectProps(id = '1', changes = {}) {
  return { match: { params: { id } }, location: { pathname: `/project/${id}` }, curProject: {}, currGroup: {},
    getProject: async value => action({ _id: value, group_id: 14, name: `Project ${value}` }),
    fetchGroupMsg: async id => action(group(id)), setBreadcrumb() {}, ...changes };
}
function store() {
  return createStore(combineReducers({ group: groupActions.default, project: projectActions.default,
    user: (state = { role: 'admin', study: true, studyTip: 1 }) => state }), applyMiddleware(promiseMiddleware, messageMiddleware));
}

test('route IDs reject blanks/invalid values and recover groupId from a shallow router context', () => {
  for (const value of [undefined, null, '', 'undefined', '14x', '0', '-1', '1.5', '9007199254740992']) assert.equal(resourceId(value), null);
  assert.equal(resourceId('14'), 14);
  assert.equal(routeGroupId({ match: { params: {} }, location: { pathname: '/group/20' } }), '20');
});

test('group selection uses the resolved list with stale Redux props and preserves the requested URL', async () => {
  const pending = deferred(), requests = [], navigations = [];
  const props = listProps('20', { fetchGroupList: () => pending.promise,
    setCurrGroup: async value => { requests.push(value._id); return action(group(value._id)); },
    history: { replace: value => navigations.push(value), push: value => navigations.push(value) } });
  let component;
  render(h(GroupList, { ...props, ref: value => { component = value; } }));
  await act(() => pending.resolve(action([group(14), group(20)])));
  await waitFor(() => assert.equal(component.state.loading, false));
  assert.deepEqual(requests, [20]);
  assert.deepEqual(navigations, []);
  assert.equal(component.props.groupList.length, 0);
  assert.equal(component.state.groupList.length, 2);
});

test('bare group URL redirects once with an absolute path and never selects an undefined group', async () => {
  const paths = [], requests = [];
  const props = listProps(null, { history: { replace: path => paths.push(path) }, setCurrGroup: value => requests.push(value) });
  render(h(GroupList, props));
  await waitFor(() => assert.deepEqual(paths, ['/group/14']));
  assert.deepEqual(requests, []);
});

test('empty, malformed, rejected and invalid group loads never send a blank group request', async () => {
  for (const [id, response, errorText] of [
    [null, async () => action([]), null],
    [null, async () => action({}), '分组列表格式错误'],
    ['14', async () => { throw new Error('List unavailable'); }, 'List unavailable'],
    ['undefined', async () => action([group(14)]), '无效的分组 ID']
  ]) {
    const requests = [], paths = [];
    let component;
    render(h(GroupList, { ...listProps(id, { fetchGroupList: response, setCurrGroup: value => requests.push(value),
      history: { replace: value => paths.push(value) } }), ref: value => { component = value; } }));
    await waitFor(() => assert.equal(component.state.loading, false));
    assert.deepEqual(requests, []); assert.deepEqual(paths, []);
    if (errorText) assert.ok(screen.getByText(errorText)); else assert.ok(screen.getByRole('status'));
    cleanup();
  }
});

test('direct group missing from list remains authoritative and failed selection is retryable', async () => {
  let fail = true;
  const ids = [], paths = [];
  render(h(GroupList, listProps('99', { history: { replace: value => paths.push(value) }, setCurrGroup: async value => {
    ids.push(value._id); if (fail) throw new Error('Group forbidden'); return action(group(value._id));
  } })));
  await screen.findByText('Group forbidden'); assert.deepEqual(ids, [99]); assert.deepEqual(paths, []);
  fail = false; fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
  await waitFor(() => assert.equal(screen.queryByText('Group forbidden'), null));
  await waitFor(() => assert.deepEqual(ids, [99, 99]));
});

test('route changes and Back select once while unrelated renders and repeated clicks do not refetch', async () => {
  const requests = [], paths = [], props = listProps('14', { setCurrGroup: async value => { requests.push(value._id); return action(group(value._id)); },
    history: { push: value => paths.push(value), replace: value => paths.push(value) } });
  let component;
  const view = render(h(GroupList, { ...props, ref: value => { component = value; } }));
  await waitFor(() => assert.deepEqual(requests, [14]));
  view.rerender(h(GroupList, { ...props, currGroup: group(14), ref: value => { component = value; } }));
  await act(() => component.selectGroup({ key: '14' })); assert.deepEqual(paths, []);
  await act(() => component.selectGroup({ key: '20' })); assert.deepEqual(paths, ['/group/20']);
  view.rerender(h(GroupList, { ...props, location: { pathname: '/group/20' } }));
  await waitFor(() => assert.deepEqual(requests, [14, 20]));
  view.rerender(h(GroupList, props));
  await waitFor(() => assert.deepEqual(requests, [14, 20, 14]));
});

test('a pending list follows the newest route and does nothing after unmount', async () => {
  const pending = deferred(), ids = [];
  const props = listProps('14', { fetchGroupList: () => pending.promise, setCurrGroup: async value => { ids.push(value._id); return action(group(value._id)); } });
  const view = render(h(GroupList, props));
  view.rerender(h(GroupList, { ...props, location: { pathname: '/group/20' } }));
  await act(() => pending.resolve(action([group(14), group(20)])));
  await waitFor(() => assert.deepEqual(ids, [20]));
  cleanup();
  const late = deferred();
  const unmounted = render(h(GroupList, { ...props, fetchGroupList: () => late.promise }));
  unmounted.unmount(); await act(() => late.resolve(action([group(14)])));
  assert.deepEqual(ids, [20]);
});

test('group guards survive real redux-promise dispatch and suppress stale state after newer selection/unmount', async () => {
  const pending = new Map([[14, deferred()], [20, deferred()]]), redux = store();
  axios.get = (url, options) => pending.get(options.params.id).promise;
  const props = listProps('14', { setCurrGroup: (...args) => redux.dispatch(groupActions.setCurrGroup(...args)) });
  const view = render(h(GroupList, props));
  await waitFor(() => assert.ok(screen.getByText('Group 14')));
  view.rerender(h(GroupList, { ...props, location: { pathname: '/group/20' } }));
  await act(() => pending.get(20).resolve(envelope(group(20))));
  assert.equal(redux.getState().group.currGroup._id, 20);
  await act(() => pending.get(14).resolve(envelope(group(14))));
  assert.equal(redux.getState().group.currGroup._id, 20);
  cleanup();
  const late = deferred(); axios.get = () => late.promise;
  const unmounted = render(h(GroupList, props));
  await waitFor(() => assert.ok(screen.getByText('Group 14')));
  unmounted.unmount(); await act(() => late.resolve(envelope(group(14))));
  assert.equal(redux.getState().group.currGroup._id, 20);
});

test('group default lookup does not select personal space over a direct URL or write after unmount', async () => {
  let calls = 0, component;
  axios.get = async () => { calls++; return envelope(group(14)); };
  const props = { location: { pathname: '/group/20' }, currGroup: {}, curUserRole: 'admin' };
  const view = render(h(Provider, { store: store() }, h(R.BrowserRouter, null, h(Group, { ...props, ref: value => { component = value; } }))));
  assert.equal(calls, 0); assert.equal(component.state.groupId, null); view.unmount();
  const pending = deferred(); axios.get = () => pending.promise;
  let unmounted;
  const loading = render(h(Group, { ...props, location: { pathname: '/group' }, ref: value => { if (value) unmounted = value; } }));
  loading.unmount(); await act(() => pending.resolve(envelope(group(14))));
  assert.equal(unmounted.state.groupId, null);
});

test('project breadcrumb/group lookup uses resolved payloads while connected props are stale', async () => {
  const groups = [], breadcrumbs = [];
  render(h(Project, projectProps('1', { fetchGroupMsg: async id => { groups.push(id); return action(group(id)); }, setBreadcrumb: value => breadcrumbs.push(value) })));
  await waitFor(() => assert.equal(breadcrumbs.length, 1));
  assert.deepEqual(groups, [14]);
  assert.deepEqual(breadcrumbs[0], [{ name: 'Group 14', href: '/group/14' }, { name: 'Project 1' }]);
});

test('project load failures/missing group IDs stay visible and never request an undefined group', async () => {
  for (const response of [async () => { throw new Error('Project unavailable'); }, async () => action({ _id: 1 }), async () => ({ error: true, payload: new Error('Network failed') })]) {
    const groups = [], breadcrumbs = [];
    render(h(Project, projectProps('1', { getProject: response, fetchGroupMsg: id => groups.push(id), setBreadcrumb: value => breadcrumbs.push(value) })));
    await screen.findByRole('alert'); assert.deepEqual(groups, []); assert.deepEqual(breadcrumbs, []); cleanup();
  }
});

test('project request guards stop old/new navigation from committing stale project, group or breadcrumbs', async () => {
  const first = deferred(), second = deferred(), redux = store(), ids = [], breadcrumbs = [];
  axios.get = url => url.endsWith('id=1') ? first.promise : second.promise;
  const props = projectProps('1', { getProject: (...args) => redux.dispatch(projectActions.getProject(...args)),
    fetchGroupMsg: async id => { ids.push(id); return action(group(id)); }, setBreadcrumb: value => breadcrumbs.push(value) });
  const view = render(h(Project, props));
  view.rerender(h(Project, { ...props, match: { params: { id: '2' } } }));
  await act(() => second.resolve(envelope({ _id: 2, group_id: 20, name: 'Newest' })));
  await act(() => first.resolve(envelope({ _id: 1, group_id: 14, name: 'Stale' })));
  assert.equal(redux.getState().project.currProject._id, 2);
  assert.deepEqual(ids, [20]); assert.equal(breadcrumbs.length, 1); assert.equal(breadcrumbs[0][1].name, 'Newest');
});

test('real middleware still rejects genuine current group errors and reducer preserves valid state', async () => {
  const redux = store(), errors = [], originalError = Ant.message.error;
  Ant.message.error = error => { errors.push(error); };
  try {
    axios.get = async () => envelope(group(14));
    await redux.dispatch(groupActions.setCurrGroup(group(14), { isCurrent: () => true }));
    axios.get = async () => ({ data: { errcode: 403, errmsg: 'Group access denied' } });
    await assert.rejects(redux.dispatch(groupActions.setCurrGroup(group(20), { isCurrent: () => true })), /Group access denied/);
    assert.deepEqual(errors, ['Group access denied']); assert.equal(redux.getState().group.currGroup._id, 14);
  } finally { Ant.message.error = originalError; }
});


test('connected group route resolves personal space once, loads projects and switches via absolute replacement', async () => {
  const ConnectedGroup = require('../client/containers/Group/Group').default;
  const redux = store(), requests = [];
  window.history.replaceState({}, '', '/group');
  axios.get = async (url, options = {}) => {
    requests.push({ url, params: options.params });
    if (url === '/api/group/get_mygroup') return envelope(group(14));
    if (url === '/api/group/list') return envelope([group(14), group(20)]);
    if (url === '/api/group/get') { assert.ok(options.params.id); return envelope(group(options.params.id)); }
    if (url === '/api/project/list') return envelope({ list: [], total: 0, userinfo: {} });
    return envelope([]);
  };
  render(h(Provider, { store: redux }, h(R.BrowserRouter, null, h(R.Route, { path: '/group', component: ConnectedGroup }))));
  await waitFor(() => assert.equal(redux.getState().group.currGroup._id, 14));
  await waitFor(() => assert.equal(requests.filter(item => item.url === '/api/project/list').length, 1));
  assert.equal(window.location.pathname, '/group/14');
  assert.equal(requests.filter(item => item.url === '/api/group/get').length, 1);
  const historyLength = window.history.length;
  fireEvent.click(screen.getByRole('menuitem', { name: /Group 20/ }));
  await waitFor(() => assert.equal(redux.getState().group.currGroup._id, 20));
  await waitFor(() => assert.equal(requests.filter(item => item.url === '/api/project/list').length, 2));
  assert.equal(window.location.pathname, '/group/20');
  assert.equal(window.history.length, historyLength);
  fireEvent.click(screen.getByRole('menuitem', { name: /Group 20/ }));
  await act(async () => {});
  assert.equal(requests.filter(item => item.url === '/api/group/get').length, 2);
  assert.equal(requests.filter(item => item.url === '/api/group/get_mygroup').length, 1);
});

test('connected direct group URL never selects the first/personal group; actual Back restores route selection', async () => {
  const ConnectedGroup = require('../client/containers/Group/Group').default;
  const redux = store(), ids = [], urls = [];
  window.history.replaceState({}, '', '/group/20');
  axios.get = async (url, options = {}) => {
    urls.push(url);
    if (url === '/api/group/list') return envelope([group(14), group(20)]);
    if (url === '/api/group/get') { ids.push(options.params.id); return envelope(group(options.params.id)); }
    if (url === '/api/project/list') return envelope({ list: [], total: 0, userinfo: {} });
    throw new Error(`Unexpected request: ${url}`);
  };
  render(h(Provider, { store: redux }, h(R.BrowserRouter, null,
    h(R.Link, { to: '/group/14' }, 'Navigate to personal group'),
    h(R.Route, { path: '/group', component: ConnectedGroup }))));
  await waitFor(() => assert.equal(redux.getState().group.currGroup._id, 20));
  assert.equal(window.location.pathname, '/group/20'); assert.deepEqual(ids, [20]);
  fireEvent.click(screen.getByText('Navigate to personal group'));
  await waitFor(() => assert.equal(redux.getState().group.currGroup._id, 14));
  await act(async () => { window.history.back(); });
  await waitFor(() => assert.equal(redux.getState().group.currGroup._id, 20));
  assert.equal(window.location.pathname, '/group/20'); assert.deepEqual(ids, [20, 14, 20]);
  assert.equal(urls.includes('/api/group/get_mygroup'), false);
});


test('group deletion uses the resolved list and routes safely when it is empty or props lag', async () => {
  const { GroupSetting } = require('../client/containers/Group/GroupSetting/GroupSetting');
  for (const groups of [[group(20)], []]) {
    const paths = [];
    let component;
    render(h(GroupSetting, { currGroup: group(14), groupList: [group(14)], curUserRole: 'admin',
      location: { pathname: '/group/14' }, history: { replace: path => paths.push(path) },
      deleteGroup: async () => action({}), fetchGroupList: async () => action(groups),
      ref: value => { component = value; } }));
    await act(() => component.deleteGroup());
    assert.deepEqual(paths, [groups.length ? '/group/20' : '/group']); cleanup();
  }
});

test('group deletion failures/newer navigation never redirect from a stale list', async () => {
  const { GroupSetting } = require('../client/containers/Group/GroupSetting/GroupSetting');
  const pending = deferred(), paths = [];
  let component;
  const props = { currGroup: group(14), groupList: [group(14)], curUserRole: 'admin',
    location: { pathname: '/group/14' }, history: { replace: path => paths.push(path) },
    deleteGroup: async () => action({}), fetchGroupList: () => pending.promise,
    ref: value => { component = value; } };
  const view = render(h(GroupSetting, props));
  let operation;
  await act(async () => { operation = component.deleteGroup(); });
  view.rerender(h(GroupSetting, { ...props, currGroup: group(20), location: { pathname: '/group/20' } }));
  await act(async () => { pending.resolve(action([group(14)])); await operation; });
  assert.deepEqual(paths, []); cleanup();
  render(h(GroupSetting, { ...props, fetchGroupList: async () => { throw new Error('Refresh failed'); } }));
  await act(() => component.deleteGroup());
  assert.ok(screen.getByText('Refresh failed')); assert.deepEqual(paths, []);
});

test('project unmount discards a pending group response and cannot write breadcrumbs or group state', async () => {
  const redux = store(), pending = deferred(), breadcrumbs = [];
  axios.get = () => pending.promise;
  const view = render(h(Project, projectProps('1', { fetchGroupMsg: (...args) => redux.dispatch(groupActions.fetchGroupMsg(...args)), setBreadcrumb: value => breadcrumbs.push(value) })));
  await act(async () => {});
  view.unmount(); await act(() => pending.resolve(envelope(group(14))));
  assert.equal(redux.getState().group.currGroup._id, undefined); assert.deepEqual(breadcrumbs, []);
});


test('group edit refreshes the intended ID once with stale props and reports a failed refresh', async () => {
  const { GroupSetting } = require('../client/containers/Group/GroupSetting/GroupSetting');
  const ids = [], news = [];
  let component, fail = false;
  render(h(GroupSetting, { currGroup: group(14), groupList: [], curUserRole: 'admin',
    location: { pathname: '/group/14' }, history: {}, changeGroupMsg: async () => action({}),
    fetchGroupList: async () => action([group(14)]),
    fetchGroupMsg: async id => { ids.push(id); return fail ? { error: true, payload: new Error('Group refresh failed') } : action(group(id)); },
    fetchNewsData: id => news.push(id), ref: value => { component = value; } }));
  await act(() => component.editGroup()); assert.deepEqual(ids, [14]); assert.deepEqual(news, [14]);
  fail = true;
  await act(() => component.editGroup());
  assert.ok(screen.getByText('Group refresh failed')); assert.deepEqual(ids, [14, 14]); assert.deepEqual(news, [14]);
});
