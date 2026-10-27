'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const DP=require('../shared/domain');
const old=code=>DP.seed({demo:false}).products.find(p=>p.code===code);
const template=()=>DP.giftTemplate();
const gift=(code,t=template())=>DP.resolveGiftProduct(DP.phase3Product(old(code),t),t);
function shirt(){const p=DP.phase3Product(old('PG-TS'));const f=p.f.find(f=>f.k==='printLocations');for(const [name,type,rate]of [['Front','u',2],['Back','f',30],['Sleeve','q',3],['Neck Label','p',5]]){f.o.find(o=>o[0]===name).splice(1,2,type,rate);Object.assign(f.optionMeta[name],{enabled:true,approved:true});}return p;}
const shirtCfg=p=>({...DP.defCfg(p),sz:{S:10,M:20},qty:30,printLocations:['Front'],designRequirements:'Use the supplied brand artwork'});

test('Phase 3 T-shirt setup is explicit/idempotent, uses the one reusable size engine and retains legacy print rates',()=>{
 const original=old('PG-TS'),p=DP.phase3Product(original);
 assert.equal(original.sizes,1);assert.equal(p.sizes,0);assert.equal(p.f.filter(f=>f.t==='SIZE_BREAKDOWN').length,1);
 assert.deepEqual(p.f.find(f=>f.k==='sz').sizes.map(s=>s.key),DP.SZ);
 assert.deepEqual(p.phase3LegacyFields,[original.f.find(f=>f.k==='loc')]);assert.ok(!p.f.some(f=>f.k==='loc'));
 assert.deepEqual(DP.phase3Product(p),p);assert.equal(p.f.find(f=>f.k==='printLocations').t,'multi');
 assert.deepEqual(p.f.find(f=>f.k==='printLocations').o.map(o=>o[0]),['Front','Back','Left Chest','Right Chest','Sleeve','Neck Label']);
 assert.equal(DP.activeOptions(p.f.find(f=>f.k==='printLocations')).length,0);
 assert.match(DP.calc(p,{...DP.defCfg(p),sz:{S:10}}).err,/required/);
});

test('Phase 3 dynamic custom/kids sizes, ordering, availability, quantities and configured surcharges use the shared engine',()=>{
 const p=shirt(),sizes=p.f.find(f=>f.k==='sz');sizes.sizes.unshift({key:'kids8',label:'Kids 8',enabled:true,price:2.5});sizes.sizes.push({key:'5XL',label:'5XL',enabled:true,price:5},{key:'XS',label:'XS',enabled:false,price:0});
 const cfg={...shirtCfg(p),sz:{kids8:5,S:10,'5XL':5},qty:20},r=DP.calc(p,cfg);
 assert.equal(r.err,null);assert.equal(r.qty,20);assert.equal(r.sub,527750);assert.deepEqual(r.L.filter(x=>x[0].startsWith('Size breakdown')).map(x=>x[1]),[1250,2500]);
 for(const sz of [{S:-1},{S:1.5},{S:'10'},{unknown:10},{XS:0},{S:0}])assert.ok(DP.calc(p,{...cfg,sz}).err,JSON.stringify(sz));
 const item=DP.mkItem(p,cfg,'sizes');assert.equal(item.cfg.qty,20);assert.deepEqual(item.cfg.sz,cfg.sz);assert.ok(DP.customerSpecifications(item).some(s=>s.includes('Kids 8 5')&&s.includes('5XL 5')));
});

test('Phase 3 multiple print locations honor each existing pricing basis once and reject inactive, duplicate and invalid choices',()=>{
 const p=shirt(),cfg=shirtCfg(p),base=DP.calc(p,{...cfg,printLocations:['Front']});assert.equal(base.sub,786000);
 const r=DP.calc(p,{...cfg,printLocations:['Front','Back','Sleeve','Neck Label']});assert.equal(r.sub,837000);assert.deepEqual(r.L.filter(x=>x[0].startsWith('Print Locations')).map(x=>x[1]),[6000,3000,9000,39000]);
 assert.ok(!r.L.some(x=>/1 Location|2 Locations/.test(x[0])));
 for(const printLocations of [['Front','Front'],['Left Chest'],['1 Location'],['Forged']])assert.ok(DP.calc(p,{...cfg,printLocations}).err);
 p.f.find(f=>f.k==='printLocations').maxSelections=1;assert.match(DP.calc(p,{...cfg,printLocations:['Front','Back']}).err,/selections/);
});

