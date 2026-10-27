'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const DP=require('../shared/domain'),Catalog=require('../shared/catalog');
const state=()=>DP.seed({demo:true}),entry=code=>Catalog.manifest.find(product=>product.code===code);
const row=(data,code)=>Catalog.checklist(data,{pageSize:100}).rows.find(product=>product.code===code);
const product=(data,code)=>data.products.find(product=>product.code===code);

test('Phase 4 catalog manifest accounts for all 28 supplied products with stable unique codes and documented scope',()=>{
 const placeholders=Catalog.manifest.filter(product=>product.placeholder);
 assert.equal(placeholders.length,28);assert.equal(new Set(placeholders.map(product=>product.code)).size,28);
 assert.deepEqual(placeholders.map(product=>product.name),['Envelope','ID Card & Lanyard','Bill Book','Catalogue','Invitation','Danglers','Menu Card','Social Media Poster','Custom Graphic Designs','Offset Printing','Digital Printing','LED Board','Eco Solvent Printing','DTF Printing','UV Direct Printing','Waterproof Vinyl Wall Posters','Screen & Canvas Printing','Foil & Emboss Printing','Hologram Stickers','Sunpack Sheet Printing','Ink-Transfer Sticker','Umbrella','Photo Frame','Gazebo / Kiosk','Pen','Cap','Badges','Sublimation Gift Printing']);
 assert.equal(Catalog.manifest.length,40);assert.equal(Catalog.coverage.fullSrsVerified,false);
 assert.match(Catalog.coverage.source,/Original complete SRS.*not available/);
 assert.ok(placeholders.every(product=>product.categoryId&&product.method&&product.templateId));
});

test('Phase 4 preparation is idempotent and preserves all existing IDs, active approved records and quotation history',()=>{
 const input=state(),before=structuredClone(input),first=Catalog.prepareCatalog(input),again=Catalog.prepareCatalog(first.state);
 assert.deepEqual(input,before);assert.equal(first.changes.length,28);assert.equal(again.changes.length,0);assert.deepEqual(again.state,first.state);
 assert.deepEqual(first.state.products.map(product=>product.id),before.products.map(product=>product.id));
 for(const original of before.products.filter(product=>product.on))assert.deepEqual(product(first.state,original.code),original);
 assert.deepEqual(first.state.quotes,before.quotes);assert.deepEqual(first.state.customers,before.customers);
 for(const original of before.products.filter(product=>!product.on)){
  const prepared=product(first.state,original.code);assert.equal(prepared.on,0);assert.equal(prepared.priceConfigured,false);assert.equal(prepared.rate,original.rate);assert.equal(prepared.tax,original.tax);
  assert.equal(row(first.state,original.code).pricingReadiness.ready,false);
 }
 assert.ok(first.changes.every(change=>change.templateId&&change.templateName));
});

test('Phase 4 missing records are created once with explicitly unconfigured prices and existing category identifiers',()=>{
 const input=state(),removed=product(input,'GD-EN');input.products=input.products.filter(product=>product.id!==removed.id);
 assert.equal(row(input,'GD-EN').status,'Missing');const first=Catalog.prepareCatalog(input),created=product(first.state,'GD-EN');
 assert.ok(created);assert.equal(created.rate,null);assert.equal(created.tax,null);assert.equal(created.on,0);assert.equal(created.priceConfigured,false);assert.equal(created.cat,'c1');
 assert.equal(Catalog.prepareCatalog(first.state).changes.length,0);assert.equal(first.state.products.filter(product=>product.code==='GD-EN').length,1);
 const renamed=state();renamed.cats.find(category=>category.id==='c1').id='business-design';for(const current of renamed.products.filter(product=>product.cat==='c1'))current.cat='business-design';renamed.products=renamed.products.filter(product=>product.code!=='GD-EN');
 assert.equal(product(Catalog.prepareCatalog(renamed).state,'GD-EN').cat,'business-design');
});

test('Phase 4 documented naming aliases require matching category and pricing model and persist a stable link',()=>{
 const input=state(),original=product(input,'PG-PN');Object.assign(original,{code:'BUSINESS-PEN',name:'Pen Printing'});const id=original.id;
 assert.equal(Catalog.match(entry('PG-PN'),input).product.id,id);const prepared=Catalog.prepareCatalog(input).state,saved=product(prepared,'BUSINESS-PEN');
 assert.equal(saved.id,id);assert.equal(saved.code,'BUSINESS-PEN');assert.equal(saved.catalogManifestCode,'PG-PN');assert.equal(prepared.products.length,40);
 saved.name='Business renamed item';assert.equal(Catalog.match(entry('PG-PN'),prepared).product.id,id);assert.equal(row(prepared,'PG-PN').productId,id);
 for(const changed of [{cat:'c2'},{m:'area'},{name:'Pen Refill'}]){
  const candidate=state(),item=product(candidate,'PG-PN');Object.assign(item,{code:'BUSINESS-PEN',...changed});assert.equal(Catalog.match(entry('PG-PN'),candidate).product,null);
 }
});

