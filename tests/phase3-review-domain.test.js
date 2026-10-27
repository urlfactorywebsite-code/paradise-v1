'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const DP=require('../shared/domain');
const {validateState,cfg}=require('../server/validation');
const admin={id:'admin',name:'Admin',role:'Administrator'},catalog={id:'catalog',name:'Catalog',role:'Employee',permissions:['product.view','product.manage']};
const product=code=>DP.seed({demo:false}).products.find(p=>p.code===code);
const pricedShirt=()=>{
 const p=DP.phase3Product(product('PG-TS')),locations=p.f.find(f=>f.k==='printLocations');
 for(const [value,basis,rate]of [['Front','u',1.25],['Back','f',12.34],['Sleeve','p',2.5]]){locations.o.find(o=>o[0]===value).splice(1,2,basis,rate);Object.assign(locations.optionMeta[value],{enabled:true,approved:true});}
 return p;
};

test('review: external gift projection markers cannot change retained master rates or record identity',()=>{
 const initial=DP.seed({demo:false}),input=structuredClone(initial),template=DP.giftTemplate();input.set.giftTemplate=template;
 const raw=DP.phase3Product(product('PG-MG'),template),effective=DP.resolveGiftProduct(raw,template);effective.f.find(f=>f.k==='type').o[1][2]=90;
 input.products=input.products.map(p=>p.id===raw.id?DP.stripGiftProduct(effective,template):p);
 const saved=validateState(input,initial,admin,()=> 'UNUSED');
 for(const key of ['__giftRaw','__giftBase']){
  const forged=structuredClone(saved),p=forged.products.find(p=>p.id===raw.id);p[key]=structuredClone(p);p[key].id='forged_identity';p[key].rate=999;p[key].f.find(f=>f.k==='type').o[1][2]=999;
  for(const actor of [admin,catalog])assert.throws(()=>validateState(forged,saved,actor,()=> 'UNUSED'),error=>error.status===422&&/projection metadata/.test(error.message));
 }
 assert.equal(saved.products.find(p=>p.id===raw.id).f.find(f=>f.k==='type').o[1][2],60);
});

test('review: private gift projection provenance survives sanctioned edits without exposing serializable markers',()=>{
 const template=DP.giftTemplate(),raw=DP.phase3Product(product('PG-PB'),template),effective=DP.resolveGiftProduct(raw,template);
 assert.equal(Object.prototype.hasOwnProperty.call(effective,'__giftRaw'),false);assert.equal(Object.prototype.hasOwnProperty.call(effective,'__giftBase'),false);
 Object.assign(effective,{name:'Reviewed Paper Bag'});effective.f.find(f=>f.k==='color').show_on_customer_pdf=false;
 const saved=DP.stripGiftProduct(effective,template);assert.equal(saved.name,'Reviewed Paper Bag');assert.equal(saved.f.length,raw.f.length);assert.equal(saved.giftTemplate.overrides.color.show_on_customer_pdf,false);
 assert.ok(!JSON.stringify(saved).includes('__gift'));assert.equal(DP.resolveGiftProduct(saved,template).f.find(f=>f.k==='color').show_on_customer_pdf,false);
});

test('review: Phase 3 preparation blocks incompatible existing controls without replacing approved options',()=>{
 for(const [code,key,label,type]of [['PG-TS','designRequirements','Design Requirements','sel'],['GD-LG','additionalRequirements','Additional Requirements','sel'],['PG-TS','printLocations','Print Locations','sel']]){
  const p=product(code);p.f.push({k:key,l:label,t:type,o:[['Existing approved option','f',75]]});const before=structuredClone(p);
  assert.throws(()=>DP.phase3Product(p),/must use|multiselect/);assert.deepEqual(p,before);
 }
 const ambiguous=product('GD-LG');ambiguous.f.push({k:'additionalRequirements',l:'Additional Requirements',t:'txt'},{k:'existingDetails',l:'Additional Requirements',t:'txt'});assert.throws(()=>DP.phase3Product(ambiguous),/one text field/);
});

test('review: compatible existing requirement fields become textareas and retain explicit customer visibility and required policy',()=>{
 for(const [code,label]of [['PG-TS','Design Requirements'],['GD-LG','Additional Requirements']]){
  const p=product(code);p.f.push({k:'existingRequirements',l:label,t:'txt',required:true,show_on_customer_pdf:false,maxLength:1600});const prepared=DP.phase3Product(p),field=prepared.f.find(f=>f.k==='existingRequirements');
  assert.equal(field.multiline,true);assert.equal(field.required,true);assert.equal(field.show_on_customer_pdf,false);assert.equal(field.maxLength,1600);assert.equal(prepared.f.filter(f=>f.l===label).length,1);assert.deepEqual(DP.phase3Product(prepared),prepared);
 }
});

