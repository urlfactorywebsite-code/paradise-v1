'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:6403',target=new URL(base);
if(process.env.TEST_DISPOSABLE!=='1'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.port==='6400')throw new Error('Use an explicitly disposable local fixture.');
const results=[],exceptions=[],id='review_'+crypto.randomBytes(6).toString('hex');
let browser,page;
async function check(name,run){try{await run();results.push({name,result:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,result:'FAIL',error:error.message});throw error;}}
async function choose(name,label){await page.getByRole('combobox',{name,exact:true}).click();await page.getByRole('searchbox',{name:'Search '+name+' options',exact:true}).fill(label);await page.getByRole('option',{name:label,exact:true}).click();}
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>exceptions.push(error.message));
 await page.goto(base);
 await page.getByLabel('Username',{exact:true}).fill(process.env.TEST_USERNAME);
 await page.getByLabel('Password',{exact:true}).fill(process.env.TEST_PASSWORD);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
 await page.evaluate(async id=>{
  await api('/api/products',{method:'POST',body:JSON.stringify({id,code:id,name:'Review conditional product',cat:S.cats[0].id,m:'unit',rate:10,min:0,minQty:1,tax:18,on:1,f:[
   {k:'mode',l:'Mode',t:'sel',o:[['Standard','f',0],['Custom','f',0]]},
   {k:'dimensions',l:'Dimensions',t:'dim',when:{key:'mode',equals:'Custom'}},
   {k:'finish',l:'Conditional finish',t:'sel',o:[['Plain','f',0],['Paid','u',2]],when:{key:'mode',equals:'Custom'}},
   {k:'bulk',l:'Bulk handling',t:'sel',o:[['Standard','f',0]],when:{key:'qty',equals:5}},
   {k:'sizes',l:'Size breakdown',t:'SIZE_BREAKDOWN',when:{key:'mode',equals:'Custom'},sizes:[{key:'kid',label:'Kids',enabled:true,price:0}]},
   {k:'sensitive',l:'InternalNotes',t:'txt',show_on_customer_pdf:true},
  ],charges:[{label:'Width surcharge',type:'f',amount:25,when:{key:'w',equals:4}}]})});
  adopt(await api('/api/state'));Q=newQ();Q.cid='C1';location.hash='#new';render();openCfg(id);
 },id);
 await check('Review browser: quantity-dependent and reappearing dropdown values match visible selections',async()=>{
  assert.equal(await page.evaluate(()=>Object.hasOwn(CF,'bulk')),false);
  await choose('Mode','Custom');
  assert.equal(await page.evaluate(()=>CF.finish),'Plain');
  await page.getByRole('spinbutton',{name:'Kids',exact:true}).fill('5');
  await page.getByRole('combobox',{name:'Bulk handling',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>CF.bulk),'Standard');
  assert.equal(await page.evaluate(()=>calc(prod(CF._p),CF).sub),7500);
  await choose('Conditional finish','Paid');assert.equal(await page.evaluate(()=>calc(prod(CF._p),CF).sub),8500);
  await choose('Mode','Standard');assert.equal(await page.evaluate(()=>Object.hasOwn(CF,'finish')),false);
  assert.equal(await page.evaluate(()=>calc(prod(CF._p),CF).sub),5000);
  assert.equal(await page.evaluate(()=>Object.hasOwn(CF,'w')),false);
  await choose('Mode','Custom');assert.equal(await page.evaluate(()=>CF.finish),'Plain');
  assert.equal(await page.evaluate(()=>Object.hasOwn(CF,'bulk')),false);
  await page.getByRole('spinbutton',{name:'Kids',exact:true}).fill('5');assert.equal(await page.evaluate(()=>calc(prod(CF._p),CF).err),null);
 });
 await check('Review browser: corrected configuration survives save and edit on a narrow viewport',async()=>{
  const input=page.getByLabel('InternalNotes',{exact:true});await input.fill('SECRET-REVIEW-BROWSER');await input.press('Tab');
  await page.setViewportSize({width:390,height:844});
  const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1);
  await page.screenshot({path:'test-results/phase1-review-mobile.png'});
  await page.getByRole('button',{name:'Add to quotation',exact:true}).click();
  await page.getByRole('button',{name:'Save as Draft',exact:true}).click();await page.getByRole('heading',{name:/^Edit Quotation/}).waitFor();
  await page.locator('#its').getByRole('button',{name:'Edit',exact:true}).click();
  assert.equal(await page.getByRole('spinbutton',{name:'Kids',exact:true}).inputValue(),'5');
  assert.equal(await page.evaluate(()=>CF.finish),'Plain');assert.equal(await page.evaluate(()=>CF.bulk),'Standard');
  assert.equal(await page.evaluate(()=>calc(prod(CF._p),CF).sub),7500);
  await page.getByRole('button',{name:'Close',exact:true}).click();
 });
 await check('Review browser: camel-case internal data is excluded from preview and authenticated PDF',async()=>{
  await page.getByRole('button',{name:'Preview Quotation',exact:true}).click();
  assert.ok(!(await page.locator('#modal .doc').innerText()).includes('SECRET-REVIEW-BROWSER'));
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const quoteId=await page.evaluate(()=>Q.id),response=await page.request.get(base+'/api/quotations/'+quoteId+'/pdf');assert.equal(response.status(),200);
  const buffer=await response.body();assert.ok(!buffer.toString('latin1').includes('SECRET-REVIEW-BROWSER'));fs.writeFileSync('test-results/phase1-review-quotation.pdf',buffer);
  assert.deepEqual(exceptions,[]);
 });
 await check('Review browser: unavailable zero-count historical sizes have a usable clear action',async()=>{
  await page.evaluate(id=>{Q.items[0].cfg.sizes.retired=0;openCfg(id,Q.items[0].id)},id);
  await page.getByText(/Previously selected sizes are unavailable: retired/).waitFor();
  await page.getByRole('button',{name:'Clear unavailable quantities',exact:true}).click();
  assert.equal(await page.evaluate(()=>Object.hasOwn(CF.sizes,'retired')),false);
  assert.equal(await page.evaluate(()=>calc(prod(CF._p),CF).err),null);
  await page.getByRole('button',{name:'Update item',exact:true}).click();
  await page.getByRole('button',{name:'Save quotation',exact:true}).click();await page.waitForFunction(()=>!busy);
  const saved=await page.evaluate(async()=>(await api('/api/quotations/'+Q.id)).data);
  assert.equal(saved.items[0].qty,5);assert.equal(saved.items[0].cfg.sizes.retired,undefined);
  assert.deepEqual(exceptions,[]);
 });
})().catch(async error=>{console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:'test-results/phase1-review-browser-failure.png'}).catch(()=>{});}).finally(async()=>{fs.writeFileSync('test-results/phase1-review-browser.json',JSON.stringify({results,exceptions},null,2));if(browser)await browser.close();});