test('Phase 4 duplicate exact aliases are reported without creating or merging an additional required product',()=>{
 const input=state(),original=product(input,'GD-EN');original.code='LOCAL-ENVELOPE';input.products.push({...structuredClone(original),id:'duplicate-envelope',code:'LOCAL-OTHER'});
 const before=structuredClone(input),report=Catalog.checklist(input,{pageSize:100});assert.equal(row(input,'GD-EN').status,'Conflict');assert.equal(report.counts.required,40);assert.equal(report.counts.conflicts,1);
 const prepared=Catalog.prepareCatalog(input);assert.equal(prepared.state.products.length,before.products.length);assert.deepEqual(prepared.state.products.filter(product=>[original.id,'duplicate-envelope'].includes(product.id)),before.products.filter(product=>[original.id,'duplicate-envelope'].includes(product.id)));
 assert.ok(prepared.issues.some(issue=>issue.code==='GD-EN'&&/Ambiguous/.test(issue.reason)));
});

test('Phase 4 canonical records win over duplicate aliases while warning without merging or counting twice',()=>{
 const input=state(),original=product(input,'GD-EN');input.products.push({...structuredClone(original),id:'alias-record',code:'LOCAL-ENVELOPE'});
 const report=Catalog.checklist(input,{pageSize:100}),found=row(input,'GD-EN');assert.equal(found.productId,original.id);assert.match(found.warnings.join(' '),/Additional alias record/);assert.equal(report.counts.required,40);
 const prepared=Catalog.prepareCatalog(input);assert.equal(prepared.state.products.length,41);assert.deepEqual(prepared.state.products.find(product=>product.id==='alias-record'),input.products.find(product=>product.id==='alias-record'));
});

test('Phase 4 conflicting stable code and manifest linkage cannot identify a single record as two required products',()=>{
 const input=state(),envelope=product(input,'GD-EN');envelope.catalogManifestCode='GD-ID';input.products=input.products.filter(product=>product.code!=='GD-ID');
 assert.equal(row(input,'GD-EN').status,'Conflict');assert.equal(row(input,'GD-ID').status,'Conflict');
 const prepared=Catalog.prepareCatalog(input);assert.equal(prepared.state.products.length,39);assert.deepEqual(product(prepared.state,'GD-EN'),envelope);assert.equal(prepared.changes.some(change=>['GD-EN','GD-ID'].includes(change.code)),false);
});

test('Phase 4 the seven print products inherit the prescribed fields and only documented additional fields',()=>{
 const prepared=Catalog.prepareCatalog(state()).state,extras={'GD-EN':[],'GD-ID':['lanyardType','lanyardCustomization'],'GD-BB':['copies','carbonSets'],'GD-CT':['pageCount'],'GD-IN':[],'GD-DG':[],'GD-MN':[]};
 for(const [code,additional] of Object.entries(extras)){
  const raw=product(prepared,code),ref=DP.templateAssignment(raw),effective=DP.resolveProduct(raw,prepared.set);assert.equal(ref.assignment.id,'print_product');
  for(const semantic of ['size','paper','sides','finish'])assert.equal(effective.f.find(field=>field.k===(ref.assignment.map?.[semantic]||semantic)).required,true);
  for(const key of additional)assert.ok(effective.f.some(field=>field.k===key));assert.equal(new Set(effective.f.map(field=>field.k)).size,effective.f.length);
 }
 const catalogue=DP.resolveProduct(product(prepared,'GD-CT'),prepared.set),page=catalogue.f.find(field=>field.k==='pageCount');assert.equal(page.t,'num');assert.equal(page.integer,true);assert.equal(page.min,1);assert.equal(page.required,true);
 const bill=DP.resolveProduct(product(prepared,'GD-BB'),prepared.set);assert.equal(bill.f.find(field=>field.k==='copies').t,'sel');assert.equal(DP.activeOptions(bill.f.find(field=>field.k==='copies')).length,0);
});

