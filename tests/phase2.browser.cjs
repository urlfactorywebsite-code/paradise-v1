'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:6404',target=new URL(base);
if(process.env.TEST_DISPOSABLE!=='1'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.port==='6400')throw new Error('Use an explicitly disposable local installation.');
const results=[],exceptions=[];let browser,page,cardId,flexId,legacy;
const idle=()=>page.waitForFunction(()=>!busy);
const field=key=>page.locator('#field-list > fieldset').filter({has:page.locator(`input[value="${key}"]`)});
const option=(key,value)=>field(key).locator('.option-editor').filter({has:page.locator(`input[value="${value}"]`)});
async function check(name,run){try{await run();results.push({name,result:'PASS'});console.log('PASS '+name)}catch(error){results.push({name,result:'FAIL',error:error.message});throw error}}
async function choose(scope,name,label){const button=scope.getByRole('combobox',{name,exact:true});await button.click();const actual=await button.getAttribute('aria-label');await page.getByRole('searchbox',{name:'Search '+actual+' options',exact:true}).fill(label);await page.getByRole('option',{name:label,exact:true}).click();}
async function commit(input,value){await input.fill(value);await input.press('Tab');}
async function editProduct(id){await page.evaluate(id=>prodForm(id),id);await page.getByRole('heading',{name:'Edit product',exact:true}).waitFor();}
async function saveProduct(){await page.getByRole('button',{name:'Save product',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await idle();}
async function approveRate(key,value,rate){const row=option(key,value);await commit(row.getByLabel('Rate (INR; blank = pending)',{exact:true}),String(rate));await row.getByLabel('Option enabled',{exact:true}).check();await row.getByLabel('Rate explicitly approved',{exact:true}).check();}
async function configure(id){await page.evaluate(id=>{Q=newQ();Q.cid='C1';location.hash='#new';render();openCfg(id)},id);}
async function flexDimensions(){await page.locator('#config-fields input[placeholder="Width"]').fill('2');await page.locator('#config-fields input[placeholder="Height"]').fill('3');await page.getByRole('spinbutton',{name:'Quantity',exact:true}).fill('2');}
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>exceptions.push(e.message));
 await check('Phase 2 browser: sign in and capture legacy quotation snapshots',async()=>{
  await page.goto(base);await page.getByLabel('Username',{exact:true}).fill(process.env.TEST_USERNAME);await page.getByLabel('Password',{exact:true}).fill(process.env.TEST_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await idle();legacy=await page.evaluate(async()=>(await api('/api/quotations/Q2')).data.items);
 });
 await check('Phase 2 browser: Admin stages and saves Visiting Card setup with structured size metadata',async()=>{
  await editProduct('p1');await page.getByRole('button',{name:'Prepare Phase 2 configuration',exact:true}).click();await field('size').getByLabel('Size width',{exact:true}).first().waitFor();
  assert.equal(await page.evaluate(()=>PRODUCT_DRAFT.compatibility.length),3);assert.equal(await page.evaluate(()=>PRODUCT_DRAFT.f.find(f=>f.k==='fin').o.find(o=>o[0]==='Custom')[2]),0);
  await saveProduct();const saved=await page.evaluate(async()=>(await api('/api/products/p1')).data);assert.equal(saved.phase2,'visiting_card');assert.equal(saved.compatibility.length,3);
 });
 await check('Phase 2 browser: card shape filters size, Custom finish validates, and saved dimensions/details restore',async()=>{
  await configure('p1');await choose(page.locator('#modal'),'Product Shape','Square');assert.match(await page.evaluate(()=>CF.size),/^Square/);
  await choose(page.locator('#modal'),'Product Shape','Custom');assert.equal(await page.evaluate(()=>CF.size),'Custom');
  await choose(page.locator('#modal'),'Finish','Custom');await page.locator('#cc').getByText(/Custom Finish Details.*required/).waitFor();
  await commit(page.getByLabel(/^Custom Finish Details/),'P2-CUSTOM-FINISH');await page.locator('input[placeholder="Width"]').fill('3');await page.locator('input[placeholder="Height"]').fill('2');await choose(page.locator('#modal'),'Dimension unit','in');
  await page.getByRole('button',{name:'Add to quotation',exact:true}).click();await page.getByRole('button',{name:'Save as Draft',exact:true}).click();await page.getByRole('heading',{name:/^Edit Quotation/}).waitFor();cardId=await page.evaluate(()=>Q.id);
  await page.locator('#its').getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await page.getByLabel(/^Custom Finish Details/).inputValue(),'P2-CUSTOM-FINISH');assert.equal(await page.locator('input[placeholder="Width"]').inputValue(),'3');await page.getByRole('button',{name:'Close',exact:true}).click();
  const response=await page.request.get(base+'/api/quotations/'+cardId+'/pdf');assert.equal(response.status(),200);const data=await response.body();assert.ok(data.toString('latin1').includes('P2-CUSTOM-FINISH'));fs.writeFileSync('test-results/phase2-card.pdf',data);
 });
 await check('Phase 2 browser: Admin manages Flex options, names, order and explicitly approved fixture rates',async()=>{
  await editProduct('p5');await page.getByRole('button',{name:'Prepare Phase 2 configuration',exact:true}).click();assert.equal(await option('material','220 GSM').getByLabel('Rate (INR; blank = pending)',{exact:true}).inputValue(),'');assert.equal(await field('eyelets').getByLabel('Business-approved eyelet counting policy',{exact:true}).isChecked(),false);
  await approveRate('material','220 GSM',2);await commit(option('material','220 GSM').getByLabel('Display name',{exact:true}),'Approved 220 stock');
  await option('material','220 GSM').getByRole('button',{name:'Move option down',exact:true}).click();assert.equal(await page.evaluate(()=>PRODUCT_DRAFT.f.find(f=>f.k==='material').o[1][0]),'220 GSM');await option('material','220 GSM').getByRole('button',{name:'Move option up',exact:true}).click();
  await field('material').getByRole('button',{name:'+ Add managed option',exact:true}).click();await commit(field('material').locator('.option-editor').last().getByLabel('Display name',{exact:true}),'Unavailable test stock');
  for(const[k,v,r]of[['printing','Solvent',3],['eyelets','Corners Only',1.5],['eyelets','Every 2 Feet',1.5],['eye','Ropes',3]])await approveRate(k,v,r);
  await choose(option('eye','Ropes'),'Quantity source (per-unit bases only)','Item quantity (default)');assert.equal(await page.evaluate(()=>PRODUCT_DRAFT.f.find(f=>f.k==='eye').optionMeta.Ropes.quantityKey),undefined);
  await choose(option('eye','Ropes'),'Quantity source (per-unit bases only)','Accessory quantity per piece');
  assert.equal(await page.evaluate(()=>PRODUCT_DRAFT.f.find(f=>f.k==='eye').o.find(o=>o[0]==='Pipe Pockets')[2]),150);assert.equal(await page.evaluate(()=>PRODUCT_DRAFT.f.find(f=>f.k==='fin').o.find(o=>o[0]==='Hemming & Eyelets')[2]),2);
  await page.setViewportSize({width:390,height:844});await field('material').scrollIntoViewIfNeeded();const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,box:document.querySelector('#modal .box').clientWidth,boxScroll:document.querySelector('#modal .box').scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1&&bounds.boxScroll<=bounds.box+1,JSON.stringify(bounds));await page.screenshot({path:'test-results/phase2-admin-mobile.png'});await page.setViewportSize({width:1440,height:1000});await saveProduct();
 });
 await check('Phase 2 browser: pending eyelet policy rejects use and is approved only in the disposable fixture',async()=>{
  await configure('p5');await flexDimensions();assert.equal(await page.evaluate(()=>calc(prod('p5'),CF).sub),36000);
  await choose(page.locator('#modal'),'Eyelets','Corners Only');await page.locator('#cc').getByText(/policy requires business approval/).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
  await editProduct('p5');await field('eyelets').getByLabel('Business-approved eyelet counting policy',{exact:true}).check();await saveProduct();
 });
 await check('Phase 2 browser: eyelet counts, accessories, bundle protection and backend totals agree',async()=>{
  await configure('p5');await flexDimensions();await choose(page.locator('#modal'),'Eyelets','Corners Only');assert.equal(await page.evaluate(()=>calc(prod('p5'),CF).computed.eyelets.total),8);
  await choose(page.locator('#modal'),'Extra Accessories','Ropes');await commit(page.getByLabel(/^Accessory quantity per piece/),'4');assert.equal(await page.evaluate(()=>calc(prod('p5'),CF).sub),39600);
  await choose(page.locator('#modal'),'Eyelets','Every 2 Feet');assert.equal(await page.evaluate(()=>calc(prod('p5'),CF).computed.eyelets.total),12);assert.equal(await page.evaluate(()=>calc(prod('p5'),CF).sub),40200);
  await choose(page.locator('#modal'),'Finishing','Hemming & Eyelets');assert.equal(await page.evaluate(()=>CF.eyelets),'None');assert.equal(await page.evaluate(()=>calc(prod('p5'),CF).sub),40800);
  await choose(page.locator('#modal'),'Finishing','Plain');await choose(page.locator('#modal'),'Eyelets','Corners Only');const expected=await page.evaluate(()=>calc(prod('p5'),CF).grand);
  await page.setViewportSize({width:390,height:844});const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1);await page.screenshot({path:'test-results/phase2-configurator-mobile.png'});await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Add to quotation',exact:true}).click();await page.getByRole('button',{name:'Save as Draft',exact:true}).click();await page.getByRole('heading',{name:/^Edit Quotation/}).waitFor();flexId=await page.evaluate(()=>Q.id);
  const saved=await page.evaluate(async id=>(await api('/api/quotations/'+id)).data,flexId);assert.equal(saved.items[0].sub,39600);assert.equal(saved.items[0].computed.eyelets.total,8);assert.equal(await page.evaluate(q=>DP.totals(q).grand,saved),expected);assert.equal(saved.items[0].cfg.material,'220 GSM');
  await page.locator('#its').getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await page.getByLabel(/^Accessory quantity per piece/).inputValue(),'4');assert.equal(await page.evaluate(()=>CF.eyelets),'Corners Only');await page.getByRole('button',{name:'Close',exact:true}).click();
  const response=await page.request.get(base+'/api/quotations/'+flexId+'/pdf');assert.equal(response.status(),200);fs.writeFileSync('test-results/phase2-flex.pdf',await response.body());
 });
 await check('Phase 2 browser: disabled options cannot be newly chosen and saved/legacy prices remain snapshots',async()=>{
  const before=await page.evaluate(async id=>(await api('/api/quotations/'+id)).data.items,flexId);await editProduct('p5');await option('material','220 GSM').getByLabel('Option enabled',{exact:true}).uncheck();await saveProduct();
  assert.deepEqual(await page.evaluate(async id=>(await api('/api/quotations/'+id)).data.items,flexId),before);assert.deepEqual(await page.evaluate(async()=>(await api('/api/quotations/Q2')).data.items),legacy);
  await configure('p5');assert.ok(await page.getByRole('option',{name:'Approved 220 stock',exact:true}).count()===0);assert.match(await page.locator('#cc').innerText(),/approved prices/);await page.getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(exceptions,[]);
 });
})().catch(async error=>{console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:'test-results/phase2-browser-failure.png'}).catch(()=>{});}).finally(async()=>{fs.writeFileSync('test-results/phase2-browser.json',JSON.stringify({results,exceptions},null,2));if(browser)await browser.close()});
