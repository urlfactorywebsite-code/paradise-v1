'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const DP=require('../shared/domain');
const fresh=()=>({id:'fixture',code:'FIXTURE',name:'Template Fixture',cat:'c1',m:'unit',rate:10,tax:18,min:0,minQty:1,on:0,priceConfigured:true,f:[{k:'note',l:'Notes',t:'txt'}],charges:[],compatibility:[]});
const settings=()=>({giftTemplate:DP.giftTemplate(),catalogTemplates:Object.fromEntries(DP.CATALOG_TEMPLATE_IDS.map(id=>[id,DP.catalogTemplate(id)]))});
function approved(field,value,basis,amount){field.o=[[value,basis,amount]];field.optionMeta={[value]:{enabled:true,approved:true}};field.required=true;}

test('Phase 4 templates reuse one projection contract with three new canonical definitions and existing gift source',()=>{
 const set=settings(),keys={print_product:['size','paper','sides','finish'],area_product:['dim','material','lamination','installation'],stationery_product:['paper','size','sides','binding']};
 for(const id of DP.CATALOG_TEMPLATE_IDS){
  const definition=DP.catalogTemplate(id);assert.deepEqual(definition.f.map(f=>f.k),keys[id]);assert.equal(DP.catalogTemplateError(definition),null);
  const p=fresh();if(id==='area_product')p.m='area';const raw=DP.assignProductTemplate(p,id,set),effective=DP.resolveProduct(raw,set);
  assert.equal(raw.f.length,p.f.length);assert.equal(effective.f.length,p.f.length+keys[id].length);assert.equal(DP.productTemplate(raw,set),set.catalogTemplates[id]);assert.equal(DP.templateAssignment(raw).key,'catalogTemplate');
  for(const field of definition.f.filter(f=>f.t==='sel')){assert.equal(field.o[0][2],null);assert.equal(DP.activeOptions(field).length,0);assert.equal(field.required,false);}
 }
 const gift=DP.assignProductTemplate(fresh(),'promotional_gift',set);assert.equal(DP.templateAssignment(gift).key,'giftTemplate');assert.equal(DP.productTemplate(gift,set),set.giftTemplate);assert.deepEqual(DP.resolveProduct(gift,set).f,DP.resolveGiftProduct(gift,set.giftTemplate).f);
 assert.throws(()=>DP.catalogTemplate('unknown'),/Unknown/);assert.match(DP.catalogTemplateError(DP.giftTemplate()),/Invalid/);
});

test('Phase 4 mapped local definitions and approved rates are preserved and priced exactly once',()=>{
 const set=settings(),p=fresh();p.f.unshift({k:'mat',l:'Existing Stock',t:'sel',o:[['Approved board','u',2]]});
 const raw=DP.assignProductTemplate(p,'print_product',set),effective=DP.resolveProduct(raw,set);assert.equal(raw.catalogTemplate.map.paper,'mat');assert.deepEqual(raw.f,p.f);assert.equal(effective.f.filter(f=>f.k==='mat').length,1);
 const cfg={...DP.defCfg(effective),qty:10},before=DP.calc(p,{...DP.defCfg(p),qty:10}),after=DP.calc(effective,cfg);assert.equal(before.sub,12000);assert.equal(after.sub,before.sub);assert.equal(after.L.filter(row=>row[0].includes('Approved board')).length,1);
 const item=DP.mkItem(effective,cfg,'preserved');assert.ok(DP.customerSpecifications(item).includes('Existing Stock: Approved board'));assert.deepEqual(DP.assignProductTemplate(raw,'print_product',set),raw);
});

test('Phase 4 product overrides remain isolated and retain inactive definitions while disabling and restoring',()=>{
 const set=settings(),one=DP.assignProductTemplate(fresh(),'print_product',set),two=DP.assignProductTemplate({...fresh(),id:'other'},'print_product',set),before=JSON.stringify(set),resolved=DP.resolveProduct(one,set);
 approved(resolved.f.find(f=>f.k==='paper'),'Fixture stock','u',1.25);resolved.f.push({k:'copies',l:'Copy instruction',t:'txt',show_on_customer_pdf:true});
 let raw=DP.stripProduct(resolved,set);assert.equal(raw.catalogTemplate.overrides.paper.o[0][2],1.25);assert.ok(raw.f.some(f=>f.k==='copies'));assert.equal(JSON.stringify(set),before);assert.equal(DP.activeOptions(DP.resolveProduct(two,set).f.find(f=>f.k==='paper')).length,0);
 raw.catalogTemplate.disabled=['paper'];const disabled=DP.resolveProduct(raw,set),saved=DP.stripProduct(disabled,set);assert.equal(saved.catalogTemplate.overrides.paper.o[0][2],1.25);assert.ok(!disabled.f.some(f=>f.k==='paper'));
 const cfg={...DP.defCfg(disabled),qty:10,paper:'Fixture stock'};assert.equal(DP.normalizeConfig(disabled,cfg).paper,undefined);assert.equal(DP.calc(disabled,cfg).sub,10000);
 saved.catalogTemplate.disabled=[];assert.equal(DP.resolveProduct(saved,set).f.find(f=>f.k==='paper').o[0][2],1.25);
});

