'use strict';
// CSS/SSR contracts only. jsdom does not establish browser layout or screenshot parity.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { JSDOM } = require('jsdom');
const sass = require('sass');
const less = require('less');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const compileSass = file => sass.compile(path.join(root, file), {
  silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions']
}).css;

async function entryStyles() {
  const styles = [];
  for (const [, name] of read('client/index.js').matchAll(/import ['"]([^'"]+\.(?:css|scss|less))['"]/g)) {
    if (name.endsWith('.scss')) styles.push(compileSass(path.join('client', name)));
    else if (name.endsWith('.less')) styles.push((await less.render(read(path.join('client', name)))).css);
    else styles.push(fs.readFileSync(require.resolve(name), 'utf8'));
  }
  return styles.join('\n');
}

function loadClientModule(file) {
  const { code } = require('@babel/core').transformSync(read(file), {
    babelrc: false, configFile: false,
    presets: [
      ['@babel/preset-env', { targets: { node: '24' }, modules: 'commonjs' }],
      ['@babel/preset-react', { runtime: 'automatic' }]
    ]
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, createRequire(path.join(root, file)));
  return module.exports.default;
}
const loadTheme = () => loadClientModule('client/styles/theme.js');

test('AntD reset precedes application styles and the shared token theme is installed', () => {
  const entry = read('client/index.js');
  assert.ok(entry.indexOf("import 'antd/dist/reset.css'") < entry.indexOf("import './styles/common.scss'"));
  assert.match(entry, /import yapiTheme from ['"]\.\/styles\/theme['"]/);
  assert.match(entry, /<ConfigProvider\b[^>]*theme=\{yapiTheme\}/);
});

test('100px rem layout has an independent 13px text baseline and normal native headings', async () => {
  const dom = new JSDOM(`<style>${await entryStyles()}</style><body>
    <div class="g-statistic"><div class="content"><h3 class="statis-title">分组数据详情</h3>
      <span id="label">分组总数</span><h2 class="gutter-box">12</h2></div></div>
    <section><h3 id="other-heading">Project heading</h3><p id="plain-text">Plugin text</p></section>
  </body>`);
  try {
    const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
    assert.equal(style('html').fontSize, '100px', 'do not shrink rem-based page geometry');
    assert.equal(style('body').fontSize, '13px', 'native text must not inherit the 100px rem root');
    assert.equal(style('body').lineHeight, '1.5');
    assert.equal(style('body').color, 'rgba(13, 27, 62, 0.65)');
    assert.equal(style('body').backgroundColor, 'rgb(236, 238, 241)');
    for (const selector of ['#label', '#plain-text']) assert.equal(style(selector).fontSize, '13px');
    for (const selector of ['.statis-title', '#other-heading']) {
      assert.equal(style(selector).fontSize, '15.21px', 'native h3 remains 1.17 × body size');
      assert.equal(style(selector).color, 'rgba(39, 56, 72, 0.85)');
      assert.equal(style(selector).fontWeight, '500');
    }
    assert.equal(style('.gutter-box').fontSize, '19.5px');
  } finally { dom.window.close(); }
});

test('header custom-input search cannot inherit the 56px navigation line height', async () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { AutoComplete, Input, ConfigProvider } = require('antd');
  const h = React.createElement;
  // Real AntD markup is used because Input's className belongs to its affix wrapper.
  const markup = renderToStaticMarkup(h(ConfigProvider, { theme: loadTheme() },
    h('div', { className: 'header-box' }, h('div', { className: 'search-wrapper' },
      h(AutoComplete, { className: 'search-dropdown', options: [] },
        h(Input, { className: 'search-input', prefix: h('span', null, 'Search'), placeholder: '搜索分组/项目/接口' }))))));
  const css = [await entryStyles(), compileSass('client/components/Header/Header.scss'),
    compileSass('client/components/Header/Search/Search.scss')].join('\n');
  const dom = new JSDOM(`<style>${css}</style>${markup}`);
  try {
    const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
    assert.equal(style('.header-box').lineHeight, '56px');
    assert.equal(style('.search-wrapper').fontSize, '13px');
    assert.equal(style('.search-wrapper').lineHeight, '1.5');
    assert.ok(dom.window.document.querySelector('.search-input.ant-input-affix-wrapper'));
    assert.equal(style('.search-input').height, '32px');
  } finally { dom.window.close(); }
});

test('the actual statistics table keeps its heading scale with populated and empty data', async () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ConfigProvider } = require('antd');
  const StatisTable = loadClientModule('exts/yapi-plugin-statistics/statisticsClientPage/StatisTable.js');
  const css = [await entryStyles(), compileSass('exts/yapi-plugin-statistics/statisticsClientPage/index.scss')].join('\n');
  for (const dataSource of [[], [{ key: 'fixture', name: 'Fixture group', project: 15, interface: 512, mock: 29 }]]) {
    const markup = renderToStaticMarkup(React.createElement(ConfigProvider, { theme: loadTheme() },
      React.createElement('div', { className: 'g-statistic' }, React.createElement(StatisTable, { dataSource }))));
    const dom = new JSDOM(`<style>${css}</style>${markup}`);
    try {
      const heading = dom.window.document.querySelector('.statis-title');
      assert.equal(heading.tagName, 'H3');
      assert.equal(heading.textContent, '分组数据详情');
      const style = dom.window.getComputedStyle(heading);
      assert.equal(style.fontSize, '15.21px');
      assert.equal(style.padding, '8px 8px 24px');
      assert.equal(dom.window.document.querySelectorAll('th').length, 4);
      if (dataSource.length) assert.match(dom.window.document.body.textContent, /Fixture group/);
    } finally { dom.window.close(); }
  }
});

test('AntD tokens retain the legacy typography, colors, control sizes and table density', () => {
  const theme = loadTheme();
  const token = require('antd').theme.getDesignToken(theme);
  assert.equal(token.fontSize, 13);
  assert.equal(token.fontSizeLG, 16);
  assert.equal(token.lineHeight, 1.5);
  assert.equal(token.fontWeightStrong, 500);
  assert.equal(token.colorText, 'rgba(13, 27, 62, 0.65)');
  assert.equal(token.colorTextHeading, 'rgba(39, 56, 72, 0.85)');
  assert.equal(token.colorTextSecondary, 'rgba(13, 27, 62, 0.43)');
  assert.equal(token.colorTextPlaceholder, 'rgba(13, 27, 62, 0.45)');
  assert.deepEqual([token.controlHeightSM, token.controlHeight, token.controlHeightLG], [26, 32, 36]);
  assert.equal(theme.components.Layout.bodyBg, '#eceef1');
  assert.equal(theme.components.Layout.headerHeight, 56);
  assert.equal(theme.components.Table.headerBg, '#eee');
  assert.equal(theme.components.Table.headerColor, token.colorTextHeading);
  assert.equal(theme.components.Table.cellPaddingBlock, 16);
  assert.equal(theme.components.Table.cellPaddingInline, 10);
  assert.equal(theme.components.Table.headerSplitColor, 'transparent');
});
