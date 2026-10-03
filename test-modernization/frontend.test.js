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
const { render, screen, fireEvent, waitFor, cleanup, act, within } = require('@testing-library/react');
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

test('schema example import is explicit, cancel preserves edits, and arrays retain variant types', async () => {
  const {default: Editor, schemaFromExample}=require('../client/components/SchemaEditor');
  assert.deepEqual(schemaFromExample([1,'a']).items,{anyOf:[{type:'integer'},{type:'string'}]});
  let latest;
  render(h(Editor,{data:JSON.stringify({type:'object',properties:{id:{type:'integer',minimum:1}}}),onChange:value=>{latest=JSON.parse(value);}}));
  await userEvent.click(screen.getByRole('button',{name:'导入 JSON'}));
  fireEvent.change(screen.getByLabelText('导入 JSON 内容'),{target:{value:'{"newField":true}'}});
  await userEvent.click(screen.getByRole('button',{name:/^取\s*消$/}));
  assert.equal(latest,undefined);
  await userEvent.click(screen.getByRole('button',{name:'导入 JSON'}));
  const input=screen.getByLabelText('导入 JSON 内容');
  fireEvent.change(input,{target:{value:JSON.stringify({rows:[{id:1}],enabled:true})}});
  await userEvent.click(screen.getByRole('button',{name:'导入并替换'}));
  assert.equal(latest.properties.rows.items.properties.id.type,'integer');
  assert.equal(latest.properties.enabled.type,'boolean');
});

test('schema editor reports invalid draft without replacing the last valid value', async () => {
  const Editor=require('../client/components/SchemaEditor').default;
  let validity,latest;
  render(h(Editor,{data:'{"type":"object"}',onChange:value=>{latest=value;},onValidityChange:value=>{validity=value;}}));
  await userEvent.click(screen.getByRole('tab',{name:'JSON（完整 Schema）'}));
  fireEvent.change(screen.getByLabelText('JSON Schema'),{target:{value:'{invalid'}});
  await waitFor(()=>assert.equal(validity,false));assert.equal(latest,undefined);
  fireEvent.change(screen.getByLabelText('JSON Schema'),{target:{value:'{"type":"string","minLength":2}'}});
  await waitFor(()=>assert.equal(validity,true));assert.equal(JSON.parse(latest).minLength,2);
});

test('schema rename rejects blank and duplicate drafts, resets display and moves required references', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  const original = { type: 'object', required: ['id', 'outside'], properties: { id: { type: 'integer', minimum: 1 }, other: { type: 'string' } }, 'x-vendor': { untouched: true } };
  let latest, changes = 0;
  const view = render(h(Editor, { data: JSON.stringify(original), onChange: value => { latest = JSON.parse(value); changes++; } }));
  for (const value of ['', '   ', 'other']) {
    const input = screen.getByLabelText('字段 id 名称');
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    assert.equal(screen.getByLabelText('字段 id 名称').value, 'id');
    assert.match(screen.getByRole('alert').textContent, /已恢复原名称/);
    assert.equal(changes, 0);
  }
  fireEvent.change(screen.getByLabelText('字段 id 名称'), { target: { value: 'discard' } });
  fireEvent.keyDown(screen.getByLabelText('字段 id 名称'), { key: 'Escape' });
  fireEvent.blur(screen.getByLabelText('字段 id 名称'));
  assert.equal(changes, 0);
  fireEvent.change(screen.getByLabelText('字段 id 名称'), { target: { value: 'identifier' } });
  fireEvent.blur(screen.getByLabelText('字段 id 名称'));
  assert.deepEqual(latest.required, ['identifier', 'outside']);
  assert.deepEqual(Object.keys(latest.properties), ['identifier', 'other']);
  assert.equal(latest.properties.identifier.minimum, 1);
  assert.deepEqual(latest['x-vendor'], original['x-vendor']);
  assert.equal(screen.getByLabelText('字段 identifier 名称').value, 'identifier');
  const saved = JSON.stringify(latest);
  view.unmount();
  render(h(Editor, { data: saved, onChange: value => { latest = JSON.parse(value); } }));
  assert.equal(screen.getByLabelText('字段 identifier 名称').value, 'identifier');
  assert.equal(screen.getByLabelText('identifier 必填').checked, true);
  await userEvent.click(screen.getByLabelText('删除字段 identifier'));
  assert.deepEqual(latest.required, ['outside']);
  assert.equal(latest.properties.identifier, undefined);
});

