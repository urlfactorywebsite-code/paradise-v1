'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const DP = require('../shared/domain');
const Catalog = require('../shared/catalog');
const {validateState} = require('../server/validation');

function workspace() {
  const elements = new Map();
  const node = selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML:'',textContent:'',style:{},dataset:{},value:'',checked:false,append(){},remove(){} });
    return elements.get(selector);
  };
  for (const selector of ['#app','#modal','#toast','#cc','#field-list','#product-rules','#config-fields','#config-quantity','#catalog-counts','#catalog-results','#catalog-template-choice']) node(selector);
  const context = vm.createContext({ DP,Catalog,crypto:crypto.webcrypto,console,AbortController,URLSearchParams,Blob,URL,
    setTimeout(fn,ms){ const timer=setTimeout(fn,ms);timer.unref();return timer; },clearTimeout,
    window:{addEventListener(){}},location:{hash:'#dash'},
    document:{body:{classList:{toggle(){}}},querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],createElement:()=>node('element'),addEventListener(){}},
    fetch:async()=>({ok:true,status:200,json:async()=>({data:[]})}),
  });
  for (const file of ['app.js','backend-ui.js','srs-ui.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8').replace(/start\(\);\s*$/,''),context,{filename:file});
  context.initial={state:DP.seed({demo:true}),revision:1,user:{id:'admin',name:'Administrator',role:'Administrator'}};
  vm.runInContext('adopt(initial);',context);
  return {run:code=>vm.runInContext(code,context),node};
}

test('Phase 4 UI: all four shared template editors reuse the existing field editor and stable keys',()=>{
 const app=workspace();
 app.run('catalogTemplatesForm()');
 for(const name of ['Print Product','Area Product','Promotional Gift','Stationery Product'])assert.ok(app.node('#modal').innerHTML.includes(name),name);
 for(const id of ['print_product','area_product','promotional_gift','stationery_product']){
  app.run(`catalogTemplateForm('${id}')`);
  assert.equal(app.run('PRODUCT_DRAFT.f.length'),id==='promotional_gift'?7:4);
  assert.match(app.node('#modal').innerHTML,/Save shared template/);
  assert.doesNotMatch(app.node('#modal').innerHTML,/Remove specification/);
  assert.match(app.node('#modal').innerHTML,/readonly/);
 }
 assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='binding').required"),false);
});

test('Phase 4 UI: Print assignment preserves existing local IDs and maps Paper while field order and overrides stay product-specific',()=>{
 const app=workspace();app.run("const envelope=S.products.find(p=>p.code==='GD-EN');prodForm(envelope.id);const original=JSON.stringify(envelope);$('#catalog-template-choice').value='print_product';assignCatalogTemplate();const paperKey=PRODUCT_DRAFT.catalogTemplate.map.paper;");
 assert.equal(app.run('paperKey'),'material');
 assert.equal(app.run("PRODUCT_DRAFT.f.filter(f=>f.k===paperKey).length"),1);
 app.run("PRODUCT_DRAFT.f.find(f=>f.k==='size').l='Envelope Size';moveProductField(PRODUCT_DRAFT.f.findIndex(f=>f.k==='size'),-1);addProductField();PRODUCT_DRAFT.f.at(-1).k='reference';PRODUCT_DRAFT.f.at(-1).l='Customer reference';const raw=DP.stripProduct(PRODUCT_DRAFT,S.set);");
 assert.equal(app.run('raw.catalogTemplate.overrides.size.l'),'Envelope Size');
 assert.ok(app.run('raw.catalogTemplate.order.length>0'));
 assert.equal(app.run("raw.f.some(f=>f.k==='reference')"),true);
 assert.equal(app.run('JSON.stringify(envelope)===original'),true);
 app.run("resetProductTemplateField('size');toggleProductTemplateField('finish',false)");
 assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='size').l"),'Size');
 assert.equal(app.run("PRODUCT_DRAFT.f.some(f=>f.k==='finish')"),false);
 assert.equal(app.run("S.products.find(p=>p.code==='GD-BB').catalogTemplate"),undefined);
});

