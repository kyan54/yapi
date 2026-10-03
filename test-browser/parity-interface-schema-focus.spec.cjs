const {test,expect}=require('@playwright/test');
const password='SyntheticParityOnly_901000!';
async function setup(page,request,info,role,schema){
  page.setDefaultTimeout(12000);
  expect((await(await request.post('/api/user/login',{data:{email:'owner@ui-parity.invalid',password}})).json()).errcode).toBe(0);
  async function api(path,data){const r=await(await request.post(path,{data})).json();expect(r.errcode).toBe(0);return r.data;}
  const p=await api('/api/project/add',{name:'Synthetic schema '+role+' '+Date.now(),group_id:901000,project_type:'private'});
  if(role!=='owner')await api('/api/project/add_member',{id:p._id,member_uids:[role==='guest'?910004:910003],role:role==='guest'?'guest':'dev'});
  const cats=(await(await request.get('/api/interface/getCatMenu?project_id='+p._id)).json()).data;
  const i=await api('/api/interface/add',{project_id:p._id,catid:cats[0]._id,title:'Synthetic schema fixture',path:'/schema',method:'POST',tag:[],req_body_type:'json',req_body_is_json_schema:true,req_body_other:JSON.stringify(schema),req_body_form:[],res_body_type:'json',res_body_is_json_schema:true,res_body:JSON.stringify(schema)});
  await info.attach('schema-fixture',{body:JSON.stringify({project:p._id,id:i._id,schema}),contentType:'application/json'});
  await page.goto('/login');await page.getByPlaceholder('Email',{exact:true}).fill((role==='guest'?'outsider':role)+'@ui-parity.invalid');await page.getByPlaceholder('Password',{exact:true}).fill(password);await page.getByRole('button',{name:/^登\s*录$/}).click();await expect(page).toHaveURL(/\/group/);
  await page.goto('/project/'+p._id+'/interface/api/'+i._id);await page.getByRole('tab',{name:'编辑',exact:true}).click();await expect(page.locator('.schema-editor-modern').first()).toBeVisible();await page.locator('#title').click();
  const read=async()=>{const r=await(await request.get('/api/interface/get?id='+i._id)).json();expect(r.errcode).toBe(0);return r.data;};return {read,api,project:p,item:i};
}

