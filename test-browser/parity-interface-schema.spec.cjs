const {test,expect}=require('@playwright/test');
const password='SyntheticParityOnly_901000!';
async function setup(page,request,info,role,schema){
  page.setDefaultTimeout(12000);
  expect((await(await request.post('/api/user/login',{data:{email:'owner@ui-parity.invalid',password}})).json()).errcode).toBe(0);
  async function api(path,data){const r=await(await request.post(path,{data})).json();expect(r.errcode).toBe(0);return r.data;}
  const p=await api('/api/project/add',{name:'Synthetic schema '+role+' '+Date.now(),group_id:901000,project_type:'private'});
  if(role!=='owner')await api('/api/project/add_member',{id:p._id,member_uids:[role==='guest'?910004:910003],role:role==='guest'?'guest':'dev'});
  const cats=(await(await request.get('/api/interface/getCatMenu?project_id='+p._id)).json()).data;
  const i=await api('/api/interface/add',{project_id:p._id,catid:cats[0]._id,title:'Synthetic schema fixture',path:'/schema',method:'POST',tag:[],req_body_type:'form',req_body_form:[],res_body_type:'json',res_body_is_json_schema:true,res_body:JSON.stringify(schema)});
  await info.attach('schema-fixture',{body:JSON.stringify({project:p._id,id:i._id,schema}),contentType:'application/json'});
  await page.goto('/login');await page.getByPlaceholder('Email',{exact:true}).fill((role==='guest'?'outsider':role)+'@ui-parity.invalid');await page.getByPlaceholder('Password',{exact:true}).fill(password);await page.getByRole('button',{name:/^登\s*录$/}).click();await expect(page).toHaveURL(/\/group/);
  await page.goto('/project/'+p._id+'/interface/api/'+i._id);await page.getByRole('tab',{name:'编辑',exact:true}).click();
  return async()=>{const r=await(await request.get('/api/interface/get?id='+i._id)).json();expect(r.errcode).toBe(0);return JSON.parse(r.data.res_body);};
}
for(const role of ['owner','developer','guest'])test('first invalid schema edit prompts before leaving '+role,async({page,request},info)=>{
  const initial={type:'object',additionalProperties:false,properties:{value:{type:'string',minLength:2}},'x-retained':{flag:true}};
  const read=await setup(page,request,info,role,initial);
  if(info.project.name==='old'){
    await expect(page.getByRole('tab',{name:'JSON（完整 Schema）',exact:true})).toHaveCount(0);
    await page.locator('input[value="root"]:visible').last().evaluate(e=>e.scrollIntoView({block:'center'}));
    await page.screenshot({path:info.outputPath('legacy-schema-capability.png')});
    await info.attach('legacy-root-dom',{body:await page.locator('input[value="root"]:visible').last().evaluate(e=>e.parentElement.parentElement.outerHTML),contentType:'text/html'});
    await info.attach('capability',{body:JSON.stringify({fullSchemaTab:false,status:'notrun',reason:'Legacy has no equivalent full-schema tab; advanced source requires separate coverage.'}),contentType:'application/json'});return;
  }
  const editor=page.locator('.schema-editor-modern').filter({visible:true});await expect(editor).toHaveCount(1);
  await editor.getByRole('tab',{name:'JSON（完整 Schema）',exact:true}).click();const text=editor.getByLabel('JSON Schema',{exact:true});await text.fill('{invalid');
  let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/interface/up'&&r.method()==='POST')writes++;});
  await page.getByRole('button',{name:/^保\s*存$/}).click();await expect(page.getByText('Schema JSON 无效，请修正后再保存',{exact:true})).toBeVisible();expect(writes).toBe(0);expect(await read()).toEqual(initial);
  await page.getByRole('tab',{name:'预览',exact:true}).first().click();const modal=page.locator('.ant-modal:visible');await expect(modal).toContainText('你即将离开编辑页面');await modal.getByRole('button',{name:/取\s*消/}).click();await expect(text).toHaveValue('{invalid');
  await text.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('first-invalid-schema-preserved.png')});
  await page.getByRole('tab',{name:'预览',exact:true}).first().click();await modal.getByRole('button',{name:/确\s*定/}).click();await page.getByRole('tab',{name:'编辑',exact:true}).click();await editor.getByRole('tab',{name:'JSON（完整 Schema）',exact:true}).click();expect(JSON.parse(await text.inputValue())).toEqual(initial);expect(writes).toBe(0);
  const changed={...initial,description:'Recovered schema'};await text.fill(JSON.stringify(changed));const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/interface/up'&&r.request().method()==='POST');await page.getByRole('button',{name:/^保\s*存$/}).click();const saved=await(await pending).json();expect(saved.errcode===0).toBe(role!=='guest');await expect(page.getByText(role==='guest'?/没有权限/:'保存成功').first()).toBeVisible();expect(await read()).toEqual(role==='guest'?initial:changed);
  await page.reload();await page.getByRole('tab',{name:'编辑',exact:true}).click();await editor.getByRole('tab',{name:'JSON（完整 Schema）',exact:true}).click();expect(JSON.parse(await text.inputValue())).toEqual(role==='guest'?initial:changed);
});
for(const role of ['owner','developer','guest'])test('tuple and depth thirteen schema preserve unknown keywords '+role,async({page,request},info)=>{
  let deep={type:'string',description:'Original deep leaf',pattern:'^[A-Z]+$','x-leaf':7};
  for(let n=12;n>=1;n--)deep={type:'object',additionalProperties:false,properties:{['level'+n]:deep}};
  const initial={type:'object','x-root':{preserve:true},properties:{deep,tuple:{type:'array',items:[{type:'string',minLength:2},{type:'integer',minimum:3},false],additionalItems:false},nullable:{type:['string','null'],enum:['yes',null]}}};
  const read=await setup(page,request,info,role,initial);
  if(info.project.name==='old'){
    await page.locator('input[value="root"]:visible').last().evaluate(e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:info.outputPath('legacy-deep-tuple-schema.png')});
    await info.attach('legacy-schema-controls',{body:JSON.stringify(await page.locator('input,button,textarea').evaluateAll(es=>es.map(e=>({tag:e.tagName,text:e.textContent,placeholder:e.getAttribute('placeholder'),value:e.value,aria:e.getAttribute('aria-label')})))),contentType:'application/json'});
    expect(await read()).toEqual(initial);return;
  }
  const editor=page.locator('.schema-editor-modern').filter({visible:true});
  for(let n=4;n<=11;n++)await editor.getByRole('button',{name:'展开 level'+n,exact:true}).click();
  await editor.getByLabel('level12 描述',{exact:true}).fill('Edited depth thirteen');
  await editor.getByRole('button',{name:'删除字段 数组元素 2',exact:true}).click();
  await editor.getByRole('button',{name:'添加数组元素',exact:true}).click();
  await editor.getByLabel('数组元素 3 描述',{exact:true}).fill('New tuple member');
  await expect(editor.locator('.schema-node-row').filter({has:page.getByLabel('字段 nullable 名称',{exact:true})})).toContainText('string | null');
  await editor.getByRole('button',{name:'折叠 deep',exact:true}).click();await expect(editor.getByLabel('level12 描述',{exact:true})).toHaveCount(0);await editor.getByRole('button',{name:'展开 deep',exact:true}).click();
  for(let n=4;n<=11;n++)await editor.getByRole('button',{name:'展开 level'+n,exact:true}).click();
  await expect(editor.getByLabel('level12 描述',{exact:true})).toHaveValue('Edited depth thirteen');await editor.getByLabel('level12 描述',{exact:true}).evaluate(e=>e.scrollIntoView({block:'center'}));await page.waitForTimeout(150);await page.screenshot({path:info.outputPath('deep-schema-expanded.png')});
  await editor.getByRole('tab',{name:'JSON（完整 Schema）',exact:true}).click();const updated=JSON.parse(await editor.getByLabel('JSON Schema',{exact:true}).inputValue());let leaf=updated.properties.deep;for(let n=1;n<=12;n++)leaf=leaf.properties['level'+n];expect(leaf).toEqual({type:'string',description:'Edited depth thirteen',pattern:'^[A-Z]+$','x-leaf':7});expect(updated.properties.tuple.items).toEqual([{type:'string',minLength:2},false,{type:'string',description:'New tuple member'}]);expect(updated.properties.nullable).toEqual(initial.properties.nullable);expect(updated['x-root']).toEqual(initial['x-root']);
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/interface/up'&&r.request().method()==='POST');await page.getByRole('button',{name:/^保\s*存$/}).click();const saved=await(await pending).json();expect(saved.errcode===0).toBe(role!=='guest');await expect(page.getByText(role==='guest'?/没有权限/:'保存成功').first()).toBeVisible();expect(await read()).toEqual(role==='guest'?initial:updated);
  await page.reload();await page.getByRole('tab',{name:'编辑',exact:true}).click();await editor.getByRole('tab',{name:'JSON（完整 Schema）',exact:true}).click();expect(JSON.parse(await editor.getByLabel('JSON Schema',{exact:true}).inputValue())).toEqual(role==='guest'?initial:updated);
});
for(const role of ['owner','developer','guest'])test('advanced schema source cancel invalid recovery save '+role,async({page,request},info)=>{
  const initial={type:'object',additionalProperties:false,properties:{value:{type:'string',minLength:2}},'x-preserve':{nested:[1,2]}};const read=await setup(page,request,info,role,initial);const modal=page.locator('.ant-modal:visible');
  async function open(){if(info.project.name==='new')await page.getByRole('button',{name:'高级设置 根节点',exact:true}).click();else await page.locator('input[value="root"]:visible').last().locator('xpath=ancestor::div[@class="ant-row-flex ant-row-flex-middle"][1]').locator('.anticon-setting').click();await expect(modal).toBeVisible();}
  async function fill(text){if(info.project.name==='new')await modal.getByLabel('根节点 高级设置内容',{exact:true}).fill(text);else{const input=modal.locator('.ace_text-input');await input.focus();await input.press('ControlOrMeta+A');await page.keyboard.insertText(text);}}
  async function value(){return info.project.name==='new'?modal.getByLabel('根节点 高级设置内容',{exact:true}).inputValue():(await modal.locator('.ace_line').allTextContents()).join('\n');}
  const apply=()=>modal.getByRole('button',{name:info.project.name==='new'?/^应\s*用$/:/^确\s*定$/}).click();
  await open();expect(JSON.parse(await value())).toEqual(initial);await fill(JSON.stringify({...initial,description:'Discard advanced draft'}));await modal.getByRole('button',{name:/取\s*消/}).click();expect(await read()).toEqual(initial);await open();await info.attach('advanced-reopen',{body:JSON.stringify({text:await value()}),contentType:'application/json'});if(info.project.name==='new')expect(JSON.parse(await value())).toEqual(initial);
  await fill('{broken');await expect.poll(value).toBe('{broken');await apply();if(info.project.name==='old'){await expect(modal).toHaveCount(0);await open();await info.attach('legacy-invalid-discarded',{body:JSON.stringify({text:await value()}),contentType:'application/json'});}else await expect(modal).toBeVisible();expect(await read()).toEqual(initial);await page.screenshot({path:info.outputPath('advanced-invalid-source.png')});
  const changed={...initial,description:'Applied source',required:['value']};await fill(JSON.stringify(changed));await apply();await expect(modal).toHaveCount(0);const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/interface/up'&&r.request().method()==='POST');await page.getByRole('button',{name:/^保\s*存$/}).click();const saved=await(await pending).json();expect(saved.errcode===0).toBe(role!=='guest');await expect(page.getByText(role==='guest'?/没有权限/:'保存成功').first()).toBeVisible();expect(await read()).toEqual(role==='guest'?initial:changed);await page.reload();await page.getByRole('tab',{name:'编辑',exact:true}).click();await open();expect(JSON.parse(await value())).toEqual(role==='guest'?initial:changed);await modal.getByRole('button',{name:/取\s*消/}).click();
});