test('Phase 4 digital service exceptions disable physical inherited fields and preserve their original pricing method',()=>{
 const prepared=Catalog.prepareCatalog(state()).state;
 for(const code of ['GD-SM','GD-CG']){
  const raw=product(prepared,code),effective=DP.resolveProduct(raw,prepared.set),found=row(prepared,code);assert.deepEqual(raw.catalogTemplate.disabled,['size','paper','sides','finish']);
  assert.ok(!effective.f.some(field=>['dim','SIZE_BREAKDOWN'].includes(field.t)||['size','paper','sides','finish','material','customization','pack','model','color','artwork'].includes(field.k)));
  assert.ok(effective.f.some(field=>field.k==='designRequirements'));assert.ok(effective.f.some(field=>field.k==='outputSpecifications'));assert.equal(found.configurationReadiness.ready,true);assert.match(found.mappingReason,/service|artwork/);
  assert.equal(raw.m,product(state(),code).m);assert.equal(raw.on,0);
 }
});

test('Phase 4 exceptional Gazebo mapping explains retained unit pricing and optional area installation without invented rates',()=>{
 const prepared=Catalog.prepareCatalog(state()).state,raw=product(prepared,'PG-GK'),effective=DP.resolveProduct(raw,prepared.set);assert.equal(raw.m,'unit');assert.equal(raw.catalogTemplate.id,'area_product');assert.equal(effective.f.find(field=>field.k==='dim').t,'dim');assert.equal(effective.f.find(field=>field.k==='installation').required,false);
 assert.match(row(prepared,'PG-GK').mappingReason,/unit pricing.*retained/i);assert.match(row(prepared,'PG-GK').mappingReason,/business confirmation/);
});

test('Phase 4 Catalogue page count accepts positive integers and rejects missing, zero and fractional values',()=>{
 const prepared=Catalog.prepareCatalog(state()).state,effective=DP.resolveProduct(product(prepared,'GD-CT'),prepared.set);Object.assign(effective,{on:1,rate:2,tax:18,priceConfigured:true});
 for(const field of effective.f.filter(field=>field.t==='sel')){field.o=[['Approved fixture choice','f',0]];field.optionMeta={'Approved fixture choice':{enabled:true,approved:true}};}
 const cfg={...DP.defCfg(effective),qty:5,pageCount:8};assert.equal(DP.calc(effective,cfg).err,null);assert.equal(DP.calc(effective,cfg).sub,1000);
 for(const pageCount of [undefined,0,-1,2.5])assert.match(DP.calc(effective,{...cfg,pageCount}).err,/Page Count|number|integer|whole/i);
});

test('Phase 4 preparation preserves Admin custom field settings and source-like options on inactive approved products',()=>{
 const input=state(),envelope=product(input,'GD-EN'),gift=product(input,'PG-PN');envelope.f.find(field=>field.k==='customization').show_on_customer_pdf=false;Object.assign(gift,{priceConfigured:true,rate:21.75,tax:12});
 const hidden=structuredClone(envelope.f.find(field=>field.k==='customization')),approvedFields=structuredClone(gift.f),prepared=Catalog.prepareCatalog(input).state,saved=product(prepared,'PG-PN'),effective=DP.resolveProduct(saved,prepared.set);
 assert.deepEqual(DP.resolveProduct(product(prepared,'GD-EN'),prepared.set).f.find(field=>field.k==='customization'),hidden);
 for(const field of approvedFields)assert.deepEqual(saved.f.find(current=>current.k===field.k),field);
 assert.equal(saved.rate,21.75);assert.equal(saved.tax,12);assert.equal(saved.on,0);assert.equal(effective.f.find(field=>field.k==='material').o[0][2],0);
 assert.equal(saved.catalogLegacyFields,undefined);
});

