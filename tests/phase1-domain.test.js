'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const DP=require('../shared/domain');
const {validateState}=require('../server/validation');
const {authorizeProductChanges}=require('../server/access');
const admin={id:'admin',name:'Admin',role:'Administrator'};
const option=(k,values)=>({k,l:k,t:'sel',o:values.map(value=>[value,'f',0])});
const condition=(key,operator,value)=>({key,operator,value});
const group=(mode,...conditions)=>({mode,conditions});
const product=(f=[],extra={})=>({id:'phase1',code:'P1',name:'Configured product',cat:'c1',m:'unit',rate:20,min:0,minQty:1,tax:18,on:1,f,...extra});
const baseFields=()=>[option('material',['Cotton','Polyester']),option('printing',['Screen','Sublimation']),{k:'details',l:'Custom Finish Details',t:'txt',required:true,when:{key:'material',equals:'Cotton'}}];
function stateWith(p){const state=DP.seed({demo:false});state.products.push(p);return validateState(state,state,admin,()=> 'UNUSED');}
function saveQuote(state,p,config,extra={}){
 const next=structuredClone(state);next.customers=[{id:'customer',date:'2026-10-26',name:'Customer',mob:'9000000001',on:1}];
 next.quotes=[{id:'quote',cid:'customer',date:'2026-10-26',valid:'2026-11-26',status:'Draft',disc:{t:'p',v:0},del:0,oth:0,terms:[],items:[{id:'item',pid:p.id,cfg:config,...extra}]}];
 return validateState(next,state,admin,()=> 'P1/2026/1');
}
const sizeField=()=>({k:'garmentSizes',l:'Size breakdown',t:'SIZE_BREAKDOWN',sizes:[
 {key:'XS',label:'XS',enabled:true,price:0},{key:'kids',label:'Kids 6-8',enabled:true,price:2},{key:'5XL',label:'5XL',enabled:true,price:5},{key:'old',label:'Discontinued',enabled:false,price:0}
]});