test('Phase 3 historical location/configuration and public requirements are immutable item snapshots',()=>{
 const original=old('PG-TS'),legacy=DP.mkItem(original,{...DP.defCfg(original),sz:{S:10},loc:'2 Locations'},'legacy');
 const before=JSON.stringify(legacy);shirt();assert.equal(JSON.stringify(legacy),before);assert.ok(DP.customerSpecifications(legacy).includes('Print Locations: 2 Locations'));
 const p=shirt(),cfg=shirtCfg(p),item=DP.mkItem(p,{...cfg,note:'PRIVATE-INTERNAL'},'shirt','SECRET-ITEM-NOTE');assert.ok(DP.customerSpecifications(item).includes('Design Requirements: '+cfg.designRequirements));assert.ok(!DP.customerSpecifications(item).join(' ').includes('PRIVATE-INTERNAL'));
 p.f.find(f=>f.k==='designRequirements').show_on_customer_pdf=false;assert.ok(DP.customerSpecifications(item).includes('Design Requirements: '+cfg.designRequirements));
 const hidden=DP.mkItem(p,cfg,'hidden');assert.ok(!DP.customerSpecifications(hidden).some(s=>s.startsWith('Design Requirements')));
 p.f.find(f=>f.k==='note').show_on_customer_pdf=true;const forgedPrivate=DP.mkItem(p,{...cfg,note:'NEVER-PUBLIC'},'private');assert.ok(!DP.customerSpecifications(forgedPrivate).join(' ').includes('NEVER-PUBLIC'));
});

test('Phase 3 Logo requirements reuse multiline validation, persistence and PDF visibility without changing package pricing',()=>{
 const p=DP.phase3Product(old('GD-LG')),cfg={...DP.defCfg(p),additionalRequirements:'Use blue and gold\nProvide a compact variant'};
 assert.equal(p.f.find(f=>f.k==='additionalRequirements').multiline,true);const item=DP.mkItem(p,cfg,'logo');assert.equal(item.sub,DP.calc(old('GD-LG'),DP.defCfg(old('GD-LG'))).sub);assert.equal(item.cfg.additionalRequirements,cfg.additionalRequirements);assert.ok(DP.customerSpecifications(item).includes('Additional Requirements: '+cfg.additionalRequirements));
 p.f.find(f=>f.k==='additionalRequirements').required=true;assert.match(DP.calc(p,{...cfg,additionalRequirements:'   '}).err,/Invalid text/);assert.ok(DP.calc(p,{...cfg,additionalRequirements:'x'.repeat(4001)}).err);
 assert.deepEqual(DP.phase3Product(p),p);
});

test('Phase 3 five gifts reference one shared template, retain local definitions and preserve every existing default price',()=>{
 const t=template();for(const code of ['PG-PB','PG-KC','PG-MG','PG-TC','PG-ST']){
  const before=old(code),raw=DP.phase3Product(before,t),effective=DP.resolveGiftProduct(raw,t);
  assert.deepEqual(raw.f,before.f,code);assert.deepEqual(DP.phase3Product(raw,t),raw,code);assert.deepEqual(DP.stripGiftProduct(effective,t),raw,code);
  assert.equal(effective.f.length,new Set(effective.f.map(f=>f.k)).size,code);assert.equal(DP.calc(effective,DP.defCfg(effective)).sub,DP.calc(before,DP.defCfg(before)).sub,code);
  for(const semantic of DP.GIFT_KEYS)assert.ok(effective.f.some(f=>f.k===(raw.giftTemplate.map[semantic]||semantic)),code+' '+semantic);
  for(const existing of before.f)assert.deepEqual(effective.f.find(f=>f.k===existing.k)?.o,existing.o,code+' '+existing.k+' rates');
 }
 const mug=gift('PG-MG'),calendar=gift('PG-TC');assert.equal(mug.f.filter(f=>f.l==='Product Model').length,1);assert.ok(mug.f.some(f=>f.k==='type'));assert.equal(calendar.f.filter(f=>f.l==='Product Model').length,1);assert.ok(calendar.f.some(f=>f.k==='stand'));assert.ok(calendar.f.some(f=>f.k==='pages'));assert.ok(gift('PG-ST').f.some(f=>f.k==='plate'));
});

