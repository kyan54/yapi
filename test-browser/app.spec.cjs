'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
const sha1 = require('sha1');
const fixture = require('../test-modernization/fixtures/interface.json');
let connection, child, directory, baseURL, log = '';
const root = path.resolve(__dirname, '..');
// Independent flows: a UI failure must not skip the Mock/assertion endpoint test.
test.describe.configure({ mode: 'default' });
test.skip(!process.env.YAPI_TEST_MONGO_URI, 'Requires a disposable MongoDB service; this is real app E2E with a deterministic local model response.');
test.beforeAll(async () => {
  const dbName = 'yapi_browser_test_' + process.pid + '_' + Date.now();
  connection = await mongoose.createConnection(process.env.YAPI_TEST_MONGO_URI, { dbName, serverSelectionTimeoutMS: 15000 }).asPromise();
  const db = connection.db;
  await db.collection('user').insertOne({ _id: 9, role: 'admin', username: 'Synthetic browser admin', email: 'browser@example.invalid', passsalt: 'browser-only-salt', password: sha1('synthetic-browser-password' + sha1('browser-only-salt')), type: 'site', study: true });
  await db.collection('group').insertOne({ _id: 8, uid: 9, group_name: 'Synthetic browser group', type: 'public', members: [], custom_field1: { name: '', enable: false } });
  await db.collection('project').insertOne({ _id: 11, uid: 9, group_id: 8, name: 'Synthetic browser project', project_type: 'private', members: [], env: [{ name: 'synthetic', domain: 'http://127.0.0.1', header: [], global: [] }], basepath: '', tag: [], switch_notice: false, pre_script: '', after_script: '' });
  await db.collection('interface_cat').insertOne({ _id: 13, uid: 9, project_id: 11, name: 'Synthetic category' });
  await db.collection('interface').insertOne({ ...fixture, uid: 9, req_headers: [], pre_script: '', res_body: '{"type":"object","properties":{"id":{"type":"integer"}}}' });
  await db.collection('interface_col').insertOne({ _id: 21, uid: 9, project_id: 11, name: 'Synthetic collection', desc: 'Browser fixture', index: 0 });
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yapi-browser-'));
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve)); baseURL = 'http://127.0.0.1:' + port;
  const configPath = path.join(directory, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ port, host: '127.0.0.1', timeout: 10000, db: { connectString: process.env.YAPI_TEST_MONGO_URI, options: { dbName } }, mail: { enable: false }, closeRegister: true, versionNotify: false }));
  child = spawn(process.execPath, ['--require', path.join(__dirname, 'provider-fixture.cjs'), 'server/app.js'], { cwd: root, env: { ...process.env, YAPI_CONFIG: configPath, YAPI_LLM_BASE_URL: 'https://llm-fixture.invalid/v1', YAPI_LLM_MODEL: 'deterministic-test-only', YAPI_LLM_API_KEY: 'synthetic-fixture-key' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
  for (let i = 0; i < 150; i++) { if (child.exitCode !== null) throw new Error(log); try { if ((await fetch(baseURL + '/api/user/status')).ok) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 200)); }
  throw new Error('App startup timeout: ' + log);
});
test.afterAll(async () => {
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
  if (connection) { await connection.dropDatabase(); await connection.close(); }
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});
async function login(page) {
  await page.goto(baseURL + '/login');
  await page.getByPlaceholder('Email', { exact: true }).fill('browser@example.invalid');
  await page.getByPlaceholder('Password', { exact: true }).fill('synthetic-browser-password');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page).toHaveURL(/\/group/);
}
async function saveInterfaceSuccessfully(page) {
  await expect(page.getByText('保存成功', { exact: true })).toHaveCount(0, {timeout:10000});
  const reply = page.waitForResponse(response => new URL(response.url()).pathname === '/api/interface/up' && response.request().method() === 'POST');
  await page.getByRole('button', { name: /^保\s*存$/ }).click();
  const response = await reply;
  expect(response.status()).toBe(200);
  expect((await response.json()).errcode).toBe(0);
  await expect(page.getByText('保存成功', { exact: true })).toBeVisible();
  await expect(page.getByText('服务器出错...', { exact: true })).toHaveCount(0);
}
test('real login, interface preview, reviewed AI update, history and reversible restore', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await page.goto(baseURL + '/project/11/interface/api/17');
  await expect(page.getByRole('tab', { name: '预览', exact: true })).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('interface-preview.png'),fullPage:true});
  await page.getByTestId('documentation-ai-button').click();
  await expect(page.getByTestId('documentation-outbound')).toContainText('Synthetic order lookup');
  const generate = page.getByRole('button', { name: '生成文档建议' }); await expect(generate).toBeDisabled();
  await page.getByRole('checkbox', { name: /我已检查接口内容/ }).check();
  await generate.click();
  await expect(page.getByRole('region', { name: 'AI 文档建议预览' })).toBeVisible();
  await expect(page.getByText('Confirm expansion semantics')).toBeVisible();
  await expect(page.locator('script').filter({ hasText: 'alert("fixture")' })).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('reviewed-ai-diff.png'),fullPage:true});
  await page.getByRole('button', { name: '审核完成，采纳此建议' }).click();
  await expect(page.getByRole('button', { name: '恢复原始文档（版本 0）' })).toBeVisible();
  let record = await connection.db.collection('interface').findOne({ _id: 17 });
  expect(record.docs_revision).toBe(1); expect(record.req_query[0].desc).toBe('Reviewed expansion selector'); expect(record.method).toBe(fixture.method); expect(record.path).toBe(fixture.path);
  await page.getByRole('button', { name: '恢复原始文档（版本 0）' }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(page.getByText('版本 2', { exact: true })).toBeVisible();
  record = await connection.db.collection('interface').findOne({ _id: 17 });
  expect(record.markdown).toBe(fixture.markdown); expect(record.req_query[0].desc).toBe(fixture.req_query[0].desc); expect(record.docs_history).toBeUndefined(); expect(record.docs_revision).toBe(2); expect(await connection.db.collection('documentation_revisions').countDocuments({interfaceId:17,projectId:11})).toBe(3);
  await page.screenshot({path:testInfo.outputPath('restored-version-history.png'),fullPage:true});
  expect(errors).toEqual([]);
});
test('legacy interface editing, request runner, Mock, collection, Swagger and configuration screens still mount', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await login(page); await page.goto(baseURL + '/project/11/interface/api/17');
  for (const name of ['编辑', '运行', '高级Mock', '预览']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Unexpected Application Error!')).toHaveCount(0);
    if(name==='编辑') {
      await expect(page.getByPlaceholder('接口名称')).toBeVisible();
      await page.getByPlaceholder('接口名称').fill('Browser verified manual edit');
      await saveInterfaceSuccessfully(page);
      await expect.poll(async()=> (await connection.db.collection('interface').findOne({_id:17})).title).toBe('Browser verified manual edit');
    }
    if(name==='运行') await expect(page.getByRole('button',{name:/^发\s*送$/})).toBeVisible();
    if(name==='高级Mock') {
      // AntD styles the native radio input with zero dimensions; the label and
      // controlled content are the visible UI, while checked state is semantic.
      await expect(page.getByText('期望',{exact:true})).toBeVisible();
      await expect(page.getByRole('radio',{name:'期望',exact:true})).toBeChecked();
      await expect(page.getByRole('button',{name:'添加期望',exact:true})).toBeVisible();
      await page.getByText('脚本',{exact:true}).click();
      await expect(page.getByRole('radio',{name:'脚本',exact:true})).toBeChecked();
      await expect(page.locator('#mock-script')).toBeVisible();
      await expect(page.getByRole('button',{name:/^保\s*存$/})).toBeVisible();
    }
  }
  await page.goto(baseURL + '/project/11/interface/col/21');
  await expect(page.getByRole('button', { name: '开始测试', exact: true })).toBeVisible();
  await page.goto(baseURL + '/project/11/setting');
  for (const name of ['项目配置', '环境配置', '请求配置', '全局mock脚本', 'Swagger自动同步']) {
    const tab = page.getByRole('tab', { name, exact: true });
    if (name === 'Swagger自动同步') { const sync=page.getByRole('tab', { name: /swagger|同步/i }); await sync.click(); await expect(page.getByText('项目的swagger json地址',{exact:true})).toBeVisible(); await page.screenshot({path:testInfo.outputPath('swagger-sync-settings.png'),fullPage:true}); }
    else { await tab.click(); await expect(tab).toHaveAttribute('aria-selected', 'true'); }
  }
  expect(errors).toEqual([]);
});

