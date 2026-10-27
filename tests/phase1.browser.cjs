'use strict';
// This runner creates fixture records only in an explicitly disposable installation.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:6402';
const target = new URL(base);
if (process.env.TEST_DISPOSABLE !== '1' || !['localhost','127.0.0.1','[::1]'].includes(target.hostname) || target.port === '6400')
  throw new Error('Set TEST_DISPOSABLE=1 and TEST_BASE_URL to a separate local test app.');
fs.mkdirSync('test-results',{recursive:true});
const results=[],exceptions=[];
const fixtureId='phase1_'+crypto.randomBytes(6).toString('hex');
const fixtureName='Phase 1 uniform '+fixtureId;
let browser,page,quotationId;
const idle=()=>page.waitForFunction(()=>!busy);
const editor=index=>page.locator('#field-list > .spec-editor').nth(index);
async function check(name,run){
  try{const detail=await run();results.push({name,result:'PASS',detail});console.log('PASS '+name);}
  catch(error){results.push({name,result:'FAIL',error:error.message});throw error;}
}
async function choose(scope,name,label){
  const button=scope.getByRole('combobox',{name,exact:true});await button.waitFor();await button.click();
  await page.getByRole('searchbox',{name:'Search '+name+' options',exact:true}).fill(label);
  await page.getByRole('option',{name:label,exact:true}).click();
}
async function commit(input,value){await input.fill(value);await input.press('Tab');}
async function noOverflow(name){
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,boxWidth:document.querySelector('#modal .box')?.clientWidth,boxScroll:document.querySelector('#modal .box')?.scrollWidth}));
  assert.ok(dimensions.scroll<=dimensions.width+1,name+': '+JSON.stringify(dimensions));
  assert.ok(dimensions.boxScroll<=dimensions.boxWidth+1,name+': '+JSON.stringify(dimensions));
  return dimensions;
}