test('schema require-all traverses nested objects and array tuples without touching extension data', async () => {
  const { default: Editor, setAllRequired } = require('../client/components/SchemaEditor');
  const original = {
    type: 'object', required: ['first'], additionalProperties: false,
    properties: {
      first: { type: 'string' },
      nested: { type: 'object', properties: { yes: true, no: false } },
      rows: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } },
      tuple: { type: 'array', items: [{ type: 'object', properties: { a: {} } }, { type: 'object', properties: { b: {} } }, false] },
      closed: { type: 'array', items: false }
    },
    definitions: { retained: { type: 'object', required: ['old'], properties: { old: {} } } },
    'x-vendor': { type: 'object', required: ['preserve'] },
    default: { required: ['example'] }
  };
  const snapshot = JSON.stringify(original);
  const checked = setAllRequired(original, true);
  assert.equal(JSON.stringify(original), snapshot, 'require-all must not mutate its input');
  assert.deepEqual(checked.required, Object.keys(original.properties));
  assert.deepEqual(checked.properties.nested.required, ['yes', 'no']);
  assert.deepEqual(checked.properties.rows.items.required, ['id']);
  assert.deepEqual(checked.properties.tuple.items[1].required, ['b']);
  assert.equal(checked.properties.tuple.items[2], false);
  assert.equal(checked.properties.closed.items, false);
  assert.deepEqual(checked.definitions, original.definitions);
  assert.deepEqual(checked['x-vendor'], original['x-vendor']);
  const cleared = setAllRequired(checked, false);
  assert.equal('required' in cleared, false);
  assert.equal('required' in cleared.properties.rows.items, false);
  assert.equal('required' in cleared.properties.tuple.items[1], false);
  assert.deepEqual(cleared.default, original.default);
  let latest;
  render(h(Editor, { data: snapshot, onChange: value => { latest = JSON.parse(value); } }));
  assert.equal(screen.getByLabelText('全部字段必填').indeterminate, true);
  await userEvent.click(screen.getByLabelText('全部字段必填'));
  assert.deepEqual(latest, checked);
  assert.equal(screen.getByLabelText('全部字段必填').checked, true);
  await userEvent.click(screen.getByLabelText('全部字段必填'));
  assert.deepEqual(latest, cleared);
  await userEvent.click(screen.getByLabelText('全部字段必填'));
  assert.deepEqual(latest, checked);
});

