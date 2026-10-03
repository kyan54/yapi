const{expect}=require('@playwright/test');
async function login(page,role='owner'){await page.goto('/login');await page.getByPlaceholder('Email',{exact:true}).fill(role+'@ui-parity.invalid');await page.getByPlaceholder('Password',{exact:true}).fill('SyntheticParityOnly_901000!');const p=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/login');await page.getByRole('button',{name:/^登\s*录$/}).click();expect((await(await p).json()).errcode).toBe(0);await expect(page).toHaveURL(/\/group/);}
async function api(page,path,data){const r=data===undefined?await page.request.get(path):await page.request.post(path,{data});const body=await r.json();expect(body.errcode,path).toBe(0);return body.data;}
async function response(page,path,action){const p=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await action();const b=await(await p).json();expect(b.errcode,path).toBe(0);return b.data;}
async function choice(page,el,text){await el.click();await page.locator('.ant-select-dropdown:visible').getByText(text,{exact:true}).last().click();}
async function selectUser(page,dialog,name){await dialog.locator('.ant-select input').first().fill('Synthetic '+name);await page.locator('.ant-select-dropdown:visible').getByText('Synthetic '+name,{exact:true}).click();}
async function group(page,label){return api(page,'/api/group/add',{group_name:'Synthetic '+label+' '+Date.now(),group_desc:'Only isolated settings fixture',owner_uids:[910002]});}
async function project(page,label,group_id=901000){return api(page,'/api/project/add',{name:'Synthetic '+label+' '+Date.now(),group_id,project_type:'private'});}
module.exports={login,api,response,choice,selectUser,group,project};