(async()=>{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});page.on('pageerror',error=>exceptions.push(error.message));
  await check('Phase 1 disposable workspace sign-in and fixture setup',async()=>{
    await page.goto(base);await page.locator('#auth_username').waitFor();
    const initialized=await page.getByRole('heading',{name:'Sign in to your workspace',exact:true}).isVisible();
    const username=process.env.TEST_USERNAME||'uitestadmin',password=process.env.TEST_PASSWORD||crypto.randomUUID()+'-Test';
    if(initialized&&!process.env.TEST_PASSWORD)throw new Error('TEST_PASSWORD is required for an initialized disposable fixture.');
    if(!initialized){await page.getByLabel('Your name',{exact:true}).fill('Phase 1 QA');await page.locator('#auth_demo').check();}
    await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill(password);
    await page.getByRole('button',{name:initialized?'Sign in':'Create workspace',exact:true}).click();
    await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await idle();
    await page.evaluate(async ({id,name})=>{
      await api('/api/products',{method:'POST',body:JSON.stringify({id,code:id,name,cat:S.cats[0].id,m:'unit',rate:100,min:0,minQty:1,tax:18,on:1,f:[
        {k:'material',l:'Material',t:'sel',o:[['Cotton','f',0],['Polyester','f',0]]},
        {k:'method',l:'Printing method',t:'sel',o:[['Screen Print','f',0],['Sublimation','f',0]]},
        {k:'details',l:'Design requirements',t:'txt',when:{key:'material',equals:'Cotton'},show_on_customer_pdf:false},
        {k:'internalNotes',l:'Internal notes',t:'txt',internal_only:true,show_on_customer_pdf:true},
        {k:'anyDetails',l:'Any match instructions',t:'txt',when:{mode:'ANY',conditions:[{key:'material',operator:'equals',value:'Cotton'},{key:'method',operator:'not_equals',value:'Sublimation'}]},show_on_customer_pdf:true},
      ]})});adopt(await api('/api/state'));
    },{id:fixtureId,name:fixtureName});
    return {productId:fixtureId};
  });
  await check('Admin condition controls preserve legacy Equals and save multiple ALL/ANY operators',async()=>{
    await page.locator('nav a[href="#prod"]').click();
    const productRow=page.locator('tr').filter({has:page.getByText(fixtureName,{exact:true})});
    await productRow.getByRole('button',{name:'Edit',exact:true}).click();
    const condition=editor(2);
    await condition.getByRole('button',{name:'+ Add condition',exact:true}).click();
    const second=condition.locator('.condition-row').nth(1);
    await choose(second,'Field','Printing method');
    await choose(second,'Operator','Not Equals');
    await commit(second.getByLabel('Value',{exact:true}),'Sublimation');
    await choose(condition,'Match conditions','ANY condition matches');
    assert.equal(await page.evaluate(()=>PRODUCT_DRAFT.f[2].when.mode),'ANY');
    await choose(condition,'Match conditions','ALL conditions match');
    await condition.getByLabel('Show on customer PDF',{exact:true}).check();
    assert.equal(await editor(3).getByLabel('Show on customer PDF (internal fields are always excluded)',{exact:true}).isDisabled(),true);
    const group=await page.evaluate(()=>PRODUCT_DRAFT.f[2].when);
    assert.deepEqual(group,{mode:'ALL',conditions:[{key:'material',operator:'equals',value:'Cotton'},{key:'method',operator:'not_equals',value:'Sublimation'}]});
    return group;
  });
  await check('Admin adds reusable sizes, custom kids labels, price adjustments, ordering and disabled sizes',async()=>{
    await page.getByRole('button',{name:'+ Add specification',exact:true}).click();
    await commit(editor(5).getByLabel('Key',{exact:true}),'sizes');
    await commit(editor(5).getByLabel('Label',{exact:true}),'Uniform sizes');
    await choose(editor(5),'Field type','Size breakdown');
    await editor(5).getByRole('button',{name:'Add missing XS–5XL sizes',exact:true}).click();
    await editor(5).getByRole('button',{name:'+ Add size / kids size',exact:true}).click();
    const kids=editor(5).locator('.size-editor-row').last();
    await commit(kids.getByLabel('Size key',{exact:true}),'kids');await commit(kids.getByLabel('Size label',{exact:true}),'Kids 6-8');
    await commit(kids.getByLabel('Price adjustment (₹ / piece)',{exact:true}),'5');
    await editor(5).locator('.size-editor-row').first().getByLabel('Enabled',{exact:true}).uncheck();
    await editor(5).getByRole('button',{name:'Move size 10 up',exact:true}).click();
    const sizes=await page.evaluate(()=>PRODUCT_DRAFT.f[5].sizes);
    assert.equal(sizes.length,10);assert.equal(sizes[0].enabled,false);assert.equal(sizes[8].key,'kids');assert.equal(sizes[8].price,5);
    for(const key of ['XS','S','M','L','XL','XXL','3XL','4XL','5XL'])assert.ok(sizes.some(s=>s.key===key));
    const desktop=await noOverflow('Desktop configuration editor');
    await editor(5).locator('.size-editor-row').last().scrollIntoViewIfNeeded();
    await page.screenshot({path:'test-results/phase1-editor-desktop.png',fullPage:false});
    await page.setViewportSize({width:390,height:844});const mobile=await noOverflow('Mobile configuration editor');
    await editor(5).locator('.size-editor-row').last().scrollIntoViewIfNeeded();
    await page.screenshot({path:'test-results/phase1-editor-mobile.png',fullPage:false});await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'Save product',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await idle();
    await page.locator('tr').filter({has:page.getByText(fixtureName,{exact:true})}).getByRole('button',{name:'Edit',exact:true}).click();
    const saved=await page.evaluate(()=>PRODUCT_DRAFT);
    assert.equal(saved.f[2].when.mode,'ALL');assert.equal(saved.f[2].show_on_customer_pdf,true);assert.equal(saved.f[5].sizes[8].key,'kids');
    await page.getByRole('button',{name:'Close',exact:true}).click();return {sizes:sizes.length,desktop,mobile};
  });
  await check('Quotation ALL/ANY conditions update immediately and clear hidden values',async()=>{
    await page.locator('nav a[href="#new"]').click();await page.getByRole('heading',{name:/^Create Quotation/}).waitFor();
    const customerName=await page.evaluate(()=>S.customers[0].name);await choose(page,'Customer',customerName+' — '+await page.evaluate(()=>S.customers[0].mob));
    await page.getByRole('button',{name:'+ Add product or service',exact:true}).click();await page.locator('#cq').fill(fixtureName);
    await page.locator('#cl .pc').filter({hasText:fixtureName}).click();
    await commit(page.getByLabel('Design requirements',{exact:true}),'PUBLIC-PHASE1-DESIGN');
    await choose(page.locator('#modal'),'Printing method','Sublimation');
    assert.equal(await page.getByLabel('Design requirements',{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>Object.hasOwn(CF,'details')),false);
    assert.equal(await page.getByLabel('Any match instructions',{exact:true}).count(),1);
    await choose(page.locator('#modal'),'Material','Polyester');
    assert.equal(await page.getByLabel('Any match instructions',{exact:true}).count(),0);
    await choose(page.locator('#modal'),'Printing method','Screen Print');
    assert.equal(await page.getByLabel('Design requirements',{exact:true}).count(),0);assert.equal(await page.getByLabel('Any match instructions',{exact:true}).count(),1);
    await choose(page.locator('#modal'),'Material','Cotton');
    await commit(page.getByLabel('Design requirements',{exact:true}),'PUBLIC-PHASE1-DESIGN');
    await commit(page.getByLabel('Internal notes',{exact:true}),'SECRET-PHASE1-INTERNAL');
    await commit(page.getByLabel('Any match instructions',{exact:true}),'PUBLIC-PHASE1-ANY');
  });
  await check('Reusable size quantities calculate total and prices, validate and survive quotation save/edit',async()=>{
    assert.equal(await page.getByRole('spinbutton',{name:'S',exact:true}).count(),0);
    await page.getByRole('spinbutton',{name:'M',exact:true}).fill('6');await page.getByRole('spinbutton',{name:'Kids 6-8',exact:true}).fill('4');
    await page.getByText('Total Quantity: 10',{exact:true}).waitFor();
    let computed=await page.evaluate(()=>calc(prod(CF._p),CF));assert.equal(computed.qty,10);assert.equal(computed.sub,102000);
    await page.getByRole('spinbutton',{name:'M',exact:true}).fill('-1');await page.locator('#cc').getByText(/nonnegative/).waitFor();
    await page.getByRole('spinbutton',{name:'M',exact:true}).fill('6');
    await page.setViewportSize({width:390,height:844});const mobile=await noOverflow('Mobile quotation configurator');await page.locator('.size-breakdown').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/phase1-configurator-mobile.png',fullPage:false});await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'Add to quotation',exact:true}).click();await page.getByRole('button',{name:'Save as Draft',exact:true}).click();await idle();
    await page.getByRole('heading',{name:/^Edit Quotation/}).waitFor();quotationId=await page.evaluate(()=>Q.id);
    const saved=await page.evaluate(async id=>(await api('/api/quotations/'+id)).data,quotationId);
    assert.equal(saved.items[0].qty,10);assert.deepEqual(saved.items[0].cfg.sizes,{M:6,L:0,XL:0,XXL:0,XS:0,'3XL':0,kids:4,'4XL':0,'5XL':0});
    await page.locator('#its').getByRole('button',{name:'Edit',exact:true}).click();
    assert.equal(await page.getByRole('spinbutton',{name:'M',exact:true}).inputValue(),'6');assert.equal(await page.getByRole('spinbutton',{name:'Kids 6-8',exact:true}).inputValue(),'4');
    await page.getByText('Total Quantity: 10',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();return {quantity:10,subtotalPaise:102000,mobile};
  });
  await check('Customer preview and protected PDF include flagged values and exclude internal notes',async()=>{
    await page.getByRole('button',{name:'Preview Quotation',exact:true}).click();
    const preview=await page.locator('#modal .doc').innerText();assert.match(preview,/PUBLIC-PHASE1-DESIGN/);assert.match(preview,/PUBLIC-PHASE1-ANY/);assert.doesNotMatch(preview,/SECRET-PHASE1-INTERNAL/);assert.match(preview,/Kids 6-8 4/);
    await page.screenshot({path:'test-results/phase1-customer-preview.png',fullPage:false});await page.getByRole('button',{name:'Close',exact:true}).click();
    const response=await page.request.get(base+'/api/quotations/'+quotationId+'/pdf');assert.equal(response.status(),200);
    const buffer=await response.body();assert.equal(buffer.subarray(0,5).toString(),'%PDF-');fs.writeFileSync('test-results/phase1-browser-quotation.pdf',buffer);
    const content=buffer.toString('latin1');assert.match(content,/PUBLIC-PHASE1-DESIGN/);assert.match(content,/PUBLIC-PHASE1-ANY/);assert.doesNotMatch(content,/SECRET-PHASE1-INTERNAL/);
    assert.deepEqual(exceptions,[]);return {pdfBytes:buffer.length,javascriptExceptions:exceptions.length};
  });
})().catch(async error=>{console.error(error.stack||error.message);process.exitCode=1;if(page)await page.screenshot({path:'test-results/phase1-browser-failure.png',fullPage:true}).catch(()=>{});}).finally(async()=>{fs.writeFileSync('test-results/phase1-browser.json',JSON.stringify({results,exceptions},null,2));if(browser)await browser.close();});
