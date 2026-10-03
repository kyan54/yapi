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
const { render, screen, fireEvent, waitFor, cleanup, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
const h = React.createElement;
const Ant = require('../client/compat/antd');
const axios = require('axios');
test.after(() => { dom.window.close(); for (const channel of channels) { channel.port1.close(); channel.port2.close(); } global.MessageChannel = NativeMessageChannel; });
test.afterEach(() => { cleanup(); document.body.innerHTML = ''; });

test('modern form bridge preserves required validation, nested values, checkboxes and dependent fields', async () => {
  let api, result;
  const Demo = Ant.Form.create()(props => {
    api = props.form;
    return h(Ant.Form, { onSubmit: event => { event.preventDefault(); api.validateFields((error, values) => { result = { error, values }; }); } },
      h(Ant.Form.Item, { label: 'Name' }, api.getFieldDecorator('name', { rules: [{ required: true, message: 'Name required' }] })(h(Ant.Input, { 'aria-label': 'Name' }))),
      h(Ant.Form.Item, null, api.getFieldDecorator('rows[0].description', { initialValue: 'initial' })(h(Ant.Input, { 'aria-label': 'Nested' }))),
      h(Ant.Form.Item, null, api.getFieldDecorator('enabled', { initialValue: false, valuePropName: 'checked' })(h(Ant.Checkbox, null, 'Enabled'))),
      h('span', { 'data-testid': 'dependent' }, api.getFieldValue('enabled') ? 'yes' : 'no'), h(Ant.Button, { htmlType: 'submit' }, 'Save'));
  });
  render(h(Demo));
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() => assert.ok(result && result.error));
  assert.equal((await screen.findByText('Name required')).textContent, 'Name required');
  await userEvent.type(screen.getByLabelText('Name'), 'Sample');
  await userEvent.click(screen.getByText('Enabled'));
  await waitFor(() => assert.equal(screen.getByTestId('dependent').textContent, 'yes'));
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() => assert.equal(result.error, null));
  assert.equal(result.values.name, 'Sample'); assert.equal(result.values.rows[0].description, 'initial');
  await act(() => api.setFieldsValue({ rows: [{ description: 'programmatic' }] }));
  assert.equal(screen.getByLabelText('Nested').value, 'programmatic');
});

test('router bridge matches nested routes and preserves unsaved-change block then resume', async () => {
  const R = require('../client/compat/router');
  const match = R.matchPath('/project/12/interface/api/34', { path: '/project/:id/interface/:action/:actionId', exact: true });
  assert.equal(match.params.id, '12'); assert.equal(match.params.actionId, '34');
  assert.equal(R.matchPath('/project/12/setting', { path: '/project/:id', exact: true }), null);
  let confirmation;
  render(h(R.BrowserRouter, { getUserConfirmation: (_, callback) => { confirmation = callback; } }, h(R.Prompt, { when: true, message: 'Leave?' }), h(R.Link, { to: '/project/2' }, 'Other project'), h(R.Route, { path: '/project/:id', render: props => h('span', { 'data-testid': 'project-id' }, props.match.params.id) })));
  assert.equal(screen.getByTestId('project-id').textContent, '1');
  await userEvent.click(screen.getByText('Other project'));
  await waitFor(() => assert.equal(typeof confirmation, 'function'));
  await act(() => confirmation(false)); assert.equal(screen.getByTestId('project-id').textContent, '1');
  await userEvent.click(screen.getByText('Other project'));
  await act(() => confirmation(true));
  await waitFor(() => assert.equal(screen.getByTestId('project-id').textContent, '2'));
});

