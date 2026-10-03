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
      await page.getByRole('button',{name:/^保\s*存$/}).click();
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
