'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const DP = require('../shared/domain');

function workspace() {
  const elements = new Map();
  const node = selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML:'',textContent:'',style:{},dataset:{},value:'',checked:false,append(){},remove(){} });
    return elements.get(selector);
  };
  for (const selector of ['#app','#modal','#toast','#cc','#field-list','#product-rules','#config-fields','#config-quantity']) node(selector);
  const context = vm.createContext({ DP,crypto:crypto.webcrypto,console,AbortController,URLSearchParams,Blob,URL,
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

test('admin converts existing single conditions to ALL/ANY rules and edits Equals/Not Equals',()=>{
  const app=workspace();
  app.run("prodForm('p1');const index=PRODUCT_DRAFT.f.findIndex(f=>f.k==='customDim');addFieldCondition(index);setConditionMode(index,'ANY');updateFieldCondition(index,1,'operator','not_equals');updateFieldCondition(index,1,'key','mat');updateFieldCondition(index,1,'value','Kraft Board');renderFields()");
  const group=JSON.parse(app.run("JSON.stringify(PRODUCT_DRAFT.f.find(f=>f.k==='customDim').when)"));
  assert.equal(group.mode,'ANY');
  assert.deepEqual(group.conditions[0],{key:'size',operator:'equals',value:'Custom'});
  assert.deepEqual(group.conditions[1],{key:'mat',operator:'not_equals',value:'Kraft Board'});
  const editor=app.node('#field-list').innerHTML;
  assert.match(editor,/ALL conditions match/);assert.match(editor,/ANY condition matches/);assert.match(editor,/Not Equals/);
  assert.doesNotMatch(editor,/<(?:select|input)\b[^>]*aria-label=[^>]*aria-label=/);
  app.run("removeFieldCondition(index,1);removeFieldCondition(index,0)");
  assert.equal(app.run("PRODUCT_DRAFT.f.find(f=>f.k==='customDim').when"),undefined);
});

test('admin customizes legacy T-shirt sizes, adds kids labels, reorders, disables and sets price adjustments',()=>{
  const app=workspace();app.node('#pe_sizes').checked=true;
  app.run("prodForm('p7');customizeLegacySizes();const index=PRODUCT_DRAFT.f.length-1;addStandardSizes(index);addProductSize(index);const sizes=PRODUCT_DRAFT.f[index].sizes;const custom=sizes.at(-1);custom.label='Kids 6–8';custom.key='kids_6_8';custom.price=12.5;sizes[0].enabled=false;moveProductSize(index,sizes.length-1,-1)");
  const field=JSON.parse(app.run('JSON.stringify(PRODUCT_DRAFT.f.at(-1))'));
  assert.equal(field.k,'sz');assert.equal(field.t,'SIZE_BREAKDOWN');assert.equal(app.run('PRODUCT_DRAFT.sizes'),0);
  for(const key of ['XS','S','M','L','XL','XXL','3XL','4XL','5XL'])assert.ok(field.sizes.some(s=>s.key===key));
  assert.equal(field.sizes.at(-2).label,'Kids 6–8');assert.equal(field.sizes.at(-2).price,12.5);
  assert.equal(field.sizes[0].enabled,false);assert.match(app.node('#field-list').innerHTML,/Price adjustment/);
});

test('conditional configurator clears hidden descendants while preserving visible required and multiselect values',()=>{
  const app=workspace();
  app.run(`Q=newQ();const p=prod('p7');p.f.push({k:'details',l:'Custom details',t:'txt',when:{mode:'ALL',conditions:[{key:'fab',operator:'equals',value:'Cotton'},{key:'meth',operator:'not_equals',value:'Sublimation'}]}});p.f.push({k:'followup',l:'Followup',t:'txt',when:{key:'details',equals:'custom'}});p.f.push({k:'extras',l:'Extras',t:'multi',required:false,o:[['Bag','f',0],['Tag','f',0]]});openCfg('p7');cs_('details','custom');cs_('extras',['Bag','Tag'])`);
  assert.match(app.node('#config-fields').innerHTML,/Followup/);
  app.run("cs_('meth','Sublimation')");
  assert.equal(app.run("'details' in CF"),false);assert.equal(app.run("'followup' in CF"),false);
  assert.doesNotMatch(app.node('#config-fields').innerHTML,/Custom details|Followup/);
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(CF.extras)')),['Bag','Tag']);
  assert.match(app.node('#config-fields').innerHTML,/multiple size=/);
  app.run("cs_('meth','DTF')");assert.match(app.node('#config-fields').innerHTML,/Custom details/);
});

test('reusable size quantities calculate prices, omit disabled sizes and restore saved quotation edits',()=>{
  const app=workspace();
  app.run(`Q=newQ();const p=prod('p7');p.sizes=0;p.minQty=1;p.tiers=null;p.rate=100;p.f.push({k:'sizeCounts',l:'Uniform sizes',t:'SIZE_BREAKDOWN',sizes:[{key:'xs',label:'XS',enabled:true,price:0},{key:'kids',label:'Kids 6–8',enabled:true,price:10},{key:'old',label:'Retired size',enabled:false,price:0}]},{k:'quantityNote',l:'Quantity note',t:'txt',when:{key:'qty',equals:15}});openCfg('p7');setSizeQuantity('sizeCounts','xs','5');setSizeQuantity('sizeCounts','kids','10')`);
  assert.match(app.node('#modal').innerHTML,/Kids 6–8/);assert.doesNotMatch(app.node('#modal').innerHTML,/Retired size/);
  assert.doesNotMatch(app.node('#modal').innerHTML,/<(?:select|input)\b[^>]*aria-label=[^>]*aria-label=/);
  assert.equal(app.run('calc(p,CF).qty'),15);assert.equal(app.run('calc(p,CF).sub'),160000);
  assert.equal(app.run('CF.qty'),15);assert.match(app.node('#config-fields').innerHTML,/Quantity note/);
  app.run("Q.items=[mkItem(p,CF,'uniform')];openCfg('p7','uniform')");
  assert.equal(app.run('CF.sizeCounts.xs'),5);assert.equal(app.run('CF.sizeCounts.kids'),10);
  assert.match(app.node('#modal').innerHTML,/Total Quantity: 15/);
  app.run("setSizeQuantity('sizeCounts','xs','-1')");assert.match(app.node('#cc').innerHTML,/nonnegative/);
});

test('PDF toggles cannot enable internal fields and customer preview uses safe snapshot specifications',()=>{
  const app=workspace();
  app.run(`prodForm('p1');PRODUCT_DRAFT.f.push({k:'internalNotes',l:'Internal notes',t:'txt',show_on_customer_pdf:true});renderFields();const p=prod('p1');p.f.push({k:'customerRequirements',l:'Design requirements',t:'txt',show_on_customer_pdf:true},{k:'internalNotes',l:'Internal notes',t:'txt',show_on_customer_pdf:true});const cfg=defCfg(p);cfg.customerRequirements='CUSTOMER-ARTWORK';cfg.internalNotes='SECRET-ARTWORK';const q=S.quotes[0];q.items=[mkItem(p,cfg,'line','SECRET-LINE-NOTES')];`);
  assert.match(app.node('#field-list').innerHTML,/disabled[^>]*[^<]*> Show on customer PDF \(internal fields are always excluded\)/);
  const html=app.run('docHTML(S.quotes[0])');assert.match(html,/CUSTOMER-ARTWORK/);assert.doesNotMatch(html,/SECRET-ARTWORK|SECRET-LINE-NOTES/);
});

test('conditional size breakdown switches to ordinary quantity while hidden and restores the size editor when shown',()=>{
  const app=workspace();
  app.run(`Q=newQ();const p=prod('p7');p.sizes=0;p.minQty=1;p.tiers=null;p.rate=100;p.f.push({k:'sizes',l:'Conditional sizes',t:'SIZE_BREAKDOWN',when:{key:'fab',equals:'Cotton'},sizes:[{key:'kids',label:'Kids',enabled:true,price:0}]});openCfg('p7');setSizeQuantity('sizes','kids','5');cs_('fab','Dri-fit Polyester')`);
  assert.match(app.node('#config-quantity').innerHTML,/>Quantity</);assert.doesNotMatch(app.node('#config-fields').innerHTML,/Conditional sizes/);
  assert.equal(app.run("'sizes' in CF"),false);app.run("cs_('qty',12)");assert.equal(app.run('calc(p,CF).qty'),12);
  app.run("cs_('fab','Cotton')");assert.equal(app.node('#config-quantity').innerHTML,'');assert.match(app.node('#config-fields').innerHTML,/Conditional sizes/);
  assert.match(app.node('#cc').innerHTML,/Enter quantities/);
});

test('review: conditional dropdowns restore their displayed defaults without restoring hidden selections',()=>{
 const app=workspace();
 app.run(`Q=newQ();const p=prod('p1');p.f.push({k:'conditional',l:'Conditional finish',t:'sel',o:[['Plain','f',0],['Paid','u',2]],when:{key:'shape',equals:'Custom'}});openCfg('p1');cs_('shape','Custom');cs_('conditional','Paid');cs_('shape','Rectangle')`);
 assert.equal(app.run("'conditional' in CF"),false);
 app.run("cs_('shape','Custom')");
 assert.equal(app.run('CF.conditional'),'Plain');
 assert.equal(app.run('calc(p,CF).err'),null);
});

test('review: initial hidden values are cleared and size edits initialize quantity-dependent dropdowns',()=>{
 const app=workspace();
 app.run(`Q=newQ();const p=prod('p7');p.f.push({k:'bulk',l:'Bulk handling',t:'sel',o:[['Standard','f',0]],when:{key:'qty',equals:10}});openCfg('p7')`);
 assert.equal(app.run("'bulk' in CF"),false);
 app.run("setSizeQuantity('sz','S','10')");
 assert.equal(app.run('CF.bulk'),'Standard');
 assert.equal(app.run('calc(p,CF).err'),null);
});

test('review: charge condition choices exclude size maps while retaining scalar fields',()=>{
 const app=workspace();
 app.run("prodForm('p7');customizeLegacySizes();addRule('charges')");
 const html=app.run('rulesEditor()');
 assert.doesNotMatch(html,/<option value="sz"/);
 assert.match(html,/<option value="qty"/);
 assert.match(html,/<option value="fab"/);
});

test('review: zero-count disabled sizes can be cleared when editing historical quotations',()=>{
 const app=workspace();
 app.run(`Q=newQ();const p=prod('p7');p.sizes=0;p.minQty=1;p.tiers=null;p.rate=100;p.f.push({k:'counts',l:'Sizes',t:'SIZE_BREAKDOWN',sizes:[{key:'kid',label:'Kids',enabled:true,price:0},{key:'old',label:'Retired',enabled:true,price:0}]});const config={...defCfg(p),counts:{kid:5,old:0}};Q.items=[mkItem(p,config,'historical')];p.f.at(-1).sizes[1].enabled=false;openCfg('p7','historical')`);
 assert.match(app.node('#modal').innerHTML,/Clear unavailable quantities/);
 assert.match(app.node('#modal').innerHTML,/unavailable: old/);
 assert.ok(app.run('calc(p,CF).err'));
 app.run("clearUnavailableSizes('counts')");
 assert.equal(app.run("'old' in CF.counts"),false);
 assert.equal(app.run('calc(p,CF).err'),null);
 assert.equal(app.run('calc(p,CF).qty'),5);
});