test('Phase 3 inherited options are product-specific, charge once, preserve setup and require explicit configured rates',()=>{
 const t=template(),raw=DP.phase3Product(old('PG-MG'),t),p=DP.resolveGiftProduct(raw,t),pack=p.f.find(f=>f.k==='pack'),color=p.f.find(f=>f.k==='color');
 color.o=[['Blue','u',4]];color.optionMeta={Blue:{enabled:true,approved:true}};pack.o.find(o=>o[0]==='Individual Box')[2]=12;
 const saved=DP.stripGiftProduct(p,t),effective=DP.resolveGiftProduct(saved,t),cfg={...DP.defCfg(effective),qty:12,color:'Blue',pack:'Individual Box',artwork:'Company crest'};
 const item=DP.mkItem(effective,cfg,'gift');assert.equal(item.sub,219200);assert.equal(item.L.filter(x=>x[0]==='Colour: Blue').length,1);assert.equal(item.L.filter(x=>x[0].startsWith('Setup:')).length,1);assert.ok(DP.customerSpecifications(item).includes('Artwork Requirement: Company crest'));
 assert.ok(!DP.resolveGiftProduct(DP.phase3Product(old('PG-KC'),t),t).f.find(f=>f.k==='color').o.some(o=>o[0]==='Blue'));
 const required=gift('PG-PB');required.f.find(f=>f.k==='color').required=true;assert.match(DP.calc(required,DP.defCfg(required)).err,/no active approved prices/);
});

test('Phase 3 shared changes, full field overrides, disabled fields and additional product fields compose without duplication',()=>{
 const t=template(),raw=DP.phase3Product(old('PG-PB'),t);t.f.find(f=>f.k==='color').l='Brand Colour';let p=DP.resolveGiftProduct(raw,t);assert.equal(p.f.find(f=>f.k==='color').l,'Brand Colour');
 const colour=p.f.find(f=>f.k==='color');colour.l='Product Colour';colour.when={key:'mat',equals:'Kraft'};p.f.push({k:'handle',l:'Handle notes',t:'txt',show_on_customer_pdf:true});p.f=p.f.filter(f=>f.k!=='packaging');const saved=DP.stripGiftProduct(p,t);assert.ok(saved.giftTemplate.disabled.includes('packaging'));assert.equal(saved.giftTemplate.overrides.color.l,'Product Colour');assert.ok(saved.f.some(f=>f.k==='handle'));
 t.f.find(f=>f.k==='color').l='New Shared Colour';p=DP.resolveGiftProduct(saved,t);assert.equal(p.f.find(f=>f.k==='color').l,'Product Colour');assert.ok(!p.f.some(f=>f.k==='packaging'));
 delete p.f.find(f=>f.k==='color').when;const cleared=DP.resolveGiftProduct(DP.stripGiftProduct(p,t),t);assert.equal(cleared.f.find(f=>f.k==='color').when,undefined);
 const configured=DP.stripGiftProduct(cleared,t);configured.giftTemplate.disabled.push('color');const hidden=DP.resolveGiftProduct(configured,t),hiddenSaved=DP.stripGiftProduct(hidden,t);assert.equal(hiddenSaved.giftTemplate.overrides.color.l,'Product Colour');hiddenSaved.giftTemplate.disabled=hiddenSaved.giftTemplate.disabled.filter(k=>k!=='color');assert.equal(DP.resolveGiftProduct(hiddenSaved,t).f.find(f=>f.k==='color').l,'Product Colour');
});