test('Phase 4 template field ordering persists as stable product ordering without copying shared definitions',()=>{
 const set=settings(),raw=DP.assignProductTemplate(fresh(),'stationery_product',set),resolved=DP.resolveProduct(raw,set);
 resolved.f=[resolved.f.find(f=>f.k==='binding'),resolved.f.find(f=>f.k==='paper'),...resolved.f.filter(f=>!['binding','paper'].includes(f.k))];
 const saved=DP.stripProduct(resolved,set),again=DP.resolveProduct(saved,set);assert.deepEqual(saved.catalogTemplate.order,resolved.f.map(f=>f.k));assert.deepEqual(again.f.map(f=>f.k),saved.catalogTemplate.order);assert.deepEqual(saved.catalogTemplate.overrides,{});assert.equal(saved.f.length,1);
 const invalid=structuredClone(saved);invalid.catalogTemplate.order=['paper','paper'];assert.throws(()=>DP.resolveProduct(invalid,set),/order/);
});

test('Phase 4 shared conditions remap to local keys and existing compatibility validation remains authoritative',()=>{
 const set=settings(),template=set.catalogTemplates.print_product;approved(template.f.find(f=>f.k==='size'),'Large','f',0);template.f.find(f=>f.k==='finish').when={key:'paper',equals:'Approved stock'};
 // A shared condition must reference a defined shared choice, then remap to mat.
 approved(template.f.find(f=>f.k==='paper'),'Approved stock','u',2);const p=fresh();p.f.unshift({k:'mat',l:'Local Paper',t:'sel',o:[['Approved stock','u',2]]});
 const raw=DP.assignProductTemplate(p,'print_product',set),resolved=DP.resolveProduct(raw,set);assert.equal(resolved.f.find(f=>f.k==='finish').when.key,'mat');assert.equal(DP.fieldVisible(resolved.f.find(f=>f.k==='finish'),{...DP.defCfg(resolved),mat:'Approved stock'},resolved),true);
 raw.compatibility=[{when:{key:'mat',equals:'Approved stock'},field:'size',allowed:['Large']}];assert.equal(DP.resolveProduct(raw,set).compatibility.length,1);
 const cyclic=structuredClone(set);cyclic.catalogTemplates.print_product.f.find(f=>f.k==='size').when={key:'finish',equals:''};cyclic.catalogTemplates.print_product.f.find(f=>f.k==='finish').when={key:'size',equals:'Large'};assert.throws(()=>DP.resolveProduct(raw,cyclic),/Circular|unavailable/);
});

test('Phase 4 malformed, circular, duplicate and forged assignments cannot impersonate internal template provenance',()=>{
 const set=settings(),raw=DP.assignProductTemplate(fresh(),'print_product',set);
 for(const mutate of [p=>p.catalogTemplate.id='unknown',p=>p.catalogTemplate.map.paper='missing',p=>p.catalogTemplate.map.paper='size',p=>p.catalogTemplate.disabled=['bad'],p=>p.catalogTemplate.overrides.paper={k:'size',l:'Bad',t:'txt'},p=>p.catalogTemplate.extends='print_product',p=>p.giftTemplate={id:'promotional_gift'},p=>p.__giftRaw={...p,rate:999},p=>p.__templateRaw={...p,rate:999}]){const bad=structuredClone(raw);mutate(bad);assert.throws(()=>DP.resolveProduct(bad,set));}
 const nested=DP.catalogTemplate('print_product');nested.parent='print_product';assert.match(DP.catalogTemplateError(nested),/Circular/);
 const dims=DP.catalogTemplate('area_product');dims.f.find(f=>f.k==='dim').t='txt';assert.match(DP.catalogTemplateError(dims),/Dimensions/);
 const ambiguous=fresh();ambiguous.f.push({k:'material',l:'Material',t:'txt'},{k:'mat',l:'Special stock',t:'txt'});assert.throws(()=>DP.assignProductTemplate(ambiguous,'print_product',set),/Multiple/);const explicit=DP.assignProductTemplate(ambiguous,'print_product',set,{map:{paper:'mat'}});assert.equal(explicit.catalogTemplate.map.paper,'mat');
 const customKey=fresh();customKey.f.push({k:'approvedEnvelopeSize',l:'Envelope Size',t:'sel',o:[['Business-maintained size','f',7]]});const preserved=DP.assignProductTemplate(customKey,'print_product',set);assert.equal(preserved.catalogTemplate.map.size,'approvedEnvelopeSize');assert.equal(DP.resolveProduct(preserved,set).f.filter(f=>/Size/.test(f.l)).length,1);
});

