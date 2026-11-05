'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createApp}=require('../server'),{testDatabase}=require('./database-helper'),DP=require('../shared/domain');
const target=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;if(process.env.TEST_DISPOSABLE!=='1'||!target||!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='55429')throw Error('Use disposable PostgreSQL on loopback 55429 with TEST_DISPOSABLE=1.');
let database,app,browser,context,page,base,csrf,savedId,password;const results=[],exceptions=[],output='test-results';fs.mkdirSync(output,{recursive:true});
async function check(name,fn){try{await fn();results.push({name,result:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,result:'FAIL',error:error.message});await page.screenshot({path:output+'/customer-phase3-failure.png',fullPage:true});throw error;}}
async function request(route,method='GET',data,status=200){const r=await context.request.fetch(base+route,{method,headers:{'X-CSRF-Token':csrf},...(data===undefined?{}:{data})}),value=await r.json();assert.equal(r.status(),status,route+': '+JSON.stringify(value));return value;}
async function choose(label,value){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('searchbox',{name:'Search '+label+' options',exact:true}).fill(value);await page.getByRole('option',{name:value,exact:true}).click();}
async function confirmed(){await page.waitForFunction(()=>categoryPreviewStatus==='confirmed'&&document.querySelector('#category-calculation-status')?.textContent==='Totals checked by the server.');}
async function parity(){await confirmed();const data=await page.evaluate(()=>({q:clone(Q),total:tot(Q),display:inr(tot(Q).grand)})),preview=await request('/api/quotations/preview','POST',data.q);assert.deepEqual(preview.totals,data.total);assert.equal(await page.locator('#editor-summary .grand-total-row b').innerText(),data.display);return data;}
async function save(){await page.getByRole('button',{name:'Save Draft',exact:true}).first().click();await page.waitForFunction(()=>Q.id&&!quotationEditorSaving&&!busy);await confirmed();savedId=await page.evaluate(()=>Q.id);return request('/api/quotations/'+savedId);}
(async()=>{
 database=await testDatabase();app=await createApp({...database,staticDir:path.resolve('public')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;
 const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync(chromium.executablePath())?chromium.executablePath():'C:/Program Files/Google/Chrome/Application/chrome.exe');browser=await chromium.launch({headless:true,executablePath:executable});context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});page=await context.newPage();page.on('pageerror',e=>exceptions.push(e.message));page.on('dialog',d=>d.accept());password='Category-phase3-'+crypto.randomUUID();
 const auth=await context.request.post(base+'/api/auth/setup',{data:{name:'Category Phase3 QA',username:'categoryphase3',password,demo:false}});assert.equal(auth.status(),201);csrf=(await auth.json()).csrfToken;
 await request('/api/customer-categories/cc_bni','PATCH',{version:1,data:{discountPercentage:'12.34',highlightEnabled:true,highlightMessage:'BNI ORIGINAL BENEFIT\nMULTILINE SECOND LINE'}});await request('/api/customer-categories/cc_yes','PATCH',{version:1,data:{discountPercentage:'7.25',highlightEnabled:true,highlightMessage:'YES MEMBER BENEFIT'}});
 const address={label:'Warehouse',line1:'DELIVERY WAREHOUSE',country:'India',isDefault:true};const bni=(await request('/api/customers','POST',{name:'BNI member',mob:'9876500001',categoryId:'cc_bni',addr:'BILLING STREET',contactPersonPhone:'+919000001111',deliveryAddresses:[address]},201)).data;
 const yes=(await request('/api/customers','POST',{name:'YES member',mob:'9876500002',categoryId:'cc_yes'},201)).data;await request('/api/customers','POST',{name:'Plain customer',mob:'9876500003'},201);await request('/api/customers','POST',{name:'Other customer',mob:'9876500004',categoryId:'cc_other',customCategoryName:'Local club'},201);
 await page.goto(base+'/#new');await page.locator('#quotation-editor').waitFor();
 await check('BNI selection applies its percentage and backend totals include the existing configured item',async()=>{
  await choose('Customer','BNI member');await confirmed();assert.equal(await page.getByLabel('Discount value',{exact:true}).inputValue(),'12.34');assert.match(await page.locator('#category-discount-context').innerText(),/BNI category discount \(12.34%\)/);await page.evaluate(()=>openCfg('p5'));await page.getByRole('button',{name:'Add to quotation',exact:true}).click();const data=await parity();assert.equal(data.q.discountSource,'category');assert.equal(data.total.disc,3702);
 });
 await check('YES, uncategorized and Other transitions replace automatic discounts and retain manual behavior',async()=>{
  await choose('Customer','YES member');assert.equal((await parity()).q.disc.v,7.25);await choose('Customer','Plain customer');assert.equal((await parity()).q.disc.v,0);await choose('Discount type','Fixed amount (₹)');await page.getByLabel('Discount value',{exact:true}).fill('10');await parity();await choose('Customer','Other customer');assert.deepEqual((await parity()).q.disc,{t:'f',v:10});await choose('Customer','BNI member');const data=await parity();assert.equal(data.q.disc.v,12.34);assert.equal(data.total.disc,3702);
 });
 await check('Manual override and explicit category replacement use only one discount',async()=>{
  await page.getByLabel('Discount value',{exact:true}).fill('2');let data=await parity();assert.equal(data.q.discountSource,'manual');assert.equal(data.total.disc,600);await page.getByRole('button',{name:'Apply current category settings',exact:true}).click();data=await parity();assert.equal(data.q.discountSource,'category');assert.equal(data.total.disc,3702);
 });
 await check('Saved preview and print show the percentage, multiline highlight and unchanged Terms & Conditions',async()=>{
  const record=await save();assert.equal(record.data.categoryDiscountAmount,3702);assert.equal(record.data.customerSnapshot.contactPersonPhone,bni.contactPersonPhone);const html=await page.evaluate(()=>docHTML(Q));assert.match(html,/BNI category discount \(12.34%\)/);assert.ok(html.indexOf('BNI ORIGINAL BENEFIT')<html.indexOf('Terms and conditions'));await page.getByRole('button',{name:'Preview',exact:true}).first().click();await page.locator('#modal .category-highlight').waitFor();assert.match(await page.locator('#modal .category-highlight').innerText(),/MULTILINE SECOND LINE/);await page.emulateMedia({media:'print'});await page.screenshot({path:output+'/customer-phase3-print.png',fullPage:true});await page.pdf({path:output+'/customer-phase3-review-matched-print.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});await page.evaluate(()=>closeM());
 });
 await check('Downloaded server PDF matches the saved total and original category message',async()=>{
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Generate PDF',exact:true}).click();const download=await pending;await download.saveAs(output+'/customer-phase3-quotation.pdf');const bytes=fs.readFileSync(output+'/customer-phase3-quotation.pdf'),saved=(await request('/api/quotations/'+savedId)).data;assert.ok(bytes.includes(Buffer.from(DP.rs(DP.totals(saved).grand))));assert.ok(bytes.includes(Buffer.from('BNI ORIGINAL BENEFIT')));assert.ok(bytes.includes(Buffer.from('category discount')));
 });
 await check('Settings changes preserve saved draft amounts until an explicit versioned refresh',async()=>{
  const category=await request('/api/customer-categories/cc_bni');await request('/api/customer-categories/cc_bni','PATCH',{version:category.data.version,data:{discountPercentage:'20.00',highlightMessage:'BNI NEW SETTINGS MESSAGE'}});await page.evaluate(async()=>adopt(await api('/api/state')));await page.getByLabel('Project name',{exact:true}).fill('Unrelated edit');assert.equal((await parity()).q.disc.v,12.34);await save();assert.equal((await request('/api/quotations/'+savedId)).data.disc.v,12.34);
  await page.getByRole('button',{name:'Apply current category settings',exact:true}).click();assert.equal((await parity()).q.disc.v,20);assert.match(await page.locator('#quotation-category-highlight').innerText(),/BNI NEW SETTINGS MESSAGE/);const refreshed=await save();assert.equal(refreshed.data.categorySnapshot.discountPercentage,'20.00');
 });
 await check('Authorized delivery creation remains customer-specific and never replaces billing details',async()=>{
  await page.getByRole('button',{name:'Manage delivery addresses',exact:true}).click();await page.getByRole('button',{name:'Add delivery address',exact:true}).click();await page.getByLabel('Address label',{exact:true}).fill('New branch');await page.getByLabel('Address line 1',{exact:true}).fill('NEW DELIVERY BRANCH');await page.getByLabel('Country',{exact:true}).fill('India');await page.getByRole('button',{name:'Use address',exact:true}).click();await page.getByRole('button',{name:'Save customer',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await choose('Quotation delivery address','New branch');const saved=await save();assert.equal(saved.data.deliveryAddressSnapshot.line1,'NEW DELIVERY BRANCH');assert.equal(saved.data.customerSnapshot.addr,'BILLING STREET');assert.equal(saved.data.categorySnapshot.discountPercentage,'20.00');
  const c=await request('/api/customers/'+bni.id);await request('/api/customers/'+bni.id+'/delivery-addresses/'+saved.data.deliveryAddressId,'PATCH',{version:c.version,data:{line1:'LATER DELIVERY CHANGE',archived:true}});assert.equal((await request('/api/quotations/'+savedId)).data.deliveryAddressSnapshot.line1,'NEW DELIVERY BRANCH');
 });
 await check('Employee defaults cannot exceed existing caps and a permitted manual discount can be saved',async()=>{
  await request('/api/users','POST',{name:'Employee',username:'categoryemployee',password,role:'Employee'},201);const employeeContext=await browser.newContext(),employeePage=await employeeContext.newPage();employeePage.on('pageerror',e=>exceptions.push(e.message));await employeeContext.request.post(base+'/api/auth/login',{data:{username:'categoryemployee',password}});await employeePage.goto(base+'/#new');await employeePage.locator('#quotation-editor').waitFor();await employeePage.evaluate(id=>{editorSelectCustomer(id);const p=effectiveProd('p5');Q.items=[DP.mkItem(p,DP.defCfg(p),'employeeLine')];upd();},bni.id);await employeePage.waitForFunction(()=>categoryPreviewStatus==='error');assert.match(await employeePage.locator('#category-calculation-status').innerText(),/authorized employee limit/);const denied=employeePage.waitForResponse(r=>r.url().endsWith('/api/quotations/preview')&&r.status()===403);await employeePage.getByRole('button',{name:'Preview',exact:true}).first().click();await denied;assert.equal(await employeePage.locator('#modal .doc').count(),0);await employeePage.getByLabel('Discount value',{exact:true}).fill('5');await employeePage.waitForFunction(()=>categoryPreviewStatus==='confirmed');await employeePage.getByRole('button',{name:'Save Draft',exact:true}).first().click();await employeePage.waitForFunction(()=>Q.id&&!busy&&!quotationEditorSaving);assert.equal(await employeePage.evaluate(()=>Q.disc.v),5);await employeeContext.close();
 });
 await check('Category quotation editor remains responsive at desktop and mobile widths',async()=>{
  for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:950});await page.waitForTimeout(60);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:output+'/customer-phase3-editor-'+width+'.png',fullPage:true});}
 });
 await check('Server validation replaces forged client item amounts before displaying confirmed totals',async()=>{
  await page.evaluate(()=>{Q.items[0].sub=1;Q.items[0].base=1;upd();});const validated=await parity();assert.equal(validated.q.items[0].sub,30000);assert.equal(validated.total.grand,28320);assert.match(await page.locator('#its').innerText(),/300\.00/);
 });
 await check('A customer created inside the quotation receives the selected category default',async()=>{
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(async()=>adopt(await api('/api/state')));await page.getByRole('button',{name:'Add customer',exact:true}).click();await page.getByLabel('Customer name *',{exact:true}).fill('Inline YES member');await page.getByLabel('Mobile number *',{exact:true}).fill('9876500019');await choose('Customer category','YES');await page.getByRole('button',{name:'Save customer',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});const data=await parity();assert.equal(data.q.disc.v,7.25);assert.equal(data.q.discountSource,'category');assert.equal(data.q.categorySnapshot.id,'cc_yes');
 });
 await check('A delayed response for the previous customer cannot replace the latest customer discount',async()=>{
  let release,ready;const gate=new Promise(r=>release=r),started=new Promise(r=>ready=r),readState=app.store.readState;let wait=true;
  app.store.readState=async(...args)=>{if(wait){wait=false;ready();await gate;}return readState(...args);};
  const delayed=page.waitForResponse(r=>r.url().endsWith('/api/quotations/preview')&&r.request().postDataJSON()?.cid===bni.id);
  try{await page.evaluate(id=>editorSelectCustomer(id),bni.id);await started;await page.evaluate(id=>editorSelectCustomer(id),yes.id);await confirmed();assert.equal(await page.evaluate(()=>Q.disc.v),7.25);release();await delayed;await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>Q.cid),yes.id);assert.equal(await page.evaluate(()=>Q.disc.v),7.25);}
  finally{release();app.store.readState=readState;}
 });
 await check('Long category names wrap in mobile editor, summary and print preview',async()=>{
  const c=await request('/api/customer-categories/cc_yes');await request('/api/customer-categories/cc_yes','PATCH',{version:c.data.version,data:{name:'Y'.repeat(150)}});await page.evaluate(async()=>{adopt(await api('/api/state'));categoryApplyCurrentDiscount();});await confirmed();await page.setViewportSize({width:320,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.getByRole('button',{name:'Preview',exact:true}).first().click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:output+'/customer-phase3-long-category.png',fullPage:true});await page.evaluate(()=>closeM());
 });

 await check('Immediate Preview and printed PDF use server-validated prices before background confirmation',async()=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(async()=>{Q.items[0].sub=1;Q.items[0].base=1;editorChanged();await prevQ();});
  await page.locator('#modal .doc').waitFor();
  const input=await page.evaluate(()=>clone(Q)),checked=await request('/api/quotations/preview','POST',input);
  assert.equal(checked.totals.grand,32834);
  assert.equal(await page.locator('#modal .doc .tot tr.g td').last().innerText(),DP.inr(32834));
  await page.emulateMedia({media:'print'});await page.pdf({path:output+'/customer-phase3-review-print.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  const projected=await page.evaluate(()=>document.querySelector('#modal .doc').innerText);fs.writeFileSync(output+'/customer-phase3-review-print.txt',projected);
  assert.ok(projected.indexOf('YES MEMBER BENEFIT')<projected.indexOf('Terms and conditions'));await page.evaluate(()=>closeM());await confirmed();
 });
 await check('Changing customer clears old quotation contact overrides',async()=>{
  await page.evaluate(id=>{Q.contact={person:'OLD CONTACT',addr:'OLD CUSTOMER BILLING'};editorSelectCustomer(id);},bni.id);await confirmed();
  assert.equal(await page.evaluate(()=>Q.contact===undefined),true);assert.match(await page.locator('#ci').innerText(),/BILLING STREET/);
 });
 await check('A delayed document preview cannot open after the customer changes',async()=>{
  await confirmed();let release,ready;const gate=new Promise(r=>release=r),started=new Promise(r=>ready=r),readState=app.store.readState;let wait=true;
  app.store.readState=async(...args)=>{if(wait){wait=false;ready();await gate;}return readState(...args);};
  const delayed=page.waitForResponse(r=>r.url().endsWith('/api/quotations/preview')&&r.request().postDataJSON()?.cid===bni.id);
  try{await page.evaluate(()=>{void prevQ();});await started;await page.evaluate(id=>editorSelectCustomer(id),yes.id);release();await delayed;await confirmed();assert.equal(await page.locator('#modal .doc').count(),0);}
  finally{release();app.store.readState=readState;}
 });

 await check('Exact tax boundary agrees in browser, backend persistence, generated PDF and printed quotation',async()=>{
  const product=await request('/api/products/p5');await request('/api/products/p5','PATCH',{version:product.version,data:{tax:2.3}});
  await page.evaluate(async()=>{adopt(await api('/api/state'));Q=newQ();render();});await choose('Customer','Plain customer');
  await page.evaluate(()=>{const p=effectiveProd('p5'),item=DP.mkItem(p,DP.defCfg(p),'boundary','',Q.calculationVersion);item.override={amount:15,reason:'Exact boundary fixture'};item.sub=1500;item.base=1500;Q.items=[item];upd();});
  let values=await parity();assert.deepEqual([values.total.taxable,values.total.gst,values.total.grand],[1500,35,1535]);const saved=await save();assert.equal(saved.data.calculationVersion,2);
  const row=await app.db.prepare('SELECT total FROM quotations WHERE id=?').get(saved.data.id);assert.equal(row.total,1535);
  const pdf=await context.request.get(base+'/api/quotations/'+saved.data.id+'/pdf');assert.equal(pdf.status(),200);fs.writeFileSync(output+'/customer-phase3-review-boundary-server.pdf',await pdf.body());
  await page.getByRole('button',{name:'Preview',exact:true}).first().click();await page.locator('#modal .doc').waitFor();assert.equal(await page.locator('#modal .doc .tot tr.g td').last().innerText(),DP.inr(1535));
  await page.emulateMedia({media:'print'});await page.pdf({path:output+'/customer-phase3-review-boundary-print.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});await page.evaluate(()=>closeM());
  const finalized=await request('/api/quotations/'+saved.data.id+'/status','POST',{version:saved.version,status:'Sent to Customer'});
  const category=await request('/api/customer-categories/cc_bni');await request('/api/customer-categories/cc_bni','PATCH',{version:category.data.version,data:{discountPercentage:'99.99',highlightMessage:'POST FINALIZATION MESSAGE'}});
  assert.deepEqual((await request('/api/quotations/'+saved.data.id)).data,finalized.data);
 });

 await check('Finalized screen, print and PDF retain amounts and messages after customer and category edits',async()=>{
  const category=await request('/api/customer-categories/cc_bni');await request('/api/customer-categories/cc_bni','PATCH',{version:category.data.version,data:{discountPercentage:'12.34',highlightMessage:'FROZEN FINAL BENEFIT'}});
  const product=await request('/api/products/p5');await request('/api/products/p5','PATCH',{version:product.version,data:{tax:18}});
  await page.evaluate(async()=>{adopt(await api('/api/state'));Q=newQ();render();});await choose('Customer','BNI member');await page.evaluate(()=>{const p=effectiveProd('p5');Q.items=[DP.mkItem(p,DP.defCfg(p),'frozen-final','',Q.calculationVersion)];upd();});await parity();const saved=await save();
  const finalized=await request('/api/quotations/'+saved.data.id+'/status','POST',{version:saved.version,status:'Sent to Customer'});assert.equal(DP.totals(finalized.data).grand,31032);
  await page.evaluate(async id=>{adopt(await api('/api/state'));Q=clone(getQ(id));render();},saved.data.id);await confirmed();await page.getByRole('button',{name:'Preview',exact:true}).first().click();await page.locator('#modal .doc').waitFor();const before=await page.locator('#modal .doc').innerText();await page.evaluate(()=>closeM());
  const updated=await request('/api/customer-categories/cc_bni');await request('/api/customer-categories/cc_bni','PATCH',{version:updated.data.version,data:{discountPercentage:'80.00',highlightMessage:'LATER CATEGORY MESSAGE'}});
  const customer=await request('/api/customers/'+bni.id);await request('/api/customers/'+bni.id,'PATCH',{version:customer.version,data:{categoryId:'cc_yes',addr:'LATER CUSTOMER ADDRESS'}});
  await page.evaluate(async id=>{adopt(await api('/api/state'));Q=clone(getQ(id));render();},saved.data.id);await confirmed();await page.getByRole('button',{name:'Preview',exact:true}).first().click();await page.locator('#modal .doc').waitFor();assert.equal(await page.locator('#modal .doc').innerText(),before);
  await page.emulateMedia({media:'print'});await page.pdf({path:output+'/customer-phase3-review-finalized-print.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  const pdf=await context.request.get(base+'/api/quotations/'+saved.data.id+'/pdf');assert.equal(pdf.status(),200);fs.writeFileSync(output+'/customer-phase3-review-finalized-server.pdf',await pdf.body());assert.deepEqual((await request('/api/quotations/'+saved.data.id)).data,finalized.data);await page.evaluate(()=>closeM());
 });
 assert.deepEqual(exceptions,[]);console.log('PASS '+results.length+' category quotation browser checks');
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(output+'/customer-phase3-browser.json',JSON.stringify({results,exceptions},null,2));if(browser)await browser.close();if(app)await app.close();if(database)await database.destroy();});
