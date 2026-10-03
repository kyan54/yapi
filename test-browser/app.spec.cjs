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
  await connection.db.collection('project').updateOne({_id:11},{$set:{is_mock_open:true,project_mock_script:'mockJson.isolated = true; delay = 0;'}});
  try {
    const response=await page.request.get(baseURL+'/mock/11/orders/123');
    expect(response.status(), 'Mock response: '+await response.text()+'\nApplication log:\n'+log.slice(-6000)).toBe(200);
    const body=await response.json();expect(body.isolated).toBe(true);expect(typeof body.id).toBe('number');
    const checked=await page.request.post(baseURL+'/api/col/run_script',{data:{col_id:21,interface_id:17,response:{status:200,body:{id:123},header:{}},records:[],params:{},script:'assert.equal(status,200); assert.equal(body.id,123); log("asserted");'}});
    expect(checked.status()).toBe(200);const result=await checked.json();expect(result.errcode).toBe(0);expect(JSON.stringify(result.data.logs)).toContain('asserted');
  } finally {await connection.db.collection('project').updateOne({_id:11},{$set:{is_mock_open:false,project_mock_script:''}});}
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
  await connection.db.collection('interface_col').insertOne({_id:22,uid:9,project_id:11,name:'Batched collection',desc:'Synthetic only',index:1});
  await connection.db.collection('interface_case').insertMany([31,32,33].map((id,index)=>({_id:id,uid:9,col_id:22,project_id:11,interface_id:17,casename:'Batched case '+index,index,case_env:'local-loopback',req_params:[{name:'id',value:'123'}],req_headers:[],req_query:[],req_body_form:[],test_status:'',enable_script:false,test_script:'',mock_verify:false})));
  await login(page);
  await page.goto(baseURL+'/project/11/interface/col/22');
  await expect(page.getByRole('link',{name:'Batched case 2',exact:true})).toBeVisible();
  await page.waitForLoadState('networkidle');
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