async function nativeReach(page,target){
 await expect(target).toBeVisible();
 if(await target.evaluateAll(es=>es.includes(document.activeElement)))return;
 for(let n=0;n<300;n++){
  const backward=await target.evaluateAll(es=>!!(document.activeElement.compareDocumentPosition(es[0])&Node.DOCUMENT_POSITION_PRECEDING));
  await page.keyboard.press(backward?'Shift+Tab':'Tab');
  if(await target.evaluateAll(es=>es.includes(document.activeElement)))return;
 }
 throw Error('Native keyboard target not reached');
}
for(const role of ['owner','developer','guest'])test('Schema modal focus close fresh reopen and valid apply '+role,async({page,request},info)=>{
 test.skip(info.project.name!=='new','Candidate focus regression; final legacy comparison was not requested');test.setTimeout(180000);
 const schema={type:'object',description:'Original root',properties:{value:{type:'string',description:'Original leaf'}}},f=await setup(page,request,info,role,schema),modal=page.locator('.ant-modal:visible'),observations=[];
 for(const side of [0,1]){
  const root=page.locator('.schema-editor-modern').nth(side);
  for(const name of ['高级设置 根节点','编辑 根节点 标题','编辑 根节点 描述','编辑 value Mock']){
   const trigger=root.getByRole('button',{name,exact:true});
   for(const method of ['Escape','Cancel','X']){
    await nativeReach(page,trigger);await page.keyboard.press(method==='X'?'Space':'Enter');await expect(modal).toBeVisible();const text=modal.locator('textarea').last(),original=await text.inputValue();await text.fill(original+' cancelled draft');
    if(method==='Escape')await page.keyboard.press('Escape');else if(method==='Cancel'){await nativeReach(page,modal.getByRole('button',{name:/^取\s*消$/}));await page.keyboard.press('Enter');}else{await nativeReach(page,modal.locator('.ant-modal-close'));await page.keyboard.press('Enter');}
    await expect(modal).toHaveCount(0);await expect(trigger).toBeFocused();
    await page.keyboard.press('Tab');expect(await trigger.evaluate(e=>e===document.activeElement)).toBe(false);await page.keyboard.press('Shift+Tab');await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');await expect(modal).toBeVisible();await expect(modal.locator('textarea').last()).toHaveValue(original);await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await expect(trigger).toBeFocused();
    observations.push({side,name,method,focusRestored:true,freshReopen:true});
   }
  }
 }
 expect(JSON.parse((await f.read()).res_body)).toEqual(schema);expect(JSON.parse((await f.read()).req_body_other)).toEqual(schema);
 const trigger=page.locator('.schema-editor-modern').last().getByRole('button',{name:'高级设置 根节点',exact:true});await nativeReach(page,trigger);await page.keyboard.press('Enter');await modal.getByLabel('根节点 高级设置内容',{exact:true}).fill('{bad');await modal.getByRole('button',{name:/^应\s*用$/}).click();await expect(modal.getByRole('alert')).toBeVisible();expect(JSON.parse((await f.read()).res_body)).toEqual(schema);
 await modal.getByLabel('根节点 高级设置内容',{exact:true}).fill(JSON.stringify({...schema,description:'Applied focus value'}));await modal.getByRole('button',{name:/^应\s*用$/}).click();await expect(modal).toHaveCount(0);await expect(trigger).toBeFocused();
 const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/interface/up'&&r.request().method()==='POST');await page.getByRole('button',{name:/^保\s*存$/}).click();const result=await(await reply).json();expect(result.errcode===0).toBe(role!=='guest');await expect(page.getByText(role==='guest'?/没有权限/:'保存成功').first()).toBeVisible();
 const after=await f.read();expect(JSON.parse(after.res_body)).toEqual(role==='guest'?schema:{...schema,description:'Applied focus value'});expect(JSON.parse(after.req_body_other)).toEqual(schema);
 const {execFileSync}=require('node:child_process'),db=JSON.parse(execFileSync('docker',['exec','parity-fast-interfaces-mongo-new','mongosh','--quiet','--eval','db=db.getSiblingDB("parity_fast_interfaces_new");print(JSON.stringify(db.interface.findOne({_id:'+f.item._id+'},{_id:1,res_body:1,req_body_other:1})));'],{encoding:'utf8'}));expect(db.res_body).toBe(after.res_body);expect(db.req_body_other).toBe(after.req_body_other);
 await page.reload();await page.getByRole('tab',{name:'编辑',exact:true}).click();await expect(page.locator('.schema-editor-modern').last().getByLabel('根节点 描述',{exact:true})).toHaveValue(role==='guest'?'Original root':'Applied focus value');await page.screenshot({path:info.outputPath('focus-reopened.png')});await info.attach('schema-focus-final',{body:JSON.stringify({id:f.item._id,role,observations,result,db}),contentType:'application/json'});
});
for(const role of ['owner','developer','guest'])test('Schema close then interface unmount cannot steal new focus '+role,async({page,request},info)=>{
 test.skip(info.project.name!=='new');const schema={type:'object',description:'First'},f=await setup(page,request,info,role,schema),second=await f.api('/api/interface/add',{project_id:f.project._id,catid:f.item.catid,title:'Second focus record',path:'/second-focus',method:'GET',res_body_type:'json',res_body_is_json_schema:true,res_body:JSON.stringify({type:'object',description:'Second'})});
 const firstURL=page.url(),secondURL=firstURL.replace(/\/\d+$/,'/'+second._id);await page.goto(secondURL);await page.goto(firstURL);await page.getByRole('tab',{name:'编辑',exact:true}).click();await expect(page.locator('.schema-editor-modern').first()).toBeVisible();await page.locator('#title').click();
 const trigger=page.locator('.schema-editor-modern').last().getByRole('button',{name:'编辑 根节点 描述',exact:true});await nativeReach(page,trigger);await page.keyboard.press('Enter');await page.locator('.ant-modal:visible textarea').fill('Stale modal draft');await page.keyboard.press('Escape');await page.goBack();await expect(page).toHaveURL(secondURL);await page.getByRole('tab',{name:'编辑',exact:true}).click();await page.locator('#title').click();await page.waitForTimeout(450);await expect(page.locator('#title')).toBeFocused();await expect(page.locator('.ant-modal:visible')).toHaveCount(0);await expect(page.locator('.schema-editor-modern').last().getByLabel('根节点 描述',{exact:true})).toHaveValue('Second');expect(JSON.parse((await f.read()).res_body)).toEqual(schema);await info.attach('schema-focus-navigation',{body:JSON.stringify({first:f.item._id,second:second._id,role,firstUnchanged:true,newTitleFocused:true}),contentType:'application/json'});
});