test('AI assistant requires reviewed outbound disclosure, previews escaped output, accepts and restores explicitly', async () => {
  const Assistant = require('../client/components/DocumentationAssistant/DocumentationAssistant').default;
  const posts = [];
  const before = { _id: 1, title: 'Fixture', path: '/example', method: 'GET', version: 0, desc: 'Before', markdown: 'Before' };
  let current = before;
  axios.get = async url => ({ data: { errcode: 0, data: url.endsWith('/history') ? { currentVersion: current.version, revisions: [{ version: 1, kind: 'accept', actorId: 1, createdAt: '2026-10-02', before, after: { desc: 'After', markdown: 'After' } }] } : { document: current, provider: { configured: true, baseURL: 'https://example.invalid/v1', model: 'fixture' }, outbound: { title: 'Fixture', markdown: 'review this exact payload' }, payloadHash: 'reviewed-hash' } } });
  axios.post = async (url, data, config) => {
    posts.push({ url, data, config });
    if (url.endsWith('/proposal')) return { data: { errcode: 0, data: { id: 'proposal', changes: { desc: '<img src=x onerror=alert(1)>', markdown: '<script>alert(1)</script>' }, unresolved: ['Check meaning'] } } };
    current = { ...before, version: current.version + 1, markdown: url.endsWith('/restore') ? 'Before' : 'After' };
    return { data: { errcode: 0, data: { document: current } } };
  };
  render(h(Assistant, { projectId: 1, interfaceId: 1 }));
  await userEvent.click(screen.getByText('AI 文档助手'));
  await screen.findByTestId('documentation-outbound');
  assert.match(screen.getByTestId('documentation-outbound').textContent, /review this exact payload/);
  const generate = screen.getByRole('button', { name: '生成文档建议' });
  assert.ok(generate.disabled);
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(generate);
  await screen.findByText('审核完成，采纳此建议');
  assert.equal(posts.length, 1); assert.equal(posts[0].data.payloadHash, 'reviewed-hash'); assert.ok(posts[0].data.requestId);
  assert.equal(posts[0].config.headers['X-YApi-Docs-Intent'], 'review');
  assert.equal(document.querySelector('img[src="x"]'), null);
  assert.ok(screen.getByText('<script>alert(1)</script>'));
  await userEvent.click(screen.getByText('审核完成，采纳此建议'));
  await screen.findByText('恢复原始文档（版本 0）');
  assert.equal(posts.filter(post => post.url.endsWith('/accept')).length, 1);
  await userEvent.click(screen.getByText('恢复原始文档（版本 0）'));
  assert.equal(posts.filter(post => post.url.endsWith('/restore')).length, 0);
  await userEvent.click(screen.getByRole('button', { name: '确认恢复' }));
  await waitFor(() => assert.equal(posts.filter(post => post.url.endsWith('/restore')).length, 1));
});

test('schema editor updates a field without dropping unknown schema keywords', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  let latest;
  render(h(Editor, { data: JSON.stringify({ type: 'object', additionalProperties: false, properties: { id: { type: 'integer', minimum: 1, description: 'Identifier' } } }), onChange: value => { latest = JSON.parse(value); } }));
  await userEvent.clear(screen.getByLabelText('id 描述'));
  await userEvent.type(screen.getByLabelText('id 描述'), 'Updated');
  assert.equal(latest.properties.id.description, 'Updated');
  assert.equal(latest.properties.id.minimum, 1); assert.equal(latest.additionalProperties, false);
});

test('AI assistant discards stale navigation responses and cannot transmit before disclosure', async () => {
  const Assistant = require('../client/components/DocumentationAssistant/DocumentationAssistant').default;
  let resolveGet, transmitted = 0;
  axios.get = () => new Promise(resolve => { resolveGet = resolve; });
  axios.post = async () => { transmitted++; throw new Error('Must not transmit'); };
  const view = render(h(Assistant, { projectId: 1, interfaceId: 1 }));
  await userEvent.click(screen.getByText('AI 文档助手'));
  view.rerender(h(Assistant, { projectId: 1, interfaceId: 2 }));
  await act(() => resolveGet({ data: { errcode: 0, data: { document: { title: 'Stale interface', method: 'GET', path: '/stale', version: 0 }, provider: { configured: true }, outbound: {}, payloadHash: 'stale' } } }));
  assert.equal(screen.queryByText('Stale interface'), null);
  assert.equal(transmitted, 0);
});