test('Phase 4 area template uses the existing geometry engine across units and optional installation adds no unapproved charge',()=>{
 const set=settings(),raw=DP.assignProductTemplate({...fresh(),m:'area',rate:20},'area_product',set),p=DP.resolveProduct(raw,set);
 const inFeet={...DP.defCfg(p),w:2,h:3,u:'ft',qty:2},inInches={...inFeet,w:24,h:36,u:'in'};assert.equal(DP.calc(p,inFeet).sub,24000);assert.equal(DP.calc(p,inInches).sub,24000);
 const install=p.f.find(f=>f.k==='installation');assert.equal(install.required,false);assert.equal(DP.activeOptions(install).length,0);assert.ok(DP.calc(p,{...inFeet,installation:'Configure options'}).err);
 assert.ok(DP.calc(p,{...inFeet,w:-1}).err);assert.ok(DP.calc(p,{...inFeet,u:'yard'}).err);
});

test('Phase 4 new quotation snapshots preserve shared definitions and PDF policy across later catalog edits',()=>{
 const set=settings(),raw=DP.assignProductTemplate(fresh(),'print_product',set),p=DP.resolveProduct(raw,set);approved(p.f.find(f=>f.k==='size'),'Fixture size','f',3);p.f.push({k:'instructions',l:'Customer instructions',t:'txt',multiline:true,show_on_customer_pdf:true});
 const cfg={...DP.defCfg(p),qty:10,instructions:'Approved instruction',note:'PRIVATE'},item=DP.mkItem(p,cfg,'snapshot'),before=structuredClone(item);assert.ok(item);assert.ok(DP.customerSpecifications(item).includes('Customer instructions: Approved instruction'));assert.ok(!DP.customerSpecifications(item).some(value=>value.includes('PRIVATE')));
 set.catalogTemplates.print_product.f.find(f=>f.k==='size').l='Changed after save';set.catalogTemplates.print_product.f.find(f=>f.k==='size').show_on_customer_pdf=false;
 assert.deepEqual(item,before);assert.ok(DP.customerSpecifications(item).includes('Size: Fixture size'));assert.equal(item.sub,10300);
});

test('Phase 4 backend normalization keeps catalog template references idempotent without flattening shared fields',()=>{
 const {validateState}=require('../server/validation'),admin={id:'admin',name:'Admin',role:'Administrator'},before=DP.seed({demo:false}),input=structuredClone(before);input.set.catalogTemplates=settings().catalogTemplates;
 const original=input.products.find(p=>p.code==='GD-EN');Object.assign(original,DP.assignProductTemplate(original,'print_product',input.set));
 const saved=validateState(input,before,admin,()=> 'UNUSED'),product=saved.products.find(p=>p.id===original.id);assert.deepEqual(product.catalogTemplate.overrides,{});assert.equal(product.f.length,original.f.length);
 const repeated=validateState(structuredClone(saved),saved,admin,()=> 'UNUSED');assert.deepEqual(repeated.products.find(p=>p.id===original.id).catalogTemplate,product.catalogTemplate);
 const updated=structuredClone(repeated);updated.set.catalogTemplates.print_product.f.find(f=>f.k==='finish').l='Reviewed finish';const final=validateState(updated,repeated,admin,()=> 'UNUSED');assert.equal(DP.resolveProduct(final.products.find(p=>p.id===original.id),final.set).f.find(f=>f.k==='finish').l,'Reviewed finish');
});