test('schema multiline description and Mock drafts cancel, apply and reopen without losing keywords', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  let latest, changes = 0;
  render(h(Editor, { data: JSON.stringify({ type: 'object', description: 'Root', properties: { code: { type: 'string', minLength: 2, description: 'Before', mock: { mock: '@word', 'x-option': 3 } } } }), onChange: value => { latest = JSON.parse(value); changes++; } }));
  assert.equal(screen.getByLabelText('编辑 根节点 Mock').disabled, true);
  await userEvent.click(screen.getByLabelText('编辑 code 描述'));
  fireEvent.change(screen.getByLabelText('code 描述内容'), { target: { value: 'Discard\nthis' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^取\s*消$/ }));
  assert.equal(changes, 0);
  await userEvent.click(screen.getByLabelText('编辑 code 描述'));
  assert.equal(screen.getByLabelText('code 描述内容').value, 'Before');
  fireEvent.change(screen.getByLabelText('code 描述内容'), { target: { value: 'Line 1\nLine 2' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
  assert.equal(latest.properties.code.description, 'Line 1\nLine 2');
  assert.equal(latest.properties.code.minLength, 2);
  await userEvent.click(screen.getByLabelText('编辑 code 描述'));
  assert.equal(screen.getByLabelText('code 描述内容').value, 'Line 1\nLine 2');
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^取\s*消$/ }));
  await userEvent.click(screen.getByLabelText('编辑 code Mock'));
  fireEvent.change(screen.getByLabelText('code Mock内容'), { target: { value: '@pick([\n"a", "b"\n])' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
  assert.deepEqual(latest.properties.code.mock, { mock: '@pick([\n"a", "b"\n])', 'x-option': 3 });
  await userEvent.click(screen.getByLabelText('编辑 code Mock'));
  assert.equal(screen.getByLabelText('code Mock内容').value, latest.properties.code.mock.mock);
  fireEvent.change(screen.getByLabelText('code Mock内容'), { target: { value: '' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
  assert.deepEqual(latest.properties.code.mock, { mock: '', 'x-option': 3 });
  await userEvent.click(screen.getByLabelText('编辑 根节点 描述'));
  fireEvent.change(screen.getByLabelText('根节点 描述内容'), { target: { value: 'Root\ndescription' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
  assert.equal(latest.description, 'Root\ndescription');
});

test('schema node advanced JSON rejects invalid shapes and replaces only the applied subtree', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  const original = { type: 'object', required: ['code'], additionalProperties: false, properties: { code: { type: 'string', pattern: '^[a-z]+$' }, other: { const: 'untouched', 'x-unknown': [1, 2] } } };
  let latest, changes = 0;
  const view = render(h(Editor, { data: JSON.stringify(original), onChange: value => { latest = JSON.parse(value); changes++; } }));
  await userEvent.click(screen.getByLabelText('高级设置 code'));
  for (const value of ['{invalid', '[]', 'null', '0', '"string"', '']) {
    fireEvent.change(screen.getByLabelText('code 高级设置内容'), { target: { value } });
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
    assert.ok(within(screen.getByRole('dialog')).getByRole('alert'));
    assert.equal(changes, 0);
  }
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^取\s*消$/ }));
  await userEvent.click(screen.getByLabelText('高级设置 code'));
  assert.deepEqual(JSON.parse(screen.getByLabelText('code 高级设置内容').value), original.properties.code);
  const subtree = { type: ['string', 'null'], anyOf: [{ maxLength: 10 }, { const: null }], 'x-custom': { a: 1 } };
  fireEvent.change(screen.getByLabelText('code 高级设置内容'), { target: { value: JSON.stringify(subtree) } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
  assert.deepEqual(latest, { ...original, properties: { ...original.properties, code: subtree } });
  await userEvent.click(screen.getByLabelText('高级设置 code'));
  assert.deepEqual(JSON.parse(screen.getByLabelText('code 高级设置内容').value), subtree);
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^取\s*消$/ }));
  const saved = JSON.stringify(latest);
  view.unmount();
  render(h(Editor, { data: saved, onChange: value => { latest = JSON.parse(value); } }));
  await userEvent.click(screen.getByLabelText('高级设置 code'));
  assert.deepEqual(JSON.parse(screen.getByLabelText('code 高级设置内容').value), subtree);
  fireEvent.change(screen.getByLabelText('code 高级设置内容'), { target: { value: 'false' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
  assert.equal(latest.properties.code, false);
  assert.deepEqual(latest.required, ['code']);
  assert.deepEqual(latest.properties.other, original.properties.other);
});

test('schema boolean roots stay lossless through mount, JSON changes, advanced edits and imports', async () => {
  const { default: Editor, parseSchema } = require('../client/components/SchemaEditor');
  assert.equal(parseSchema('false'), false);
  assert.equal(parseSchema('true'), true);
  for (const value of ['null', '[]', '0', '"object"', '']) assert.throws(() => parseSchema(value));
  let latest, validity;
  const onChange = value => { latest = value; };
  const onValidityChange = value => { validity = value; };
  const view = render(h(Editor, { data: false, onChange, onValidityChange }));
  assert.equal(validity, true);
  assert.ok(screen.getByText('根节点: false'));
  assert.equal(latest, undefined);
  await userEvent.click(screen.getByRole('tab', { name: 'JSON（完整 Schema）' }));
  assert.equal(screen.getByLabelText('JSON Schema').value, 'false');
  for (const value of ['true', 'false']) {
    fireEvent.change(screen.getByLabelText('JSON Schema'), { target: { value } });
    assert.equal(latest, value);
    assert.equal(validity, true);
  }
  for (const value of ['', 'null', '[]', '{']) {
    fireEvent.change(screen.getByLabelText('JSON Schema'), { target: { value } });
    assert.equal(validity, false);
    assert.equal(latest, 'false');
  }
  fireEvent.change(screen.getByLabelText('JSON Schema'), { target: { value: 'true' } });
  await userEvent.click(screen.getByRole('tab', { name: '可视化 Schema' }));
  await userEvent.click(screen.getByLabelText('高级设置 根节点'));
  fireEvent.change(screen.getByLabelText('根节点 高级设置内容'), { target: { value: 'false' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
  assert.equal(latest, 'false');
  for (const value of ['true', 'false']) {
    await userEvent.click(screen.getByRole('button', { name: '导入 JSON' }));
    await userEvent.click(screen.getByRole('radio', { name: 'JSON Schema' }));
    fireEvent.change(screen.getByLabelText('导入 JSON 内容'), { target: { value } });
    await userEvent.click(screen.getByRole('button', { name: '导入并替换' }));
    assert.equal(latest, value);
    assert.equal(validity, true);
  }
  view.unmount();
  render(h(Editor, { data: latest, onChange, onValidityChange }));
  assert.ok(screen.getByText('根节点: false'));
  assert.equal(validity, true);
});

test('schema array edits retain boolean and tuple items, complex keywords, collapse and repeat actions', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  const original = { type: 'array', items: [{ type: 'object', properties: { id: { type: 'integer' } }, unevaluatedProperties: false }, false, { $ref: '#/$defs/tail' }], $defs: { tail: { type: ['string', 'null'] } }, prefixItems: [true, false], 'x-unknown': { keep: true } };
  let latest;
  render(h(Editor, { data: JSON.stringify(original), onChange: value => { latest = JSON.parse(value); } }));
  await userEvent.click(screen.getByLabelText('折叠 数组元素 1'));
  assert.equal(screen.queryByLabelText('字段 id 名称'), null);
  await userEvent.click(screen.getByLabelText('添加字段 数组元素 1'));
  assert.ok(screen.getByLabelText('字段 id 名称'));
  assert.ok(screen.getByLabelText('字段 field1 名称'));
  await userEvent.click(screen.getByLabelText('添加字段 数组元素 1'));
  assert.ok(screen.getByLabelText('字段 field2 名称'));
  await userEvent.click(screen.getByLabelText('删除字段 field1'));
  await userEvent.click(screen.getByLabelText('添加字段 数组元素 1'));
  assert.ok(screen.getByLabelText('字段 field1 名称'));
  assert.equal(latest.items[0].unevaluatedProperties, false);
  assert.deepEqual(latest.items.slice(1), original.items.slice(1));
  assert.deepEqual(latest.$defs, original.$defs);
  assert.deepEqual(latest.prefixItems, original.prefixItems);
  assert.deepEqual(latest['x-unknown'], original['x-unknown']);
  await userEvent.click(screen.getByLabelText('高级设置 数组元素 1'));
  fireEvent.change(screen.getByLabelText('数组元素 1 高级设置内容'), { target: { value: 'false' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
  assert.equal(latest.items[0], false);
  assert.deepEqual(latest.items.slice(1), original.items.slice(1));
  assert.ok(screen.getByText('数组元素 1: false'));
  await userEvent.click(screen.getByLabelText('高级设置 数组元素 1'));
  assert.equal(screen.getByLabelText('数组元素 1 高级设置内容').value, 'false');
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^取\s*消$/ }));
});

test('schema advanced drafts close on an external schema replacement instead of overwriting newer data', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  let latest;
  const onChange = value => { latest = value; };
  const view = render(h(Editor, { data: '{"type":"string","description":"before"}', onChange }));
  await userEvent.click(screen.getByLabelText('高级设置 根节点'));
  fireEvent.change(screen.getByLabelText('根节点 高级设置内容'), { target: { value: '{"const":"stale"}' } });
  view.rerender(h(Editor, { data: '{"type":"number","minimum":5}', onChange }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(latest, undefined);
  await userEvent.click(screen.getByLabelText('高级设置 根节点'));
  assert.deepEqual(JSON.parse(screen.getByLabelText('根节点 高级设置内容').value), { type: 'number', minimum: 5 });
});

test('schema plain Mock clearing uses the legacy empty representation and Cancel never publishes a draft', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  let latest, changes = 0;
  render(h(Editor, { data: '{"type":"string","mock":{"mock":"@word"}}', onChange: value => { latest = JSON.parse(value); changes++; } }));
  await userEvent.click(screen.getByLabelText('编辑 根节点 Mock'));
  fireEvent.change(screen.getByLabelText('根节点 Mock内容'), { target: { value: '@discard' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^取\s*消$/ }));
  assert.equal(changes, 0);
  await userEvent.click(screen.getByLabelText('编辑 根节点 Mock'));
  assert.equal(screen.getByLabelText('根节点 Mock内容').value, '@word');
  fireEvent.change(screen.getByLabelText('根节点 Mock内容'), { target: { value: '' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^应\s*用$/ }));
  assert.equal(latest.mock, '');
  fireEvent.change(screen.getByLabelText('根节点 Mock'), { target: { value: '@integer' } });
  assert.deepEqual(latest.mock, { mock: '@integer' });
  fireEvent.change(screen.getByLabelText('根节点 Mock'), { target: { value: '' } });
  assert.equal(latest.mock, '');
});

test('schema deep content and special property names survive edits without rewriting unrelated keywords', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  let deep = { const: 7, 'x-deep': true };
  for (let index = 14; index >= 0; index--) deep = { type: 'object', properties: { ['depth' + index]: deep } };
  const original = { type: 'object', required: ['old'], properties: { old: { type: 'string' }, deep }, $defs: { other: false }, allOf: [{ 'x-keyword': { required: ['leave'] } }] };
  let latest;
  render(h(Editor, { data: JSON.stringify(original), onChange: value => { latest = JSON.parse(value); } }));
  for (let index = 3; index <= 14; index++) {
    const expand = screen.queryByRole('button', { name: '展开 depth' + index });
    if (expand) fireEvent.click(expand);
  }
  assert.ok(screen.getByRole('button', { name: '高级设置 depth14' }));
  fireEvent.change(screen.getByLabelText('字段 old 名称'), { target: { value: '__proto__' } });
  fireEvent.blur(screen.getByLabelText('字段 old 名称'));
  assert.ok(Object.prototype.hasOwnProperty.call(latest.properties, '__proto__'));
  assert.deepEqual(latest.required, ['__proto__']);
  assert.deepEqual(latest.properties.deep, deep);
  assert.deepEqual(latest.$defs, original.$defs);
  assert.deepEqual(latest.allOf, original.allOf);
  assert.equal(Object.getPrototypeOf(latest.properties), Object.prototype);
  await userEvent.click(screen.getByRole('tab', { name: 'JSON（完整 Schema）' }));
  assert.deepEqual(JSON.parse(screen.getByLabelText('JSON Schema').value), latest);
});

test('schema dialogs discard Close and Escape drafts and reject invalid schema imports', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  let latest, changes = 0;
  render(h(Editor, { data: '{"type":"string","description":"before"}', onChange: value => { latest = JSON.parse(value); changes++; } }));
  await userEvent.click(screen.getByLabelText('编辑 根节点 描述'));
  fireEvent.change(screen.getByLabelText('根节点 描述内容'), { target: { value: 'discard on close' } });
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  assert.equal(changes, 0);
  await userEvent.click(screen.getByLabelText('高级设置 根节点'));
  fireEvent.change(screen.getByLabelText('根节点 高级设置内容'), { target: { value: '{"const":"discard on Escape"}' } });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(changes, 0);
  await userEvent.click(screen.getByRole('button', { name: '导入 JSON' }));
  await userEvent.click(screen.getByRole('radio', { name: 'JSON Schema' }));
  for (const value of ['{', 'null', '[]', '1']) {
    fireEvent.change(screen.getByLabelText('导入 JSON 内容'), { target: { value } });
    await userEvent.click(screen.getByRole('button', { name: '导入并替换' }));
    assert.ok(within(screen.getByRole('dialog')).getByRole('alert'));
    assert.equal(changes, 0);
  }
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^取\s*消$/ }));
  assert.equal(screen.getByLabelText('根节点 描述').value, 'before');
  await userEvent.click(screen.getByRole('button', { name: '导入 JSON' }));
  assert.equal(screen.getByLabelText('导入 JSON 内容').value, '');
  await userEvent.click(screen.getByRole('radio', { name: 'JSON 示例' }));
  fireEvent.change(screen.getByLabelText('导入 JSON 内容'), { target: { value: 'false' } });
  await userEvent.click(screen.getByRole('button', { name: '导入并替换' }));
  assert.deepEqual(latest, { type: 'boolean' });
});

test('schema table explicitly describes boolean roots instead of hiding false or rendering an empty true row', () => {
  const SchemaTable = require('../client/components/SchemaTable/SchemaTable').default;
  const view = render(h(SchemaTable, { dataSource: 'false' }));
  assert.match(screen.getByTestId('boolean-schema-preview').textContent, /JSON Schema: false/);
  assert.match(screen.getByTestId('boolean-schema-preview').textContent, /不允许任何 JSON 值。/);
  assert.equal(screen.queryByRole('table'), null);
  view.rerender(h(SchemaTable, { dataSource: 'true' }));
  assert.match(screen.getByTestId('boolean-schema-preview').textContent, /JSON Schema: true/);
  assert.match(screen.getByTestId('boolean-schema-preview').textContent, /允许任意 JSON 值。/);
  assert.equal(screen.queryByRole('table'), null);
  view.rerender(h(SchemaTable, { dataSource: '{"type":"object","properties":{"id":{"type":"integer"}}}' }));
  assert.ok(screen.getByRole('table'));
  assert.equal(screen.queryByTestId('boolean-schema-preview'), null);
});

test('legacy schema title, Mock choices, typed advanced drafts and tuple siblings remain independently editable', async () => {
  const Editor = require('../client/components/SchemaEditor').default;
  let latest;
  render(h(Editor, { data: JSON.stringify({type:'object',properties:{amount:{type:'integer',enum:[0], 'x-retained':7}, tuple:{type:'array',items:[{type:'string'},{type:'integer'}]}}}), onChange:value => {latest=JSON.parse(value);} }));
  fireEvent.change(screen.getByLabelText('amount 标题'), {target:{value:'金额'}});
  assert.equal(latest.properties.amount.title,'金额');
  await userEvent.type(screen.getByLabelText('amount Mock'), '@inte');
  const choices = await screen.findAllByText('@integer');
  await userEvent.click(choices[choices.length - 1]);
  assert.deepEqual(latest.properties.amount.mock,{mock:'@integer'});
  await userEvent.click(screen.getByRole('button',{name:'高级设置 amount'}));
  fireEvent.change(screen.getByRole('spinbutton',{name:'最小值'}),{target:{value:'2'}});
  fireEvent.blur(screen.getByRole('spinbutton',{name:'最小值'}));
  await userEvent.click(screen.getByRole('button',{name:'取 消'}));
  assert.equal(latest.properties.amount.minimum,undefined);
  await userEvent.click(screen.getByRole('button',{name:'高级设置 amount'}));
  fireEvent.change(screen.getByRole('spinbutton',{name:'最小值'}),{target:{value:'2'}});
  fireEvent.blur(screen.getByRole('spinbutton',{name:'最小值'}));
  fireEvent.change(screen.getByLabelText('枚举值（每行一个）'),{target:{value:'oops'}});
  assert.ok(screen.getByRole('button',{name:'应 用'}).disabled);
  fireEvent.change(screen.getByRole('spinbutton',{name:'最大值'}),{target:{value:'99'}});
  fireEvent.blur(screen.getByRole('spinbutton',{name:'最大值'}));
  assert.equal(screen.getByLabelText('枚举值（每行一个）').value,'oops');
  assert.ok(screen.getByRole('button',{name:'应 用'}).disabled);
  fireEvent.change(screen.getByLabelText('枚举值（每行一个）'),{target:{value:'2\n3'}});
  await userEvent.click(screen.getByRole('button',{name:'应 用'}));
  assert.equal(latest.properties.amount.minimum,2);
  assert.deepEqual(latest.properties.amount.enum,[2,3]);
  assert.equal(latest.properties.amount['x-retained'],7);
  fireEvent.change(screen.getByLabelText('数组元素 2 标题'),{target:{value:'second'}});
  assert.equal(latest.properties.tuple.items[1].title,'second');
  assert.equal(latest.properties.tuple.items[0].type,'string');
});


test('environment form hydrates asynchronous records and switches without stale nested values', async () => {
  const Environment = require('../client/containers/Project/Setting/ProjectEnv/ProjectEnvContent').default;
  let saved;
  const props = { handleEnvInput() {}, onSubmit(value) { saved = value; } };
  const view = render(h(Environment, { ...props, projectMsg: {} }));
  const first = { name: 'local-synthetic', domain: 'http://127.0.0.1:3000/mock/1', header: [{ name: 'X-Fixture', value: 'synthetic' }], global: [{ name: 'sampleId', value: '42' }] };
  view.rerender(h(Environment, { ...props, projectMsg: first }));
  await waitFor(() => assert.equal(screen.getByPlaceholderText('请输入环境名称').value, 'local-synthetic'));
  assert.equal(screen.getByPlaceholderText('请输入环境域名').value, '127.0.0.1:3000/mock/1');
  assert.equal(document.getElementById('header_0_value').value, 'synthetic');
  assert.equal(document.getElementById('global_0_value').value, '42');
  const second = { name: 'browser-synthetic', domain: 'https://example.invalid/mock', header: [], global: [] };
  view.rerender(h(Environment, { ...props, projectMsg: second }));
  await waitFor(() => assert.equal(screen.getByPlaceholderText('请输入环境名称').value, 'browser-synthetic'));
  assert.equal(screen.getByPlaceholderText('请输入环境域名').value, 'example.invalid/mock');
  assert.equal(document.getElementById('header_0_value').value, '');
  assert.equal(document.getElementById('global_0_value').value, '');
  view.rerender(h(Environment, { ...props, projectMsg: first }));
  await waitFor(() => assert.equal(document.getElementById('global_0_value').value, '42'));
  fireEvent.click(screen.getByRole('button', { name: /保.*存/ }));
  await waitFor(() => assert.ok(saved));
  assert.equal(saved.env.domain, first.domain);
  assert.deepEqual(saved.env.global, first.global);
  assert.deepEqual(saved.env.header, first.header);
});


test('environment no-op save preserves row ordering and synthetic cookie equals signs', async () => {
  const Environment = require('../client/containers/Project/Setting/ProjectEnv/ProjectEnvContent').default;
  let saved;
  const source={name:'cookie-fixture',domain:'http://example.invalid',header:[{name:'X-First',value:'one'},{name:'X-Second',value:'two'},{name:'Cookie',value:'sample=a=b==;other=2'}],global:[{name:'first',value:'1'},{name:'second',value:'2'}]};
  render(h(Environment,{projectMsg:source,handleEnvInput(){},onSubmit(value){saved=value;}}));
  await waitFor(()=>assert.equal(document.getElementById('cookie_0_value').value,'a=b=='));
  assert.equal(document.getElementById('cookie_1_value').value,'2');
  fireEvent.click(screen.getByRole('button',{name:/保.*存/}));
  await waitFor(()=>assert.ok(saved));
  assert.deepEqual(saved.env.header,source.header);
  assert.deepEqual(saved.env.global,source.global);
});


test('empty environment component exposes add and safely saves its first record', async () => {
  const Environment = require('../client/containers/Project/Setting/ProjectEnv').default.WrappedComponent;
  let saved;
  const project={_id:91,role:'owner',env:[]};
  axios.get=async(url,options)=>{assert.equal(url,'/api/project/get');assert.equal(options.params.id,91);return {data:{errcode:0,data:project}};};
  const refresh=async()=>({payload:{data:{errcode:0,data:project}}});
  render(h(Environment,{projectId:91,projectMsg:project,getProject:refresh,getEnv:refresh,updateEnv:async value=>{saved=value;project.env=value.env;return {payload:{data:{errcode:0}}};}}));
  await screen.findByText('暂无环境配置');
  fireEvent.click(screen.getByRole('button',{name:'添加环境'}));
  await userEvent.type(screen.getByPlaceholderText('请输入环境名称'),'first');
  await userEvent.type(screen.getByPlaceholderText('请输入环境域名'),'example.invalid');
  fireEvent.click(screen.getByRole('button',{name:/保.*存/}));
  await waitFor(()=>assert.ok(saved));assert.equal(saved._id,91);assert.equal(saved.env.length,1);assert.equal(saved.env[0].name,'first');assert.equal(saved.env[0].domain,'http://example.invalid');
});


test('legacy interface and category submit buttons recover after validation errors', async () => {
  const AddInterface = require('../client/containers/Project/Interface/InterfaceList/AddInterfaceForm').default;
  const AddCategory = require('../client/containers/Project/Interface/InterfaceList/AddInterfaceCatForm').default;
  let submitted;
  const view=render(h(AddInterface,{catdata:[{_id:13,name:'Synthetic category'}],onSubmit:value=>{submitted=value;},onCancel(){}}));
  const submit=screen.getByRole('button',{name:/提.*交/});
  assert.equal(submit.disabled,false);fireEvent.click(submit);
  await screen.findByText('请输入接口路径!');
  await userEvent.type(screen.getByPlaceholderText('接口名称'),'Synthetic new interface');
  await userEvent.type(screen.getByPlaceholderText('/path'),'/synthetic');
  await waitFor(()=>assert.equal(submit.disabled,false));fireEvent.click(submit);
  await waitFor(()=>assert.ok(submitted));assert.equal(submitted.title,'Synthetic new interface');assert.equal(submitted.path,'/synthetic');
  view.unmount();submitted=null;
  render(h(AddCategory,{onSubmit:value=>{submitted=value;},onCancel(){}}));
  const categorySubmit=screen.getByRole('button',{name:/提.*交/});assert.equal(categorySubmit.disabled,false);
  await userEvent.type(document.querySelector('#name'),'Synthetic new category');
  fireEvent.click(categorySubmit);await waitFor(()=>assert.ok(submitted));assert.equal(submitted.name,'Synthetic new category');
});

test('new interface empty schema initializes valid but a cleared JSON draft remains invalid', async () => {
  const Editor=require('../client/components/SchemaEditor').default;
  let validity,latest;
  render(h(Editor,{data:'',onChange:value=>{latest=value;},onValidityChange:value=>{validity=value;}}));
  await waitFor(()=>assert.equal(validity,true));assert.equal(latest,undefined);
  await userEvent.click(screen.getByRole('tab',{name:'JSON（完整 Schema）'}));
  assert.equal(JSON.parse(screen.getByLabelText('JSON Schema').value).type,'object');
  fireEvent.change(screen.getByLabelText('JSON Schema'),{target:{value:''}});
  await waitFor(()=>assert.equal(validity,false));assert.equal(latest,undefined);
});
