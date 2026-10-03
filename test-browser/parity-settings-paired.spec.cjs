const {test,expect}=require('@playwright/test');
const projectId=901001;
async function login(page,role='admin'){await page.goto('/login');await page.getByPlaceholder('Email',{exact:true}).fill(role+'@ui-parity.invalid');await page.getByPlaceholder('Password',{exact:true}).fill('SyntheticParityOnly_901000!');await page.getByRole('button',{name:/^登\s*录$/}).click();await expect(page).toHaveURL(/\/group/);}
async function save(page,path,click){const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===path);await click();const response=await pending;expect(response.status()).toBe(200);const body=await response.json();expect(body.errcode).toBe(0);return body;}
async function readProject(page){const r=await page.request.get('/api/project/get?id='+projectId);expect(r.status()).toBe(200);const b=await r.json();expect(b.errcode).toBe(0);return b.data;}
function field(page,version,name){return page.locator('[id="'+(version==='old'?name:name.replace(/[.\[\]]/g,'_').replace(/__+/g,'_').replace(/_$/,''))+'"]');}
test('admin environment add rename nested values cancel delete and reload',async({page},info)=>{
 const version=info.project.name;page.setDefaultTimeout(15000);await login(page);let before=await readProject(page);const name='Synthetic matrix environment '+version;
 await page.goto('/project/'+projectId+'/setting');await page.getByRole('tab',{name:'环境配置',exact:true}).click();
 for(const leftover of before.env.filter(x=>x.name===name||x.name===name+' renamed')) {
   const row=page.locator('.menu-item').filter({has:page.getByText(leftover.name,{exact:true})});await row.hover();await row.locator('.interface-delete-icon').click();await save(page,'/api/project/up_env',()=>page.getByRole('button',{name:/确\s*定/}).click());
 }
 before=await readProject(page);await page.getByText('local-synthetic',{exact:true}).click();
 await test.step('load and switch existing environments',async()=>{await expect(page.getByPlaceholder('请输入环境名称')).toHaveValue('local-synthetic');await expect(field(page,version,'global[0].value')).toHaveValue('42');await page.getByText('browser-synthetic',{exact:true}).click();await expect(page.getByPlaceholder('请输入环境名称')).toHaveValue('browser-synthetic');await expect(field(page,version,'global[0].value')).toHaveValue('');});
 await test.step('add named environment and nested rows',async()=>{
  await page.locator('.first-menu-item .anticon-plus').click();await expect(page.getByPlaceholder('请输入环境名称')).toHaveValue('');
  await page.getByPlaceholder('请输入环境名称').fill(name);await page.getByPlaceholder('请输入环境域名').fill('127.0.0.1:3000/mock/901001');
  await field(page,version,'global[0].name').fill('matrixOne');await field(page,version,'global[0].value').fill('α-one');
  await field(page,version,'global[1].name').fill('matrixTwo');await field(page,version,'global[1].value').fill('二-two');
  await field(page,version,'cookie[0].name').fill('syntheticCookie');await field(page,version,'cookie[0].value').fill('fixtureOnly');
  await page.locator('.env-content .ant-select-auto-complete input').first().fill('X-Matrix-Fixture');await field(page,version,'header[0].value').fill('synthetic-header');
  await save(page,'/api/project/up_env',()=>page.getByRole('button',{name:/保\s*存/}).click());
  const saved=(await readProject(page)).env.find(x=>x.name===name);expect(saved.domain).toBe('http://127.0.0.1:3000/mock/901001');expect(saved.global.map(({name,value})=>({name,value}))).toEqual([{name:'matrixOne',value:'α-one'},{name:'matrixTwo',value:'二-two'}]);expect(saved.header).toEqual(expect.arrayContaining([expect.objectContaining({name:'X-Matrix-Fixture',value:'synthetic-header'}),expect.objectContaining({name:'Cookie',value:expect.stringContaining('syntheticCookie=fixtureOnly')})]));
 });
 await test.step('reload rename save exact selected record',async()=>{
  await page.reload();await page.getByRole('tab',{name:'环境配置',exact:true}).click();await page.getByText(name,{exact:true}).click();await expect(page.getByPlaceholder('请输入环境名称')).toHaveValue(name);
  await page.getByPlaceholder('请输入环境名称').fill(name+' renamed');await save(page,'/api/project/up_env',()=>page.getByRole('button',{name:/保\s*存/}).click());expect((await readProject(page)).env.filter(x=>x.name===name+' renamed')).toHaveLength(1);
 });
 await test.step('delete cancel retains then confirm removes only added record',async()=>{
  const row=page.locator('.menu-item').filter({has:page.getByText(name+' renamed',{exact:true})});await row.hover();await row.locator('.interface-delete-icon').click();await page.getByRole('button',{name:/取\s*消/}).click();expect((await readProject(page)).env.some(x=>x.name===name+' renamed')).toBe(true);
  await row.hover();await row.locator('.interface-delete-icon').click();await save(page,'/api/project/up_env',()=>page.getByRole('button',{name:/确\s*定/}).click());
  const after=await readProject(page);expect(after.env.map(x=>x.name)).toEqual(before.env.map(x=>x.name));
  await page.reload();await page.getByRole('tab',{name:'环境配置',exact:true}).click();await expect(page.getByText(name+' renamed',{exact:true})).toHaveCount(0);await expect(page.getByPlaceholder('请输入环境名称')).toHaveValue('local-synthetic');
 });
 await page.screenshot({path:info.outputPath('environment-complete.png'),fullPage:true});
});

