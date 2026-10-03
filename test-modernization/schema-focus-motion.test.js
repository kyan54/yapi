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
// jsdom has no CSS clock; exercise real rc-motion via explicit animation-end events.
window.AnimationEvent = window.Event;
window.TransitionEvent = window.Event;
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


const Editor = require('../client/components/SchemaEditor').default;
const initial = JSON.stringify({type:'object',description:'before',properties:{leaf:{type:'string',description:'leaf before'}}});
async function finishMotion(dialog, phase) {
  await waitFor(() => assert.match(dialog.className, new RegExp(phase + '-active')));
  fireEvent.animationEnd(dialog);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,60));});
}
async function openDescription(label) {
  const trigger=screen.getByRole('button',{name:'编辑 '+label+' 描述'});
  trigger.focus(); fireEvent.click(trigger);
  const dialog=screen.getByRole('dialog');
  await finishMotion(dialog,'appear');
  return {trigger,dialog};
}
for (const label of ['根节点','leaf']) for (const close of ['Cancel','Apply']) {
 test('external data replacement during '+close+' motion retires '+label+' dialog without stealing focus', async () => {
  let latest;
  const view=render(h('div',null,h('input',{'aria-label':'new document input'}),h(Editor,{data:initial,onChange:v=>{latest=v;}})));
  const {trigger,dialog}=await openDescription(label);
  await userEvent.click(within(dialog).getByRole('textbox')); await userEvent.type(within(dialog).getByRole('textbox'),' local draft',{delay:30});
  fireEvent.click(within(dialog).getByRole('button',{name:close==='Cancel'?/^取\s*消$/:/^应\s*用$/}));
  await waitFor(()=>assert.match(dialog.className,/leave-active/));
  assert.ok(dialog.isConnected,'must replace during live closing motion');
  view.rerender(h('div',null,h('input',{'aria-label':'new document input'}),h(Editor,{data:JSON.stringify({type:'object',description:'external',properties:{leaf:{type:'string',description:'external leaf'}}}),onChange:v=>{latest=v;}})));
  const target=screen.getByLabelText('new document input');target.focus();
  assert.equal(dialog.isConnected,false,'external generation must retire old dialog');
  fireEvent.animationEnd(dialog);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,80));});
  assert.equal(document.activeElement,target);assert.equal(trigger.isConnected,false);
  assert.equal(screen.getByLabelText(label+' 描述').value,label==='leaf'?'external leaf':'external');
  if(close==='Cancel')assert.equal(latest,undefined);
  else {
    const applied=JSON.parse(latest);
    assert.equal(label==='leaf'?applied.properties.leaf.description:applied.description,(label==='leaf'?'leaf before':'before')+' local draft');
  }
 });
}
for (const close of ['Cancel','Apply']) test('ordinary '+close+' motion restores focus including controlled Apply echo', async()=>{
 const Demo=()=>{const [data,setData]=React.useState(initial);return h(Editor,{data,onChange:setData});};
 render(h(Demo));const {trigger,dialog}=await openDescription('根节点');
 await userEvent.click(within(dialog).getByRole('textbox')); await userEvent.type(within(dialog).getByRole('textbox'),'applied',{delay:30});
 fireEvent.click(within(dialog).getByRole('button',{name:close==='Cancel'?/^取\s*消$/:/^应\s*用$/}));
 await finishMotion(dialog,'leave');
 await waitFor(()=>assert.equal(document.activeElement,trigger));
 assert.equal(screen.getByLabelText('根节点 描述').value,close==='Apply'?'beforeapplied':'before');
});