test('Phase 4 UI: four template families render dynamically and restore approved fixture configuration values',()=>{
 const app=workspace();
 for(const [id,code] of [['print_product','GD-EN'],['area_product','PR-LED'],['promotional_gift','PG-UM'],['stationery_product','GD-BB']]){
  app.run(`const raw${id}=S.products.find(p=>p.code==='${code}');Object.assign(raw${id},DP.assignProductTemplate(raw${id},'${id}',S.set));raw${id}.on=1;raw${id}.priceConfigured=true;raw${id}.rate=10;const projected${id}=DP.resolveProduct(raw${id},S.set);for(const f of projected${id}.f)if(['sel','multi'].includes(f.t)){f.o=[['Approved fixture','u',1]];f.optionMeta={'Approved fixture':{enabled:true,approved:true}};}Object.assign(raw${id},DP.stripProduct(projected${id},S.set));Q=newQ();openCfg(raw${id}.id);`);
  const expected=id==='area_product'?['Lamination','Installation']:id==='promotional_gift'?['Printing Method','Artwork Requirement']:id==='stationery_product'?['Printing Sides','Binding']:['Printing Sides','Finish'];
  for(const label of expected)assert.ok(app.node('#modal').innerHTML.includes(label),id+': '+label);
  app.run("var selectField=effectiveProd(CF._p).f.find(f=>f.t==='sel');cs_(selectField.k,'Approved fixture');CF.qty=100;CF.w=2;CF.h=3;CF.u='ft';addItem();openCfg(Q.items[0].pid,Q.items[0].id);");
  assert.ok(app.node('#modal').innerHTML.includes('Approved fixture'));
  assert.equal(app.run('Q.items.length'),1);
 }
});

test('Phase 4 UI: metadata save preserves unconfigured nullable pricing and inactive state',async()=>{
 const app=workspace();app.run("const p=S.products.find(p=>p.code==='GD-EN');p.rate=null;p.tax=null;p.priceConfigured=false;p.on=0;prodForm(p.id);persist=async()=>true;render=()=>{};");
 const fields={name:'Reviewed Envelope',code:'GD-EN',cat:'c1',description:'',unit:'item',type:'Product',m:'unit',taxMode:'exclusive',rate:'',min:'0',minQty:'1',tax:'',tiers:''};
 for(const [key,value]of Object.entries(fields))app.node('#pe_'+key).value=value;app.node('#pe_sizes').checked=false;
 await app.run('prodSave(p.id)');
 assert.equal(app.run('p.priceConfigured'),false);assert.equal(app.run('p.rate'),null);assert.equal(app.run('p.tax'),null);assert.equal(app.run('p.on'),0);
});

test('Phase 4 UI: checklist displays backend global counts, actual statuses and readiness warnings while filtering',async()=>{
 const app=workspace(),response={rows:[{code:'GD-EN',name:'Envelope <img src=x>',productId:'p13',categoryName:'Graphic Designing',templateName:'Print Product',status:'Inactive (Price Pending)',configurationReadiness:{status:'Complete'},pricingReadiness:{status:'Pending'},missingRequirements:['Base pricing unavailable'],warnings:['Business review required']}],counts:{required:40,missing:2,inactive:28,active:10},pagination:{page:1,pageSize:20,total:1,totalPages:1}};
 app.run(`var requestPath='';api=async path=>{requestPath=path;return ${JSON.stringify(response)}};`);
 await app.run("setCatalogFilter('template','print_product')");
 await app.run('loadCatalogChecklist()');
 assert.match(app.node('#catalog-counts').innerHTML,/<b>40<\/b>/);assert.match(app.node('#catalog-counts').innerHTML,/<b>28<\/b>/);
 assert.match(app.node('#catalog-results').innerHTML,/1 matching required products/);assert.match(app.node('#catalog-results').innerHTML,/Inactive \(Price Pending\)/);assert.match(app.node('#catalog-results').innerHTML,/Base pricing unavailable/);
 assert.match(app.node('#catalog-results').innerHTML,/&lt;img src=x&gt;/);assert.doesNotMatch(app.node('#catalog-results').innerHTML,/<img src=x>/);
 assert.match(app.run('requestPath'),/template=print_product/);
});

test('Phase 4 UI: checklist errors and empty states are actionable and permission-limited',async()=>{
 const app=workspace();app.run("api=async()=>{throw new Error('Catalog unavailable')};");await app.run('loadCatalogChecklist()');
 assert.match(app.node('#catalog-results').innerHTML,/Catalog unavailable/);assert.match(app.node('#catalog-results').innerHTML,/Retry catalog verification/);
 app.run("CATALOG_DATA={rows:[],counts:{required:40,missing:0,inactive:28,active:12},pagination:{page:1,total:0,totalPages:1}};renderCatalogChecklist()");
 assert.match(app.node('#catalog-results').innerHTML,/No required products match/);
 app.run("AUTH.role='Employee';AUTH.permissions=['product.view'];S.role='Employee';");assert.equal(app.run("allowedView('catalog')"),false);
 app.run("AUTH.permissions=['pricing.manage'];");assert.equal(app.run("allowedView('catalog')"),true);assert.doesNotMatch(app.run('V.catalog()'),/Review catalog configuration plan/);
});

