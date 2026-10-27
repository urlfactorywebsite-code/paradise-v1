/* Documented SRS catalog identity, explicit setup planning and read-only readiness. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./domain'):root.DP);if(typeof module==='object'&&module.exports)module.exports=api;else root.Catalog=api;})(typeof globalThis!=='undefined'?globalThis:this,function(DP){
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v)),normal=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const categories={c1:'Graphic Designing',c2:'Printing Services',c3:'Promotional Gifts'};
const sourceProducts=DP.seed({demo:false}).products;
const definitions=[
 ['GD-EN','Envelope','c1','print_product'],['GD-ID','ID Card & Lanyard','c1','print_product',['lanyardType','lanyardCustomization']],
 ['GD-BB','Bill Book','c1','print_product',['copies','carbonSets']],['GD-CT','Catalogue','c1','print_product',['pageCount']],
 ['GD-IN','Invitation','c1','print_product'],['GD-DG','Danglers','c1','print_product'],['GD-MN','Menu Card','c1','print_product'],
 ['GD-SM','Social Media Poster','c1','print_product',['designRequirements','outputSpecifications'],'Digital artwork service: physical print fields disabled; actual deliverables and commercial requirements require business confirmation.'],
 ['GD-CG','Custom Graphic Designs','c1','print_product',['designRequirements','outputSpecifications'],'Design service: physical print fields disabled; actual deliverables and commercial requirements require business confirmation.'],
 ['PR-OF','Offset Printing','c2','stationery_product',[],'Paper/size/sides reuse Stationery; binding remains optional. Confirm actual production choices.'],
 ['PR-DG','Digital Printing','c2','stationery_product',[],'Paper/size/sides reuse Stationery; binding remains optional. Confirm actual production choices.'],
 ['PR-LED','LED Board','c2','area_product'],['PR-ECO','Eco Solvent Printing','c2','area_product'],['PR-DTF','DTF Printing','c2','area_product'],
 ['PR-UV','UV Direct Printing','c2','area_product'],['PR-WV','Waterproof Vinyl Wall Posters','c2','area_product'],['PR-SC','Screen & Canvas Printing','c2','area_product'],
 ['PR-GF','Foil & Emboss Printing','c2','print_product'],['PR-HS','Hologram Stickers','c2','print_product'],['PR-SP','Sunpack Sheet Printing','c2','area_product'],
 ['PG-IT','Ink-Transfer Sticker','c3','print_product',[],'Print template with product-specific material/transfer options still requiring confirmation.'],
 ['PG-UM','Umbrella','c3','promotional_gift'],['PG-PF','Photo Frame','c3','promotional_gift'],
 ['PG-GK','Gazebo / Kiosk','c3','area_product',[],'Area dimensions and optional installation reuse the Area template. Existing unit pricing is retained; construction scope, measurement and commercial pricing basis require business confirmation.'],
 ['PG-PN','Pen','c3','promotional_gift'],['PG-CP','Cap','c3','promotional_gift'],['PG-BD','Badges','c3','promotional_gift'],['PG-SG','Sublimation Gift Printing','c3','promotional_gift'],
];
const aliases={'PR-DTF':['DTF Printing for Fabric & Leather'],'PR-GF':['Gold / Silver Foil & Emboss Printing'],'PG-PN':['Pen Printing']};
const placeholders=definitions.map(([code,name,categoryId,templateId,additionalFields=[],reason=''])=>({code,name,categoryId,categoryName:categories[categoryId],templateId,additionalFields,reason,placeholder:true,method:sourceProducts.find(p=>p.code===code)?.m,aliases:[name,sourceProducts.find(p=>p.code===code)?.name,...(aliases[code]||[])].filter(Boolean)}));
const manifest=Object.freeze([...sourceProducts.filter(p=>!placeholders.some(e=>e.code===p.code)).map(p=>({code:p.code,name:p.name,categoryId:p.cat,categoryName:categories[p.cat],templateId:null,additionalFields:[],reason:'Existing documented catalog product; previous phase configuration retained.',placeholder:false,method:p.m,aliases:[p.name,...(p.code==='GD-BR'?['Brochure']:[])]})),...placeholders].map(e=>Object.freeze({...e,aliases:Object.freeze([...new Set(e.aliases)]),additionalFields:Object.freeze(e.additionalFields)})));
const coverage=Object.freeze({documentedRequired:manifest.length,placeholderRequired:placeholders.length,fullSrsVerified:false,source:'28 products explicitly supplied for Phase 4 plus 12 existing documented seed products. Original complete SRS product-list artifact is not available in this repository.'});
function match(entry,state){
 const coded=(state.products||[]).filter(p=>normal(p.code)===normal(entry.code)||normal(p.catalogManifestCode)===normal(entry.code));
 const names=new Set(entry.aliases.map(normal)),known=new Set(manifest.map(e=>normal(e.code)));
 const named=(state.products||[]).filter(p=>names.has(normal(p.name))&&(!known.has(normal(p.code))||normal(p.code)===normal(entry.code))&&(!p.catalogManifestCode||normal(p.catalogManifestCode)===normal(entry.code))&&p.m===entry.method&&(p.cat===entry.categoryId||normal((state.cats||[]).find(c=>c.id===p.cat)?.name)===normal(entry.categoryName)));
 const candidates=coded.length?coded:named,identityConflict=candidates.some(p=>p.catalogManifestCode&&known.has(normal(p.code))&&normal(p.code)!==normal(p.catalogManifestCode)),product=candidates.length===1&&!identityConflict?candidates[0]:null;
 return {product,candidates,identityConflict,matchedBy:coded.length?(product?.catalogManifestCode?'persistent manifest code':'code'):named.length?'exact documented alias + category + pricing model':'none',duplicates:[...new Set([...coded,...named].map(p=>p.id))].length>1};
}
function templateName(id,settings){return id==='promotional_gift'?(settings?.giftTemplate||DP.giftTemplate()).name:DP.CATALOG_TEMPLATE_IDS.includes(id)?(settings?.catalogTemplates?.[id]||DP.catalogTemplate(id)).name:id?'Unknown template ('+id+')':'Not assigned';}
function pricingReadiness(product,effective){
 const missing=[];let pending=false;
 if(product.priceConfigured===false){missing.push('Approved pricing is not configured.');pending=true;}
 if((product.rate===null||product.rate===undefined)&&!(product.m==='tier'||product.m==='unit'&&product.tiers?.length)){missing.push('Base price is unconfigured.');pending=true;}
 if(product.tax===null||product.tax===undefined){missing.push('Tax treatment/rate requires configuration.');pending=true;}
 if(effective){
  const error=DP.pricingError(effective);if(error&&!missing.includes(error))missing.push(error);
  for(const f of effective.f||[])if(['sel','multi'].includes(f.t)&&(f.required===true||f.t==='sel'&&f.required!==false)&&!DP.activeOptions(f).length&&!(f.allowCustom&&f.customCharge?.approved&&typeof f.customCharge.amount==='number')){missing.push(f.l+': no selectable approved rate.');pending=true;}
 }
 return {ready:missing.length===0,pending,status:missing.length?'Pending':'Ready',missing:[...new Set(missing)]};
}
function readiness(entry,product,state){
 const missing=[],warnings=[];let effective,ref;
 if(!(state.cats||[]).some(c=>c.id===product.cat))missing.push('Valid product category is missing.');
 try{ref=DP.templateAssignment(product);effective=DP.resolveProduct(product,state.set||{});}catch(error){missing.push(error.message);}
 if(entry.placeholder&&!ref)missing.push('Assign the '+templateName(entry.templateId,state.set)+' template.');
 if(entry.placeholder&&ref&&ref.assignment.id!==entry.templateId)missing.push('Expected '+templateName(entry.templateId,state.set)+' template; review the existing assignment.');
 if(effective){
  const error=DP.fieldDefinitionError(effective);if(error)missing.push(error);
  for(const field of effective.f||[]){
   if(!field||typeof field!=='object'){missing.push('Invalid product field definition.');continue;}
   if(!['sel','multi','txt','dim','num','SIZE_BREAKDOWN'].includes(field.t)||typeof field.l!=='string'||!field.l.trim())missing.push('Invalid field definition: '+field.k+'.');
   if(['sel','multi'].includes(field.t)){
    if(!Array.isArray(field.o)||!field.o.length||field.o.some(o=>!Array.isArray(o)||typeof o[0]!=='string'||!o[0].trim())||new Set((field.o||[]).map(o=>o?.[0])).size!==field.o?.length)missing.push(field.l+': option identifiers must be nonempty and unique.');
    else {const optionError=DP.optionDefinitionError(effective,field);if(optionError)missing.push(field.l+': '+optionError);}
   }
  }
  const digital=['GD-SM','GD-CG'].includes(entry.code);
  if(entry.placeholder&&ref){
   const definition=DP.productTemplate(product,state.set||{});
   for(const shared of definition.f){
    const key=ref.assignment.map?.[shared.k]||shared.k,field=effective.f.find(f=>f.k===key),local=ref.assignment.map?.[shared.k]&&product.f.find(f=>f.k===key),override=ref.assignment.overrides?.[shared.k];
    let required=shared.required===true;
    if(local)required=local.required===true||local.t==='sel'&&local.required!==false;
    if(ref.assignment.required?.includes(shared.k))required=true;
    if(override)required=override.required===true||override.t==='sel'&&override.required!==false;
    if(!field&&!digital&&(required||['print_product','stationery_product'].includes(definition.id)&&['size','paper','sides','finish'].includes(shared.k)))missing.push(shared.l+': applicable shared field is disabled or missing.');
   }
  }
  for(const f of effective.f||[])if(['sel','multi'].includes(f.t)&&(f.required===true||f.t==='sel'&&f.required!==false)){
   const enabled=(f.o||[]).filter(o=>DP.optionMeta(f,o[0]).enabled!==false);
   if(!enabled.length&&!f.allowCustom)missing.push(f.l+': configure available options.');
  }
  missing.push(...additionalFieldReview(entry,effective.f).errors);
  if(digital&&effective.f.some(f=>['dim','SIZE_BREAKDOWN'].includes(f.t)||['size','paper','sides','finish'].includes(f.k)))missing.push('Digital service must not require physical print specifications.');
 }
 if(entry.reason)warnings.push(entry.reason);
 const pricing=pricingReadiness(product,effective);if(product.on&&!pricing.ready)warnings.push('Active product has incomplete pricing; review without automatic deactivation.');
 return {configurationReadiness:{ready:missing.length===0,status:missing.length?'Incomplete':'Complete',missing:[...new Set(missing)]},pricingReadiness:pricing,warnings,ref,effective};
}
function checklist(state,filters={}){
 const rows=manifest.map(entry=>{
  const found=match(entry,state),p=found.product,base={code:entry.code,name:entry.name,actualName:p?.name||null,categoryId:p?.cat||entry.categoryId,categoryName:p?(state.cats||[]).find(c=>c.id===p.cat)?.name||'Unknown category':entry.categoryName,productId:p?.id||null,additionalFields:[...entry.additionalFields],mappingReason:entry.reason,matchedBy:found.matchedBy};
  if(!p){const conflict=found.candidates.length>1||found.identityConflict,reason=found.identityConflict?'Product code and persistent manifest identity conflict; review without merging or creating another record.':conflict?'Multiple catalog records match this documented identity; review without merging or creating another record.':'Required product is missing.';return {...base,templateId:null,templateName:'Not assigned',status:conflict?'Conflict':'Missing',active:false,configurationReadiness:{ready:false,status:'Incomplete',missing:[reason]},pricingReadiness:{ready:false,status:'Pending',missing:['No unambiguous product/pricing reference.']},missingRequirements:[reason],warnings:conflict?[reason]:[]};}
  const r=readiness(entry,p,state),id=r.ref?.assignment.id||null,warnings=[...r.warnings];if(found.duplicates)warnings.push('Additional alias record exists; it is not counted as another required product or merged.');
  return {...base,templateId:id,templateName:templateName(id,state.set),status:p.on?'Active':r.pricingReadiness.pending?'Inactive (Price Pending)':'Inactive',active:!!p.on,configurationReadiness:r.configurationReadiness,pricingReadiness:r.pricingReadiness,missingRequirements:[...r.configurationReadiness.missing,...r.pricingReadiness.missing],warnings};
 });
 const counts={required:rows.length,missing:rows.filter(r=>r.status==='Missing').length,inactive:rows.filter(r=>r.status.startsWith('Inactive')).length,active:rows.filter(r=>r.status==='Active').length,conflicts:rows.filter(r=>r.status==='Conflict').length};
 const q=normal(filters.q),filtered=rows.filter(r=>(!q||normal([r.name,r.actualName,r.code,...manifest.find(e=>e.code===r.code).aliases].join(' ')).includes(q))&&(!filters.category||r.categoryId===filters.category)&&(!filters.status||r.status===filters.status)&&(!filters.template||(r.templateId||'unassigned')===filters.template));
 const pageSize=Math.min(100,Math.max(1,Number.isSafeInteger(Number(filters.pageSize))?Number(filters.pageSize):25)),page=Math.max(1,Number.isSafeInteger(Number(filters.page))?Number(filters.page):1);
 return {rows:filtered.slice((page-1)*pageSize,page*pageSize),counts,total:rows.length,filteredTotal:filtered.length,page,pageSize,coverage};
}
function pendingField(k,l,required=false){return{k,l,t:'sel',required,show_on_customer_pdf:true,o:[['Configure options','f',null]],optionMeta:{'Configure options':{enabled:false,approved:false,label:'Configure options',order:0}}};}
function extraField(key){const labels={lanyardType:'Lanyard Type',lanyardCustomization:'Lanyard Customization',copies:'Number of Copies',carbonSets:'Carbon Sets',pageCount:'Page Count',designRequirements:'Design Requirements',outputSpecifications:'Output Specifications'};
 if(['copies','carbonSets'].includes(key))return pendingField(key,labels[key],key==='copies');
 if(key==='pageCount')return{k:key,l:labels[key],t:'num',integer:true,min:1,max:1000000,required:true,show_on_customer_pdf:true};
 return{k:key,l:labels[key],t:'txt',multiline:true,required:false,show_on_customer_pdf:true};
}
// Reuse a single exact documented label only when no duplicate definition is
// present. Admin keys, conditions, options and rates are never renamed here.
function additionalFieldReview(entry,fields=[]){
 const errors=[],present=new Set();
 for(const key of entry.additionalFields){
  const expected=extraField(key),candidates=fields.filter(field=>field.k===key||normal(field.l)===normal(expected.l));
  if(candidates.length>1){errors.push(expected.l+': multiple existing fields match this requirement; review their stable identifiers without merging or replacing Admin definitions.');continue;}
  if(!candidates.length){errors.push('Product-specific field missing: '+key+'.');continue;}
  present.add(key);const field=candidates[0];
  if(key==='pageCount'&&(field.t!=='num'||field.integer!==true||field.required!==true||typeof field.min!=='number'||!Number.isFinite(field.min)||field.min<1||field.when!==undefined))errors.push('Page Count must use an unconditional required positive whole-number field; review the existing Admin definition.');
  if(['copies','carbonSets'].includes(key)&&field.t!=='sel')errors.push(expected.l+' must use Admin-managed choices; review the existing Admin definition.');
  if(key==='copies'&&(field.required===false||field.when!==undefined))errors.push('Number of Copies must be required and unconditional; review the existing Admin definition.');
 }
 return{errors,present};
}
function additionalFieldErrors(product,cats=[]){
 const entry=placeholders.find(e=>normal(e.code)===normal(product?.catalogManifestCode||product?.code))||placeholders.find(e=>match(e,{products:[product],cats}).product);
 return entry?additionalFieldReview(entry,product.f).errors:[];
}
function genericField(entry,field,product){const source=sourceProducts.find(p=>p.code===entry.code)?.f.find(f=>f.k===field.k);return ['material','customization','model','color','pack','artwork'].includes(field.k)&&product.priceConfigured===false&&!!source&&Object.keys(field).length===Object.keys(source).length&&Object.keys(source).every(key=>JSON.stringify(field[key])===JSON.stringify(source[key]));}
function prepareProduct(input,settings={},cats=[]){
 const entry=manifest.find(e=>e.placeholder&&normal(e.code)===normal(input.code))||placeholders.find(e=>match(e,{products:[input],cats}).product);
 if(!entry)throw new Error('Phase 4 preparation is available only for the 28 documented catalog products.');
 if(input.catalogManifestCode&&normal(input.catalogManifestCode)!==normal(entry.code))throw new Error('Product code and persistent manifest identity conflict; review before preparation.');
 const existing=DP.resolveProduct(input,settings),additional=additionalFieldReview(entry,existing.f),incompatible=additional.errors.filter(error=>!error.startsWith('Product-specific field missing: '));
 if(incompatible.length)return{product:clone(input),changed:false,blocked:true,issues:incompatible};
 const before=clone(input);let p=clone(input),ref=DP.templateAssignment(p);
 if(normal(p.code)!==normal(entry.code))p.catalogManifestCode=entry.code;
 if(ref&&ref.assignment.id!==entry.templateId)return{product:p,changed:JSON.stringify(p)!==JSON.stringify(before),blocked:true,issues:['Existing template differs from documented mapping; review explicitly before changing it.']};
 if(!ref)p=DP.assignProductTemplate(p,entry.templateId,settings);
 const referenced=new Set(),conditions=when=>{for(const row of when?.conditions??(when?[when]:[]))referenced.add(row.key);};
 for(const field of p.f||[]){conditions(field.when);for(const metadata of Object.values(field.optionMeta||{}))if(metadata.quantityKey)referenced.add(metadata.quantityKey);}
 for(const rule of [...(p.charges||[]),...(p.compatibility||[])]){conditions(rule.when);if(rule.field)referenced.add(rule.field);}
 ref=DP.templateAssignment(p);const template=DP.productTemplate(p,settings),digital=['GD-SM','GD-CG'].includes(entry.code),genericKeys=new Set(p.f.filter(f=>genericField(entry,f,p)&&!referenced.has(f.k)).map(f=>f.k)),mapped=new Set(Object.values(ref.assignment.map||{}));
 // Retain unmodified sample definitions for history/review without rendering
 // unrelated generic physical controls in the new product-specific projection.
 const archive=p.f.filter(f=>genericKeys.has(f.k)&&(!mapped.has(f.k)||digital)&&!DP.isInternalField(f));
 if(archive.length){p.catalogLegacyFields=[...(p.catalogLegacyFields||[])];for(const field of archive)if(!p.catalogLegacyFields.some(f=>f.k===field.k))p.catalogLegacyFields.push(clone(field));p.f=p.f.filter(f=>!archive.some(a=>a.k===f.k));for(const semantic of Object.keys(ref.assignment.map||{}))if(archive.some(f=>f.k===ref.assignment.map[semantic]))delete ref.assignment.map[semantic];}
 if(digital)ref.assignment.disabled=template.f.map(f=>f.k);
 else for(const shared of template.f){
  const key=ref.assignment.map?.[shared.k]||shared.k,local=p.f.find(f=>f.k===key);
  if(local&&genericKeys.has(key)&&!ref.assignment.overrides?.[shared.k])ref.assignment.overrides[shared.k]={...clone(shared),k:key,required:['print_product','stationery_product'].includes(template.id)?['size','paper','sides','finish'].includes(shared.k):template.id==='area_product'?shared.k==='material':shared.k==='material'||shared.k==='customization'};
 }
 // Requiredness is assignment policy rather than a copied whole-field
 // override, so future shared labels/options continue to inherit. Explicit
 // Admin field policies and overrides take precedence over preparation defaults.
 if(['print_product','stationery_product'].includes(template.id)&&!digital){
  const required=new Set(ref.assignment.required||[]);
  for(const shared of template.f){
   const key=ref.assignment.map?.[shared.k]||shared.k,local=p.f.find(f=>f.k===key),override=ref.assignment.overrides?.[shared.k];
   if(['size','paper','sides','finish'].includes(shared.k)&&local?.required===undefined&&override?.required===undefined)required.add(shared.k);
  }
  ref.assignment.required=[...required];
 }
 const effective=DP.resolveProduct(p,settings);
 for(const key of entry.additionalFields)if(!additional.present.has(key))effective.f.push(extraField(key));
 p=DP.stripProduct(effective,settings);
 return{product:p,changed:JSON.stringify(p)!==JSON.stringify(before),blocked:false,issues:entry.reason?[entry.reason]:[]};
}
function newProduct(entry,state){
 const category=(state.cats||[]).find(c=>c.id===entry.categoryId)||(state.cats||[]).find(c=>normal(c.name)===normal(entry.categoryName));if(!category)throw new Error('Required category is missing; create/review the category explicitly.');
 let id='catalog_'+entry.code.toLowerCase().replace(/[^a-z0-9]+/g,'_'),n=1;while((state.products||[]).some(p=>p.id===id))id='catalog_'+entry.code.toLowerCase().replace(/[^a-z0-9]+/g,'_')+'_'+n++;
 return {id,code:entry.code,name:entry.name,cat:category.id,m:entry.method,rate:null,tax:null,priceConfigured:false,on:0,min:0,minQty:1,tiers:null,taxMode:state.set?.taxMode||'exclusive',unit:entry.method==='area'?'sq ft':['fixed','base','package'].includes(entry.method)?'service':'item',type:entry.categoryId==='c1'?'Design Service':entry.categoryId==='c2'?'Printing':'Promotional Product',description:'Configure actual available specifications and approved pricing before activation.',image:'',charges:[],compatibility:[],f:[{k:'note',l:'Internal Notes',t:'txt',internal_only:true,show_on_customer_pdf:false}]};
}
function prepareCatalog(input){
 const state=clone(input),changes=[],issues=[];
 state.set=state.set||{};state.set.catalogTemplates=state.set.catalogTemplates||{};
 for(const id of DP.CATALOG_TEMPLATE_IDS)if(!state.set.catalogTemplates[id])state.set.catalogTemplates[id]=DP.catalogTemplate(id);
 if(!state.set.giftTemplate)state.set.giftTemplate=DP.giftTemplate();
 for(const entry of placeholders){
  const found=match(entry,state);if(!found.product&&(found.candidates.length>1||found.identityConflict)){issues.push({code:entry.code,reason:'Ambiguous or conflicting catalog identities; no record was created or merged.'});continue;}
  if(found.duplicates)issues.push({code:entry.code,reason:'Duplicate alias record needs explicit review; canonical record retained.'});
  let p=found.product,created=false;
  if(p?.on){if(normal(p.code)!==normal(entry.code)&&p.catalogManifestCode!==entry.code){p.catalogManifestCode=entry.code;changes.push({code:entry.code,id:p.id,action:'linked'});}issues.push({code:entry.code,reason:'Existing active product preserved; review its template/configuration explicitly.'});continue;}
  try{
   if(!p){p=newProduct(entry,state);created=true;}
   const prepared=prepareProduct(p,state.set,state.cats);for(const reason of prepared.issues)issues.push({code:entry.code,reason});
   if(prepared.blocked)continue;
   const templateId=DP.templateAssignment(prepared.product)?.assignment.id,details={templateId,templateName:templateName(templateId,state.set)};
   if(created){state.products.push(prepared.product);changes.push({code:entry.code,id:p.id,action:'created',...details});}
   else if(prepared.changed){state.products[state.products.findIndex(x=>x.id===p.id)]=prepared.product;changes.push({code:entry.code,id:p.id,action:'configured',...details});}
  }catch(error){issues.push({code:entry.code,reason:error.message});}
 }
 return{state,changes,issues};
}
return{manifest,coverage,match,checklist,readiness,prepareProduct,prepareCatalog,additionalFieldErrors};
});