for(const role of ['owner','developer','guest'])for(const [kind,draft] of [
 ['implicit',{properties:{leaf:{type:'string'}}}],
 ['uppercase',{type:'OBJECT',properties:{leaf:{type:'string'}}}]
])test('actual InterfaceEditForm normalized Schema Apply '+kind+' '+role,async({page,request},info)=>{
 test.skip(info.project.name!=='new');
 const schema={type:'object',description:'Original'},expected={...draft,type:'object'},f=await setup(page,request,info,role,schema),modal=page.locator('.ant-modal:visible');
 for(const side of [0,1]){
  const trigger=page.locator('.schema-editor-modern').nth(side).getByRole('button',{name:'高级设置 根节点',exact:true});
  await nativeReach(page,trigger);await page.keyboard.press('Enter');await modal.getByLabel('根节点 高级设置内容',{exact:true}).fill(JSON.stringify(draft));
  await modal.getByRole('button',{name:/^应\s*用$/}).click();await expect(modal).toHaveCount(0);await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');expect(JSON.parse(await modal.getByLabel('根节点 高级设置内容',{exact:true}).inputValue())).toEqual(expected);
  await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await expect(trigger).toBeFocused();
 }
 const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/interface/up'&&r.request().method()==='POST');await page.getByRole('button',{name:/^保\s*存$/}).click();const result=await(await reply).json();expect(result.errcode===0).toBe(role!=='guest');await expect(page.getByText(role==='guest'?/没有权限/:'保存成功').first()).toBeVisible();
 const after=await f.read(),persisted=role==='guest'?schema:expected;expect(JSON.parse(after.res_body)).toEqual(persisted);expect(JSON.parse(after.req_body_other)).toEqual(persisted);
 const {execFileSync}=require('node:child_process'),db=JSON.parse(execFileSync('docker',['exec','parity-fast-interfaces-mongo-new','mongosh','--quiet','--eval','db=db.getSiblingDB("parity_fast_interfaces_new");print(JSON.stringify(db.interface.findOne({_id:'+f.item._id+'},{_id:1,res_body:1,req_body_other:1})));'],{encoding:'utf8'}));expect(db.res_body).toBe(after.res_body);expect(db.req_body_other).toBe(after.req_body_other);
 await page.reload();await page.getByRole('tab',{name:'编辑',exact:true}).click();
 for(const side of [0,1]){await page.locator('.schema-editor-modern').nth(side).getByRole('button',{name:'高级设置 根节点',exact:true}).click();expect(JSON.parse(await modal.getByLabel('根节点 高级设置内容',{exact:true}).inputValue())).toEqual(persisted);await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);}
 await page.screenshot({path:info.outputPath('normalized-apply-reopened.png')});await info.attach('schema-normalized-final',{body:JSON.stringify({id:f.item._id,role,kind,expected:persisted,result,db}),contentType:'application/json'});
});