test('form legacy ref exposes fields and mounted tabs retain nested extension keys', async () => {
  let form;
  const Demo = Ant.Form.create()(props => h(Ant.Form, null, props.form.getFieldDecorator('name', { initialValue: 'collection' })(h(Ant.Input, { 'aria-label': 'Collection' }))));
  render(h(Demo, { ref: value => { form = value; } }));
  await waitFor(() => assert.ok(form));
  assert.equal(form.getFieldsValue().name, 'collection');
  cleanup();
  let selected;
  render(h(Ant.Tabs, { onChange: key => { selected = key; } }, h(Ant.Tabs.TabPane, { key: 'base', tab: 'Base' }, 'Base content'), [h(Ant.Tabs.TabPane, { key: 'plugin', tab: 'Plugin' }, 'Plugin content')]));
  await userEvent.click(screen.getByRole('tab', { name: 'Plugin' }));
  assert.equal(selected, 'plugin');
});

test('router bridge queues legacy pre-mount redirects until the current router is ready', async () => {
  const R = require('../client/compat/router');
  window.history.replaceState({}, '', '/redirect-source');
  class LegacyRedirect extends React.Component { UNSAFE_componentWillMount() { this.props.history.replace('/redirect-target'); } render() { return null; } }
  render(h(R.BrowserRouter, null, h(R.Switch, null, h(R.Route, { path: '/redirect-source', component: R.withRouter(LegacyRedirect) }), h(R.Route, { path: '/redirect-target', render: () => h('span', null, 'Redirect complete') }))));
  await screen.findByText('Redirect complete');
});

test('AI history loads older cursor pages without hiding the current page', async () => {
 const Assistant=require('../client/components/DocumentationAssistant/DocumentationAssistant').default;
 const queries=[];
 const revision=version=>({version,kind:'manual',actorId:9,createdAt:'synthetic',after:{markdown:'Version '+version}});
 axios.get=async(url,options)=>{
  if(url.endsWith('/history')) {queries.push(options.params);return{data:{errcode:0,data:options.params.cursor===1?{revisions:[revision(1),revision(0)],currentVersion:2,nextCursor:null,hasMore:false}:{revisions:[revision(2)],currentVersion:2,nextCursor:1,hasMore:true}}};}
  return{data:{errcode:0,data:{document:{title:'History',method:'GET',path:'/history',version:2},provider:{configured:false},outbound:{}}}};
 };
 render(h(Assistant,{projectId:11,interfaceId:17}));
 await userEvent.click(screen.getByText('AI 文档助手'));
 await userEvent.click(await screen.findByText('查看历史与恢复'));
 await userEvent.click(await screen.findByText('加载更早历史'));
 await screen.findByText('版本 0');
 assert.ok(screen.getByText('版本 2'));assert.ok(screen.getByText('版本 1'));
 assert.deepEqual(queries[1],{projectId:11,interfaceId:17,cursor:1,limit:50});
 assert.equal(screen.queryByText('加载更早历史'),null);
});

test('legacy autocomplete filter receives string children for modern value-only options', async () => {
  const labels = [];
  render(h(Ant.AutoComplete, { dataSource: ['Content-Type','Authorization'], open: true,
    filterOption: (input, option) => { labels.push(option.props.children); return option.props.children.toUpperCase().includes(input.toUpperCase()); }
  }));
  await userEvent.type(screen.getByRole('combobox'), 'content');
  await waitFor(() => assert.ok(labels.includes('Content-Type')));
  assert.ok(labels.every(label => typeof label === 'string'));
});


test('legacy empty button icon is absent and preserves request-runner accessible name', () => {
  render(h(Ant.Button, { icon: '' }, '发送'));
  assert.ok(screen.getByRole('button', { name: /^发\s*送$/ }));
  assert.equal(screen.queryByRole('img'), null);
});
