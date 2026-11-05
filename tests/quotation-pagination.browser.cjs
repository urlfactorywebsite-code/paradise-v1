'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createApp}=require('../server'),{testDatabase}=require('./database-helper');
const target=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
if(process.env.TEST_DISPOSABLE!=='1'||!target||!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='55429')throw Error('Explicit disposable loopback PostgreSQL on port 55429 required.');
let database,app,browser,context,page,base,csrf;const results=[],exceptions=[];fs.mkdirSync('test-results',{recursive:true});
async function check(name,fn){try{await fn();results.push({name,result:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,result:'FAIL',error:error.message});throw error;}}
async function request(route,method='GET',data,status=200){const response=await context.request.fetch(base+route,{method,headers:{'X-CSRF-Token':csrf},...(data===undefined?{}:{data})}),body=await response.json();assert.equal(response.status(),status,JSON.stringify(body));return body;}
async function choose(id,value){await page.locator(id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function closeExport(){await page.locator('#ql-export').getByRole('button',{name:'Cancel',exact:true}).click();}
async function previewRows(rows){await page.waitForFunction(rows=>document.querySelector('#ql-preview')?.textContent.startsWith(rows+' rows from ')&&!document.querySelector('#ql-download').disabled,rows);}
async function openExport(){await page.locator('.ql-heading').getByRole('button',{name:'Export CSV',exact:true}).click();await page.locator('#ql-export-type').waitFor({state:'attached'});}
(async()=>{
 database=await testDatabase();app=await createApp({...database,staticDir:path.resolve('dist')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});page=await context.newPage();page.on('pageerror',e=>exceptions.push(e.message));
 const password='Quotation-export-'+crypto.randomUUID(),setup=await context.request.post(base+'/api/auth/setup',{data:{name:'Quotation export QA',username:'quotationexport',password,demo:false}});assert.equal(setup.status(),201);csrf=(await setup.json()).csrfToken;
 const c1=(await request('/api/customers','POST',{name:'தமிழ், "Buyer"',mob:'9876543210',categoryId:'cc_bni',person:'Contact',contactPersonPhone:'+442079460958'},201)).data,c2=(await request('/api/customers','POST',{name:'Other customer',mob:'9876543211'},201)).data;
 await request('/api/products','POST',{id:'export_browser_product',code:'EXPB',name:'Export product',cat:'c1',m:'unit',rate:100,tax:18,min:0,minQty:1,on:1,priceConfigured:true,f:[]},201);
 const q=(await request('/api/quotations','POST',{cid:c1.id,date:'2026-11-01',valid:'2026-12-01',sales:'Sales One',items:[{pid:'export_browser_product',cfg:{qty:2}}]},201)).data;
 await request('/api/quotations','POST',{cid:c2.id,date:'2026-10-01',valid:'2026-12-01',sales:'Sales Two'},201);
 const source=await app.db.prepare('SELECT * FROM quotations WHERE id=?').get(q.id);
 await app.db.transaction(async()=>{for(let i=0;i<1005;i++){const doc={...q,id:'ExportBrowser'+String(i).padStart(3,'0'),no:'EXPORT/'+String(i).padStart(3,'0')};await app.db.prepare('INSERT INTO quotations(id,number,customer_id,date,valid_until,status,salesperson,owner_id,total,body,version,position,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(doc.id,doc.no,doc.cid,doc.date,doc.valid,doc.status,doc.sales,source.owner_id,source.total,JSON.stringify(doc),1,i+2,source.updated_at);await app.db.prepare('INSERT INTO quotation_items SELECT ?,id,product_id,quantity,subtotal,body,position FROM quotation_items WHERE quotation_id=?').run(doc.id,q.id);}});
 await page.goto(base+'/#list');await page.getByRole('heading',{name:'All Quotations',exact:true}).waitFor();
 const ready=()=>page.waitForFunction(()=>document.querySelector('#tb')?.getAttribute('aria-busy')==='false');
 await ready();
 await check('Default ten rows use the bounded backend query and scalable page input',async()=>{
  assert.equal(await page.locator('#tb tr').count(),10);assert.equal(await page.locator('#ql-range').innerText(),'Showing 1–10 of 1007 quotations');assert.equal(await page.locator('#ql-previous').isDisabled(),true);assert.equal(await page.locator('#ql-page').getAttribute('type'),'number');assert.equal(await page.locator('#ql-page option').count(),0);assert.equal(await page.getByRole('navigation',{name:'Quotation pagination',exact:true}).count(),1);assert.equal(await page.locator('#ql-page').getAttribute('aria-describedby'),'ql-page-total');
 });
 await check('All four page sizes refresh rows, counts and page one without full-state requests',async()=>{
  const requests=[];const capture=req=>requests.push(new URL(req.url()).pathname);page.on('request',capture);
  try{for(const size of [20,30,40,10]){await choose('#ql-page-size',String(size));await ready();assert.equal(await page.locator('#tb tr').count(),size);assert.equal(await page.evaluate(()=>F.page),1);assert.equal(await page.locator('#ql-range').innerText(),`Showing 1–${size} of 1007 quotations`);}assert.equal(requests.filter(p=>p==='/api/quotation-list').length,4);assert.equal(requests.includes('/api/state'),false);}finally{page.off('request',capture);}
 });
 await check('Direct dropdown navigation reaches the last page and preserves selection',async()=>{
  await choose('#ql-page-size','40');await ready();assert.equal(await page.locator('#ql-page option').count(),26);await page.locator('#tb input[type=checkbox]').first().check();await choose('#ql-page','26');await ready();assert.equal(await page.locator('#tb tr').count(),7);assert.equal(await page.locator('#ql-range').innerText(),'Showing 1001–1007 of 1007 quotations');assert.equal(await page.locator('#ql-next').isDisabled(),true);assert.equal(await page.locator('#ql-selection').innerText(),'1 selected');await page.locator('#ql-previous').click();await ready();assert.equal(await page.evaluate(()=>F.page),25);
 });
 await check('Large page jump validates input; browser Back/Forward restores page and size',async()=>{
  await choose('#ql-page-size','10');await ready();await page.locator('#ql-page').fill('101');await page.locator('.ql-jump button').click();await ready();assert.equal(await page.evaluate(()=>F.page),101);await page.waitForFunction(()=>document.activeElement.id==='ql-page-go');assert.equal(await page.locator('#tb tr').count(),7);await page.locator('#ql-previous').click();await ready();assert.equal(await page.evaluate(()=>F.page),100);await page.goBack();await ready();assert.equal(await page.evaluate(()=>F.page),101);await page.goForward();await ready();assert.equal(await page.evaluate(()=>F.page),100);await page.locator('#ql-page').fill('99.0');await page.locator('.ql-jump button').click();await ready();assert.equal(await page.evaluate(()=>F.page),99);await page.locator('#ql-page').fill('102');await page.locator('.ql-jump button').click();assert.equal(await page.evaluate(()=>F.page),99);
 });
 await check('Search resets page, empty/single-page states disable navigation, clearing restores totals',async()=>{
  await page.locator('#ql-search').fill('EXPORT/100');await ready();assert.equal(await page.evaluate(()=>F.page),1);assert.equal(await page.evaluate(()=>listTotal),6);assert.equal(await page.locator('#ql-next').isDisabled(),true);await page.locator('#ql-search').fill('No quotations exist here');await ready();assert.equal(await page.locator('#ql-range').innerText(),'Showing 0–0 of 0 quotations');assert.equal(await page.locator('#ql-page').isDisabled(),true);assert.equal(await page.locator('#ql-select-page').isDisabled(),true);await page.getByRole('button',{name:'Clear Search filter',exact:true}).click();await ready();assert.equal(await page.evaluate(()=>listTotal),1007);
 });
 await check('Keyboard navigation retains focus at the last and first page boundaries',async()=>{
  await choose('#ql-page-size','40');await ready();await choose('#ql-page','25');await ready();
  await page.locator('#ql-next').focus();await page.keyboard.press('Enter');await ready();assert.equal(await page.evaluate(()=>F.page),26);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Page');
  await choose('#ql-page','2');await ready();await page.locator('#ql-previous').focus();await page.keyboard.press('Enter');await ready();assert.equal(await page.evaluate(()=>F.page),1);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Page');
 });
 await check('Retry preserves the requested page and size after a transient failure',async()=>{
  await choose('#ql-page','3');await ready();const ids=await page.locator('#tb [data-ql-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.qlId));
  await page.route('**/api/quotation-list?*',route=>route.fulfill({status:503,json:{error:'Synthetic page-three failure'}}),{times:1});await page.evaluate(()=>QuotationList.retry());await page.getByRole('alert').filter({hasText:'Synthetic page-three failure'}).waitFor();
  await page.getByRole('button',{name:'Retry',exact:true}).click();await ready();assert.equal(await page.evaluate(()=>F.page),3);assert.equal(await page.locator('#ql-page-size').inputValue(),'40');assert.deepEqual(await page.locator('#tb [data-ql-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.qlId)),ids);
 });
 await check('Back navigation cancels an export preview that belongs to the replaced page',async()=>{
  let release,started;const gate=new Promise(r=>release=r),waiting=new Promise(r=>started=r);
  await page.route('**/api/quotation-export/preview',async route=>{started();await gate;await route.continue();},{times:1});
  try{await openExport();await waiting;await page.goBack();await ready();assert.equal(await page.locator('#ql-export').evaluate(el=>el.open),false);const finished=page.waitForResponse(r=>r.url().includes('/api/quotation-export/preview'));release();await finished;await page.waitForTimeout(150);assert.deepEqual(exceptions,[]);}finally{release();await page.unroute('**/api/quotation-export/preview');}
 });
 await check('Status changes and reset synchronize counts without losing page size',async()=>{
  await choose('#ql-page-size','20');await ready();await choose('#ql-primary-status','Cancelled');await ready();assert.equal(await page.evaluate(()=>listTotal),0);await page.getByRole('button',{name:'Advanced Filters',exact:false}).click();await page.getByRole('button',{name:'Reset Filters',exact:true}).click();await page.getByRole('button',{name:'Apply Filters',exact:true}).click();await ready();assert.equal(await page.evaluate(()=>listTotal),1007);assert.equal(await page.locator('#tb tr').count(),20);
 });
 await check('Out-of-order page responses cannot replace a newer search',async()=>{
  let release,started;const gate=new Promise(r=>release=r),waiting=new Promise(r=>started=r);
  await page.route('**/api/quotation-list?*',async route=>{if(new URL(route.request().url()).searchParams.get('q')==='EXPORT/999'){started();await gate;}await route.continue();});
  try{await page.locator('#ql-search').fill('EXPORT/999');await waiting;await page.locator('#ql-search').fill(q.no);await ready();assert.equal(await page.locator('#tb input[data-ql-id]').getAttribute('data-ql-id'),q.id);release();await page.waitForTimeout(250);assert.equal(await page.locator('#tb input[data-ql-id]').getAttribute('data-ql-id'),q.id);}finally{release();await page.unroute('**/api/quotation-list?*');}
 });
 await check('Failed page requests expose Retry and never leave stale selectable records',async()=>{
  await page.route('**/api/quotation-list?*',route=>route.fulfill({status:503,json:{error:'Synthetic page unavailable'}}),{times:1});await page.evaluate(()=>QuotationList.retry());await page.getByRole('alert').filter({hasText:'Synthetic page unavailable'}).waitFor();assert.equal(await page.locator('#ql-select-page').isDisabled(),true);assert.equal(await page.locator('#ql-next').isDisabled(),true);await page.getByRole('button',{name:'Retry',exact:true}).click();await ready();assert.equal(await page.evaluate(()=>listTotal),1);
 });
 await check('Deleting the final record after concurrent removals clamps to the surviving page without resurrecting rows',async()=>{
  await page.locator('#ql-search').fill('');await ready();await choose('#ql-page-size','10');await ready();await page.locator('#ql-page').fill('101');await page.locator('.ql-jump button').click();await ready();
  const ids=await page.locator('#tb input[data-ql-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.qlId));await app.db.prepare('DELETE FROM quotations WHERE id IN ('+ids.slice(0,-1).map(()=>'?').join(',')+')').run(...ids.slice(0,-1));await page.evaluate(()=>render());await ready();assert.equal(await page.evaluate(()=>listTotal),1001);assert.equal(await page.locator('#tb input[data-ql-id]').count(),1);
  await page.locator('#tb').getByRole('button',{name:'Delete',exact:true}).click();await page.locator('#modal').getByRole('button',{name:'Delete',exact:true}).click();await page.waitForFunction(()=>!busy&&listTotal===1000&&document.querySelector('#tb')?.getAttribute('aria-busy')==='false');assert.equal(await page.evaluate(()=>F.page),100);assert.equal(await page.locator('#ql-range').innerText(),'Showing 991\u20131000 of 1000 quotations');assert.equal(await page.locator('#ql-next').isDisabled(),true);assert.equal((await app.db.prepare('SELECT count(*) AS n FROM quotations').get()).n,1000);
 });
 await check('Page controls fit desktop/tablet/mobile, with keyboard labels and no console exceptions',async()=>{
  for(const width of [1440,768,375,320]){await page.setViewportSize({width,height:900});const bounds=await page.locator('#quote-pagination').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1,JSON.stringify({width,...bounds}));assert.equal(await page.getByRole('combobox',{name:'Rows per page',exact:true}).count(),1);await page.getByRole('combobox',{name:'Rows per page',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('combobox',{name:'Rows per page',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('option',{name:'30',exact:true}).waitFor();await page.keyboard.press('Escape');}await page.waitForFunction(()=>!document.querySelector('#toast').children.length);await page.locator('#quote-pagination').screenshot({path:'test-results/quotation-pagination-mobile.png'});
 });
 await check('A fresh own-only account sees an actually empty dataset and no other user records',async()=>{
  await request('/api/users','POST',{name:'Empty quotation owner',username:'paginationempty',password,role:'Employee',permissions:['quotation.view_own']},201);
  const restricted=await browser.newContext();try{const login=await restricted.request.post(base+'/api/auth/login',{data:{username:'paginationempty',password}});assert.equal(login.status(),200);const tab=await restricted.newPage();tab.on('pageerror',e=>exceptions.push(e.message));await tab.goto(base+'/#list');await tab.waitForFunction(()=>document.querySelector('#tb')?.getAttribute('aria-busy')==='false');assert.equal(await tab.locator('#ql-range').innerText(),'Showing 0\u20130 of 0 quotations');assert.equal(await tab.locator('#ql-page option').count(),1);assert.equal(await tab.locator('#ql-page').inputValue(),'1');assert.equal(await tab.locator('#ql-previous').isDisabled(),true);assert.equal(await tab.locator('#ql-next').isDisabled(),true);assert.equal(await tab.locator('#ql-select-page').isDisabled(),true);assert.equal(await tab.evaluate(()=>S.quotes.length),0);}finally{await restricted.close();}
 });
 assert.deepEqual(exceptions,[]);
})().catch(async error=>{console.error(error.stack);process.exitCode=1;await page?.screenshot({path:'test-results/quotation-pagination-failure.png',fullPage:true}).catch(()=>{});}).finally(async()=>{fs.writeFileSync('test-results/quotation-pagination-browser.json',JSON.stringify({results,exceptions},null,2));await browser?.close();await app?.close();await database?.destroy();});