test('actual Mock route and authenticated collection assertions execute through isolated runner',async({page})=>{
  await login(page);
  await connection.db.collection('interface_case').insertOne({_id:29,uid:9,col_id:21,project_id:11,interface_id:17,casename:'Synthetic persisted runner case',index:0,enable_script:true});
  await connection.db.collection('project').updateOne({_id:11},{$set:{is_mock_open:true,project_mock_script:'mockJson.isolated = true; delay = 0;'}});
  try {
    const response=await page.request.get(baseURL+'/mock/11/orders/123');
    expect(response.status(), 'Mock response: '+await response.text()+'\nApplication log:\n'+log.slice(-6000)).toBe(200);
    const body=await response.json();expect(body.isolated).toBe(true);expect(typeof body.id).toBe('number');
    const checked=await page.request.post(baseURL+'/api/col/run_script',{data:{col_id:21,case_id:29,interface_id:17,response:{status:200,body:{id:123},header:{}},records:[],params:{},script:'assert.equal(status,200); assert.equal(body.id,123); log("asserted");'}});
    expect(checked.status()).toBe(200);const result=await checked.json();expect(result.errcode).toBe(0);expect(JSON.stringify(result.data.logs)).toContain('asserted');
  } finally {await connection.db.collection('project').updateOne({_id:11},{$set:{is_mock_open:false,project_mock_script:''}});await connection.db.collection('interface_case').deleteOne({_id:29});}
});

test('editing preserves parameter rows, schema semantics and description through save and cancelled navigation', async ({page}, testInfo) => {
  page.setDefaultTimeout(10000);
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  const schema={type:'object',additionalProperties:false,properties:{id:{type:'integer',minimum:1},state:{type:'string',enum:['open','closed']}}};
  await connection.db.collection('interface').insertOne({...fixture,_id:18,uid:9,title:'Editor compatibility fixture',method:'POST',path:'/editor-fixture',req_params:[],req_headers:[],req_body_type:'form',req_body_form:[{name:'caseNo',type:'text',required:'1',example:'S202005-001',desc:'Synthetic reference'}],res_body_is_json_schema:true,res_body:JSON.stringify(schema)});
  await login(page); await page.goto(baseURL+'/project/11/interface/api/18');
  await page.getByRole('tab',{name:'编辑',exact:true}).click();
  await expect(page.locator('#req_body_form_0_name')).toBeVisible();
  const geometry=await page.locator('#req_body_form_0_name').evaluate(el=>{const row=el.closest('.interface-edit-item-content');return {row:row.getBoundingClientRect().width,panel:row.closest('.panel-sub').getBoundingClientRect().width};});
  expect(geometry.row/geometry.panel).toBeGreaterThan(.90);
  await page.locator('#req_body_form_0_example').fill('S20261003-002');
  await page.getByText('Query',{exact:true}).click();
  await page.locator('#req_query_0_desc').fill('Edited query description');
  await page.getByText('Headers',{exact:true}).click();
  await page.getByRole('button',{name:'添加Header',exact:true}).click();
  const headerNames=page.locator('input[id^="req_headers_"][id$="_name"]');await headerNames.last().fill('X-Synthetic');
  await page.locator('input[id^="req_headers_"][id$="_value"]').last().fill('fixture');
  const editor=page.locator('.schema-editor-modern').filter({visible:true});
  await editor.getByLabel('id 描述',{exact:true}).fill('Preserved identifier');
  await editor.getByLabel('id 必填',{exact:true}).check();
  await editor.getByRole('button',{name:'添加字段 根节点',exact:true}).click();
  await editor.getByLabel('字段 field1 名称',{exact:true}).fill('note');
  await editor.getByLabel('字段 field1 名称',{exact:true}).press('Tab');
  await editor.getByLabel('note 描述',{exact:true}).fill('Temporary field');
  await editor.getByRole('button',{name:'删除字段 note',exact:true}).click();
  await editor.getByRole('button',{name:'导入 JSON',exact:true}).click();
  await page.getByLabel('导入 JSON 内容',{exact:true}).fill('{"discarded":true}');
  await page.getByRole('button',{name:/^取\s*消$/}).click();
  await expect(editor.getByLabel('id 描述',{exact:true})).toHaveValue('Preserved identifier');
  await editor.getByRole('tab',{name:'JSON（完整 Schema）',exact:true}).click();
  const edited=JSON.parse(await editor.getByLabel('JSON Schema',{exact:true}).inputValue());
  expect(edited.properties.state.enum).toEqual(['open','closed']);expect(edited.properties.id.minimum).toBe(1);expect(edited.additionalProperties).toBe(false);
  await editor.getByLabel('JSON Schema',{exact:true}).fill('{invalid');
  await page.getByRole('button',{name:/^保\s*存$/}).click();
  await expect(page.getByText('Schema JSON 无效，请修正后再保存',{exact:true})).toBeVisible();
  expect(JSON.parse((await connection.db.collection('interface').findOne({_id:18})).res_body)).toEqual(schema);
  await editor.getByLabel('JSON Schema',{exact:true}).fill(JSON.stringify(edited));
  await editor.getByRole('tab',{name:'可视化 Schema',exact:true}).click();
  await page.locator('#desc .toastui-editor-ww-container [contenteditable="true"]').fill('Synthetic edited description');
  await saveInterfaceSuccessfully(page);
  await expect.poll(async()=> (await connection.db.collection('interface').findOne({_id:18})).markdown).toContain('Synthetic edited description');
  const saved=await connection.db.collection('interface').findOne({_id:18});expect(saved.req_body_form[0].example).toBe('S20261003-002');expect(saved.req_query[0].desc).toBe('Edited query description');expect(saved.req_headers.some(h=>h.name==='X-Synthetic'&&h.value==='fixture')).toBe(true);expect(JSON.parse(saved.res_body)).toEqual(edited);
  await page.getByRole('tab',{name:'预览',exact:true}).first().click();
  await expect(page.getByText('Synthetic edited description',{exact:true})).toBeVisible();
  for(let i=0;i<2;i++) {
    await page.getByRole('tab',{name:'编辑',exact:true}).click();
    await expect(page.getByLabel('id 描述',{exact:true})).toHaveValue('Preserved identifier');
    await page.getByLabel('id 描述',{exact:true}).fill('Unsaved draft '+i);
    await page.getByRole('tab',{name:'预览',exact:true}).first().click();
    await page.getByRole('button',{name:/取\s*消/}).click();
    await expect(page.getByLabel('id 描述',{exact:true})).toHaveValue('Unsaved draft '+i);
    await page.getByRole('tab',{name:'预览',exact:true}).first().click();
    await page.getByRole('button',{name:/确\s*定/}).click();
  }
  await page.getByRole('tab',{name:'编辑',exact:true}).click();
  await expect(page.locator('#desc .toastui-editor-ww-container [contenteditable="true"]')).toContainText('Synthetic edited description');
  await page.reload();
  await page.getByRole('tab',{name:'编辑',exact:true}).click();
  await expect(page.locator('#desc .toastui-editor-ww-container [contenteditable="true"]')).toContainText('Synthetic edited description');
  await page.getByLabel('id 描述',{exact:true}).fill('Reopened schema edit');
  await saveInterfaceSuccessfully(page);
  expect((await connection.db.collection('interface').findOne({_id:18})).markdown).toContain('Synthetic edited description');
  await page.getByLabel('id 描述',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('editor-compatible.png'),fullPage:true});
  expect(errors).toEqual([]);
});

