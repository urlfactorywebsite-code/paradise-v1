'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const DP=require('../shared/domain');
const sample=DP.seed();
const product=id=>structuredClone(sample.products.find(value=>value.id===id));
const item=(sub,tax=18)=>({sub,base:sub,qty:1,tax});
const quote=(items,disc={t:'f',v:0},other={})=>({items,disc,del:0,oth:0,...other});

test('currency formatting uses the rupee sign and Indian digit grouping',()=>{
  assert.equal(DP.inr(100),'\u20b91.00');
  assert.equal(DP.inr(123456789),'\u20b912,34,567.89');
  assert.equal(DP.rs(100),'Rs. 1.00');
});

test('demo catalog retains the original five quotation totals and no authentication state',()=>{
  assert.equal(sample.products.length,12);
  assert.deepEqual(sample.quotes.map(value=>DP.totals(value,sample.set).grand),[602538,337480,2655000,590000,1265100]);
  assert.equal(Object.hasOwn(sample,'user'),false);
  assert.equal(Object.hasOwn(sample,'role'),false);
  assert.ok(sample.quotes.every(value=>value.chargeTax===18));
  const fresh=DP.seed({demo:false});
  assert.equal(fresh.products.length,12);
  assert.equal(fresh.customers.length,0);
  assert.equal(fresh.quotes.length,0);
  fresh.products[0].f.find(value=>value.k==='deliv').o[0][0]='Changed';
  assert.equal(DP.seed().products[0].f.find(value=>value.k==='deliv').o[0][0],'Standard');
});