test('Phase 3 conditional inherited fields remap stable aliases and reject circular/conflicting inheritance',()=>{
 const t=template(),raw=DP.phase3Product(old('PG-PB'),t);t.f.find(f=>f.k==='color').when={key:'material',equals:'Kraft'};
 assert.throws(()=>DP.resolveGiftProduct(raw,t),/unavailable option/); // shared option references must be valid in the shared definition
 t.f.find(f=>f.k==='material').o=[['Kraft','f',null]];t.f.find(f=>f.k==='material').optionMeta={Kraft:{approved:false,enabled:false}};
 const p=DP.resolveGiftProduct(raw,t);assert.equal(p.f.find(f=>f.k==='color').when.key,'mat');assert.equal(DP.fieldVisible(p.f.find(f=>f.k==='color'),{mat:'Kraft'},p),true);
 const bad=structuredClone(raw);bad.giftTemplate.map.color='mat';assert.throws(()=>DP.resolveGiftProduct(bad,t),/unique/);bad.giftTemplate.map.color='nonexistent';assert.throws(()=>DP.resolveGiftProduct(bad,t),/existing product/);
 const cyclic=template();cyclic.extends='promotional_gift';assert.match(DP.giftTemplateError(cyclic),/Circular/);
 const override=structuredClone(raw);override.giftTemplate.overrides.color={k:'changed',l:'Colour',t:'txt'};assert.throws(()=>DP.resolveGiftProduct(override,t),/stable/);
});

test('Phase 3 custom dropdown values require an approved configured charge and reject disabled known options',()=>{
 const p=gift('PG-PB'),f=p.f.find(f=>f.k==='color');f.allowCustom=true;let cfg={...DP.defCfg(p),color:'Pantone 123 C'};assert.match(DP.calc(p,cfg).err,/explicitly approved/);
 f.customCharge={type:'u',amount:2,approved:true};const r=DP.calc(p,cfg);assert.equal(r.err,null);assert.equal(r.sub,230000);assert.ok(r.sp.includes('Colour: Pantone 123 C'));
 assert.match(DP.calc(p,{...cfg,color:'Standard'}).err,/active option/);f.customCharge={type:'f',amount:null,approved:false};assert.match(DP.calc(p,cfg).err,/explicitly approved/);
});

test('Phase 3 explicit future assignment works without changing the 28 inactive catalog products',()=>{
 const initial=DP.seed({demo:false}),future=initial.products.find(p=>p.code==='PG-UM'),assigned=DP.assignGiftProduct(future,template());assert.ok(assigned.giftTemplate);assert.equal(future.giftTemplate,undefined);assert.ok(DP.resolveGiftProduct(assigned,template()).f.some(f=>f.k==='printing'));
 assert.equal(initial.products.filter(p=>p.on===0).length,28);assert.equal(initial.products.filter(p=>p.giftTemplate).length,0);
});

test('Phase 3 ambiguous pre-existing semantic fields require explicit Admin mapping without guessing or replacing prices',()=>{
 const t=template(),p=old('PG-PB');p.f.push({k:'material',l:'Special material surcharge',t:'sel',o:[['Special','u',9]]});const original=structuredClone(p);
 assert.throws(()=>DP.assignGiftProduct(p,t),/Multiple existing fields.*material.*explicit/);assert.deepEqual(p,original);
 p.giftTemplate={id:t.id,map:{material:'mat',printing:'print'},disabled:[],overrides:{}};
 assert.equal(DP.resolveGiftProduct(p,t).f.filter(f=>f.k==='mat').length,1);assert.deepEqual(p.f.find(f=>f.k==='material').o,[['Special','u',9]]);
});

test('Phase 3 backend normalization and no-op saves retain shared references without copying inherited fields into overrides',()=>{
 const {validateState}=require('../server/validation'),admin={id:'admin',name:'Admin',role:'Administrator'};
 const before=DP.seed({demo:false}),input=structuredClone(before);input.set.giftTemplate=template();input.products=input.products.map(p=>p.code==='PG-PB'?DP.phase3Product(p,input.set.giftTemplate):p);
 const saved=validateState(input,before,admin,()=> 'UNUSED'),p=saved.products.find(p=>p.code==='PG-PB');assert.deepEqual(p.giftTemplate.overrides,{});assert.equal(p.f.length,old('PG-PB').f.length);
 const again=validateState(structuredClone(saved),saved,admin,()=> 'UNUSED');assert.deepEqual(again.products.find(record=>record.id===p.id).giftTemplate,p.giftTemplate);
 const changed=structuredClone(again);changed.set.giftTemplate.f.find(f=>f.k==='color').l='Revised shared colour';const applied=validateState(changed,again,admin,()=> 'UNUSED');assert.equal(DP.resolveGiftProduct(applied.products.find(p=>p.code==='PG-PB'),applied.set.giftTemplate).f.find(f=>f.k==='color').l,'Revised shared colour');
});