test('statistics real API, legacy typography, empty data and failed-request retry at 1920x1080', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  const date = require('../exts/yapi-plugin-statistics/util').formatYMD(new Date());
  // This database is unique to this test process and is dropped by afterAll.
  await connection.db.collection('statis_mock').deleteMany({});
  await connection.db.collection('statis_mock').insertMany([
    { _id: 501, interface_id: 17, project_id: 11, group_id: 8, date, time: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
    { _id: 502, interface_id: 18, project_id: 11, group_id: 8, date, time: Math.floor(Date.now() / 1000), ip: '127.0.0.1' }
  ]);
  const response = await page.request.get(baseURL + '/api/plugin/statismock/get');
  const payload = await response.json();
  expect(payload.errcode, JSON.stringify(payload)).toBe(0);
  expect(payload.data).toEqual({ mockCount: 2, mockDateList: [{ _id: date, count: 2 }] });
  await page.goto(baseURL + '/statistic');
  await expect(page.getByRole('heading', { name: '分组数据详情', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'mock 接口访问总数为：2', exact: true })).toBeVisible();
  await expect(page.locator('.g-statistic .ant-spin-spinning')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Synthetic browser group', exact: true })).toBeVisible();
  await expect(page.locator('.system-content .gutter-box').first()).toHaveText(/\S/);
  const geometry = await page.evaluate(() => {
    const heading = document.querySelector('.m-row-table .statis-title');
    const input = document.querySelector('input[placeholder="搜索分组/项目/接口"]');
    const search = input.closest('.ant-input-affix-wrapper') || input;
    return {
      width: innerWidth, height: innerHeight,
      bodyFont: parseFloat(getComputedStyle(document.body).fontSize),
      headingFont: parseFloat(getComputedStyle(heading).fontSize),
      headingHeight: heading.getBoundingClientRect().height,
      searchHeight: search.getBoundingClientRect().height,
      searchCenterOffset: Math.abs((search.getBoundingClientRect().top + search.getBoundingClientRect().height / 2) - (document.querySelector('.user-toolbar').getBoundingClientRect().top + document.querySelector('.user-toolbar').getBoundingClientRect().height / 2)),
      pageWidth: document.documentElement.scrollWidth
    };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(1920);
  expect(geometry.height).toBeGreaterThanOrEqual(1080);
  expect(geometry.bodyFont).toBe(13);
  expect(geometry.headingFont).toBeGreaterThanOrEqual(13);
  expect(geometry.headingFont).toBeLessThanOrEqual(24);
  expect(geometry.headingHeight).toBeLessThan(70);
  expect(geometry.searchHeight).toBeGreaterThanOrEqual(24);
  expect(geometry.searchHeight).toBeLessThanOrEqual(40);
  expect(geometry.searchCenterOffset).toBeLessThanOrEqual(2);
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.width);
  await testInfo.attach('statistics-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('statistics-1920x1080.png'), fullPage: true });

  await connection.db.collection('statis_mock').deleteMany({});
  await page.reload();
  await expect(page.getByRole('heading', { name: 'mock 接口访问总数为：0', exact: true })).toBeVisible();
  await expect(page.locator('.g-statistic .ant-spin-spinning')).toHaveCount(0);

  await page.route('**/api/plugin/statismock/get', route => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ errcode: 500, errmsg: 'Synthetic failure' })
  }));
  await page.reload();
  await expect(page.getByText('Mock 统计加载失败', { exact: true })).toBeVisible();
  await expect(page.locator('.g-statistic .ant-spin-spinning')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('statistics-retry-state.png'), fullPage: true });
  await page.unroute('**/api/plugin/statismock/get');
  await page.getByRole('button', { name: /^重\s*试$/ }).click();
  await expect(page.getByText('Mock 统计加载失败', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'mock 接口访问总数为：0', exact: true })).toBeVisible();
  await expect(page.locator('.g-statistic .ant-spin-spinning')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('statistics enforce admin access for all real endpoints and direct non-admin navigation', async ({ page }, testInfo) => {
  const endpoints = ['count', 'get', 'get_system_status', 'group_data_statis'];
  for (const endpoint of endpoints) {
    const response = await page.request.get(baseURL + '/api/plugin/statismock/' + endpoint);
    const body = await response.json();
    expect(body.errcode).toBe(40011);
    expect(body.data).toBeNull();
  }
  await login(page);
  for (const endpoint of endpoints) {
    const response = await page.request.get(baseURL + '/api/plugin/statismock/' + endpoint);
    const body = await response.json();
    expect(body.errcode, endpoint + ': ' + JSON.stringify(body)).toBe(0);
  }
  const email = 'statistics-member@example.invalid';
  const password = 'synthetic-statistics-password';
  const passsalt = 'synthetic-statistics-salt';
  await connection.db.collection('user').insertOne({ _id: 99, username: 'Synthetic statistics member', email,
    role: 'member', type: 'site', study: true, passsalt, password: sha1(password + sha1(passsalt)) });
  const memberLogin = await page.request.post(baseURL + '/api/user/login', { data: { email, password } });
  expect((await memberLogin.json()).errcode).toBe(0);
  for (const endpoint of endpoints) {
    const response = await page.request.get(baseURL + '/api/plugin/statismock/' + endpoint);
    const body = await response.json();
    expect(body.errcode, endpoint).toBe(405);
    expect(body.data, endpoint).toBeNull();
    expect(body.errmsg, endpoint).toContain('管理员');
  }
  const statisticRequests = [];
  page.on('request', request => { if (request.url().includes('/api/plugin/statismock/')) statisticRequests.push(request.url()); });
  await page.goto(baseURL + '/statistic');
  await expect(page.getByText('仅管理员可以查看系统统计', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '分组数据详情', exact: true })).toHaveCount(0);
  expect(statisticRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('statistics-permission-denied.png'), fullPage: true });
});