test('Phase 4 generic field cleanup retains existing Delivery and compatible extra fields with their rates across all 28 products',()=>{
 const input=state(),envelope=product(input,'GD-EN');envelope.f.push({k:'approvedExtra',l:'Existing optional extra',t:'sel',required:false,o:[['Retained extra','u',3]],show_on_customer_pdf:true});const before=structuredClone(input),prepared=Catalog.prepareCatalog(input).state;
 for(const entry of Catalog.manifest.filter(entry=>entry.placeholder)){
  const raw=product(prepared,entry.code),effective=DP.resolveProduct(raw,prepared.set),delivery=product(before,entry.code).f.find(field=>field.k==='deliv');assert.deepEqual(effective.f.find(field=>field.k==='deliv'),delivery);assert.ok(!raw.catalogLegacyFields?.some(field=>field.k==='deliv'));
 }
 const effective=DP.resolveProduct(product(prepared,'GD-EN'),prepared.set);assert.deepEqual(effective.f.find(field=>field.k==='approvedExtra'),envelope.f.find(field=>field.k==='approvedExtra'));Object.assign(effective,{rate:10,tax:18,priceConfigured:true});
 for(const field of effective.f.filter(field=>field.t==='sel'&&!['deliv','approvedExtra'].includes(field.k))){field.o=[['Approved fixture choice','f',0]];field.optionMeta={'Approved fixture choice':{enabled:true,approved:true}};}
 const cfg={...DP.defCfg(effective),qty:2,deliv:'Express',approvedExtra:'Retained extra'},calculated=DP.calc(effective,cfg);assert.equal(calculated.err,null);assert.equal(calculated.sub,3000);assert.equal(calculated.L.find(line=>line[0]==='Delivery: Express (20% of base)')[1],400);assert.equal(calculated.L.find(line=>line[0]==='Existing optional extra: Retained extra')[1],600);
});

test('Phase 4 preparing source-like generic fields retains definitions referenced by existing conditional or compatibility rules',()=>{
 const input=state(),original=product(input,'GD-EN');original.f.find(field=>field.k==='note').when={key:'model',equals:'Retained model'};original.compatibility=[{field:'customization',when:{key:'material',equals:'Standard'},allowed:['Printed']}];
 const prepared=Catalog.prepareCatalog(input),saved=product(prepared.state,'GD-EN'),effective=DP.resolveProduct(saved,prepared.state.set);
 assert.ok(effective.f.some(field=>field.k==='model'));assert.ok(effective.f.some(field=>field.k==='customization'));assert.deepEqual(saved.compatibility,original.compatibility);assert.deepEqual(effective.f.find(field=>field.k==='note').when,original.f.find(field=>field.k==='note').when);
 assert.equal(DP.fieldDefinitionError(effective),null);
});

test('Phase 4 incompatible template assignments are blocked explicitly while informational exceptional mappings remain reviewable',()=>{
 const input=state(),wrong=DP.assignProductTemplate(product(input,'GD-EN'),'stationery_product'),before=structuredClone(wrong),result=Catalog.prepareProduct(wrong,input.set,input.cats);
 assert.equal(result.blocked,true);assert.equal(result.changed,false);assert.deepEqual(result.product,before);
 const digital=Catalog.prepareProduct(product(input,'GD-SM'),input.set,input.cats);assert.equal(digital.blocked,false);assert.equal(digital.changed,true);assert.match(digital.issues.join(' '),/service/);
});

test('Phase 4 preparation keeps inherited shared updates live and respects explicit Admin optional and disabled policies',()=>{
 const input=state(),first=Catalog.prepareProduct(product(input,'GD-EN'),input.set,input.cats).product;assert.equal(first.catalogTemplate.overrides.finish,undefined);assert.ok(first.catalogTemplate.required.includes('finish'));
 input.set.catalogTemplates={print_product:DP.catalogTemplate('print_product')};input.set.catalogTemplates.print_product.f.find(field=>field.k==='finish').l='Business shared finish';assert.equal(DP.resolveProduct(first,input.set).f.find(field=>field.k==='finish').l,'Business shared finish');
 const edited=DP.resolveProduct(first,input.set);edited.f.find(field=>field.k==='finish').required=false;const raw=DP.stripProduct(edited,input.set);raw.catalogTemplate.disabled=['sides'];const repeated=Catalog.prepareProduct(raw,input.set,input.cats).product;
 assert.equal(DP.resolveProduct(repeated,input.set).f.find(field=>field.k==='finish').required,false);assert.ok(repeated.catalogTemplate.disabled.includes('sides'));assert.ok(!DP.resolveProduct(repeated,input.set).f.some(field=>field.k==='sides'));
 const local=product(state(),'GD-EN');local.f.find(field=>field.k==='material').required=false;const preserved=Catalog.prepareProduct(local,input.set,input.cats).product;assert.equal(DP.resolveProduct(preserved,input.set).f.find(field=>field.k==='material').required,false);assert.ok(!preserved.catalogTemplate.required.includes('paper'));
});