test('review: Phase 3 shared frontend and backend validation agree on explicit size-total mismatches',()=>{
 const p=pricedShirt(),configuration={...DP.defCfg(p),sz:{S:10},qty:999,printLocations:['Front']};
 assert.match(DP.calc(p,configuration).err,/must match/);assert.throws(()=>cfg(configuration,p),error=>error.status===422&&/must match/.test(error.message));
 configuration.qty=10;const calculated=DP.calc(p,configuration);assert.equal(calculated.err,null);assert.equal(DP.calc(p,cfg(configuration,p)).sub,calculated.sub);
 for(const invalid of [{S:-1},{S:1.5},{unknown:10}])assert.ok(DP.calc(p,{...configuration,sz:invalid}).err);
 const legacy=product('PG-TS');assert.equal(DP.calc(legacy,{...DP.defCfg(legacy),sz:{S:10},qty:999}).qty,10);
});

test('review: deterministic shirt charges, discount, GST and paise rounding agree with hand-calculated totals',()=>{
 const p=pricedShirt();p.f.find(f=>f.k==='sz').sizes.find(s=>s.key==='S').price=2.03;
 const config={...DP.defCfg(p),sz:{S:10},qty:10,printLocations:['Front','Back','Sleeve']};
 const item=DP.mkItem(p,config,'known-rates');
 // Base260000 + sizes2030 + unit1250 + fixed1234 + 2.5%6500 =271014 paise.
 assert.equal(item.base,260000);assert.equal(item.sub,271014);assert.equal(item.L.filter(row=>row[0].startsWith('Print Locations:')).length,3);
 const totals=DP.totals({items:[item],disc:{t:'p',v:7.5},del:0,oth:0});
 assert.equal(totals.disc,20326);assert.equal(totals.taxable,250688);assert.equal(totals.gst,45124);assert.equal(totals.grand,295812);
 assert.equal(totals.cgst+totals.sgst,totals.gst);
});

test('review: per-product gift overrides charge each semantic once and leave another product and shared template unchanged',()=>{
 const template=DP.giftTemplate(),before=structuredClone(template),raw=DP.phase3Product(product('PG-PB'),template),other=DP.phase3Product(product('PG-KC'),template),otherBefore=DP.calc(DP.resolveGiftProduct(other,template),DP.defCfg(DP.resolveGiftProduct(other,template))).sub;
 const effective=DP.resolveGiftProduct(raw,template);
 for(const [semantic,basis,rate]of [['model','u',1.11],['material','u',2.22],['customization','f',3.33],['printing','u',4.44],['packaging','f',5.55]]){
  const key=raw.giftTemplate.map[semantic]||semantic,field=effective.f.find(f=>f.k===key);field.o=[['Approved fixture',basis,rate]];field.optionMeta={'Approved fixture':{enabled:true,approved:true}};field.required=true;
 }
 const saved=DP.stripGiftProduct(effective,template),current=DP.resolveGiftProduct(saved,template),config={...DP.defCfg(current),qty:100};
 const result=DP.calc(current,config);assert.equal(result.err,null);
 // Existing base180000 + model11100 + material22200 + customization333 + printing44400 + packaging555 + existing setup30000.
 assert.equal(result.sub,288588);assert.equal(result.L.filter(row=>/Approved fixture/.test(row[0])).length,5);
 assert.deepEqual(template,before);assert.equal(DP.calc(DP.resolveGiftProduct(other,template),DP.defCfg(DP.resolveGiftProduct(other,template))).sub,otherBefore);
 assert.equal(new Set(current.f.map(f=>f.k)).size,current.f.length);
});

test('review: disabled inherited fields discard stale editable selections while historical item snapshots remain unchanged',()=>{
 const template=DP.giftTemplate(),color=template.f.find(f=>f.k==='color');color.o=[['Blue','u',2]];color.optionMeta={Blue:{enabled:true,approved:true}};
 const raw=DP.phase3Product(product('PG-PB'),template),before=DP.resolveGiftProduct(raw,template),configuration={...DP.defCfg(before),color:'Blue'},item=DP.mkItem(before,configuration,'historical');
 const snapshot=structuredClone(item);raw.giftTemplate.disabled=['color','material'];const current=DP.resolveGiftProduct(raw,template),normalized=DP.normalizeConfig(current,configuration),result=DP.calc(current,configuration);
 assert.equal(normalized.color,undefined);assert.equal(normalized.mat,undefined);assert.equal(result.err,null);assert.equal(result.sub,item.sub-20000);assert.ok(!result.L.some(row=>row[0].startsWith('Colour:')));
 assert.deepEqual(item,snapshot);assert.ok(DP.customerSpecifications(item).includes('Colour: Blue'));
 assert.match(DP.calc(current,{...configuration,forgedOption:'Bad'}).err,/Unknown/);
});