test('the same module loads without Node or a DOM as the browser DP global',()=>{
  const browser={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../shared/domain.js'),'utf8'),browser);
  assert.equal(typeof browser.DP.calc,'function');
  assert.equal(browser.DP.inr(100),'\u20b91.00');
  assert.equal(browser.DP.seed({demo:false}).products.length,12);
  assert.equal(browser.DP.totals(browser.DP.seed().quotes[0],{tax:18}).grand,602538);
});

test('quantity tiers, base-only percentage supplements, and minimum orders are preserved',()=>{
  const p=product('p1'),cfg={...DP.defCfg(p),qty:500,mat:'Textured Paper',sides:'Double Side',edge:'Rounded Edge'};
  const result=DP.calc(p,cfg);
  assert.equal(result.err,null);
  assert.equal(result.base,190000);
  assert.equal(result.sub,312500);
  assert.equal(result.gst,56250);
  assert.match(DP.calc(p,{...cfg,qty:99}).err,/Minimum/);
  assert.equal(DP.calc(p,{...DP.defCfg(p),qty:1000}).base,320000);
});

test('area units accept decimal dimensions and apply the minimum charge before percentages',()=>{
  const p=product('p5');
  const small=DP.calc(p,{...DP.defCfg(p),w:.5,h:.5,deliv:'Express'});
  assert.equal(small.err,null);
  assert.equal(small.base,30000);
  assert.equal(small.sub,36000);
  const feet=DP.calc(p,{...DP.defCfg(p),w:12,h:4,qty:2});
  const inches=DP.calc(p,{...DP.defCfg(p),w:144,h:48,u:'in',qty:2});
  const centimeters=DP.calc(p,{...DP.defCfg(p),w:365.76,h:121.92,u:'cm',qty:2});
  assert.equal(feet.sub,inches.sub);
  assert.equal(feet.sub,centimeters.sub);
});

test('invalid whole quantities, dimensions, size counts, and selected options are rejected',()=>{
  const unit=product('p1'),area=product('p5'),sizes=product('p7');
  for(const qty of [-1,0,100.5,NaN,Infinity,1000001,'100'])assert.ok(DP.calc(unit,{...DP.defCfg(unit),qty}).err);
  for(const dimension of [-1,0,NaN,Infinity,10001,'4']){
    assert.ok(DP.calc(area,{...DP.defCfg(area),w:dimension}).err);
    assert.ok(DP.calc(area,{...DP.defCfg(area),h:dimension}).err);
  }
  assert.ok(DP.calc(area,{...DP.defCfg(area),u:'yards'}).err);
  for(const count of [-1,.5,NaN,Infinity,1000001,'10'])assert.ok(DP.calc(sizes,{...DP.defCfg(sizes),sz:{S:count,M:20}}).err);
  assert.ok(DP.calc(sizes,{...DP.defCfg(sizes),sz:{XXXL:10}}).err);
  assert.ok(DP.calc(sizes,DP.defCfg(sizes)).err);
  assert.ok(DP.calc(unit,{...DP.defCfg(unit),mat:'Unknown material'}).err);
  assert.equal(DP.mkItem(unit,{...DP.defCfg(unit),qty:1.5}),null);
});

test('invalid catalog pricing and integer overflow cannot produce billable items',()=>{
  for(const invalid of [-1,NaN,Infinity]){
    const p=product('p5');p.rate=invalid;
    assert.ok(DP.calc(p,DP.defCfg(p)).err);
    const u=product('p1');u.tiers[0][1]=invalid;
    assert.ok(DP.calc(u,DP.defCfg(u)).err);
    const option=product('p1');option.f[0].o[0][2]=invalid;
    assert.ok(DP.calc(option,DP.defCfg(option)).err);
  }
  const p=product('p5');p.rate=Number.MAX_SAFE_INTEGER;
  assert.ok(DP.calc(p,DP.defCfg(p)).err);
  assert.ok(DP.calc(null,{}).err);
  assert.throws(()=>DP.totals(quote([item(Infinity)])),/Invalid/);
  assert.throws(()=>DP.totals(quote([item(100)],{t:'p',v:Infinity})),/Invalid/);
  assert.throws(()=>DP.totals(quote([item(100)],undefined,{del:-1})),/nonnegative/);
});

test('size quantity drives pricing while item config remains an independent snapshot',()=>{
  const p=product('p7'),cfg={...DP.defCfg(p),sz:{S:10,M:20,L:30,XL:25,XXL:15},meth:'DTF'};
  const saved=DP.mkItem(p,cfg,'saved-id','Artwork pending');
  assert.equal(saved.qty,100);
  assert.equal(saved.sub,2250000);
  assert.equal(saved.id,'saved-id');
  assert.equal(saved.notes,'Artwork pending');
  cfg.sz.S=100;
  assert.equal(saved.cfg.sz.S,10);
});

test('largest remainder discounts never create a negative taxable final row',()=>{
  const result=DP.totals(quote([item(1,0),item(1,5),item(0,18)],{t:'f',v:.01}));
  assert.deepEqual(result.br.map(row=>row.t),[0,1,0]);
  assert.equal(result.disc,1);
  assert.equal(result.taxable,1);
  for(let a=0;a<=5;a++)for(let b=0;b<=5;b++)for(let c=0;c<=5;c++)for(let discount=0;discount<=a+b+c;discount++){
    const totals=DP.totals(quote([item(a,0),item(b,5),item(c,18)],{t:'f',v:discount/100}));
    assert.ok(totals.br.every(row=>Number.isInteger(row.t)&&row.t>=0));
    assert.equal(totals.br.reduce((sum,row)=>sum+row.t,0),a+b+c-discount);
    assert.equal(totals.grand,totals.taxable+totals.gst);
  }
});

test('discount clamps and mixed tax brackets retain integer-paise accounting',()=>{
  const result=DP.totals(quote([item(10000,18),item(10000,12)],{t:'p',v:10}));
  assert.deepEqual(result.br,[{r:12,t:9000,x:1080},{r:18,t:9000,x:1620}]);
  assert.equal(result.grand,20700);
  assert.equal(DP.totals(quote([item(100)],{t:'p',v:200})).grand,0);
  assert.equal(DP.totals(quote([item(100)],{t:'p',v:200})).warn,true);
  assert.equal(DP.totals(quote([item(100)],{t:'f',v:-1})).disc,0);
});

test('additional charges use the saved quotation tax including zero, then current settings',()=>{
  assert.equal(DP.totals(quote([],undefined,{del:100,chargeTax:12}),{tax:18}).grand,11200);
  assert.equal(DP.totals(quote([],undefined,{del:100,chargeTax:0}),{tax:18}).grand,10000);
  assert.equal(DP.totals(quote([],undefined,{del:100}),{tax:18}).grand,11800);
  assert.equal(DP.totals(quote([]),{tax:18}).grand,0);
});