test('Phase 4 configuration readiness and pricing readiness remain independent for defined unapproved options',()=>{
 const prepared=Catalog.prepareCatalog(state()).state,raw=product(prepared,'GD-EN'),effective=DP.resolveProduct(raw,prepared.set);
 for(const field of effective.f.filter(field=>['sel','multi'].includes(field.t))){field.o=[['Business-maintained choice','f',null]];field.optionMeta={'Business-maintained choice':{enabled:true,approved:false}};}
 prepared.products[prepared.products.findIndex(product=>product.id===raw.id)]=DP.stripProduct(effective,prepared.set);
 const found=row(prepared,'GD-EN');assert.equal(found.configurationReadiness.ready,true);assert.equal(found.pricingReadiness.ready,false);assert.equal(found.status,'Inactive (Price Pending)');
 const disabled=DP.resolveProduct(product(prepared,'GD-EN'),prepared.set);disabled.f.find(field=>field.k==='size').optionMeta['Business-maintained choice'].enabled=false;prepared.products[prepared.products.findIndex(product=>product.id===raw.id)]=DP.stripProduct(disabled,prepared.set);
 assert.equal(row(prepared,'GD-EN').configurationReadiness.ready,false);
});

test('Phase 4 readiness rejects invalid definitions, missing shared fields, missing category and cyclic dependencies',()=>{
 const prepared=Catalog.prepareCatalog(state()).state;
 for(const mutate of [item=>item.cat='missing-category',item=>item.catalogTemplate.disabled=['size'],item=>item.f.push({k:'broken',l:'Broken',t:'unknown'}),item=>item.f.push({k:'badChoices',l:'Duplicate choices',t:'sel',o:[['Same','f',0],['Same','f',0]]}),item=>{item.f.push({k:'cycleA',l:'A',t:'txt',when:{key:'cycleB',equals:'yes'}},{k:'cycleB',l:'B',t:'txt',when:{key:'cycleA',equals:'yes'}});}]){
  const input=structuredClone(prepared);mutate(product(input,'GD-EN'));assert.equal(row(input,'GD-EN').configurationReadiness.ready,false);
 }
 const invalid=structuredClone(prepared);product(invalid,'GD-EN').catalogTemplate.id='removed_template';const invalidRow=row(invalid,'GD-EN');assert.equal(invalidRow.templateName,'Unknown template (removed_template)');assert.equal(invalidRow.configurationReadiness.ready,false);assert.match(invalidRow.missingRequirements.join(' '),/Invalid catalog template reference/);
 const gift=structuredClone(prepared);product(gift,'PG-PN').giftTemplate.disabled=['material'];assert.match(row(gift,'PG-PN').configurationReadiness.missing.join(' '),/Material.*disabled or missing/);
});

test('Phase 4 status uses actual activation and explicit pending evidence while preserving approved inactive records',()=>{
 const input=state(),logo=product(input,'GD-LG'),envelope=product(input,'GD-EN');logo.on=0;assert.equal(row(input,'GD-LG').status,'Inactive');assert.equal(row(input,'GD-LG').pricingReadiness.ready,true);
 Object.assign(envelope,{on:1,priceConfigured:false});const active=row(input,'GD-EN');assert.equal(active.status,'Active');assert.equal(active.pricingReadiness.ready,false);assert.match(active.warnings.join(' '),/Active product has incomplete pricing/);
 const before=structuredClone(envelope),prepared=Catalog.prepareCatalog(input);assert.deepEqual(product(prepared.state,'GD-EN'),before);
 // An invalid condition is a configuration error, not evidence that an Admin-disabled approved product awaits rates.
 logo.f.find(field=>field.k==='urg').when={key:'missing',equals:'yes'};const invalid=row(input,'GD-LG');assert.equal(invalid.configurationReadiness.ready,false);assert.equal(invalid.pricingReadiness.ready,false);assert.equal(invalid.status,'Inactive');
});

test('Phase 4 checklist search matches exact documented aliases and actual business names without changing global counts',()=>{
 const input=Catalog.prepareCatalog(state()).state,all=Catalog.checklist(input,{pageSize:100});
 assert.deepEqual(all.counts,{required:40,missing:0,inactive:28,active:12,conflicts:0});
 for(const query of ['Pen Printing','DTF Printing for Fabric & Leather','Gold / Silver Foil'])assert.equal(Catalog.checklist(input,{q:query}).rows.length,1);
 product(input,'GD-EN').name='Business Branded Envelope';assert.equal(Catalog.checklist(input,{q:'Business Branded'}).rows[0].code,'GD-EN');
 const filtered=Catalog.checklist(input,{category:'c1',template:'print_product',status:'Inactive (Price Pending)',pageSize:2,page:2});assert.equal(filtered.rows.length,2);assert.equal(filtered.filteredTotal,9);assert.deepEqual(filtered.counts,all.counts);
});