test('schema legacy controls preserve drafts, recursive required fields and boolean roots through real saves', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const schema = { type: 'object', additionalProperties: false, 'x-preserve': { flag: true }, properties: {
    name: { type: 'string', minLength: 2, description: 'Original description', mock: { mock: '@name', extension: 'keep' } },
    details: { type: 'object', properties: { enabled: { type: 'boolean' }, nullable: { type: ['string', 'null'] } } },
    items: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' } } } }
  } };
  await connection.db.collection('interface').insertOne({ ...fixture, _id: 19, uid: 9,
    title: 'Schema controls fixture', method: 'POST', path: '/schema-controls-fixture',
    req_params: [], req_query: [], req_headers: [], req_body_type: 'form', req_body_form: [],
    req_body_is_json_schema: false, req_body_other: '', res_body_is_json_schema: true, res_body: JSON.stringify(schema) });
  await login(page); await page.goto(baseURL + '/project/11/interface/api/19');
  await page.getByRole('tab', { name: '编辑', exact: true }).click();
  const editor = page.locator('.schema-editor-modern').filter({ visible: true });
  await expect(editor).toHaveCount(1);
  const rename = editor.getByLabel('字段 name 名称', { exact: true });
  for (const rejected of ['', 'details']) {
    await rename.fill(rejected); await rename.press('Tab');
    await expect(rename).toHaveValue('name');
  }
  await editor.getByLabel('全部字段必填', { exact: true }).check();
  await expect(editor.getByLabel('enabled 必填', { exact: true })).toBeChecked();
  await expect(editor.getByLabel('sku 必填', { exact: true })).toBeChecked();
  await editor.getByLabel('全部字段必填', { exact: true }).uncheck();
  await expect(editor.getByLabel('enabled 必填', { exact: true })).not.toBeChecked();
  await editor.getByLabel('全部字段必填', { exact: true }).check();
  await expect(editor.getByRole('button', { name: '编辑 根节点 Mock', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: '编辑 name 描述', exact: true }).click();
  await page.getByLabel('name 描述内容', { exact: true }).fill('Discard this draft');
  await page.getByRole('button', { name: /^取\s*消$/ }).click();
  await editor.getByRole('button', { name: '编辑 name 描述', exact: true }).click();
  await expect(page.getByLabel('name 描述内容', { exact: true })).toHaveValue('Original description');
  await page.getByLabel('name 描述内容', { exact: true }).fill('Line one\nLine two');
  await page.getByRole('button', { name: /^应\s*用$/ }).click();
  await editor.getByRole('button', { name: '编辑 name Mock', exact: true }).click();
  await page.getByLabel('name Mock内容', { exact: true }).fill('@pick(["alpha", "beta"])\n');
  await page.getByRole('button', { name: /^应\s*用$/ }).click();
  await editor.getByRole('button', { name: '高级设置 details', exact: true }).click();
  const advanced = page.getByLabel('details 高级设置内容', { exact: true });
  const details = JSON.parse(await advanced.inputValue());
  await advanced.fill('{invalid');
  await page.getByRole('button', { name: /^应\s*用$/ }).click();
  await expect(advanced).toBeVisible();
  await advanced.fill(JSON.stringify({ ...details, additionalProperties: false, 'x-advanced': 'preserve' }));
  await page.screenshot({ path: testInfo.outputPath('schema-node-advanced.png'), fullPage: true });
  await page.getByRole('button', { name: /^应\s*用$/ }).click();
  expect(JSON.parse((await connection.db.collection('interface').findOne({ _id: 19 })).res_body)).toEqual(schema);
  await saveInterfaceSuccessfully(page);
  await expect.poll(async () => JSON.parse((await connection.db.collection('interface').findOne({ _id: 19 })).res_body).properties.name.description).toBe('Line one\nLine two');
  const saved = JSON.parse((await connection.db.collection('interface').findOne({ _id: 19 })).res_body);
  expect(saved.required).toEqual(['name', 'details', 'items']);
  expect(saved.properties.details.required).toEqual(['enabled', 'nullable']);
  expect(saved.properties.items.items.required).toEqual(['sku']);
  expect(saved.properties.name.mock).toEqual({ mock: '@pick(["alpha", "beta"])\n', extension: 'keep' });
  expect(saved.properties.name.minLength).toBe(2);
  expect(saved.properties.details['x-advanced']).toBe('preserve');
  expect(saved['x-preserve']).toEqual({ flag: true });
  await page.getByRole('tab', { name: '预览', exact: true }).first().click();
  await page.getByRole('tab', { name: '编辑', exact: true }).click();
  await editor.getByRole('button', { name: '编辑 name 描述', exact: true }).click();
  await expect(page.getByLabel('name 描述内容', { exact: true })).toHaveValue('Line one\nLine two');
  await page.getByRole('button', { name: /^取\s*消$/ }).click();
  for (const value of [false, true]) {
    await editor.getByRole('button', { name: '高级设置 根节点', exact: true }).click();
    await page.getByLabel('根节点 高级设置内容', { exact: true }).fill(String(value));
    await page.getByRole('button', { name: /^应\s*用$/ }).click();
    await saveInterfaceSuccessfully(page);
    await expect.poll(async () => (await connection.db.collection('interface').findOne({ _id: 19 })).res_body).toBe(String(value));
    await page.getByRole('tab', { name: '预览', exact: true }).first().click();
    await expect(page.getByTestId('boolean-schema-preview')).toContainText('JSON Schema: ' + value);
    await page.getByRole('tab', { name: '编辑', exact: true }).click();
    await editor.getByRole('button', { name: '高级设置 根节点', exact: true }).click();
    await expect(page.getByLabel('根节点 高级设置内容', { exact: true })).toHaveValue(String(value));
    await page.getByRole('button', { name: /^取\s*消$/ }).click();
  }
  await page.screenshot({ path: testInfo.outputPath('schema-boolean-root.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('group and project navigation use current IDs without duplicate selection or uncaught errors', async ({ page }, testInfo) => {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (['/api/group/get', '/api/project/get'].includes(url.pathname)) requests.push({ path: url.pathname, id: url.searchParams.get('id') });
  });
  await login(page);
  await expect(page).toHaveURL(/\/group\/\d+$/);
  const publicGroup = page.getByRole('menuitem').filter({ hasText: 'Synthetic browser group' });
  await expect(publicGroup).toBeVisible();
  await publicGroup.click();
  await expect(page).toHaveURL(baseURL + '/group/8');
  await expect(page.locator('.project-list-header')).toContainText('Synthetic browser group');
  await expect(page.getByText('Synthetic browser project', { exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const beforeRepeat = requests.filter(request => request.path === '/api/group/get' && request.id === '8').length;
  await publicGroup.click();
  await page.waitForLoadState('networkidle');
  expect(requests.filter(request => request.path === '/api/group/get' && request.id === '8')).toHaveLength(beforeRepeat);

  await page.goto(baseURL + '/project/11/interface/api/17');
  await expect(page.getByRole('tab', { name: '预览', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(baseURL + '/group/8');
  await expect(page.locator('.project-list-header')).toContainText('Synthetic browser group');
  await page.goForward();
  await expect(page).toHaveURL(baseURL + '/project/11/interface/api/17');
  await expect(page.getByRole('tab', { name: '预览', exact: true })).toBeVisible();

  await page.goto(baseURL + '/group/invalid');
  await expect(page.getByText('无效的分组 ID', { exact: true })).toBeVisible();
  await page.goto(baseURL + '/project/invalid/interface/api');
  await expect(page.getByText('无效的项目 ID', { exact: true })).toBeVisible();
  await page.goto(baseURL + '/group/8');
  await expect(page.locator('.project-list-header')).toContainText('Synthetic browser group');
  await page.screenshot({ path: testInfo.outputPath('group-navigation.png'), fullPage: true });
  expect(requests.every(request => request.id !== null && /^[1-9]\d*$/.test(request.id))).toBe(true);
  expect(errors).toEqual([]);
});

test('collection Start Test finishes every row and opens successful reports after repeated runs', async ({page}) => {
  await connection.db.collection('project').updateOne({_id:11},{$set:{env:[{name:'local-loopback',domain:baseURL+'/mock/11',header:[],global:[]}]}});
  await connection.db.collection('interface_col').insertOne({_id:22,uid:9,project_id:11,name:'Batched collection with a deliberately long synthetic name that must remain on one line 中文',desc:'Synthetic only',index:1});
  await connection.db.collection('interface_case').insertMany([31,32,33].map((id,index)=>({_id:id,uid:9,col_id:22,project_id:11,interface_id:17,casename:'Batched case '+index,index,case_env:'local-loopback',req_params:[{name:'id',value:'123'}],req_headers:[],req_query:[],req_body_form:[],test_status:'',enable_script:false,test_script:'',mock_verify:false})));
  await login(page);
  await page.goto(baseURL+'/project/11/interface/col/22');
  await expect(page.getByRole('link',{name:'Batched case 2',exact:true})).toBeVisible();
  await page.waitForLoadState('networkidle');
  const layout=await page.evaluate(()=>{const title=[...document.querySelectorAll('.col-list-tree .menu-title > span:first-child')].find(e=>e.textContent.includes('Batched collection'));return {orderWidth:document.querySelector('th.interface-col-order').getBoundingClientRect().width,titleHeight:title.getBoundingClientRect().height,whiteSpace:getComputedStyle(title).whiteSpace}});
  expect(layout.orderWidth).toBeLessThanOrEqual(100);expect(layout.titleHeight).toBeLessThanOrEqual(36);expect(layout.whiteSpace).toBe('nowrap');
  for(let run=0;run<2;run++) {
    await page.getByRole('button',{name:'开始测试',exact:true}).click();
    await expect(page.getByRole('button',{name:'测试报告',exact:true})).toHaveCount(3);
    await expect(page.locator('tbody .ant-spin-spinning')).toHaveCount(0);
    await expect(page.locator('tbody [aria-label="check-circle"]')).toHaveCount(3);
    for(let index=0;index<3;index++) {
      await page.getByRole('button',{name:'测试报告',exact:true}).nth(index).click();
      const report=page.getByRole('dialog',{name:'测试报告',exact:true});
      await report.getByRole('tab',{name:'验证结果',exact:true}).click();
      await expect(report.getByText('验证通过',{exact:true})).toBeVisible();
      await report.getByRole('button',{name:'关闭',exact:true}).click();
    }
  }
});

test('project settings Save retains the visible submitted value across repeat saves and reload', async ({page})=>{
  await login(page); await page.goto(baseURL+'/project/11/setting');
  const name=page.locator('#name'); await name.fill('Synthetic persisted project');
  for(let attempt=0;attempt<2;attempt++) {
    const reply=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/project/up'&&response.request().method()==='POST');
    await page.getByRole('button',{name:/保\s*存/}).click();
    expect((await (await reply).json()).errcode).toBe(0);
    await expect(name).toHaveValue('Synthetic persisted project');
    expect((await connection.db.collection('project').findOne({_id:11})).name).toBe('Synthetic persisted project');
  }
  await page.reload(); await expect(name).toHaveValue('Synthetic persisted project');
});

test('environment settings load, switch, edit and save actual nested values', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const env=[
    {name:'local-synthetic',domain:'http://127.0.0.1:3000/mock/11',header:[{name:'X-Fixture',value:'synthetic'},{name:'X-Second',value:'second'},{name:'Cookie',value:'sample=a=b==;other=2'}],global:[{name:'sampleId',value:'42'},{name:'second',value:'2'}]},
    {name:'browser-synthetic',domain:'https://example.invalid/mock',header:[],global:[]}
  ];
  await connection.db.collection('project').updateOne({_id:11},{$set:{env}});
  await login(page);await page.goto(baseURL+'/project/11/setting');
  await page.getByRole('tab',{name:'环境配置',exact:true}).click();
  await expect(page.getByPlaceholder('请输入环境名称')).toHaveValue('local-synthetic');
  await expect(page.getByPlaceholder('请输入环境域名')).toHaveValue('127.0.0.1:3000/mock/11');
  await expect(page.locator('#header_0_value')).toHaveValue('synthetic');
  await expect(page.locator('#global_0_value')).toHaveValue('42');
  await page.getByText('browser-synthetic',{exact:true}).click();
  await expect(page.getByPlaceholder('请输入环境名称')).toHaveValue('browser-synthetic');
  await expect(page.getByPlaceholder('请输入环境域名')).toHaveValue('example.invalid/mock');
  await expect(page.locator('#header_0_value')).toHaveValue('');
  await expect(page.locator('#global_0_value')).toHaveValue('');
  await page.getByText('local-synthetic',{exact:true}).click();
  await expect(page.locator('#global_0_value')).toHaveValue('42');
  await page.locator('#global_0_value').fill('43');
  const reply=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/project/up_env');
  await page.getByRole('button',{name:/保\s*存/}).click();
  expect((await (await reply).json()).errcode).toBe(0);
  await expect(page.getByText('修改成功!',{exact:true})).toBeVisible();
  const saved=await connection.db.collection('project').findOne({_id:11});
  expect(saved.env[0].global.map(({name,value})=>({name,value}))).toEqual([{name:'sampleId',value:'43'},{name:'second',value:'2'}]);
  expect(saved.env[0].header.map(({name,value})=>({name,value}))).toEqual(env[0].header);expect(saved.env[1]).toMatchObject(env[1]);
  await page.reload();await page.getByRole('tab',{name:'环境配置',exact:true}).click();
  await expect(page.locator('#global_0_value')).toHaveValue('43');
  expect(errors).toEqual([]);
});


test('empty stored project environment loads the legacy default and persists its first environment', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await connection.db.collection('project').updateOne({_id:11},{$set:{env:[]}});
  await login(page);await page.goto(baseURL+'/project/11/setting');
  await page.getByRole('tab',{name:'环境配置',exact:true}).click();
  // The real API preserves its historical local fallback for an empty DB array.
  await expect(page.getByPlaceholder('请输入环境名称')).toHaveValue('local');
  await page.getByPlaceholder('请输入环境名称').fill('first-synthetic');
  await page.getByPlaceholder('请输入环境域名').fill('127.0.0.1:3000/mock/11');
  const reply=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/project/up_env');
  await page.getByRole('button',{name:/保\s*存/}).click();
  expect((await (await reply).json()).errcode).toBe(0);
  const saved=await connection.db.collection('project').findOne({_id:11});
  expect(saved.env).toHaveLength(1);expect(saved.env[0]).toMatchObject({name:'first-synthetic',domain:'http://127.0.0.1:3000/mock/11'});
  await page.reload();await page.getByRole('tab',{name:'环境配置',exact:true}).click();
  await expect(page.getByPlaceholder('请输入环境名称')).toHaveValue('first-synthetic');
  expect(errors).toEqual([]);
});

test('runner environment configuration is actionable and discards closed drafts',async({page})=>{
  await connection.db.collection('project').updateOne({_id:11},{$set:{env:[{name:'local-synthetic',domain:'http://127.0.0.1:3000/mock/11',header:[],global:[{name:'sampleId',value:'42'}]},{name:'环境配置',domain:'http://127.0.0.1:3000/mock/11',header:[],global:[]}]}});
  await login(page);await page.goto(baseURL+'/project/11/interface/api/17');await page.getByRole('tab',{name:'运行',exact:true}).click();
  const environmentSelect=page.locator('.url .ant-select').nth(1);
  await environmentSelect.click();
  await environmentSelect.getByRole('combobox').press('ArrowDown');
  await environmentSelect.getByRole('combobox').press('Enter');
  await expect(environmentSelect).toContainText('环境配置');
  await expect(page.locator('.env-modal')).toHaveCount(0);
  async function open(){await page.locator('.url .ant-select').nth(1).click();const button=page.getByRole('button',{name:'环境配置',exact:true});await expect(button).toBeEnabled();await button.click();await expect(page.locator('.env-modal')).toBeVisible();}
  await open();await expect(page.locator('#global_0_value')).toHaveValue('42');await page.locator('#global_0_value').fill('unsaved');await page.locator('.env-modal .ant-modal-close').click();
  await open();await expect(page.locator('#global_0_value')).toHaveValue('42');await page.locator('#global_0_value').fill('43');
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/project/up_env');
  await page.locator('.env-modal').getByRole('button',{name:/保\s*存/}).click();expect((await (await response).json()).errcode).toBe(0);await expect(page.locator('.env-modal')).toHaveCount(0);
  expect((await connection.db.collection('project').findOne({_id:11})).env[0].global[0].value).toBe('43');
  await expect(page.locator('.url .ant-select').nth(1)).toContainText('local-synthetic');
});

test('interface and category creation submit after visible validation errors',async({page})=>{
  await login(page);await page.goto(baseURL+'/project/11/interface/api');
  await page.getByRole('button',{name:'添加分类',exact:true}).click();
  await page.getByRole('button',{name:/提\s*交/}).click();await expect(page.getByText('请输入分类名称!',{exact:true})).toBeVisible();
  await page.getByPlaceholder('分类名称',{exact:true}).fill('Browser created category');
  await expect(page.getByRole('button',{name:/提\s*交/})).toBeEnabled();
  const categoryReply=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/interface/add_cat');
  await page.getByRole('button',{name:/提\s*交/}).click();expect((await(await categoryReply).json()).errcode).toBe(0);
  await page.getByRole('button',{name:'添加接口',exact:true}).click();
  await page.getByRole('button',{name:/提\s*交/}).click();await expect(page.getByText('请输入接口路径!',{exact:true})).toBeVisible();
  await page.getByPlaceholder('接口名称',{exact:true}).fill('Browser created interface');await page.getByPlaceholder('/path',{exact:true}).fill('/browser-created');
  await expect(page.getByRole('button',{name:/提\s*交/})).toBeEnabled();
  const interfaceReply=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/interface/add');
  await page.getByRole('button',{name:/提\s*交/}).click();const created=await(await interfaceReply).json();expect(created.errcode).toBe(0);
  const record=await connection.db.collection('interface').findOne({_id:created.data._id});expect(record).toMatchObject({project_id:11,title:'Browser created interface',path:'/browser-created'});
  await page.reload();await expect(page.getByRole('link',{name:'Browser created interface',exact:true}).first()).toBeVisible();
  await page.goto(baseURL+'/project/11/interface/api/'+created.data._id);await page.getByRole('tab',{name:'编辑',exact:true}).click();await page.getByPlaceholder('接口名称').fill('Browser renamed empty interface');await saveInterfaceSuccessfully(page);await page.reload();expect((await connection.db.collection('interface').findOne({_id:created.data._id})).title).toBe('Browser renamed empty interface');
});

test('Swagger file import resolves browser module and malformed file exits loading',async({page})=>{
  await login(page);await page.goto(baseURL+'/project/11/data');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.dataSync .ant-select').first().click();await page.locator('.ant-select-dropdown:visible').getByText('普通模式',{exact:true}).click();
  const spec={swagger:'2.0',info:{title:'Synthetic browser import',version:'1'},paths:{'/browser-swagger-import':{get:{summary:'Browser imported Swagger',responses:{200:{description:'ok'}}}}}};
  const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/interface/add');
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-swagger.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(spec))});expect((await(await pending).json()).errcode).toBe(0);await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
  expect(await connection.db.collection('interface').countDocuments({project_id:11,path:'/browser-swagger-import'})).toBe(1);
  await page.locator('input[type=file]').setInputFiles({name:'malformed-synthetic.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});await expect(page.getByText('解析失败',{exact:true})).toBeVisible();await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);expect(errors).toEqual([]);
});

test('file read error abort and synchronous failure permit a successful retry',async({page})=>{
  await login(page);await page.goto(baseURL+'/project/11/data');
  await page.locator('.dataSync .ant-select').first().click();await page.locator('.ant-select-dropdown:visible').getByText('普通模式',{exact:true}).click();
  await page.evaluate(()=>{const Native=window.FileReader;window.FileReader=class extends Native{readAsText(file){const mode=window.syntheticReadFailure;window.syntheticReadFailure=null;if(mode==='throw')throw new DOMException('Synthetic read failure','NotReadableError');if(mode){queueMicrotask(()=>this.dispatchEvent(new ProgressEvent(mode)));return;}return super.readAsText(file)}}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const mode of ['error','abort','throw']){
    await page.evaluate(value=>{window.syntheticReadFailure=value},mode);
    const spec={swagger:'2.0',info:{title:'Synthetic retry',version:'1'},paths:{['/read-retry-'+mode]:{get:{summary:'Read retry '+mode,responses:{200:{description:'ok'}}}}}};
    const file={name:'synthetic-'+mode+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(spec))};
    await page.locator('input[type=file]').setInputFiles(file);await expect(page.getByText(mode==='abort'?'文件读取已取消，请重新选择文件':'文件读取失败，请重新选择文件',{exact:true}).last()).toBeVisible();await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
    expect(await connection.db.collection('interface').countDocuments({project_id:11,path:'/read-retry-'+mode})).toBe(0);
    const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/interface/add');await page.locator('input[type=file]').setInputFiles(file);expect((await(await pending).json()).errcode).toBe(0);await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);expect(await connection.db.collection('interface').countDocuments({project_id:11,path:'/read-retry-'+mode})).toBe(1);
  }
  expect(errors).toEqual([]);
});

test('case order persists for editor and guest cannot mutate it',async({page})=>{
  await connection.db.collection('interface_col').insertOne({_id:23,uid:9,project_id:11,name:'Order ACL collection',index:2});
  await connection.db.collection('interface_case').insertMany([41,42].map((id,index)=>({_id:id,uid:9,col_id:23,project_id:11,interface_id:17,casename:'ACL case '+index,index,req_params:[],req_headers:[],req_query:[],req_body_form:[]})));
  await login(page);await page.goto(baseURL+'/project/11/interface/col/23');await expect(page.getByRole('button',{name:'上移用例 ACL case 0',exact:true})).toBeDisabled();
  const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/col/up_case_index');await page.getByRole('button',{name:'下移用例 ACL case 0',exact:true}).click();expect((await(await pending).json()).errcode).toBe(0);await page.reload();await expect(page.getByRole('button',{name:'上移用例 ACL case 1',exact:true})).toBeDisabled();
  const email='order-guest@example.invalid',password='synthetic-order-password',passsalt='synthetic-order-salt';await connection.db.collection('user').insertOne({_id:95,username:'Synthetic order guest',email,password:sha1(password+sha1(passsalt)),passsalt,role:'member',type:'site',study:true});await connection.db.collection('project').updateOne({_id:11},{$push:{members:{uid:95,role:'guest',username:'Synthetic order guest',email}}});
  expect((await(await page.request.post(baseURL+'/api/user/login',{data:{email,password}})).json()).errcode).toBe(0);await page.goto(baseURL+'/project/11/interface/col/23');await expect(page.getByRole('cell',{name:'ACL case 0',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/[上下]移用例/})).toHaveCount(0);const denied=await(await page.request.post(baseURL+'/api/col/up_case_index',{data:[{id:41,index:0},{id:42,index:1}]})).json();expect(denied.errcode).not.toBe(0);expect((await connection.db.collection('interface_case').find({_id:{$in:[41,42]}}).sort({index:1}).toArray()).map(x=>x._id)).toEqual([42,41]);
});

test('private exports deny outsiders and allow read-only members and public projects',async({page})=>{
  const email='export-reader@example.invalid',password='synthetic-export-password',passsalt='synthetic-export-salt';
  await connection.db.collection('user').insertOne({_id:96,username:'Synthetic export reader',email,password:sha1(password+sha1(passsalt)),passsalt,role:'member',type:'site',study:true});
  await connection.db.collection('project').updateOne({_id:11},{$set:{project_type:'private'}});
  await login(page);
  const endpoints=['/api/plugin/export?type=json&pid=11','/api/plugin/exportSwagger?type=OpenAPIV2&pid=11'];
  // Legacy Mongoose hydration allocates transient nested subdocument IDs on each read.
  const stable=value=>JSON.parse(JSON.stringify(value,(key,item)=>key==='_id'?undefined:item));
  const bodies=[];
  for(const endpoint of endpoints){const r=await page.request.get(baseURL+endpoint);expect(r.status()).toBe(200);bodies.push(await r.json());}
  expect(Array.isArray(bodies[0])).toBe(true);expect(bodies[1].swagger).toBe('2.0');
  expect((await(await page.request.post(baseURL+'/api/user/login',{data:{email,password}})).json()).errcode).toBe(0);
  for(const endpoint of endpoints){const result=await(await page.request.get(baseURL+endpoint)).json();expect(result.errcode).toBe(400);expect(result.data).toBeNull();}
  await connection.db.collection('project').updateOne({_id:11},{$push:{members:{uid:96,role:'guest',username:'Synthetic export reader',email}}});
  for(let i=0;i<endpoints.length;i++)expect(stable(await(await page.request.get(baseURL+endpoints[i])).json())).toEqual(stable(bodies[i]));
  await connection.db.collection('project').updateOne({_id:11},{$pull:{members:{uid:96}},$set:{project_type:'public'}});
  for(let i=0;i<endpoints.length;i++)expect(stable(await(await page.request.get(baseURL+endpoints[i])).json())).toEqual(stable(bodies[i]));
});

test('case endpoints use live collection scope and deny inaccessible source copies',async({page})=>{
  const email='case-editor@example.invalid',password='synthetic-case-password',passsalt='synthetic-case-salt';
  await connection.db.collection('user').insertOne({_id:97,username:'Synthetic case editor',email,password:sha1(password+sha1(passsalt)),passsalt,role:'member',type:'site',study:true});
  await connection.db.collection('project').updateOne({_id:11},{$set:{project_type:'private'},$push:{members:{uid:97,role:'dev',username:'Synthetic case editor',email}}});
  await connection.db.collection('project').insertOne({_id:12,uid:9,group_id:8,name:'Synthetic inaccessible project',project_type:'private',members:[],basepath:'',env:[]});
  await connection.db.collection('interface_col').insertOne({_id:24,uid:9,project_id:12,name:'Synthetic private collection'});
  await connection.db.collection('interface').insertOne({...fixture,_id:119,project_id:12,uid:9,title:'Synthetic private source'});
  await connection.db.collection('interface_case').insertMany([{_id:43,uid:9,col_id:24,project_id:12,interface_id:119,casename:'Private case'},{_id:44,uid:97,col_id:21,project_id:11,interface_id:17,casename:'Own case'}]);
  expect((await(await page.request.post(baseURL+'/api/user/login',{data:{email,password}})).json()).errcode).toBe(0);
  const before=await connection.db.collection('interface_case').find({}).sort({_id:1}).toArray();
  for(const [endpoint,data]of[
    ['add_case',{project_id:11,col_id:24,interface_id:17,casename:'Forged'}],
    ['add_case_list',{project_id:11,col_id:24,interface_list:[17]}],
    ['add_case_list',{project_id:11,col_id:21,interface_list:[17,119]}],
    ['clone_case_list',{project_id:11,col_id:21,new_col_id:24}],
    ['clone_case_list',{project_id:11,col_id:24,new_col_id:21}],
    ['up_case',{id:44,col_id:24}],
    ['add_case',{project_id:11,col_id:21,interface_id:119,casename:'Private copy'}]
  ])expect((await(await page.request.post(baseURL+'/api/col/'+endpoint,{data})).json()).errcode,endpoint).not.toBe(0);
  for(const caseid of [43,99999999])expect((await(await page.request.get(baseURL+'/api/col/case?caseid='+caseid)).json()).errcode).not.toBe(0);
  expect(await connection.db.collection('interface_case').find({}).sort({_id:1}).toArray()).toEqual(before);
  expect((await(await page.request.get(baseURL+'/api/col/case?caseid=44')).json()).errcode).toBe(0);
});

test('search visibility and member admission respect independent real roles',async({browser})=>{
  const db=connection.db, prefix='SyntheticScopeSearch';
  const roles=[['owner',740001],['developer',740002],['outsider',740003],['guest',740004]];
  const password='synthetic-scope-password',passsalt='synthetic-scope-salt';
  await db.collection('user').insertMany(roles.map(([name,_id])=>({_id,username:'Synthetic '+name,email:name+'-scope@example.invalid',password:sha1(password+sha1(passsalt)),passsalt,role:'member',type:'site',study:true})));
  await db.collection('group').insertOne({_id:743001,uid:740001,group_name:prefix+' group',type:'public',members:[]});
  await db.collection('project').insertMany([['private',741001],['public',741002]].map(([visibility,_id])=>({_id,uid:740001,group_id:743001,name:prefix+' '+visibility,project_type:visibility,members:visibility==='private'?[{uid:740002,role:'dev'},{uid:740004,role:'guest'}]:[],env:[{name:'synthetic-secret-marker',domain:'http://127.0.0.1',header:[]}],basepath:''})));
  await db.collection('interface').insertMany([['private',742001,741001],['public',742002,741002]].map(([visibility,_id,project_id])=>({...fixture,_id,project_id,uid:740001,title:prefix+' '+visibility+' interface',path:'/scope-'+visibility})));
  const contexts=[];
  try {
    await Promise.all(roles.map(async([role])=>{
      const context=await browser.newContext();contexts.push(context);const p=await context.newPage();await p.goto(baseURL+'/login');await p.getByPlaceholder('Email',{exact:true}).fill(role+'-scope@example.invalid');await p.getByPlaceholder('Password',{exact:true}).fill(password);await p.getByRole('button',{name:/^登\s*录$/}).click();await p.waitForURL('**/group**');
      const pending=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/project/search');await p.getByPlaceholder('搜索分组/项目/接口').fill(prefix);const result=await(await pending).json();expect(result.errcode).toBe(0);expect(result.data.project.map(x=>x._id).sort()).toEqual(role==='outsider'?[741002]:[741001,741002]);expect(result.data.interface.map(x=>x._id).sort()).toEqual(role==='outsider'?[742002]:[742001,742002]);for(const item of result.data.project)expect(Object.keys(item).sort()).toEqual(['_id','groupId','name']);for(const item of result.data.interface)expect(Object.keys(item).sort()).toEqual(['_id','projectId','title']);expect(JSON.stringify(result)).not.toContain('synthetic-secret-marker');await expect(p.getByText('项目: '+prefix+' private',{exact:true})).toHaveCount(role==='outsider'?0:1);
      if(role!=='owner'){
        const before=await db.collection('project').findOne({_id:741001});
        for(const targetRole of ['owner','dev','guest'])expect((await(await p.request.post(baseURL+'/api/project/add_member',{data:{id:741001,member_uids:[740003],role:targetRole}})).json()).errcode).not.toBe(0);
        expect((await(await p.request.post(baseURL+'/api/project/change_member_role',{data:{id:741001,member_uid:740002,role:'owner'}})).json()).errcode).not.toBe(0);
        expect((await db.collection('project').findOne({_id:741001})).members).toEqual(before.members);
      }
    }));
    const p=await contexts[0].newPage();expect((await(await p.request.post(baseURL+'/api/user/login',{data:{email:'owner-scope@example.invalid',password}})).json()).errcode).toBe(0);
    expect((await(await p.request.post(baseURL+'/api/project/add_member',{data:{id:741001,member_uids:[740003],role:'owner'}})).json()).errcode).toBe(0);expect((await db.collection('project').findOne({_id:741001})).members.find(m=>m.uid===740003).role).toBe('owner');
    expect((await(await p.request.post(baseURL+'/api/user/login',{data:{email:'browser@example.invalid',password:'synthetic-browser-password'}})).json()).errcode).toBe(0);expect((await(await p.request.post(baseURL+'/api/project/add_member',{data:{id:741002,member_uids:[740004],role:'guest'}})).json()).errcode).toBe(0);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});

test('profile username and email cancellation discard drafts without writes',async({page})=>{
  const email='profile-draft@example.invalid',password='synthetic-profile-password',passsalt='synthetic-profile-salt';
  await connection.db.collection('user').insertOne({_id:740010,username:'Synthetic profile baseline',email,password:sha1(password+sha1(passsalt)),passsalt,role:'member',type:'site',study:true});
  expect((await(await page.request.post(baseURL+'/api/user/login',{data:{email,password}})).json()).errcode).toBe(0);await page.goto(baseURL+'/user/profile/740010');
  for(const [label,placeholder,value]of[['用户名','用户名','Synthetic profile baseline'],['Email','Email',email]]){
    const row=page.locator('.user-item').filter({has:page.getByText(label,{exact:true})});await row.getByRole('button',{name:/修\s*改/}).click();await row.getByPlaceholder(placeholder,{exact:true}).fill('discarded@example.invalid');await row.getByRole('button',{name:/取\s*消/}).click();await row.getByRole('button',{name:/修\s*改/}).click();await expect(row.getByPlaceholder(placeholder,{exact:true})).toHaveValue(value);await row.getByRole('button',{name:/取\s*消/}).click();
  }
  const saved=await connection.db.collection('user').findOne({_id:740010});expect(saved.username).toBe('Synthetic profile baseline');expect(saved.email).toBe(email);
});

test('profile email saves and reloads while avatar validation rejects invalid files',async({page})=>{
  const email='profile-avatar@example.invalid',password='synthetic-avatar-password',passsalt='synthetic-avatar-salt';
  await connection.db.collection('user').insertOne({_id:740011,username:'Synthetic avatar user',email,password:sha1(password+sha1(passsalt)),passsalt,role:'member',type:'site',study:true});
  expect((await(await page.request.post(baseURL+'/api/user/login',{data:{email,password}})).json()).errcode).toBe(0);await page.goto(baseURL+'/user/profile/740011');
  const row=page.locator('.user-item').filter({has:page.getByText('Email',{exact:true})});await row.getByRole('button',{name:/修\s*改/}).click();await row.getByPlaceholder('Email',{exact:true}).fill('profile-avatar-saved@example.invalid');const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/update');await row.getByRole('button',{name:/确\s*定/}).click();expect((await(await saved).json()).errcode).toBe(0);await page.reload();await expect(row).toContainText('profile-avatar-saved@example.invalid');
  let uploads=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/user/upload_avatar')uploads++});
  const input=page.locator('input[type=file]');await input.setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic')});await expect(page.getByText('图片的格式只能为 jpg、png！',{exact:true})).toBeVisible();await input.setInputFiles({name:'too-big.png',mimeType:'image/png',buffer:Buffer.alloc(220000)});await expect(page.getByText('图片必须小于 200kb!',{exact:true})).toBeVisible();expect(uploads).toBe(0);
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1sAAAAASUVORK5CYII=','base64');const upload=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/upload_avatar'&&r.request().headers()['content-type']?.includes('application/json'));await input.setInputFiles({name:'synthetic-pixel.png',mimeType:'image/png',buffer:image});expect((await(await upload).json()).errcode).toBe(0);await page.reload();const avatar=await page.request.get(baseURL+'/api/user/avatar?uid=740011');expect(avatar.headers()['content-type']).toContain('image/png');expect(await avatar.body()).toEqual(image);
});

test('search authorizes before ten-result limit and hides other personal groups',async({page})=>{
  const db=connection.db,prefix='BoundedSearchFixture';
  await db.collection('group').insertMany([
    ...Array.from({length:12},(_,i)=>({_id:753000+i,uid:799999,group_name:prefix+' hidden '+i,type:'private',members:[]})),
    {_id:753020,uid:9,group_name:prefix+' own personal',type:'private',members:[]},
    {_id:753021,uid:799999,group_name:prefix+' public',type:'public',members:[]},
    {_id:753022,uid:799999,group_name:'Inherited fixture group',type:'public',members:[{uid:9,role:'dev'}]},
    {_id:753023,uid:799999,group_name:'SharedPrivateNavigation',type:'private',members:[]}
  ]);
  await db.collection('project').insertMany([
    ...Array.from({length:12},(_,i)=>({_id:754000+i,uid:799999,group_id:753000,name:prefix+' hidden '+i,project_type:'private',members:[],env:[]})),
    ...Array.from({length:12},(_,i)=>({_id:754020+i,uid:799999,group_id:753021,name:prefix+' public '+i,project_type:'public',members:[],env:[]})),
    {_id:754050,uid:799999,group_id:753022,name:'BoundedInheritedFixture',project_type:'private',members:[],env:[]},
    {_id:754051,uid:799999,group_id:753023,name:'SharedPrivateNavigationProject',project_type:'private',members:[{uid:9,role:'guest'}],env:[]}
  ]);
  await db.collection('interface').insertMany([...Array.from({length:12},(_,i)=>({_id:755000+i,uid:799999,project_id:754000+i,title:prefix+' hidden '+i,path:'/bound-hidden-'+i,method:'GET'})),...Array.from({length:12},(_,i)=>({_id:755020+i,uid:799999,project_id:754020+i,title:prefix+' public '+i,path:'/bound-public-'+i,method:'GET'})),{_id:755050,uid:799999,project_id:754050,title:'BoundedInheritedFixture',path:'/inherited',method:'GET'}]);
  // Reuse the already-authorized synthetic account; never change credentials.
  await db.collection('user').updateOne({_id:9},{$set:{role:'member'}});
  try {
    await login(page);await page.goto(baseURL+'/group');const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/project/search');await page.getByPlaceholder('搜索分组/项目/接口').fill(prefix);const data=(await(await pending).json()).data;
    expect(data.project.map(p=>p._id)).toEqual(Array.from({length:10},(_,i)=>754020+i));expect(data.interface.map(p=>p._id)).toEqual(Array.from({length:10},(_,i)=>755020+i));expect(data.group.map(g=>g._id)).toEqual([753020,753021]);await expect(page.getByText('分组: '+prefix+' own personal',{exact:true})).toBeVisible();await expect(page.getByText('分组: '+prefix+' hidden 0',{exact:true})).toHaveCount(0);
    const inherited=(await(await page.request.get(baseURL+'/api/project/search?q=BoundedInheritedFixture')).json()).data;expect(inherited.project.map(p=>p._id)).toEqual([754050]);expect(inherited.interface.map(p=>p._id)).toEqual([755050]);
    await db.collection('group').updateOne({_id:753022},{$set:{members:[]}});const revoked=(await(await page.request.get(baseURL+'/api/project/search?q=BoundedInheritedFixture')).json()).data;expect(revoked.project).toEqual([]);expect(revoked.interface).toEqual([]);
    const shared=(await(await page.request.get(baseURL+'/api/project/search?q=SharedPrivateNavigation')).json()).data;expect(shared.group.map(g=>g._id)).toEqual([753023]);expect(shared.project.map(p=>p._id)).toEqual([754051]);
    await db.collection('project').updateOne({_id:754051},{$set:{members:[]}});const unshared=(await(await page.request.get(baseURL+'/api/project/search?q=SharedPrivateNavigation')).json()).data;expect(unshared.group).toEqual([]);expect(unshared.project).toEqual([]);
  }finally{await db.collection('user').updateOne({_id:9},{$set:{role:'admin'}});}
  const admin=(await(await page.request.get(baseURL+'/api/project/search?q='+prefix)).json()).data;expect(admin.project).toHaveLength(10);expect(admin.project[0]._id).toBe(754000);expect(admin.group).toHaveLength(10);
});
test('avatar menu Escape closes restores focus and never navigates',async({page})=>{
  await login(page);await page.goto(baseURL+'/group/8');const trigger=page.getByRole('button',{name:'用户菜单',exact:true});const original=page.url();
  for(let i=0;i<2;i++){
    await trigger.click();await expect(trigger).toHaveAttribute('aria-expanded','true');
    const profile=page.getByRole('link',{name:/个人中心/});await expect(profile).toBeVisible();await profile.focus();
    await page.keyboard.press('Escape');await expect(page.locator('.user-menu:visible')).toHaveCount(0);await expect(trigger).toBeFocused();await expect(trigger).toHaveAttribute('aria-expanded','false');expect(page.url()).toBe(original);
  }
  await trigger.press('Enter');await expect(page.locator('.user-menu:visible')).toHaveCount(1);await page.locator('body').click({position:{x:1000,y:60}});await expect(page.locator('.user-menu:visible')).toHaveCount(0);
  await trigger.focus();await trigger.press('Space');await expect(page.locator('.user-menu:visible')).toHaveCount(1);await page.getByRole('link',{name:/个人中心/}).click();await expect(page).toHaveURL(/\/user\/profile\/9$/);await expect(page.locator('.user-menu:visible')).toHaveCount(0);
});
test('normal login validates email and serializes retries while a response is pending',async({page})=>{
 let requests=0;await page.route('**/api/user/login',async route=>{requests++;await new Promise(resolve=>setTimeout(resolve,1000));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({errcode:405,errmsg:'Synthetic rejected login'})})});await page.goto(baseURL+'/login');const form=page.locator('form').first(),button=form.locator('button.login-form-button');await button.click();await expect(page.getByText('请输入正确的email!',{exact:true})).toBeVisible();await expect(page.getByText('请输入密码!',{exact:true})).toBeVisible();expect(requests).toBe(0);await form.getByPlaceholder('Email',{exact:true}).fill('invalid email');await form.getByPlaceholder('Password',{exact:true}).fill('synthetic-invalid-only');await button.click();expect(requests).toBe(0);await form.getByPlaceholder('Email',{exact:true}).fill('browser@example.invalid');await form.getByPlaceholder('Password',{exact:true}).press('Enter');await page.keyboard.press('Enter');await expect(page.getByText('Synthetic rejected login',{exact:true}).first()).toBeVisible();expect(requests).toBe(1);await expect(button).not.toHaveClass(/ant-btn-loading/);await button.click();await expect.poll(()=>requests).toBe(2);await expect(button).not.toHaveClass(/ant-btn-loading/);await expect(page).toHaveURL(/\/login$/);
});
test('disabled registration rejects direct submission and switching clears cancelled drafts',async({page})=>{
 await page.goto(baseURL+'/login');for(let i=0;i<2;i++){await page.getByRole('tab',{name:'注册',exact:true}).click();await expect(page.getByText('管理员已禁止注册，请联系管理员',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^注\s*册$/})).toHaveCount(0);await page.getByRole('tab',{name:'登录',exact:true}).click();}expect((await(await page.request.post(baseURL+'/api/user/reg',{data:{}})).json()).errcode).not.toBe(0);
 await page.route('**/api/user/status',async route=>{const response=await route.fetch();const body=await response.json();body.canRegister=true;await route.fulfill({response,json:body})});let registrations=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/user/reg')registrations++});await page.reload();await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByRole('button',{name:/^注\s*册$/}).click();await expect(page.getByText('请输入用户名!',{exact:true})).toBeVisible();await page.getByPlaceholder('Username',{exact:true}).fill('Cancelled only');await page.getByRole('tab',{name:'登录',exact:true}).click();await page.getByRole('tab',{name:'注册',exact:true}).click();await expect(page.getByPlaceholder('Username',{exact:true})).toHaveValue('');await expect(page.getByText('请输入email!',{exact:true})).toHaveCount(0);expect(registrations).toBe(0);
});
test('project navigation remains visible after status and tag filters for owner developer and guest',async({page})=>{
 const db=connection.db,group=790800;await db.collection('group').insertOne({_id:group,uid:97,group_name:'Synthetic navigation visibility',type:'public',members:[]});await db.collection('user').updateOne({_id:9},{$set:{role:'member'}});
 try{for(const[k,role]of['owner','dev','guest'].entries()){
  const project=790810+k,cat=790820+k;await db.collection('project').insertOne({_id:project,uid:role==='owner'?9:97,group_id:group,name:'Synthetic navigation '+role,project_type:'private',members:role==='owner'?[]:[{uid:9,role}],env:[],tag:[{name:'review',desc:''},{name:'synthetic',desc:''}],basepath:''});await db.collection('interface_cat').insertOne({_id:cat,uid:97,project_id:project,name:'Navigation category'});await db.collection('interface').insertMany([['Done review','done','review'],['Undone review','undone','review'],['Done synthetic','done','synthetic']].map(([title,status,tag],i)=>({...fixture,_id:790830+k*10+i,project_id:project,catid:cat,uid:97,title,status,tag:[tag],path:'/nav-'+i})));
  await login(page);await page.goto(baseURL+'/project/'+project+'/interface/api');const nav=page.locator('.m-subnav'),table=page.locator('.table-interfacelist');await expect(table.locator('tbody tr')).toHaveCount(3);
  const visibleNavigation=async()=>{for(const[label,path]of[['接口','interface/api'],['动态','activity'],['数据管理','data'],['成员管理','members'],['设置','setting'],['Wiki','wiki']]){const link=nav.locator('a[href="/project/'+project+'/'+path+'"]');await expect(link).toBeInViewport();await expect(link.locator('xpath=ancestor::li[1]')).toHaveCSS('opacity','1');await expect(link).toContainText(new RegExp(label.split('').join('\\s*')));}};
  await visibleNavigation();for(const[column,value,reset,count]of[['状态','未完成',false,1],['tag','review',false,1],['状态','',true,2],['tag','',true,3]]){const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/interface/list');await table.locator('th').filter({hasText:column}).locator('.anticon-filter').click();const popup=page.locator('.ant-table-filter-dropdown:visible');await expect(popup).toBeVisible();if(reset)await popup.getByText('重置',{exact:true}).click();else await popup.getByText(value,{exact:true}).click();const ok=popup.getByText(/^确\s*定$/);if(await ok.isVisible())await ok.click();await expect(popup).toBeHidden();expect((await(await reply).json()).errcode).toBe(0);await expect(table.locator('tbody tr')).toHaveCount(count);await visibleNavigation();}
 }}finally{await db.collection('user').updateOne({_id:9},{$set:{role:'admin'}});}
});


test('saving a request twice while pending creates exactly one collection case', async ({page}) => {
  await login(page);
  await page.goto(baseURL+'/project/11/interface/api/17');
  await page.getByText('运行',{exact:true}).click();
  await page.getByRole('button',{name:/保\s*存/}).click();
  const dialog=page.getByRole('dialog',{name:'添加到集合'});
  await dialog.locator('.col-item').first().click();
  const caseName='Synthetic default CI duplicate submission';
  await dialog.getByPlaceholder('请输入接口用例名称').fill(caseName);
  let requests=0;
  await page.route('**/api/col/add_case',async route=>{
    requests++;
    await new Promise(resolve=>setTimeout(resolve,300));
    await route.continue();
  });
  await dialog.getByRole('button',{name:/确\s*定/}).dblclick({delay:20});
  await expect(dialog).toHaveCount(0);
  await expect.poll(()=>connection.db.collection('interface_case').countDocuments({casename:caseName})).toBe(1);
  expect(requests).toBe(1);
});


test('header search ignores stale responses and clear invalidates an in-flight search', async ({page}) => {
  await login(page);await page.goto(baseURL+'/group');
  let release,seen=false;
  let gate=new Promise(resolve=>release=resolve);
  const queries=[];
  await page.route('**/api/project/search?*',async route=>{
    const q=new URL(route.request().url()).searchParams.get('q');queries.push(q);
    if(q==='older'||q==='clear me'){seen=true;await gate;}
    await route.fulfill({contentType:'application/json',body:JSON.stringify({errcode:0,data:{group:[],project:[{_id:11,groupId:8,name:q+' synthetic result'}],interface:[]}})});
  });
  const input=page.getByPlaceholder('搜索分组/项目/接口');
  await input.fill('older');await expect.poll(()=>seen).toBe(true);
  await input.fill('new & #');await expect(page.getByText('项目: new & # synthetic result',{exact:true})).toBeVisible();
  release();await page.waitForTimeout(100);
  await expect(page.getByText('项目: older synthetic result',{exact:true})).toHaveCount(0);
  expect(queries).toContain('new & #');
  seen=false;gate=new Promise(resolve=>release=resolve);
  await input.fill('clear me');await expect.poll(()=>seen).toBe(true);await input.fill('');release();
  await page.waitForTimeout(100);await expect(page.getByText('项目: clear me synthetic result',{exact:true})).toHaveCount(0);
});

test('authenticated home resolves personal group and browser history stays usable', async ({page}) => {
  await login(page);
  const personal=(await (await page.request.get(baseURL+'/api/group/get_mygroup')).json()).data._id;
  await page.goto(baseURL+'/');await expect(page).toHaveURL(baseURL+'/group/'+personal);
  await page.goto(baseURL+'/project/11/interface/api');await expect(page.getByPlaceholder('搜索接口',{exact:true})).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(baseURL+'/group/'+personal);
  await page.goForward();await expect(page).toHaveURL(baseURL+'/project/11/interface/api');
});


for (const cancellation of ['registration tab', 'browser Back']) test('late successful login cannot navigate after '+cancellation, async ({page}) => {
  let release,started=false;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/user/login',async route=>{
    started=true;await gate;
    await route.fulfill({contentType:'application/json',body:JSON.stringify({errcode:0,data:{uid:9,username:'Synthetic cancelled login',email:'browser@example.invalid',role:'admin',type:'site'}})});
  });
  await page.goto(baseURL+'/');
  await page.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();
  await expect(page).toHaveURL(baseURL+'/login');
  await page.getByPlaceholder('Email',{exact:true}).fill('browser@example.invalid');
  await page.getByPlaceholder('Password',{exact:true}).fill('synthetic-not-submitted-to-server');
  await page.locator('button.login-form-button').click();await expect.poll(()=>started).toBe(true);
  if(cancellation==='registration tab')await page.getByRole('tab',{name:'注册',exact:true}).click();else await page.goBack();
  const expected=page.url();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/login');release();await response;
  await page.waitForTimeout(200);await expect(page).toHaveURL(expected);
  await expect(page.getByText('登录成功!',{exact:false})).toHaveCount(0);
  if(cancellation==='registration tab')await expect(page.getByRole('tab',{name:'注册',exact:true})).toHaveAttribute('aria-selected','true');
});


test('normal login accepts an existing synthetic plus-address email', async ({page}) => {
  const email='synthetic+legacy@example.invalid';
  await connection.db.collection('user').updateOne({_id:9},{$set:{email}});
  try {
    await page.goto(baseURL+'/login');
    await page.getByPlaceholder('Email',{exact:true}).fill(email);
    await page.getByPlaceholder('Password',{exact:true}).fill('synthetic-browser-password');
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/login');
    await page.locator('button.login-form-button').click();
    expect((await (await response).json()).errcode).toBe(0);
    await expect(page).toHaveURL(/\/group/);
  } finally {
    await connection.db.collection('user').updateOne({_id:9},{$set:{email:'browser@example.invalid'}});
  }
});