test('Phase 4 UI: exceptional product mapping warnings permit preparation and existing assignments remain reviewable',()=>{
 const app=workspace();
 for(const code of ['GD-SM','GD-CG','PR-OF','PG-GK']){
  app.run(`prodForm(S.products.find(p=>p.code==='${code}').id);preparePhase4Product();`);
  assert.ok(app.run('DP.templateAssignment(PRODUCT_DRAFT)'),code);
  assert.match(app.run('catalogTemplateAssignmentPanel()'),/Prepare Phase 4 configuration/,code);
  if(code.startsWith('GD-')){
   assert.equal(app.run("PRODUCT_DRAFT.f.some(f=>['size','paper','sides','finish'].includes(f.k)||f.t==='dim')"),false,code);
   assert.equal(app.run("PRODUCT_DRAFT.f.some(f=>f.k==='designRequirements')"),true,code);
  }
 }
 app.run("prodForm(S.products.find(p=>p.code==='GD-EN').id);$('#catalog-template-choice').value='stationery_product';assignCatalogTemplate();const beforeConflict=JSON.stringify(PRODUCT_DRAFT);preparePhase4Product();");
 assert.equal(app.run('JSON.stringify(PRODUCT_DRAFT)===beforeConflict'),true);
});

test('Phase 4 UI: out-of-order catalog responses cannot replace the newest filter results',async()=>{
 const app=workspace();app.run('var pending=[];api=path=>new Promise(resolve=>pending.push(resolve));var firstRequest=loadCatalogChecklist();CATALOG_FILTER.q="Envelope";var latestRequest=loadCatalogChecklist();');
 app.run('pending[1]({rows:[],counts:{required:40,missing:0,inactive:28,active:12},pagination:{page:1,total:0,totalPages:1},coverage:{source:"Documented manifest only; complete SRS unverified."}})');
 await app.run('latestRequest');
 const latest=app.node('#catalog-results').innerHTML;
 app.run('pending[0]({rows:[{name:"Stale product"}],counts:{required:1},pagination:{page:1,total:1,totalPages:1}})');
 await app.run('firstRequest');
 assert.equal(app.node('#catalog-results').innerHTML,latest);
 assert.match(app.node('#catalog-counts').innerHTML,/complete SRS unverified/);
 assert.match(app.run('V.catalog()'),/Products per page/);
});

test('Phase 4 UI: Admin preview identifies the record, template and unresolved business mapping before applying',async()=>{
 const app=workspace();app.run('api=async()=>({revision:4,changes:[{code:"GD-EN",id:"p13",action:"configured",templateId:"print_product",templateName:"Print Product"}],issues:[{code:"GD-SM",reason:"Confirm digital deliverables"}]});');
 await app.run('prepareCatalogPlan()');
 for(const value of ['Envelope','p13','Print Product','GD-SM: Confirm digital deliverables','Apply catalog configuration'])assert.ok(app.node('#modal').innerHTML.includes(value),value);
 assert.equal(app.run('CATALOG_PLAN.revision'),4);
});

test('Phase 4 UI: catalog-only metadata edits preserve omitted private pricing rather than submitting blank replacement values',async()=>{
 const app=workspace();app.run("AUTH.role='Employee';AUTH.permissions=['product.manage'];S.role='Employee';const p=S.products.find(p=>p.code==='GD-EN');for(const key of ['rate','tax','min','tiers','charges'])delete p[key];for(const f of p.f)if(f.o)f.o=f.o.map(o=>[o[0]]);prodForm(p.id);persist=async()=>true;render=()=>{};");
 assert.doesNotMatch(app.node('#modal').innerHTML,/id="pe_rate"|id="pe_tax"|id="pe_tiers"/);
 for(const [key,value]of Object.entries({name:'Catalog review',code:'GD-EN',cat:'c1',description:'',unit:'item',type:'Product'}))app.node('#pe_'+key).value=value;
 app.node('#pe_sizes').checked=false;await app.run('prodSave(p.id)');
 assert.equal(app.run('p.name'),'Catalog review');
 for(const key of ['rate','tax','min','tiers','charges'])assert.equal(app.run(`Object.hasOwn(p,'${key}')`),false,key);
});