test('Phase 4 known archived generic values are pruned only from current edits and never shadow live field keys',()=>{
 const set=settings(),raw=DP.assignProductTemplate(fresh(),'print_product',set);raw.catalogLegacyFields=[{k:'oldMaterial',l:'Legacy material',t:'txt'},{k:'note',l:'Notes',t:'txt'}];
 const p=DP.resolveProduct(raw,set),cfg={...DP.defCfg(p),oldMaterial:'Old saved value',note:'Still internal'};assert.equal(DP.normalizeConfig(p,cfg).oldMaterial,undefined);assert.equal(DP.normalizeConfig(p,cfg).note,'Still internal');assert.equal(DP.calc(p,cfg).err,null);
 assert.match(DP.calc(p,{...cfg,unknownSavedValue:'Not archived'}).err,/Unknown/);assert.throws(()=>DP.assignProductTemplate(fresh(),'print_product',set,{id:'area_product'}),/options/);
});

test('Phase 4 assignment required policy persists without freezing inherited labels and explicit full overrides take precedence',()=>{
 const set=settings(),raw=DP.assignProductTemplate(fresh(),'print_product',set,{required:['size','finish']}),effective=DP.resolveProduct(raw,set),saved=DP.stripProduct(effective,set);
 assert.deepEqual(saved.catalogTemplate.required,['size','finish']);assert.deepEqual(saved.catalogTemplate.overrides,{});assert.equal(effective.f.find(field=>field.k==='size').required,true);assert.equal(effective.f.find(field=>field.k==='paper').required,false);
 set.catalogTemplates.print_product.f.find(field=>field.k==='finish').l='Updated shared finish';assert.equal(DP.resolveProduct(saved,set).f.find(field=>field.k==='finish').l,'Updated shared finish');
 const edited=DP.resolveProduct(saved,set);Object.assign(edited.f.find(field=>field.k==='finish'),{l:'Product finish policy',required:false});const overridden=DP.stripProduct(edited,set);
 assert.equal(overridden.catalogTemplate.overrides.finish.required,false);assert.equal(DP.resolveProduct(overridden,set).f.find(field=>field.k==='finish').required,false);
 delete overridden.catalogTemplate.overrides.finish;assert.equal(DP.resolveProduct(overridden,set).f.find(field=>field.k==='finish').required,true);assert.equal(DP.resolveProduct(overridden,set).f.find(field=>field.k==='finish').l,'Updated shared finish');
});

test('Phase 4 required semantic policy survives disabling and restoring with stable mapped identifiers',()=>{
 const set=settings(),p=fresh();p.f.push({k:'productPaper',l:'Paper',t:'sel',o:[['Approved paper','u',2]]});const raw=DP.assignProductTemplate(p,'print_product',set,{required:['paper','finish']});raw.catalogTemplate.disabled=['paper'];
 const effective=DP.resolveProduct(raw,set),saved=DP.stripProduct(effective,set);assert.deepEqual(saved.catalogTemplate.required,['paper','finish']);assert.ok(!effective.f.some(field=>field.k==='productPaper'));
 saved.catalogTemplate.disabled=[];const restored=DP.resolveProduct(saved,set);assert.equal(restored.f.find(field=>field.k==='productPaper').required,true);assert.equal(restored.f.find(field=>field.k==='productPaper').o[0][2],2);
 for(const required of [['paper','paper'],['productPaper'],'paper',null]){const invalid=structuredClone(raw);invalid.catalogTemplate.required=required;assert.throws(()=>DP.resolveProduct(invalid,set),/Required shared template fields/);}
});

test('Phase 4 Area Dimensions cannot be remapped or overridden to an incompatible field type',()=>{
 const set=settings(),p={...fresh(),m:'area'};p.f.push({k:'notDimensions',l:'Legacy size note',t:'txt'});
 assert.throws(()=>DP.assignProductTemplate(p,'area_product',set,{map:{dim:'notDimensions'}}),/Dimensions.*dimensions field/);
 const raw=DP.assignProductTemplate(p,'area_product',set);raw.catalogTemplate.overrides.dim={k:'dim',l:'Dimensions note',t:'txt'};assert.throws(()=>DP.resolveProduct(raw,set),/Dimensions.*dimensions field/);
 delete raw.catalogTemplate.overrides.dim;raw.catalogTemplate.disabled=['dim'];assert.ok(!DP.resolveProduct(raw,set).f.some(field=>field.k==='dim'));
});