test('Phase 3 automatic Mug/Calendar model aliases keep live shared PDF metadata until Admin explicitly overrides it',()=>{
 const t=template();for(const code of ['PG-MG','PG-TC']){
  const raw=DP.phase3Product(old(code),t);assert.deepEqual(raw.giftTemplate.overrides,{});assert.equal(DP.resolveGiftProduct(raw,t).f.find(f=>f.k===raw.giftTemplate.map.model).l,'Product Model');
  t.f.find(f=>f.k==='model').show_on_customer_pdf=false;const effective=DP.resolveGiftProduct(raw,t),f=effective.f.find(f=>f.k===raw.giftTemplate.map.model);assert.equal(DP.publicField(f),false);
  f.show_on_customer_pdf=true;const customized=DP.stripGiftProduct(effective,t);assert.ok(customized.giftTemplate.overrides.model);assert.equal(DP.publicField(DP.resolveGiftProduct(customized,t).f.find(f=>f.k===raw.giftTemplate.map.model)),true);
 }
});

test('Phase 3 disabled configured overrides remain validated and require independent pricing authorization',()=>{
 const {validateState}=require('../server/validation'),admin={id:'admin',name:'Admin',role:'Administrator'},catalog={id:'catalog',name:'Catalog',role:'Employee',permissions:['product.view','product.manage']};
 const initial=DP.seed({demo:false}),input=structuredClone(initial);input.set.giftTemplate=template();let raw=DP.phase3Product(input.products.find(p=>p.code==='PG-PB'),input.set.giftTemplate),resolved=DP.resolveGiftProduct(raw,input.set.giftTemplate),color=resolved.f.find(f=>f.k==='color');color.o=[['Blue','u',2]];color.optionMeta={Blue:{enabled:true,approved:true}};raw=DP.stripGiftProduct(resolved,input.set.giftTemplate);raw.giftTemplate.disabled=['color'];input.products=input.products.map(p=>p.id===raw.id?raw:p);
 const saved=validateState(input,initial,admin,()=> 'UNUSED');
 const edited=structuredClone(saved);edited.products.find(p=>p.id===raw.id).giftTemplate.overrides.color.o[0][2]=99;assert.throws(()=>validateState(edited,saved,catalog,()=> 'UNUSED'),error=>error.status===403&&/Pricing/.test(error.message));
 for(const mutate of [f=>f.t='UNKNOWN',f=>f.o[0][2]=-1]){const invalid=structuredClone(saved);mutate(invalid.products.find(p=>p.id===raw.id).giftTemplate.overrides.color);assert.throws(()=>validateState(invalid,saved,admin,()=> 'UNUSED'),error=>error.status===422);}
 const distinct=structuredClone(saved);distinct.products.find(p=>p.id===raw.id).f.push({k:'disabled_color',l:'Distinct active local charge',t:'sel',o:[['Blue','u',9]]});const withLocal=validateState(distinct,saved,admin,()=> 'UNUSED'),tampered=structuredClone(withLocal);tampered.products.find(p=>p.id===raw.id).f.find(f=>f.k==='disabled_color').o[0][2]=99;assert.throws(()=>validateState(tampered,withLocal,catalog,()=> 'UNUSED'),error=>error.status===403&&/Pricing/.test(error.message));
});

