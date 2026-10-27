'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DP = require('../shared/domain');
const { authorizeProductChanges } = require('../server/access');
const { cfg } = require('../server/validation');
const { quotationPdf } = require('../server/pdf');
const product = (f, extra = {}) => ({ id:'review', code:'REVIEW', name:'Review fixture', cat:'c1', m:'unit', rate:10, min:0, minQty:1, tax:18, on:1, f, ...extra });

test('review: fixed and package quantity conditions use the actual item quantity', () => {
 for (const m of ['fixed','package']) {
  const p = product([{k:'details',l:'Single item instructions',t:'txt',required:true,when:{key:'qty',equals:1}}], {m});
  assert.match(DP.calc(p,{qty:99}).err,/required/);
  const item = DP.mkItem(p,{qty:99,details:'One service'},'fixed');
  assert.ok(item); assert.equal(item.qty,1); assert.equal(item.cfg.qty,1);
  assert.ok(DP.customerSpecifications(item).includes('Single item instructions: One service'));
 }
});

test('review: malformed size definitions reach validation without authorization TypeErrors', () => {
 const admin = {role:'Administrator'}, old = product([]);
 for (const size of [null, false, 3, 'invalid', []]) {
  const changed = {...old,f:[{k:'sizes',l:'Sizes',t:'SIZE_BREAKDOWN',sizes:[size]}]};
  assert.doesNotThrow(() => authorizeProductChanges([changed],[old],admin));
  assert.ok(DP.pricingError(changed));
 }
});

test('review: scalar condition values must match text and built-in numeric reference types', () => {
 for (const [key,equals] of [['qty','10'],['w','4'],['h','3'],['u',4]]) {
  assert.ok(DP.fieldDefinitionError(product([{k:'details',l:'Details',t:'txt',when:{key,equals}}])),key);
 }
 const fields=[{k:'text',l:'Text',t:'txt'},{k:'details',l:'Details',t:'txt',when:{key:'text',equals:1}}];
 assert.ok(DP.fieldDefinitionError(product(fields)));
});

test('review: hidden dimension values cannot activate conditions or charges', () => {
 const p = product([
  {k:'mode',l:'Mode',t:'sel',o:[['Standard','f',0],['Custom','f',0]]},
  {k:'dimensions',l:'Custom dimensions',t:'dim',when:{key:'mode',equals:'Custom'}},
  {k:'details',l:'Dimension instructions',t:'txt',required:true,when:{key:'w',equals:4}},
 ],{charges:[{label:'Width surcharge',type:'f',amount:25,when:{key:'w',equals:4}}]});
 const input = {...DP.defCfg(p),qty:2,mode:'Standard',details:'STALE-DIMENSION'};
 const item = DP.mkItem(p,input,'hidden-dim');
 assert.ok(item); assert.equal(item.sub,2000);
 assert.equal(item.cfg.details,undefined);
 assert.ok(!DP.customerSpecifications(item).join(' ').includes('STALE-DIMENSION'));
 assert.equal(DP.calc(p,{...input,mode:'Custom',details:''}).err,'Dimension instructions is required.');
});

test('review: configuration sanitization rejects malformed visible sizes and preserves hidden discard', () => {
 const p=product([{k:'mode',l:'Mode',t:'txt'},{k:'sizes',l:'Sizes',t:'SIZE_BREAKDOWN',when:{key:'mode',equals:'custom'},sizes:[{key:'kid',label:'Kids',enabled:true,price:0}]}]);
 const hidden=cfg({qty:2,mode:'standard',sizes:{unknown:-1}},p);
 assert.equal(hidden.sizes,undefined); assert.equal(DP.calc(p,hidden).qty,2);
 assert.throws(()=>cfg({qty:2,mode:'custom',sizes:{kid:-1}},p),/size quantity/);
});

test('review: implicit dimension dependencies cannot create direct or transitive cycles', () => {
 for (const f of [
  [{k:'dimensions',l:'Dimensions',t:'dim',when:{key:'w',equals:4}}],
  [{k:'dimensions',l:'Dimensions',t:'dim',when:{key:'details',equals:'custom'}},{k:'details',l:'Details',t:'txt',when:{key:'w',equals:4}}],
 ]) assert.match(DP.fieldDefinitionError(product(f)),/Circular/);
});

test('review: zero size totals cannot activate a quantity condition using a stale submitted total', () => {
 const p=product([{k:'sizes',l:'Sizes',t:'SIZE_BREAKDOWN',sizes:[{key:'kid',label:'Kids',enabled:true,price:0}]},{k:'details',l:'Details',t:'txt',when:{key:'qty',equals:10}}]);
 const normalized=DP.normalizeConfig(p,{qty:10,sizes:{kid:0},details:'STALE'});
 assert.equal(normalized.qty,0);assert.equal(normalized.details,undefined);
 assert.match(DP.calc(p,normalized).err,/Enter quantities/);
});

test('review: legacy optional dropdown None conditions remain valid',()=>{
 const p=product([{k:'finish',l:'Finish',t:'sel',required:false,o:[['Matte','f',0]]},{k:'details',l:'No finish instructions',t:'txt',required:true,when:{key:'finish',equals:''}}]);
 assert.equal(DP.fieldDefinitionError(p),null);
 assert.match(DP.calc(p,{...DP.defCfg(p),qty:1}).err,/required/);
 assert.equal(DP.calc(p,{qty:1,finish:'Matte'}).err,null);
});

test('review: camel-case internal labels are excluded from new and legacy customer PDFs',()=>{
 const state=DP.seed(),quote=state.quotes[0];
 const p=product(['InternalNotes','PrivateMemo','StaffNotes'].map((l,i)=>({k:'sensitive'+i,l,t:'txt',show_on_customer_pdf:true})));
 const item=DP.mkItem(p,{qty:1,sensitive0:'SECRET-ONE',sensitive1:'SECRET-TWO',sensitive2:'SECRET-THREE'});
 assert.deepEqual(DP.customerSpecifications(item),[]);
 quote.items=[{...quote.items[0],sp:['InternalNotes: SECRET-ONE','PrivateMemo: SECRET-TWO','StaffNotes: SECRET-THREE','Finish: Matte']}];
 delete quote.items[0].fieldSnapshot;
 assert.deepEqual(DP.customerSpecifications(quote.items[0]),['Finish: Matte']);
 assert.ok(!quotationPdf(quote,state).toString('latin1').includes('SECRET-'));
});

test('review: ALL and ANY truth tables cover Equals and Not Equals with blank and missing references',()=>{
 const a={k:'material',l:'Material',t:'txt'},b={k:'printing',l:'Printing',t:'txt'};
 for(const mode of ['ALL','ANY'])for(const first of ['equals','not_equals'])for(const second of ['equals','not_equals']){
  const detail={k:'details',l:'Details',t:'txt',when:{mode,conditions:[{key:'material',operator:first,value:'Cotton'},{key:'printing',operator:second,value:'Sublimation'}]}},p=product([a,b,detail]);
  for(const material of ['Cotton','Polyester','',undefined])for(const printing of ['Screen','Sublimation','',undefined]){
   const config={};if(material!==undefined)config.material=material;if(printing!==undefined)config.printing=printing;
   const x=material!==undefined&&(first==='equals'?material==='Cotton':material!=='Cotton');
   const y=printing!==undefined&&(second==='equals'?printing==='Sublimation':printing!=='Sublimation');
   assert.equal(DP.fieldVisible(detail,config,p),mode==='ALL'?x&&y:x||y,JSON.stringify({mode,first,second,config}));
  }
 }
});