test('Phase 4 UI: option builders preserve private and pending rates through server validation roundtrips',()=>{
 const app=workspace();app.run("AUTH.role='Employee';AUTH.permissions=['product.manage'];S.role='Employee';prodForm(S.products.find(p=>p.code==='GD-EN').id);fieldOptions(0,'Existing choice\\nNew choice | f | 0');");
 assert.equal(app.run('PRODUCT_DRAFT.f[0].o.every(option=>option.length===1)'),true);
 app.run('addProductField();var addedField=PRODUCT_DRAFT.f.length-1;changeFieldType(addedField,"sel");addManagedOption(addedField);');
 assert.equal(app.run('PRODUCT_DRAFT.f[addedField].o.every(option=>option.length===1)'),true);
 assert.equal(app.run('Object.values(PRODUCT_DRAFT.f[addedField].optionMeta).every(meta=>meta.enabled===false&&meta.approved===false)'),true);
 app.run("AUTH.role='Administrator';S.role='Administrator';fieldOptions(0,'Pending amount\\nExplicit included option | f | 0');");
 assert.equal(app.run('PRODUCT_DRAFT.f[0].o[0][2]'),null);
 assert.equal(app.run('PRODUCT_DRAFT.f[0].o[1][2]'),0);
 const adminApp=workspace();adminApp.run("prodForm(S.products.find(p=>p.code==='GD-EN').id);fieldOptions(0,'Pending amount\\nExplicit included option | f | 0');manageOptions(0);");
 const previous=DP.seed({demo:false}),next=structuredClone(previous),raw=JSON.parse(adminApp.run('JSON.stringify(DP.stripProduct(PRODUCT_DRAFT,S.set))'));
 next.products[next.products.findIndex(p=>p.id===raw.id)]=raw;
 const actor={id:'admin',name:'Administrator',role:'Administrator'},saved=validateState(next,previous,actor,()=> 'UNUSED'),field=saved.products.find(p=>p.id===raw.id).f[0];
 assert.equal(field.o[0][2],null);assert.equal(field.optionMeta['Pending amount'].enabled,false);assert.equal(field.optionMeta['Pending amount'].approved,false);
 assert.equal(field.o[1][2],0);assert.equal(field.optionMeta['Explicit included option'].approved,true);
 assert.deepEqual(DP.activeOptions(field).map(option=>option[0]),['Explicit included option']);
 const restored=validateState(structuredClone(saved),saved,actor,()=> 'UNUSED');
 assert.deepEqual(restored.products.find(p=>p.id===raw.id).f[0],field);
});

test('Phase 4 UI: omitted catalog rates remain restricted and pricing readers see disabled price controls while editing catalog metadata',()=>{
 const app=workspace();app.run("AUTH.role='Employee';AUTH.permissions=['product.view','product.manage'];S.role='Employee';for(const p of S.products){for(const key of ['rate','tax','min','tiers','charges'])delete p[key];for(const f of p.f)if(f.o)f.o=f.o.map(o=>[o[0]]);}prodForm('p13');manageOptions(0);");
 assert.match(app.run('V.prod()'),/Pricing access restricted/);assert.doesNotMatch(app.run('V.prod()'),/\u20b9|undefined/);
 assert.doesNotMatch(app.node('#modal').innerHTML+app.node('#field-list').innerHTML,/Rate \(INR; blank = pending\)<\/span>|Rate explicitly approved|id="pe_rate"|id="pe_tax"|Charge amount|\+ Add charge rule/);
 const reader=workspace();reader.run("AUTH.role='Employee';AUTH.permissions=['product.view','product.manage','pricing.view'];S.role='Employee';prodForm('p13');manageOptions(0);addManagedOption(0);");
 assert.match(reader.node('#field-list').innerHTML,/Rate \(INR; blank = pending\)<\/span><input[^>]*disabled/);
 assert.equal(reader.run('PRODUCT_DRAFT.f[0].o.at(-1).length'),3);assert.equal(reader.run('PRODUCT_DRAFT.f[0].o.at(-1)[2]'),null);
 reader.run("fieldOptions(0,'Standard | f | 99\\nNew reader choice | f | 40');");
 assert.equal(reader.run('PRODUCT_DRAFT.f[0].o[0][2]'),0);assert.equal(reader.run('PRODUCT_DRAFT.f[0].o[1][2]'),null);assert.equal(reader.run("PRODUCT_DRAFT.f[0].optionMeta['New reader choice'].approved"),false);
});


