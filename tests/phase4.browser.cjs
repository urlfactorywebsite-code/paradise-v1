'use strict';
// This suite changes approved fixtures only in an explicitly disposable local app.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:6413',target=new URL(base);
if(process.env.TEST_DISPOSABLE!=='1'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.port==='6400')throw new Error('Use an explicitly disposable local installation.');
fs.mkdirSync('test-results',{recursive:true});
const results=[],exceptions=[],printCodes=['GD-EN','GD-ID','GD-BB','GD-CT','GD-IN','GD-DG','GD-MN'];
let browser,page,baseline,prepared,fixtures;
const idle=()=>page.waitForFunction(()=>!busy);
async function check(name,run){if(process.env.PHASE4_BROWSER_ONLY_RESTRICTED==='1'&&!name.includes('authenticated Admin')&&!name.includes('catalog-only staff'))return;try{const detail=await run();results.push({name,result:'PASS',detail});console.log('PASS '+name);}catch(error){results.push({name,result:'FAIL',error:error.message});throw error;}}
async function commit(input,value){await input.fill(String(value));await input.press('Tab');}
async function choose(name,label,scope=page){const button=scope.getByRole('combobox',{name,exact:true});await button.click();await page.getByRole('searchbox',{name:'Search '+await button.getAttribute('aria-label')+' options',exact:true}).fill(label);await page.getByRole('option',{name:label,exact:true}).click();}
async function catalog(){await page.evaluate(()=>go('catalog'));await page.locator('.catalog-checklist').waitFor();await idle();}
async function filter(key,label){await choose(key,label);await page.waitForFunction(()=>!!document.querySelector('#catalog-results table')||document.querySelector('#catalog-results')?.textContent.includes('No required products'));}
async function resetFilters(){await page.evaluate(()=>resetCatalogFilters());await page.locator('.catalog-checklist').waitFor();}
async function close(){await page.getByRole('button',{name:'Close',exact:true}).first().click();}
async function bounds(){return page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,box:document.querySelector('#modal .box')?.clientWidth,boxScroll:document.querySelector('#modal .box')?.scrollWidth}));}
async function inspectPdf(id,name,visible,privateText){const response=await page.request.get(base+'/api/quotations/'+id+'/pdf');assert.equal(response.status(),200);const body=await response.body(),content=body.toString('latin1');fs.writeFileSync('test-results/phase4-'+name+'.pdf',body);const text=[...content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(match=>match[1].replace(/\\([\\()])/g,'$1')).join('').replace(/\s+/g,'');for(const value of visible)assert.ok(text.includes(value.replace(/\s+/g,'')),'PDF includes '+value);assert.ok(!text.includes(privateText),'Internal notes stay private');return {bytes:body.length};}
async function configureAndSave(code){
 const fixture=fixtures.find(p=>p.code===code);
 await page.evaluate(id=>{Q=newQ();Q.cid='C1';go('new');openCfg(id);},fixture.id);
 const fields=await page.evaluate(()=>effectiveProd(CF._p).f.filter(f=>DP.fieldVisible(f,CF,effectiveProd(CF._p))).map(f=>({k:f.k,l:f.l,t:f.t,required:!!f.required,internal:DP.isInternalField(f),public:DP.publicField(f)})));
 const expected={};
 if(await page.getByRole('spinbutton',{name:'Quantity',exact:true}).count())await commit(page.getByRole('spinbutton',{name:'Quantity',exact:true}),10);
 for(const f of fields){
  const label=f.l+(f.required?' *':'');
  if(f.t==='sel'){const key='fixture_'+code+'_'+f.k+'_B';await choose(label,'Fixture '+f.l+' B');expected[f.k]=key;}
  if(f.t==='txt'){const value=f.internal?'P4-PRIVATE-'+code:'P4-'+code+'-'+f.k;await commit(page.getByRole('textbox',{name:label,exact:true}),value);expected[f.k]=value;}
  if(f.t==='num'){await commit(page.getByRole('spinbutton',{name:label,exact:true}),12);expected[f.k]=12;}
  if(f.t==='dim'){await commit(page.getByPlaceholder('Width',{exact:true}),24);await commit(page.getByPlaceholder('Height',{exact:true}),36);await choose('Dimension unit','in');expected.w=24;expected.h=36;expected.u='in';assert.equal(await page.evaluate(()=>CF.w*CF.h*DP.AF[CF.u]),6);}
 }
 assert.equal(await page.evaluate(()=>DP.calc(effectiveProd(CF._p),CF).err||null),null);
 await page.getByRole('button',{name:'Add to quotation',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Save as Draft',exact:true}).click();await page.getByRole('heading',{name:/^Edit Quotation/}).waitFor();await idle();
 const id=await page.evaluate(()=>Q.id),stored=await page.evaluate(async id=>(await api('/api/quotations/'+id)).data,id);
 for(const [key,value]of Object.entries(expected))assert.deepEqual(stored.items[0].cfg[key],value,code+' saved '+key);
 await page.reload();await page.getByRole('button',{name:'Save as Draft',exact:true}).waitFor();await idle();await page.evaluate(id=>editQ(id),id);
 await page.locator('#its').getByRole('button',{name:'Edit',exact:true}).click();
 const reopened=await page.evaluate(()=>CF);for(const [key,value]of Object.entries(expected))assert.deepEqual(reopened[key],value,code+' restored '+key);
 if(code==='GD-EN'){
  await page.setViewportSize({width:390,height:844});const size=await bounds();assert.ok(size.scroll<=size.width+1&&size.boxScroll<=size.box+1,JSON.stringify(size));await page.screenshot({path:'test-results/phase4-print-config-mobile.png'});await page.setViewportSize({width:1440,height:1000});
  expected.customerReference+='-edited';await commit(page.getByRole('textbox',{name:'Customer Reference',exact:true}),expected.customerReference);await page.getByRole('button',{name:'Update item',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await page.getByRole('button',{name:'Save quotation',exact:true}).click();await idle();assert.equal(await page.evaluate(async id=>(await api('/api/quotations/'+id)).data.items[0].cfg.customerReference,id),expected.customerReference);
 }
 else await close();
 const publicValues=fields.filter(f=>f.public&&f.t==='txt').map(f=>expected[f.k]);
 await inspectPdf(id,code.toLowerCase(),[...publicValues,...fields.filter(f=>f.public&&f.t==='sel').map(f=>'Fixture '+f.l+' B')],'P4-PRIVATE-'+code);
 return {quotation:id,fields:fields.map(f=>f.k)};
}
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>exceptions.push(error.message));
 await check('Phase 4 browser: authenticated Admin captures existing catalog and historical quotation snapshots',async()=>{
  await page.goto(base);await page.getByLabel('Username',{exact:true}).fill(process.env.TEST_USERNAME);await page.getByLabel('Password',{exact:true}).fill(process.env.TEST_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await idle();
  baseline=await page.evaluate(async()=>{const result=await api('/api/state');return {state:result.state,legacy:(await api('/api/quotations/Q3')).data};});assert.ok(baseline.state.products.length>=40);
  fixtures=baseline.state.products.filter(p=>[...printCodes,'PR-LED','PG-UM','PR-OF','GD-SM','GD-CG','PG-GK'].includes(p.code)).map(p=>({code:p.code,id:p.id}));
 });
 await check('Phase 4 browser: Admin reviews and applies all 28 catalog assignments without activating or repricing',async()=>{
  await catalog();await page.getByRole('button',{name:'Review catalog configuration plan',exact:true}).click();await page.getByRole('heading',{name:'Catalog configuration plan',exact:true}).waitFor();
  const changes=await page.evaluate(()=>CATALOG_PLAN.changes);assert.equal(changes.filter(change=>change.action!=='linked').length,28);assert.ok(await page.getByRole('table',{name:'Proposed catalog configuration',exact:true}).isVisible());await page.screenshot({path:'test-results/phase4-catalog-plan.png'});
  await page.getByRole('button',{name:'Apply catalog configuration',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await page.locator('.catalog-checklist').waitFor();await idle();prepared=await page.evaluate(()=>S);
  for(const before of baseline.state.products){const after=prepared.products.find(p=>p.id===before.id);assert.ok(after,before.code+' stable ID');for(const key of ['rate','tax','tiers','min','minQty','m','on','priceConfigured'])assert.deepEqual(after[key],before[key],before.code+' preserved '+key);}
  const assignments=await page.evaluate(()=>Catalog.manifest.filter(e=>e.placeholder).map(e=>{const p=Catalog.match(e,S).product;return {code:e.code,id:p?.id,on:p?.on,template:DP.templateAssignment(p)?.assignment.id};}));assert.equal(assignments.length,28);assert.ok(assignments.every(p=>p.id&&p.template&&p.on===0));return assignments;
 });
 await check('Phase 4 browser: catalog preparation is idempotent and new quotation selector excludes inactive products',async()=>{
  await page.getByRole('button',{name:'Review catalog configuration plan',exact:true}).click();await page.getByRole('heading',{name:'Catalog configuration plan',exact:true}).waitFor();assert.equal(await page.evaluate(()=>CATALOG_PLAN.changes.length),0);await close();
  await page.evaluate(()=>{Q=newQ();go('new');openCat();});const ids=await page.locator('#cl .pc').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('onclick')));assert.equal(ids.length,baseline.state.products.filter(p=>p.on).length);for(const entry of prepared.products.filter(p=>!p.on))assert.ok(!ids.some(value=>value.includes("'"+entry.id+"'")));await close();
 });
 await check('Phase 4 browser: shared template manager uses the existing editor for all four template families',async()=>{
  await catalog();await page.getByRole('button',{name:'Manage catalog templates',exact:true}).click();
  for(const name of ['Print Product','Area Product','Promotional Gift','Stationery Product'])assert.ok(await page.getByRole('button',{name:'Edit '+name,exact:true}).isVisible());
  await page.getByRole('button',{name:'Edit Print Product',exact:true}).click();assert.equal(await page.locator('#field-list > fieldset').count(),4);await close();
 });
 await check('Phase 4 browser: catalog backend totals remain global across search, category, status, template and pagination',async()=>{
  await catalog();const global=await page.locator('#catalog-counts .cards b').allTextContents();assert.deepEqual(global,['40','0','28','12']);
  await filter('Products per page','10');assert.equal(await page.locator('.catalog-checklist tbody tr').count(),10);await page.getByRole('button',{name:'Next catalog page',exact:true}).click();await page.getByText('Page 2 of 4',{exact:true}).waitFor();assert.deepEqual(await page.locator('#catalog-counts .cards b').allTextContents(),global);
  await filter('Catalog category','Promotional Gifts');assert.ok(await page.locator('.catalog-checklist tbody tr').count()>0);assert.ok((await page.locator('.catalog-checklist tbody tr td:nth-child(2)').allTextContents()).every(t=>t==='Promotional Gifts'));
  await resetFilters();await filter('Catalog status','Inactive (Price Pending)');assert.ok((await page.locator('.catalog-checklist tbody tr td:nth-child(4)').allTextContents()).every(t=>t==='Inactive (Price Pending)'));
  await resetFilters();await filter('Assigned template','Area Product');assert.ok((await page.locator('.catalog-checklist tbody tr td:nth-child(3)').allTextContents()).every(t=>t==='Area Product'));
  await resetFilters();await page.getByRole('textbox',{name:'Search required products',exact:true}).fill('Envelope');await page.getByText('1 matching required products.',{exact:true}).waitFor();assert.equal(await page.locator('.catalog-checklist tbody tr').count(),1);assert.deepEqual(await page.locator('#catalog-counts .cards b').allTextContents(),global);
  await page.getByRole('button',{name:'Review product',exact:true}).click();await page.getByRole('heading',{name:'Edit product',exact:true}).waitFor();assert.equal(await page.getByLabel('Product code',{exact:true}).inputValue(),'GD-EN');await close();
  await page.getByRole('textbox',{name:'Search required products',exact:true}).fill('no-such-required-product');await page.getByText('No required products match these filters.',{exact:true}).waitFor();await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.locator('.catalog-checklist').waitFor();
 });
 await check('Phase 4 browser: checklist has a recoverable error and stays usable on mobile',async()=>{
  await page.route('**/api/catalog/checklist?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Controlled catalog availability fixture'})}));await page.evaluate(()=>loadCatalogChecklist());await page.getByRole('button',{name:'Retry catalog verification',exact:true}).waitFor();await page.unroute('**/api/catalog/checklist?*');await page.getByRole('button',{name:'Retry catalog verification',exact:true}).click();await page.locator('.catalog-checklist').waitFor();
  await page.setViewportSize({width:390,height:844});const size=await bounds();assert.ok(size.scroll<=size.width+1,JSON.stringify(size));await page.screenshot({path:'test-results/phase4-catalog-mobile.png'});await page.setViewportSize({width:1440,height:1000});
 });
 await check('Phase 4 browser: Admin creates an additional public field and product-specific override without changing siblings',async()=>{
  await page.evaluate(()=>prodForm(S.products.find(p=>p.code==='GD-EN').id));const size=page.locator('#field-list > fieldset').filter({has:page.locator('input[value="size"]')});await commit(size.getByLabel('Label',{exact:true}),'Envelope Size');await page.getByRole('button',{name:'+ Add specification',exact:true}).click();const extra=page.locator('#field-list > fieldset').last();await commit(extra.getByLabel('Key',{exact:true}),'customerReference');await commit(page.locator('#field-list > fieldset').last().getByLabel('Label',{exact:true}),'Customer Reference');await page.getByRole('button',{name:'Save product',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await idle();
  const state=await page.evaluate(()=>S);assert.ok(state.products.find(p=>p.code==='GD-EN').catalogTemplate.overrides.size);assert.ok(!state.products.find(p=>p.code==='GD-IN').catalogTemplate.overrides.size);await catalog();
 });
 await check('Phase 4 browser: synthetic approved rates and activation exist only in the disposable fixture',async()=>{
  fixtures=await page.evaluate(async codes=>{const output=[];for(const code of codes){const raw=S.products.find(p=>p.code===code),p=DP.resolveProduct(raw,S.set);for(const f of p.f)if(['sel','multi'].includes(f.t)){f.o=['A','B'].map((suffix,index)=>['fixture_'+code+'_'+f.k+'_'+suffix,'f',index+1]);f.optionMeta=Object.fromEntries(f.o.map((o,index)=>[o[0],{label:'Fixture '+f.l+' '+(index?'B':'A'),enabled:true,approved:true,order:index}]));}p.rate=10;p.tax=18;p.tiers=null;p.priceConfigured=true;p.on=1;const data=DP.stripProduct(p,S.set),current=await api('/api/products/'+p.id);await api('/api/products/'+p.id,{method:'PUT',body:JSON.stringify({version:current.version,data})});output.push({code,id:p.id});}adopt(await api('/api/state'));return output;},[...printCodes,'PR-LED','PG-UM','PR-OF','GD-SM','GD-CG','PG-GK']);
  await catalog();await filter('Catalog status','Active');assert.equal(await page.locator('#catalog-counts .cards b').last().textContent(),'25');return {fixtureProducts:fixtures.length,realBusinessApproval:false};
 });
 await check('Phase 4 browser: forged choices and fractional page counts cannot be added through the existing configurator',async()=>{
  await page.evaluate(id=>{Q=newQ();Q.cid='C1';go('new');openCfg(id);CF.size='forged-unapproved-size';refCalc();},fixtures.find(p=>p.code==='GD-EN').id);assert.ok((await page.locator('#cc').textContent()).includes('Invalid option'));await page.getByRole('button',{name:'Add to quotation',exact:true}).click();assert.equal(await page.evaluate(()=>Q.items.length),0);await close();
  await page.evaluate(id=>openCfg(id),fixtures.find(p=>p.code==='GD-CT').id);await commit(page.getByRole('spinbutton',{name:'Page Count *',exact:true}),'1.5');assert.ok((await page.locator('#cc').textContent()).includes('Invalid numeric value'));await page.getByRole('button',{name:'Add to quotation',exact:true}).click();assert.equal(await page.evaluate(()=>Q.items.length),0);await close();
 });
 for(const code of printCodes)await check('Phase 4 browser: '+code+' dynamically loads, validates, saves, restores and prints eligible specifications',()=>configureAndSave(code));
 for(const code of ['PR-LED','PG-UM','PR-OF','GD-SM','GD-CG','PG-GK'])await check('Phase 4 browser: '+code+' reuses its assigned template through quotation editing and customer PDF',()=>configureAndSave(code));
 await check('Phase 4 browser: digital services avoid physical fields, stationery binding is optional and area installation is optional',async()=>{
  const result=await page.evaluate(()=>{const get=code=>effectiveProd(S.products.find(p=>p.code===code).id);return {digital:['GD-SM','GD-CG'].map(code=>get(code).f.filter(f=>['dim','SIZE_BREAKDOWN'].includes(f.t)||['size','paper','sides','finish'].includes(f.k)).length),binding:get('PR-OF').f.find(f=>f.k==='binding').required,installation:get('PR-LED').f.find(f=>f.k==='installation').required,gift:DP.templateAssignment(S.products.find(p=>p.code==='PG-UM')).key};});assert.deepEqual(result,{digital:[0,0],binding:false,installation:false,gift:'giftTemplate'});
 });
 await check('Phase 4 browser: historical quotation snapshots and approved existing products remain unchanged',async()=>{
  const current=await page.evaluate(async()=>({state:(await api('/api/state')).state,legacy:(await api('/api/quotations/Q3')).data}));assert.deepEqual(current.legacy,baseline.legacy);for(const before of baseline.state.products.filter(p=>p.on))assert.deepEqual(current.state.products.find(p=>p.id===before.id),before);assert.deepEqual(exceptions,[]);
 });
 await check('Phase 4 browser: catalog-only staff edit labels and add a pending option without seeing or changing private prices',async()=>{
  const limited={username:'phase4catalogeditor'+crypto.randomBytes(4).toString('hex'),password:crypto.randomUUID()+'-Fixture'};
  await page.evaluate(async limited=>api('/api/users',{method:'POST',body:JSON.stringify({...limited,name:'Catalog Editor Fixture',role:'Employee',permissions:['product.view','product.manage']})}),limited);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill(limited.username);await page.getByLabel('Password',{exact:true}).fill(limited.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('nav').waitFor();await idle();await page.evaluate(()=>go('prod'));
  assert.ok((await page.locator('table tr td:nth-child(4)').allTextContents()).every(text=>text==='Pricing access restricted'));assert.ok((await page.locator('table tr td:nth-child(5)').allTextContents()).every(text=>text==='Restricted'));
  const id=fixtures.find(p=>p.code==='GD-EN').id;await page.evaluate(id=>prodForm(id),id);await page.getByRole('heading',{name:'Edit product',exact:true}).waitFor();assert.equal(await page.locator('#pe_rate,#pe_tax,#pe_tiers').count(),0);assert.equal(await page.getByLabel('Rate (INR; blank = pending)',{exact:true}).count(),0);
  const field=()=>page.locator('#field-list > fieldset').filter({has:page.locator('input[value="size"]')});await commit(field().getByLabel('Label',{exact:true}),'Limited Envelope Size');await field().getByRole('button',{name:'+ Add managed option',exact:true}).click();const added=field().locator('.option-editor').last(),key=await added.getByLabel('Option key',{exact:true}).inputValue();await commit(added.getByLabel('Display name',{exact:true}),'Limited pending size');assert.equal(await page.getByLabel('Rate (INR; blank = pending)',{exact:true}).count(),0);assert.equal(await page.getByLabel('Rate explicitly approved',{exact:true}).count(),0);await added.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/phase4-catalog-limited.png'});
  await page.getByRole('button',{name:'Save product',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await idle();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill(process.env.TEST_USERNAME);await page.getByLabel('Password',{exact:true}).fill(process.env.TEST_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('nav').waitFor();await idle();
  const saved=await page.evaluate(async id=>{const row=await api('/api/products/'+id);return {raw:row.data,effective:DP.resolveProduct(row.data,S.set)};},id),size=saved.effective.f.find(f=>f.k==='size');assert.equal(saved.raw.rate,10);assert.equal(size.l,'Limited Envelope Size');assert.equal(size.o.find(option=>option[0]===key)[2],null);assert.equal(size.optionMeta[key].approved,false);assert.equal(size.optionMeta[key].enabled,false);assert.equal(size.o.find(option=>option[0]==='fixture_GD-EN_size_B')[2],2);assert.deepEqual(exceptions,[]);
  return {product:id,pendingAmount:null,privateBaseRateUnchanged:true};
 });
})().catch(async error=>{console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:'test-results/phase4-browser-failure.png'}).catch(()=>{});}).finally(async()=>{fs.writeFileSync('test-results/phase4-browser.json',JSON.stringify({results,exceptions},null,2));if(browser)await browser.close();});