test('Phase 3 archived legacy option names cannot mask active configuration price changes during authorization',()=>{
 const {validateState}=require('../server/validation'),admin={id:'admin',name:'Admin',role:'Administrator'},catalog={id:'catalog',name:'Catalog',role:'Employee',permissions:['product.view','product.manage']};
 const initial=DP.seed({demo:false}),input=structuredClone(initial);input.products=input.products.map(p=>p.code==='PG-TS'?DP.phase3Product(p):p);const saved=validateState(input,initial,admin,()=> 'UNUSED');
 const forged=structuredClone(saved),p=forged.products.find(p=>p.code==='PG-TS');p.f.push(structuredClone(p.phase3LegacyFields[0]));p.f.find(f=>f.k==='loc').o.find(o=>o[0]==='2 Locations')[2]=999;
 assert.throws(()=>validateState(forged,saved,catalog,()=> 'UNUSED'),error=>error.status===403&&/Pricing/.test(error.message));
});

test('Phase 3 overridden and disabled raw master rates remain protected and malformed latent definitions are rejected',()=>{
 const {validateState}=require('../server/validation'),admin={id:'admin',name:'Admin',role:'Administrator'},catalog={id:'catalog',name:'Catalog',role:'Employee',permissions:['product.view','product.manage']};
 const initial=DP.seed({demo:false}),input=structuredClone(initial);input.set.giftTemplate=template();let raw=DP.phase3Product(input.products.find(p=>p.code==='PG-MG'),input.set.giftTemplate),resolved=DP.resolveGiftProduct(raw,input.set.giftTemplate);resolved.f.find(f=>f.k==='type').o[1][2]=90;raw=DP.stripGiftProduct(resolved,input.set.giftTemplate);input.products=input.products.map(p=>p.id===raw.id?raw:p);
 let saved=validateState(input,initial,admin,()=> 'UNUSED');
 const changed=structuredClone(saved);changed.products.find(p=>p.id===raw.id).f.find(f=>f.k==='type').o[1][2]=999;assert.throws(()=>validateState(changed,saved,catalog,()=> 'UNUSED'),error=>error.status===403&&/Pricing/.test(error.message));
 const malformed=structuredClone(saved);malformed.products.find(p=>p.id===raw.id).f.find(f=>f.k==='type').o[1][2]=-1;assert.throws(()=>validateState(malformed,saved,admin,()=> 'UNUSED'),error=>error.status===422);
 const disabled=structuredClone(saved);disabled.products.find(p=>p.id===raw.id).giftTemplate.disabled=['model'];saved=validateState(disabled,saved,admin,()=> 'UNUSED');const disabledChanged=structuredClone(saved);disabledChanged.products.find(p=>p.id===raw.id).f.find(f=>f.k==='type').o[1][2]=999;assert.throws(()=>validateState(disabledChanged,saved,catalog,()=> 'UNUSED'),error=>error.status===403&&/Pricing/.test(error.message));
});

test('Phase 3 catalog-only visibility overrides on mapped priced fields retain independent pricing authorization',()=>{
 const {validateState}=require('../server/validation'),admin={id:'admin',name:'Admin',role:'Administrator'},catalog={id:'catalog',name:'Catalog',role:'Employee',permissions:['product.view','product.manage']};
 const initial=DP.seed({demo:false}),input=structuredClone(initial);input.set.giftTemplate=template();input.products=input.products.map(p=>p.code==='PG-MG'?DP.phase3Product(p,input.set.giftTemplate):p);const saved=validateState(input,initial,admin,()=> 'UNUSED'),edited=structuredClone(saved),raw=edited.products.find(p=>p.code==='PG-MG'),resolved=DP.resolveGiftProduct(raw,edited.set.giftTemplate);resolved.f.find(f=>f.k==='type').show_on_customer_pdf=false;edited.products=edited.products.map(p=>p.id===raw.id?DP.stripGiftProduct(resolved,edited.set.giftTemplate):p);
 const hidden=validateState(edited,saved,catalog,()=> 'UNUSED'),p=hidden.products.find(p=>p.id===raw.id);assert.equal(p.giftTemplate.overrides.model.show_on_customer_pdf,false);assert.equal(p.giftTemplate.overrides.model.o[1][2],60);
 const priced=structuredClone(hidden);priced.products.find(p=>p.id===raw.id).giftTemplate.overrides.model.o[1][2]=999;assert.throws(()=>validateState(priced,hidden,catalog,()=> 'UNUSED'),error=>error.status===403&&/Pricing/.test(error.message));
});
