const {test,expect}=require('@playwright/test');
for(const kind of ['interface-order','category-order','cross-category'])for(const failure of ['network','http'])test('drag failure and retry '+kind+' '+failure,async({page,request},info)=>{
  test.skip(info.project.name==='old','Candidate transport-error regression; legacy resolved-error parity is covered by tree suite.');
  page.setDefaultTimeout(12000);const password='SyntheticParityOnly_901000!';
  expect((await(await request.post('/api/user/login',{data:{email:'owner@ui-parity.invalid',password}})).json()).errcode).toBe(0);
  async function api(path,data){const r=await(await request.post(path,{data})).json();expect(r.errcode).toBe(0);return r.data;}
  const p=await api('/api/project/add',{name:'Synthetic drag transport '+kind+' '+failure+' '+Date.now(),group_id:901000,project_type:'private'});
  await api('/api/interface/add_cat',{project_id:p._id,name:'Retry A'});await api('/api/interface/add_cat',{project_id:p._id,name:'Retry B'});
  const menu=async()=>{const r=await(await request.get('/api/interface/list_menu?project_id='+p._id)).json();expect(r.errcode).toBe(0);return r.data;};
  const cats=await menu(),ca=cats.find(c=>c.name==='Retry A'),cb=cats.find(c=>c.name==='Retry B');const ids=[];
  for(const suffix of ['A','B'])ids.push((await api('/api/interface/add',{project_id:p._id,catid:ca._id,title:'Retry interface '+suffix,path:'/retry-'+suffix,method:'GET',tag:[],res_body_type:'json',res_body_is_json_schema:true,res_body:'{"type":"object","properties":{}}'}))._id);
  await info.attach('drop-fixture',{body:JSON.stringify({project:p._id,catA:ca._id,catB:cb._id,ids,kind,failure}),contentType:'application/json'});
  await page.goto('/login');await page.getByPlaceholder('Email',{exact:true}).fill('owner@ui-parity.invalid');await page.getByPlaceholder('Password',{exact:true}).fill(password);await page.getByRole('button',{name:/^登\s*录$/}).click();await expect(page).toHaveURL(/\/group/);await page.goto('/project/'+p._id+'/interface/api/'+ids[0]);
  const link=name=>page.locator('a.interface-item').filter({hasText:new RegExp('^'+name+'$')});await expect(link('Retry interface B')).toBeVisible();await page.waitForTimeout(400);
  const endpoint=kind==='interface-order'?'/api/interface/up_index':kind==='category-order'?'/api/interface/up_cat_index':'/api/interface/up';
  async function drag(){const source=kind==='category-order'?'Retry B':'Retry interface A',target=kind==='interface-order'?'Retry interface B':kind==='category-order'?'Retry A':'Retry B';const a=await page.locator('.ant-tree-treenode').filter({has:link(source)}).locator('.ant-tree-draggable-icon').boundingBox(),b=await link(target).boundingBox();const x=b.x+(kind==='category-order'?20:b.width/2),y=b.y+(kind==='category-order'?1:b.height-3);await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2+10,a.y+a.height/2+5,{steps:5});await page.mouse.move(x,y,{steps:12});await page.waitForTimeout(350);await page.mouse.move(x+1,y);await page.mouse.up();}
  const before=await menu(),visibleBefore=await page.locator('a.interface-item').allTextContents();const errors=[];page.on('pageerror',e=>errors.push(e.message));let intercepted=0;
  const pattern='**'+endpoint;await page.route(pattern,async route=>{intercepted++;if(failure==='network')await route.abort('failed');else await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({errcode:503,errmsg:'Synthetic sorting unavailable'})});});
  await drag();await expect(page.getByText(failure==='network'?'移动或排序失败，请重试':'Synthetic sorting unavailable',{exact:true}).first()).toBeVisible();expect(intercepted).toBe(1);expect(await menu()).toEqual(before);expect(await page.locator('a.interface-item').allTextContents()).toEqual(visibleBefore);expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('drag-failure-visible.png')});
  await page.unroute(pattern);const pending=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='POST');await drag();expect((await(await pending).json()).errcode).toBe(0);await page.reload();const after=await menu();
  if(kind==='cross-category'){expect(after.find(c=>c._id===cb._id).list.some(i=>i._id===ids[0])).toBe(true);await expect(link('Retry interface A')).toBeVisible();}
  else if(kind==='category-order')expect(after.findIndex(c=>c._id===cb._id)).toBeLessThan(after.findIndex(c=>c._id===ca._id));
  else expect(after.find(c=>c._id===ca._id).list.map(i=>i._id)).toEqual([ids[1],ids[0]]);
  expect(errors).toEqual([]);await info.attach('drop-final',{body:JSON.stringify(after),contentType:'application/json'});await page.screenshot({path:info.outputPath('drag-retry-success.png')});
});