test('Phase 1 legacy single conditions preserve Equals and array comparisons',()=>{
 const p=product(baseFields()),config={...DP.defCfg(p),qty:2};
 assert.match(DP.calc(p,config).err,/required/);
 assert.equal(DP.calc(p,{...config,details:'Custom artwork'}).err,null);
 assert.equal(DP.calc(p,{...config,material:'Polyester'}).err,null);
 p.f[2].when.equals=['Cotton','Polyester'];assert.match(DP.calc(p,{...config,material:'Polyester'}).err,/required/);
 const blank=product([{k:'trigger',l:'Trigger',t:'txt'},{k:'emptyDetail',l:'Empty detail',t:'txt',when:{key:'trigger',equals:''}}]);
 assert.equal(DP.fieldVisible(blank.f[1],{trigger:''},blank),true);assert.equal(DP.fieldVisible(blank.f[1],{},blank),false);
});
test('Phase 1 multiple ALL conditions require every Equals and Not Equals comparison',()=>{
 const fields=baseFields();fields[2].when=group('ALL',condition('material','equals','Cotton'),condition('printing','not_equals','Sublimation'));
 const p=product(fields),config={...DP.defCfg(p),qty:3};
 assert.match(DP.calc(p,config).err,/required/);
 assert.equal(DP.calc(p,{...config,printing:'Sublimation'}).err,null);
 assert.equal(DP.calc(p,{...config,material:'Polyester'}).err,null);
 assert.equal(DP.calc(p,{...config,details:'Custom'}).err,null);
});
test('Phase 1 ANY conditions match either branch and do not match absent references',()=>{
 const fields=baseFields();fields[2].when=group('ANY',condition('material','equals','Cotton'),condition('printing','equals','Screen'));
 const p=product(fields),config={qty:2,material:'Polyester',printing:'Sublimation'};
 assert.equal(DP.calc(p,config).err,null);
 assert.match(DP.calc(p,{...config,printing:'Screen'}).err,/required/);
 assert.match(DP.calc(p,{...config,material:'Cotton'}).err,/required/);
 fields[2].when=group('ALL',condition('material','not_equals','Cotton'));
 assert.equal(DP.fieldVisible(fields[2],{}),false);
});
test('Phase 1 backend rejects invalid references, operators, empty groups and unavailable options',()=>{
 const invalid=[{key:'missing',equals:'Cotton'},group('ALL',condition('material','bad','Cotton')),group('SOME',condition('material','equals','Cotton')),group('ALL'),group('ANY',condition('material','equals','Unavailable'))];
 for(const when of invalid){const fields=baseFields();fields[2].when=when;assert.throws(()=>stateWith(product(fields)),/condition|Condition|unknown|unavailable/i);assert.ok(DP.calc(product(fields),{qty:1}).err);}
});
test('Phase 1 backend rejects self cycles, multi-field cycles and calculated quantity cycles',()=>{
 const a={k:'a',l:'A',t:'txt',when:{key:'b',equals:'x'}},b={k:'b',l:'B',t:'txt',when:{key:'a',equals:'x'}};
 assert.throws(()=>stateWith(product([a,b])),/Circular/);
 assert.throws(()=>stateWith(product([{...a,when:{key:'a',equals:'x'}}])),/Circular/);
 const sizes=sizeField();sizes.when={key:'a',equals:'x'};
 assert.throws(()=>stateWith(product([sizes,{...a,when:{key:'qty',equals:5}}])),/Circular/);
});
test('Phase 1 hidden fields cannot price, persist, or enable dependent fields',()=>{
 const p=product([option('mode',['Standard','Custom']),{k:'paid',l:'Paid choice',t:'sel',o:[['Paid','u',99]],when:{key:'mode',equals:'Custom'}},{k:'child',l:'Child details',t:'txt',required:true,when:group('ALL',condition('paid','not_equals','No choice'))}],{charges:[{label:'Conditional surcharge',type:'f',amount:400,when:{key:'paid',equals:'Paid'}}]});
 // Use an existing compared option; Not Equals still cannot match a hidden dependency.
 p.f[2].when.conditions[0].value='Paid';
 const state=stateWith(p),config={qty:2,mode:'Standard',paid:'Paid',child:'FORGED-HIDDEN'};
 const saved=saveQuote(state,p,config).quotes[0].items[0];
 assert.equal(saved.sub,4000);assert.equal(Object.hasOwn(saved.cfg,'paid'),false);assert.equal(Object.hasOwn(saved.cfg,'child'),false);
 assert.ok(!JSON.stringify(DP.customerSpecifications(saved)).includes('FORGED-HIDDEN'));
});
test('Phase 1 condition changes preserve independent pricing and hidden invalid values are discarded',()=>{
 const p=product([option('mode',['Standard','Custom']),{k:'count',l:'Count',t:'num',min:1,when:{key:'mode',equals:'Custom'}}]);
 const state=stateWith(p),saved=saveQuote(state,p,{qty:2,mode:'Standard',count:{bad:-1}}).quotes[0].items[0];
 assert.equal(saved.sub,4000);assert.equal(Object.hasOwn(saved.cfg,'count'),false);
 assert.throws(()=>saveQuote(state,p,{qty:2,mode:'Custom',count:-1}),/numeric/);
 assert.throws(()=>saveQuote(state,p,{qty:2,mode:'Standard',unknown:'forged'}),/Unknown/);
});
test('Phase 1 reusable sizes sum quantities including custom labels, zero entries and approved surcharges',()=>{
 const p=product([sizeField()]),config={...DP.defCfg(p),qty:999,garmentSizes:{XS:5,kids:10,'5XL':0}};
 const item=DP.mkItem(p,config,'sizes');assert.ok(item);assert.equal(item.qty,15);assert.equal(item.cfg.qty,15);assert.equal(item.sub,32000);
 assert.match(DP.customerSpecifications(item).join('; '),/Kids 6-8 10/);
 assert.doesNotMatch(DP.customerSpecifications(item).join('; '),/5XL 0/);
 assert.equal(DP.calc(p,{...config,garmentSizes:{XS:0,kids:0}}).err!==null,true);
});
test('Phase 1 reusable size validation rejects negatives, fractions, strings, overflow and unavailable sizes',()=>{
 const p=product([sizeField()]),state=stateWith(p);
 for(const value of [-1,.5,'2',Infinity,1000001]){const cfg={qty:1,garmentSizes:{XS:value}};assert.ok(DP.calc(p,cfg).err);assert.throws(()=>saveQuote(state,p,cfg));}
 for(const garmentSizes of [{XS:2,old:1},{XS:2,old:0},{XS:2,unknown:0},{XS:1000000,kids:1}]){assert.ok(DP.calc(p,{qty:1,garmentSizes}).err);assert.throws(()=>saveQuote(state,p,{qty:1,garmentSizes}));}
});
test('Phase 1 size definitions reject duplicates, all disabled, wrong pricing method and multiple drivers',()=>{
 const variants=[{...sizeField(),sizes:[...sizeField().sizes,{key:'XS',label:'Duplicate',enabled:true,price:0}]},{...sizeField(),sizes:sizeField().sizes.map(size=>({...size,enabled:false}))}];
 for(const field of variants)assert.throws(()=>stateWith(product([field])),/size/i);
 assert.throws(()=>stateWith(product([sizeField()],{m:'fixed'})),/unit or tier/);
 assert.throws(()=>stateWith(product([sizeField(),{...sizeField(),k:'otherSizes'}])),/one size/);
});
test('Phase 1 size breakdown works with tier pricing and quantity-driven conditions',()=>{
 const p=product([sizeField(),{k:'bulk',l:'Bulk details',t:'txt',required:true,when:{key:'qty',equals:15}}],{m:'tier',tiers:[[1,20],[10,15]]});
 const item=DP.mkItem(p,{qty:1,garmentSizes:{XS:5,kids:10},bulk:'Bulk packaging'});assert.ok(item);assert.equal(item.qty,15);assert.equal(item.base,22500);assert.equal(item.sub,24500);assert.equal(item.cfg.bulk,'Bulk packaging');
});
test('Phase 1 existing T-Shirts retain legacy sizes and editable explicit sz conversion',()=>{
 const state=DP.seed(),p=state.products.find(p=>p.id==='p7'),config={...DP.defCfg(p),sz:{S:10,M:20}};
 const before=DP.mkItem(p,config);assert.equal(before.qty,30);assert.equal(before.sub,780000);
 const field={...DP.sizeFields(p)[0]};delete field.legacy;p.f.push(field);p.sizes=0;
 const after=DP.mkItem(p,config);assert.equal(after.qty,before.qty);assert.equal(after.sub,before.sub);assert.deepEqual(after.cfg.sz,before.cfg.sz);
});
test('Phase 1 quotation editing persists size quantities and leaves untouched legacy snapshots operational',()=>{
 const p=product([sizeField()]),state=stateWith(p),saved=saveQuote(state,p,{qty:1,garmentSizes:{XS:5,kids:10}});
 const next=structuredClone(saved);next.quotes[0].items[0].cfg.garmentSizes.kids=20;
 const edited=validateState(next,saved,admin,()=> 'UNUSED');assert.equal(edited.quotes[0].items[0].qty,25);assert.equal(edited.quotes[0].items[0].sub,54000);
 const old=structuredClone(edited);delete old.quotes[0].items[0].fieldSnapshot;old.products.find(value=>value.id===p.id).f[0].sizes[0].enabled=false;
 const unchanged=validateState(structuredClone(old),old,admin,()=> 'UNUSED');assert.deepEqual(unchanged.quotes[0].items[0],old.quotes[0].items[0]);
});
test('Phase 1 product-specific maps and multi selections cannot bypass server validation',()=>{
 const p=product([sizeField(),{...option('services',['Foil','Emboss']),t:'multi'}]),state=stateWith(p);
 assert.throws(()=>saveQuote(state,p,{qty:1,garmentSizes:{XS:1},services:['Foil','Unknown']}),/Invalid option/);
 assert.throws(()=>saveQuote(state,p,{qty:1,garmentSizes:{XS:1},services:['Foil','Foil']}),/Invalid option/);
 const saved=saveQuote(state,p,{qty:1,garmentSizes:{XS:1},services:['Foil','Emboss']},{fieldSnapshot:[{k:'internalNotes',l:'Notes',t:'txt',show_on_customer_pdf:true}],sp:['Forged']}).quotes[0].items[0];
 assert.equal(saved.fieldSnapshot[0].k,'garmentSizes');assert.deepEqual(saved.cfg.services,['Foil','Emboss']);assert.ok(!saved.sp.includes('Forged'));
});
test('Phase 1 size prices require pricing permission while visibility remains catalog-only',()=>{
 const p=product([sizeField()]),catalog={id:'cat',role:'Employee',permissions:['product.manage']},pricing={id:'price',role:'Employee',permissions:['pricing.manage']};
 const changed=structuredClone(p);changed.f[0].sizes[0].price=3;
 assert.throws(()=>authorizeProductChanges([changed],[p],catalog),/Pricing/);assert.doesNotThrow(()=>authorizeProductChanges([changed],[p],pricing));
 const presentation=structuredClone(p);presentation.f[0].show_on_customer_pdf=false;
 assert.doesNotThrow(()=>authorizeProductChanges([presentation],[p],catalog));assert.throws(()=>authorizeProductChanges([presentation],[p],pricing),/Product management/);
});
