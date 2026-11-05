'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createApp}=require('../server'),{testDatabase}=require('./database-helper');
const target=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
if(process.env.TEST_DISPOSABLE!=='1'||!target||!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='55429')throw Error('Use disposable loopback PostgreSQL on port 55429.');
const results=[],exceptions=[],requests=[],out='test-results';let database,app,browser,context,page,base,csrf,staffId,customerId,staffPassword;
fs.mkdirSync(out,{recursive:true});
async function check(name,fn){try{const detail=await fn();results.push({name,result:'PASS',detail});console.log('PASS '+name);}catch(e){results.push({name,result:'FAIL',error:e.message});throw e;}}
async function request(route,method='GET',data,status=200){const r=await context.request.fetch(base+route,{method,headers:{'X-CSRF-Token':csrf},...(data===undefined?{}:{data})}),body=await r.json();assert.equal(r.status(),status,route+': '+JSON.stringify(body));return body;}
async function choose(label,value){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();}
async function ready(){await page.waitForFunction(()=>productAnalyticsState.data&&document.querySelector('#pa-results')?.getAttribute('aria-busy')==='false');}
async function openComparison(){const details=page.locator('.pa-product-picker');if(!await details.evaluate(node=>node.open))await details.locator('summary').click();}
async function apply(){await page.getByRole('button',{name:'Apply analytics filters',exact:true}).click();await ready();}
(async()=>{
 database=await testDatabase();app=await createApp({...database,staticDir:path.resolve('dist')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.on('pageerror',e=>exceptions.push(e.message));page.on('request',r=>{if(r.url().includes('/api/reports/product-performance'))requests.push(r.url());});
 staffPassword='Analytics-browser-'+crypto.randomUUID();const setup=await context.request.post(base+'/api/auth/setup',{data:{name:'Analytics browser',username:'analyticsbrowser',password:staffPassword,demo:false}});assert.equal(setup.status(),201);csrf=(await setup.json()).csrfToken;
 for(const [id,name,cat]of [['chart_a','Quoted A <img src=x onerror="window.analyticsXSS=1">','c1'],['chart_b','Quoted B','c2']])await request('/api/products','POST',{id,code:id,name,cat,m:'unit',rate:100,tax:18,min:0,minQty:1,priceConfigured:true,on:1,f:[]},201);
 customerId=(await request('/api/customers','POST',{name:'Chart customer',mob:'9876543299'},201)).data.id;
 const customer2=(await request('/api/customers','POST',{name:'Other chart customer',mob:'9876543298'},201)).data.id;
 const q1=await request('/api/quotations','POST',{cid:customerId,date:'2026-01-31',valid:'2026-12-31',items:[{pid:'chart_a',cfg:{qty:2}},{pid:'chart_a',cfg:{qty:3}},{pid:'chart_b',cfg:{qty:1}}],discountSource:'manual',disc:{t:'p',v:10}},201);
 await request('/api/quotations','POST',{cid:customer2,date:'2026-03-01',valid:'2026-12-31',items:[{pid:'chart_a',cfg:{qty:1}}]},201);
 await request('/api/quotations/'+q1.data.id+'/status','POST',{version:q1.version,status:'Pending Internal Review'});
 staffId=(await request('/api/users','POST',{name:'Chart employee',username:'chartemployee',password:staffPassword,role:'Employee'},201)).user.id;
 await check('Reports expose monthly product analytics from the backend with unique counts and a zero month',async()=>{
  await page.goto(base+'/#rep');await page.getByRole('heading',{name:'Global Product Performance',exact:true}).waitFor();await ready();
  await page.getByLabel('From date',{exact:true}).fill('2026-01-01');await page.getByLabel('To date',{exact:true}).fill('2026-03-31');await apply();
  const data=await page.evaluate(()=>productAnalyticsState.data);assert.deepEqual(data.periods,['2026-01','2026-02','2026-03']);assert.deepEqual(data.series[0].values,[1,0,1]);assert.equal(data.totals.lineItemCount,4);assert.equal(data.totals.quotedValue,75520);assert.ok(requests.length>=2);const layout=await page.evaluate(()=>({panel:document.querySelector('#product-analytics').getBoundingClientRect().x,sidebar:document.querySelector('#workspace-sidebar').getBoundingClientRect().right}));assert.ok(layout.panel>=layout.sidebar,JSON.stringify(layout));assert.equal(await page.locator('#pa-results svg .rd-bar').count(),6);assert.equal(await page.locator('#pa-results img').count(),0);assert.equal(await page.evaluate(()=>window.analyticsXSS),undefined);
 });
 await check('All chart modes and selectable metrics retain exact API values and show accessible data',async()=>{
  for(const [label,key]of [['Stacked bar chart','stacked'],['Multi-line chart','line'],['Area chart','area'],['Grouped bar chart','grouped']]){await choose('Chart mode',label);assert.equal(await page.evaluate(()=>productAnalyticsState.mode),key);assert.equal(await page.getByRole('img',{name:/Global Product Performance/}).count(),1);}
  await choose('Analytics metric','Total quantity quoted');await apply();await page.locator('.pa-data>summary').click();assert.match(await page.locator('.pa-table-scroll caption').innerText(),/Total quantity/);assert.deepEqual(await page.evaluate(()=>productAnalyticsState.data.series[0].values),[5,0,1]);
  await choose('Analytics metric','Quoted value including GST');await apply();assert.deepEqual(await page.evaluate(()=>productAnalyticsState.data.series[0].values),[53100,0,11800]);assert.match(await page.locator('.pa-table-scroll tbody').innerText(),/531/);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/product-analytics-desktop.png',fullPage:false});
 });
 await check('Multiple products, category, customer, employee, status, year and month filters use stable backend IDs',async()=>{
  await openComparison();await page.getByLabel('All Products',{exact:true}).uncheck();await page.getByLabel('Compare products',{exact:true}).selectOption(['chart_a','chart_b']);await page.getByLabel('Year',{exact:true}).fill('2026');await choose('Month','January');await choose('Product category','Graphic Designing');await choose('Customer','Chart customer');await choose('Employee','Analytics browser');await choose('Status','Pending Internal Review');await apply();
  const data=await page.evaluate(()=>productAnalyticsState.data);assert.deepEqual(data.appliedFilters.productIds,['chart_a','chart_b']);assert.deepEqual(data.appliedFilters.categoryIds,['c1']);assert.deepEqual(data.periods,['2026-01']);assert.equal(data.products.length,1);assert.equal(data.totals.quotationCount,1);assert.equal(data.totals.quotedValue,53100);
 });
 await check('Zero-data years retain selected historical products without fabricating quotations',async()=>{
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();await ready();await openComparison();await page.getByLabel('All Products',{exact:true}).uncheck();await page.getByLabel('Compare products',{exact:true}).selectOption(['chart_a','chart_b']);await page.getByLabel('From date',{exact:true}).fill('2025-01-01');await page.getByLabel('To date',{exact:true}).fill('2025-12-31');await apply();
  const data=await page.evaluate(()=>productAnalyticsState.data);assert.equal(data.products.length,2);assert.equal(data.periods.length,12);assert.equal(data.totals.quotationCount,0);assert.ok(data.series.every(s=>s.values.every(v=>v===0)));await page.getByText('No quotations match these dates. Selected historical products are shown with zero values.',{exact:true}).waitFor();
 });
 await check('Analytics are responsive, labelled and usable with keyboard controls at desktop and mobile widths',async()=>{
  const widths=[];for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=width+1,JSON.stringify(bounds));widths.push(bounds);}
  await page.getByRole('button',{name:'Apply analytics filters',exact:true}).focus();assert.equal(await page.getByRole('button',{name:'Apply analytics filters',exact:true}).evaluate(el=>el===document.activeElement),true);await page.getByRole('combobox',{name:'Chart mode',exact:true}).focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>productAnalyticsState.mode),'area');await page.waitForFunction(()=>document.querySelector('#workspace-sidebar').getBoundingClientRect().right<=1);await page.evaluate(()=>document.querySelector('#pa-results').scrollIntoView({block:'start'}));await page.screenshot({path:out+'/product-analytics-mobile.png',fullPage:false});await page.setViewportSize({width:1440,height:1000});return widths;
 });
 await check('API failures are recoverable and a late response cannot replace another user or report view',async()=>{
  await page.route('**/api/reports/product-performance?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic analytics availability failure'})}),{times:1});await page.getByRole('button',{name:'Apply analytics filters',exact:true}).click();await page.getByRole('button',{name:'Retry product analytics',exact:true}).waitFor();await page.getByRole('button',{name:'Retry product analytics',exact:true}).click();await ready();
  let release,started;const gate=new Promise(r=>release=r),waiting=new Promise(r=>started=r);await page.route('**/api/reports/product-performance?*',async route=>{started();await gate;await route.continue();},{times:1});
  try{await page.evaluate(()=>{window.pendingAnalytics=loadProductPerformance(true);});await waiting;await page.evaluate(()=>go('dash'));release();await page.evaluate(()=>window.pendingAnalytics);assert.equal(await page.locator('#product-analytics').count(),0);}finally{release();}
 });
 await check('Own-report employees see only permitted metadata and accounts without reports cannot open the report',async()=>{
  const employee=await browser.newContext();try{
   const login=await employee.request.post(base+'/api/auth/login',{data:{username:'chartemployee',password:staffPassword}}),auth=await login.json();assert.equal(login.status(),200);
   await employee.request.post(base+'/api/quotations',{headers:{'X-CSRF-Token':auth.csrfToken},data:{cid:customerId,date:'2026-01-01',valid:'2026-12-31',items:[{pid:'chart_b',cfg:{qty:1}}]}});
   const tab=await employee.newPage();await tab.goto(base+'/#rep');await tab.waitForFunction(()=>productAnalyticsState.data);const data=await tab.evaluate(()=>productAnalyticsState.data);assert.equal(data.scope,'own');assert.equal(data.totals.quotationCount,1);assert.deepEqual(data.options.products.map(p=>p.id),['chart_b']);assert.deepEqual(data.options.employees.map(e=>e.id),[staffId]);
   await request('/api/users/'+staffId,'PATCH',{version:1,permissions:['product.view']});await employee.request.post(base+'/api/auth/login',{data:{username:'chartemployee',password:staffPassword}});await tab.reload();await tab.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();assert.equal(await tab.locator('#product-analytics').count(),0);
  }finally{await employee.close();}
  assert.deepEqual(exceptions,[]);
 });
 await check('A report above the series limit still exposes scoped options and can be narrowed to a historical product',async()=>{
  const q=await request('/api/quotations','POST',{cid:customerId,date:'2026-04-01',valid:'2026-12-31',items:Array.from({length:51},()=>({pid:'chart_b',cfg:{qty:1}}))},201);
  await app.db.prepare("UPDATE quotation_items SET product_id='old_chart_'||position,body=(body::jsonb||jsonb_build_object('pid','old_chart_'||position,'name','Historical chart product '||position))::text WHERE quotation_id=?").run(q.data.id);
  await page.goto(base+'/#rep');await page.getByRole('button',{name:'Reset filters',exact:true}).click();await page.getByText('More than 50 products match. Select products or narrow the filters.',{exact:true}).waitFor();
  assert.ok(await page.locator('#pa-products option').count()>50);await openComparison();await page.getByLabel('All Products',{exact:true}).uncheck();await page.getByLabel('Compare products',{exact:true}).selectOption(['old_chart_0']);await apply();
  assert.equal(await page.evaluate(()=>productAnalyticsState.data.products.length),1);assert.equal(await page.evaluate(()=>productAnalyticsState.data.totals.quotedValue),11800);assert.deepEqual(exceptions,[]);
 });
 await check('An in-flight report cannot replace newer global date and customer filters',async()=>{
  let release,started;const gate=new Promise(r=>release=r),waiting=new Promise(r=>started=r);await page.route('**/api/reports/product-performance?*',async route=>{started();await gate;await route.continue();},{times:1});
  try{await page.evaluate(()=>{window.pendingAnalytics=loadProductPerformance(true);});await waiting;await page.getByLabel('From date',{exact:true}).fill('2026-05-01');await choose('Customer','Other chart customer');release();await page.evaluate(()=>window.pendingAnalytics);await ready();
   assert.equal(await page.getByLabel('From date',{exact:true}).inputValue(),'2026-05-01');assert.match(await page.getByRole('combobox',{name:'Customer',exact:true}).innerText(),/Other chart customer/);assert.equal(await page.evaluate(()=>productAnalyticsState.data.appliedFilters.from),'2026-05-01');await apply();assert.equal(await page.evaluate(()=>productAnalyticsState.data.appliedFilters.from),'2026-05-01');assert.equal(await page.evaluate(()=>productAnalyticsState.data.totals.quotationCount),0);
  }finally{release();}assert.deepEqual(exceptions,[]);
 });
})().catch(async e=>{console.error(e.stack);process.exitCode=1;await page?.screenshot({path:out+'/product-analytics-failure.png',fullPage:true}).catch(()=>{});}).finally(async()=>{fs.writeFileSync(out+'/product-analytics-browser.json',JSON.stringify({results,exceptions},null,2));if(browser)await browser.close();if(app)await app.close();if(database)await database.destroy();});
