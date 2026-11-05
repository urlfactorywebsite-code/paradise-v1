'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createApp}=require('../server'),{testDatabase}=require('./database-helper');
const target=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
if(process.env.TEST_DISPOSABLE!=='1'||!target||!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='55429')throw Error('Use the disposable customer PostgreSQL server on loopback port 55429 with TEST_DISPOSABLE=1.');
let database,app,browser,context,page,base,csrf,customerId,quotationId;
const results=[],exceptions=[],output='test-results';fs.mkdirSync(output,{recursive:true});
async function check(name,fn){try{const detail=await fn();results.push({name,result:'PASS',detail});console.log('PASS '+name);}catch(error){results.push({name,result:'FAIL',error:error.message});throw error;}}
async function request(route,method='GET',data,status=200){const response=await context.request.fetch(base+route,{method,headers:{'X-CSRF-Token':csrf},...(data===undefined?{}:{data})});const body=await response.json();assert.equal(response.status(),status,route+': '+JSON.stringify(body));return body;}
async function choose(label,option){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('searchbox',{name:'Search '+label+' options',exact:true}).fill(option);await page.getByRole('option',{name:option,exact:true}).click();}
async function openCustomer(id=''){await page.evaluate(id=>custForm(id,1),id);await page.locator('#customer-form').waitFor();}
async function saveCustomer(){await page.getByRole('button',{name:'Save customer',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await page.waitForFunction(()=>!busy);}
async function enterAddress(label,street){await page.getByRole('button',{name:'Add delivery address',exact:true}).click();await page.getByLabel('Address label',{exact:true}).fill(label);await page.getByLabel('Address line 1',{exact:true}).fill(street);await page.getByLabel('City',{exact:true}).fill('Salem');await page.getByLabel('State',{exact:true}).fill('Tamil Nadu');await page.getByLabel('Postal code',{exact:true}).fill('636001');await page.getByLabel('Country',{exact:true}).fill('India');await page.getByRole('button',{name:'Use address',exact:true}).click();}
(async()=>{
 database=await testDatabase();app=await createApp({...database,staticDir:path.resolve('public')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;
 const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync(chromium.executablePath())?chromium.executablePath():'C:/Program Files/Google/Chrome/Application/chrome.exe');
 browser=await chromium.launch({headless:true,executablePath:executable});context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.on('pageerror',error=>exceptions.push(error.message));
 const auth=await context.request.post(base+'/api/auth/setup',{data:{name:'Customer QA',username:'customerqa',password:'Customer-'+crypto.randomUUID(),demo:false}});assert.equal(auth.status(),201);csrf=(await auth.json()).csrfToken;
 await page.goto(base+'/#new');await page.locator('#quotation-editor').waitFor();
 await check('Customer modal removes Status, adds category and adjacent contact person number',async()=>{
  await page.getByLabel('Project name',{exact:true}).fill('Preserved quotation project');await page.getByRole('button',{name:'Add customer',exact:true}).click();
  assert.equal(await page.locator('#cf_on').count(),0);assert.equal(await page.getByRole('combobox',{name:'Status',exact:true}).count(),0);
  assert.equal(await page.getByRole('combobox',{name:'Customer category',exact:true}).count(),1);
  assert.equal(await page.getByLabel('Custom category description',{exact:true}).isVisible(),false);
  const bounds=await page.locator('#cf_person,#cf_contactPersonPhone').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));assert.equal(bounds[0].y,bounds[1].y);assert.ok(bounds[1].x>bounds[0].x);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'cf_name');
 });
 await check('Other category and malformed phone show inline errors without losing entries',async()=>{
  await page.getByLabel('Customer name *',{exact:true}).fill('Address customer');await page.getByLabel('Mobile number *',{exact:true}).fill('9876543210');await page.getByLabel('Contact person',{exact:true}).fill('Buyer');await page.getByLabel('Contact person number',{exact:true}).fill('invalid');await choose('Customer category','Other');
  assert.equal(await page.getByLabel('Custom category description',{exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'Save customer',exact:true}).click();assert.equal(await page.locator('#cf_error_contactPersonPhone').isVisible(),true);assert.equal(await page.locator('#cf_error_customCategoryName').isVisible(),true);assert.equal((await request('/api/customers')).pagination.total,0);
  await page.getByLabel('Contact person number',{exact:true}).fill('+44 (20) 7946-0958');await page.getByLabel('Custom category description',{exact:true}).fill('Local association');await page.getByLabel('Billing address',{exact:true}).fill('Preserved billing address');
 });
 await check('Multiple addresses can be entered before saving the customer and remain transactional',async()=>{
  await page.getByRole('button',{name:'Add delivery address',exact:true}).click();await page.getByRole('button',{name:'Use address',exact:true}).click();assert.equal(await page.locator('#ca_error').isVisible(),true);await page.getByRole('button',{name:'Cancel address changes',exact:true}).click();
  await enterAddress('Warehouse','12 First street');await enterAddress('Branch','34 Second street');assert.equal((await request('/api/customers')).pagination.total,0);
  assert.equal(await page.locator('#cf_deliveryAddressId option').count(),3);assert.equal(await page.getByLabel('Billing address',{exact:true}).inputValue(),'Preserved billing address');
 });
 await check('Repeated Save submits once, selects the new customer and retains quotation fields',async()=>{
  let writes=0;const listener=req=>{if(req.url().endsWith('/api/changes')&&req.method()==='POST')writes++;};page.on('request',listener);await page.evaluate(()=>{custSave();custSave();});await page.locator('#modal').waitFor({state:'hidden'});page.off('request',listener);assert.equal(writes,1);
  customerId=await page.evaluate(()=>Q.cid);const c=await request('/api/customers/'+customerId);assert.equal(c.data.on,1);assert.equal(c.data.categoryId,'cc_other');assert.equal(c.data.customCategoryName,'Local association');assert.equal(c.data.contactPersonPhone,'+442079460958');assert.equal(c.data.deliveryAddresses.length,2);
  assert.equal(await page.getByLabel('Project name',{exact:true}).inputValue(),'Preserved quotation project');assert.match(await page.locator('#ci').innerText(),/Preserved billing address/);assert.equal(await page.getByRole('combobox',{name:'Quotation delivery address',exact:true}).count(),1);
 });
 await check('Edit restores Other text, phone and addresses and preserves an existing inactive status',async()=>{
  let c=await request('/api/customers/'+customerId);await request('/api/customers/'+customerId,'PATCH',{version:c.version,data:{on:0}});await page.evaluate(async()=>adopt(await api('/api/state')));await openCustomer(customerId);
  assert.equal(await page.locator('#cf_on').count(),0);assert.equal(await page.getByLabel('Custom category description',{exact:true}).inputValue(),'Local association');assert.equal(await page.getByLabel('Contact person number',{exact:true}).inputValue(),'+442079460958');
  await choose('Customer category','BNI');assert.equal(await page.getByLabel('Custom category description',{exact:true}).isVisible(),false);await page.getByLabel('Contact person number',{exact:true}).fill('+919876543219');await saveCustomer();c=await request('/api/customers/'+customerId);assert.equal(c.data.on,0);assert.equal(c.data.categoryId,'cc_bni');assert.equal(c.data.customCategoryName,null);assert.equal(c.data.contactPersonPhone,'+919876543219');
 });
 await check('Authorized editing, default selection and saved address selection roundtrip',async()=>{
  await openCustomer(customerId);await choose('Delivery address','Branch');await page.getByRole('button',{name:'Edit address',exact:true}).click();await page.getByLabel('Address line 1',{exact:true}).fill('56 Updated branch');await page.getByRole('button',{name:'Use address',exact:true}).click();await page.getByRole('button',{name:'Set as default',exact:true}).click();await saveCustomer();
  const c=(await request('/api/customers/'+customerId)).data,a=c.deliveryAddresses.find(a=>a.label==='Branch');assert.equal(a.isDefault,true);assert.equal(a.line1,'56 Updated branch');assert.equal(c.deliveryAddressId,a.id);assert.equal(c.addr,'Preserved billing address');
  await page.evaluate(()=>{Q.deliveryAddressId=cust(Q.cid).deliveryAddressId;delete Q.deliveryAddressSnapshot;render();});await page.getByRole('button',{name:'Save Draft',exact:true}).first().click();await page.waitForFunction(()=>Boolean(Q.id)&&!busy&&!quotationEditorSaving);quotationId=await page.evaluate(()=>Q.id);assert.equal((await request('/api/quotations/'+quotationId)).data.deliveryAddressSnapshot.line1,a.line1);
 });
 await check('Archiving hides an address from new selections while saved quotations retain the delivery snapshot',async()=>{
  await openCustomer(customerId);await choose('Delivery address','Branch (Default)');await page.getByRole('button',{name:'Archive address',exact:true}).click();await saveCustomer();const c=(await request('/api/customers/'+customerId)).data;assert.equal(c.deliveryAddresses.find(a=>a.label==='Branch').archived,true);assert.equal((await request('/api/customers/'+customerId+'/delivery-addresses')).data.length,1);assert.equal((await request('/api/quotations/'+quotationId)).data.deliveryAddressSnapshot.line1,'56 Updated branch');
  await openCustomer(customerId);await page.getByText('Archived delivery addresses (1)',{exact:true}).click();await page.getByRole('button',{name:'Restore address',exact:true}).click();await saveCustomer();assert.equal((await request('/api/customers/'+customerId+'/delivery-addresses')).data.length,2);
 });
 await check('A later quotation can reuse only the chosen customer’s saved addresses',async()=>{
  await request('/api/customers','POST',{name:'Foreign customer',mob:'9876543211',deliveryAddresses:[{label:'FOREIGN ADDRESS',line1:'Other customer street',country:'India',isDefault:true}]},201);
  await page.evaluate(async()=>{adopt(await api('/api/state'));Q=null;quotationEditorSession=null;render();});await choose('Customer','Address customer');
  const options=await page.locator('#ci select[aria-label="Quotation delivery address"] option').allTextContents();assert.ok(options.includes('Warehouse'));assert.ok(options.includes('Branch'));assert.ok(!options.some(x=>x.includes('FOREIGN')));
 });
 await check('Clearing delivery selection remains cleared for editing and a later quotation',async()=>{
  await openCustomer(customerId);await choose('Delivery address','Warehouse');await page.getByRole('button',{name:'Set as default',exact:true}).click();await choose('Delivery address','No delivery address selected');await saveCustomer();
  const c=(await request('/api/customers/'+customerId)).data;assert.equal(c.deliveryAddressId,null);assert.equal(c.deliveryAddresses.find(a=>a.label==='Warehouse').isDefault,true);
  await openCustomer(customerId);assert.equal(await page.locator('#cf_deliveryAddressId').inputValue(),'');await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>{Q=null;quotationEditorSession=null;render();});await choose('Customer','Address customer');assert.equal(await page.locator('#ci select[aria-label="Quotation delivery address"]').inputValue(),'');
  await page.getByRole('button',{name:'Save Draft',exact:true}).first().click();await page.waitForFunction(()=>Boolean(Q.id)&&!busy&&!quotationEditorSaving);const q=await request('/api/quotations/'+await page.evaluate(()=>Q.id));assert.ok(!q.data.deliveryAddressSnapshot);
 });
 await check('Duplicate review is explicit and does not discard the customer form',async()=>{
  await openCustomer();await page.getByLabel('Customer name *',{exact:true}).fill('Reviewed duplicate');await page.getByLabel('Mobile number *',{exact:true}).fill('9876543210');await page.getByRole('button',{name:'Save customer',exact:true}).click();assert.equal(await page.locator('#customer-duplicate-warning').isVisible(),true);assert.equal(await page.getByLabel('Customer name *',{exact:true}).inputValue(),'Reviewed duplicate');assert.equal((await request('/api/customers')).pagination.total,2);
  await page.getByRole('button',{name:'Save separate customer',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});assert.equal((await request('/api/customers')).pagination.total,3);
 });
 await check('A failed save preserves form entries and can be retried',async()=>{
  await openCustomer(customerId);await page.getByLabel('Company name',{exact:true}).fill('Retained after failure');await page.getByLabel('Mobile number *',{exact:true}).fill('9876543219');await page.route('**/api/changes',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary customer test outage'})}),{times:1});await page.getByRole('button',{name:'Save customer',exact:true}).click();await page.locator('#customer-form-error:not([hidden])').waitFor();assert.equal(await page.getByLabel('Company name',{exact:true}).inputValue(),'Retained after failure');await saveCustomer();assert.equal((await request('/api/customers/'+customerId)).data.co,'Retained after failure');
 });
 await check('Conflicting edits retain form entries and offer an explicit reload without overwriting newer data',async()=>{
  await openCustomer(customerId);await page.getByLabel('Company name',{exact:true}).fill('Local unsaved company');const current=await request('/api/customers/'+customerId);await request('/api/customers/'+customerId,'PATCH',{version:current.version,data:{co:'Remote saved company'}});
  await page.getByRole('button',{name:'Save customer',exact:true}).click();const reload=page.getByRole('button',{name:'Reload latest data (discard form changes)',exact:true});await reload.waitFor();assert.equal(await page.getByLabel('Company name',{exact:true}).inputValue(),'Local unsaved company');assert.equal((await request('/api/customers/'+customerId)).data.co,'Remote saved company');
  await reload.click();await page.waitForFunction(()=>document.querySelector('#cf_co')?.value==='Remote saved company');await page.getByRole('button',{name:'Close',exact:true}).click();
 });
 await check('Modal and inline address editor fit desktop, tablet and mobile widths',async()=>{
  await openCustomer(customerId);await page.getByRole('button',{name:'Add delivery address',exact:true}).click();for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:900});const sizes=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,modal:document.querySelector('#modal .box').clientWidth,content:document.querySelector('#modal .box').scrollWidth}));assert.ok(sizes.page<=sizes.viewport+1,JSON.stringify(sizes));assert.ok(sizes.content<=sizes.modal+1,JSON.stringify(sizes));}
  await page.setViewportSize({width:1440,height:1100});await page.getByRole('button',{name:'Cancel address changes',exact:true}).click();await page.evaluate(()=>{$('#modal').scrollTop=0;$('#toast').replaceChildren();});await page.screenshot({path:output+'/customer-phase1-desktop.png'});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{$('#modal').scrollTop=0;});await page.screenshot({path:output+'/customer-phase1-mobile.png'});await page.getByRole('button',{name:'Close',exact:true}).click();
 });
 await check('Customer modal keeps keyboard focus inside and Escape closes it',async()=>{
  await openCustomer(customerId);await page.locator('#customer-form .customer-form-actions button').last().focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Close');await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Cancel');await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').isVisible(),false);
 });
 await check('No browser JavaScript exceptions',async()=>assert.deepEqual(exceptions,[]));
})().catch(async error=>{console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:output+'/customer-phase1-failure.png',fullPage:true}).catch(()=>{});}).finally(async()=>{fs.writeFileSync(output+'/customer-phase1-browser.json',JSON.stringify({results,exceptions,passed:results.filter(r=>r.result==='PASS').length,failed:results.filter(r=>r.result==='FAIL').length},null,2));if(browser)await browser.close();if(app)await app.close();if(database)await database.destroy();});
