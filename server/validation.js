'use strict';
const DP = require('../shared/domain');
const Catalog = require('../shared/catalog');
const PricingReadiness = require('../shared/pricing-readiness');
const { hasPermission, authorizeProductChanges, authorizeSettingsChanges } = require('./access');
const { isDeepStrictEqual: equal } = require('node:util');
const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
const object = (v, label) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${label} must be an object.`); return v; };
function str(v, label, max = 200, required = false) {
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) fail(`Invalid ${label}.`);
  if (required && !v.trim()) fail(`${label} is required.`);
  return v;
}
const text = (v, label, max = 200) => str(v ?? '', label, max);
function num(v, label, max = 10000000, integer = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isInteger(v))) fail(`Invalid ${label}.`);
  return v;
}
const id = v => { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v)) fail('Invalid record ID.'); return v; };
function date(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) fail('Invalid date.');
  return v;
}
function list(v, label, max = 10000) { if (!Array.isArray(v) || v.length > max) fail(`Invalid ${label}.`); return v; }
function records(v, label, map) {
  const result = list(v, label).map(x => { object(x, label); id(x.id); return map(x); });
  if (new Set(result.map(x => x.id)).size !== result.length) fail(`Duplicate ${label} IDs.`);
  return result;
}
const on = v => { if (![0, 1, false, true].includes(v)) fail('Invalid active flag.'); return v ? 1 : 0; };
const terms = v => list(v, 'terms', 100).map(t => str(t, 'term', 4000));
function choice(v, values, label) { if (!values.includes(v)) fail(`Invalid ${label}.`); return v; }
function bool(v, label, fallback = false) { if (v === undefined) return fallback; if (typeof v !== 'boolean') fail(`Invalid ${label}.`); return v; }
function image(v, label) {
 const value = text(v, label, 750000);
 if (value && !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) fail(`${label} must be an embedded PNG or JPEG image.`);
 return value;
}
function settings(v) {
 object(v, 'settings');
 const result = {};
 for (const k of ['name', 'tag', 'addr', 'phone', 'email', 'web', 'gstin', 'prefix']) result[k] = text(v[k], k, k === 'addr' ? 2000 : 200);
 str(result.name, 'company name', 200, true);
 if (!/^[A-Za-z0-9 /_-]{1,40}$/.test(result.prefix)) fail('Quotation prefix may contain letters, numbers, spaces, /, _ and - only.');
 result.tax = num(v.tax, 'default tax', 100);
 result.valid = num(v.valid, 'validity', 3650, true);
 result.showNotes = bool(v.showNotes, 'internal notes setting');
 result.terms = terms(v.terms);
 result.employeeDiscountLimit = num(v.employeeDiscountLimit ?? 10, 'employee discount percentage limit', 100);
 result.employeeDiscountMax = num(v.employeeDiscountMax ?? 0, 'employee discount amount limit');
 result.allowAdditionalCharges = bool(v.allowAdditionalCharges, 'additional charge setting', true);
 result.independentApproval = bool(v.independentApproval, 'independent approval setting', true);
 result.taxMode = choice(v.taxMode ?? 'exclusive', DP.TAX_MODES, 'default tax treatment');
 result.taxDisplay = choice(v.taxDisplay ?? 'split', ['split', 'igst'], 'tax presentation');
 result.currency = choice(v.currency ?? 'INR', ['INR'], 'currency');
 result.sequenceStart = num(v.sequenceStart ?? 1, 'quotation starting sequence', 999999999, true);
 if (!result.sequenceStart) fail('Quotation starting sequence must be positive.');
 result.logo = image(v.logo, 'company logo');
 for (const k of ['signature', 'footer', 'customerNotes', 'whatsappTemplate']) result[k] = text(v[k], k, ['signature','footer'].includes(k) ? 200 : 4000);
 if(v.giftTemplate!==undefined)result.giftTemplate=giftTemplate(v.giftTemplate);
 if(v.catalogTemplates!==undefined){
  object(v.catalogTemplates,'catalog templates');result.catalogTemplates={};
  for(const [key,value] of Object.entries(v.catalogTemplates)){
   if(!['print_product','area_product','stationery_product'].includes(key))fail('Unknown catalog template.');
   result.catalogTemplates[key]=catalogTemplate(value,key);
  }
 }
 return result;
}
function giftTemplate(v){
 object(v,'promotional gift template');
 if(Object.keys(v).some(key=>!['id','version','name','f'].includes(key))||v.id!=='promotional_gift'||v.version!==1)fail('Invalid or unsupported promotional gift template.');
 const normalized=product({id:'gift_template',code:'GIFT-TEMPLATE',name:'Promotional gift template',cat:'gift_category',m:'unit',rate:0,tax:0,on:0,f:v.f},[{id:'gift_category'}]);
 const template={id:v.id,version:v.version,...(v.name!==undefined?{name:str(v.name,'template name',150,true)}:{}),f:normalized.f};
 const error=DP.giftTemplateError(template);if(error)fail(error);
 return template;
}
function catalogTemplate(v,key){
 object(v,'catalog template');
 if(Object.keys(v).some(name=>!['id','version','name','f'].includes(name))||v.id!==key||v.version!==1)fail('Invalid or unsupported catalog template.');
 const normalized=product({id:'catalog_template',code:'CATALOG-TEMPLATE',name:'Catalog template',cat:'template_category',m:key==='area_product'?'area':'unit',rate:0,tax:0,on:0,f:v.f},[{id:'template_category'}]);
 const template={id:key,version:1,name:str(v.name,'template name',150,true),f:normalized.f};
 const error=DP.catalogTemplateError(template);if(error)fail(error);
 return template;
}
const fieldKey = (v) => {
 if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(v) || ['__proto__','constructor','prototype'].includes(v)) fail('Invalid product field key.');
 return v;
};
function condition(v) {
 object(v, 'field condition');
 if (v.conditions!==undefined) {
  const mode=choice(v.mode,['ALL','ANY'],'condition group');
  const conditions=list(v.conditions,'field conditions',50).map(row=>{
   object(row,'field condition');fieldKey(row.key);
   const operator=choice(row.operator,['equals','not_equals'],'condition operator');
   const value=typeof row.value==='number'?num(Math.abs(row.value),'condition value'):str(row.value,'condition value',4000);
   return {key:row.key,operator,value:typeof row.value==='number'?row.value:value};
  });
  if(!conditions.length)fail('A condition group needs at least one condition.');
  return {mode,conditions};
 }
 fieldKey(v.key);
 if(v.operator!==undefined&&v.operator!=='equals')fail('Use a condition group for Not Equals.');
 const scalar = value => { if (typeof value === 'number') { if (!Number.isFinite(value) || Math.abs(value)>10000000) fail('Invalid condition value.'); return value; } return str(value, 'condition value', 4000); };
 return { key: v.key, equals: Array.isArray(v.equals) ? list(v.equals, 'condition options', 100).map(scalar) : scalar(v.equals) };
}
function productField(f) {
  object(f, 'product field'); fieldKey(f.k);
  if (['qty','sz','w','h','u'].includes(f.k)&&!(f.k==='sz'&&f.t==='SIZE_BREAKDOWN')) fail('Reserved product field key.');
  const field = { k:f.k, l:str(f.l, 'option label', 150, true), t:choice(f.t, ['sel','multi','txt','dim','num','SIZE_BREAKDOWN'], 'product field type') };
  for(const key of ['show_on_customer_pdf','internal_only'])if(f[key]!==undefined)field[key]=bool(f[key],key);
  if (f.required!==undefined) field.required=bool(f.required, 'required field flag');
  if(f.multiline!==undefined)field.multiline=bool(f.multiline,'multiline text flag');
  if (f.when!==undefined) field.when=condition(f.when);
  if (['sel','multi'].includes(f.t)) {
   if(f.allowCustom!==undefined)field.allowCustom=bool(f.allowCustom,'custom option flag');
   if(f.customCharge!==undefined){object(f.customCharge,'custom option charge');field.customCharge={type:choice(f.customCharge.type,['f','u','p','a','q'],'custom charge basis'),amount:f.customCharge.amount===null?null:num(f.customCharge.amount,'custom option amount'),approved:bool(f.customCharge.approved,'custom rate approval')};}
   for(const key of ['minSelections','maxSelections'])if(f[key]!==undefined)field[key]=num(f[key],key,100,true);
   if(f.legacyTextDefault!==undefined)field.legacyTextDefault=str(f.legacyTextDefault,'retained legacy text default',4000);
   if(f.optionMeta!==undefined){
    object(f.optionMeta,'option metadata');field.optionMeta={};
    for(const [key,input] of Object.entries(f.optionMeta)){
     str(key,'option key',200,true);if(['__proto__','constructor','prototype'].includes(key))fail('Invalid option key.');object(input,'option metadata');
     const m={};for(const k of ['enabled','approved','includesEyelets'])if(input[k]!==undefined)m[k]=bool(input[k],k);
     if(input.label!==undefined)m.label=str(input.label,'option display name',200,true);
     if(input.order!==undefined)m.order=num(input.order,'option order',1000000,true);
     if(input.quantityRule!==undefined)m.quantityRule=choice(input.quantityRule,['none','corners','perimeter'],'option quantity rule');
     if(input.quantityKey!==undefined)m.quantityKey=fieldKey(input.quantityKey);
     if(input.geometry!==undefined){object(input.geometry,'size geometry');const g=input.geometry;m.geometry=g.custom===true?{custom:true}:{w:num(g.w,'size width',10000),h:num(g.h,'size height',10000),u:choice(g.u,Object.keys(DP.AF),'size dimension unit')};}
     field.optionMeta[key]=m;
    }
   }
   if(f.rateBasis!==undefined)field.rateBasis=choice(f.rateBasis,['area'],'field rate basis');
   if(f.quantityRule!==undefined){field.quantityRule=choice(f.quantityRule,['eyelets'],'derived quantity rule');object(f.eyeletPolicy,'eyelet policy');field.eyeletPolicy={approved:bool(f.eyeletPolicy.approved,'eyelet policy approval'),spacingFt:num(f.eyeletPolicy.spacingFt,'eyelet spacing',2),corners:num(f.eyeletPolicy.corners,'corner count',4,true)};}
   field.o=list(f.o, 'choices', 100).map(o=>{
    if (!Array.isArray(o)||o.length!==3||!['f','u','p','a','q'].includes(o[1])) fail('Invalid option charge.');
    return [str(o[0], 'option name', 200, true),o[1],o[2]===null&&DP.optionMeta(field,o[0]).approved===false?null:num(o[2], 'option amount')];
   });
   if (!field.o.length||new Set(field.o.map(x=>x[0])).size!==field.o.length) fail('Option names must be nonempty and unique.');
  }
  if (f.t==='SIZE_BREAKDOWN') {
   field.sizes=list(f.sizes,'size definitions',100).map(size=>{
    object(size,'size definition');
    const key=str(size.key,'size key',80,true);if(['__proto__','constructor','prototype'].includes(key))fail('Invalid size key.');
    return {key,label:str(size.label,'size label',100,true),enabled:bool(size.enabled,'size enabled flag',true),price:num(size.price??0,'size price')};
   });
  }
  if (f.t==='num') {
   for (const k of ['min','max']) if (f[k]!==undefined) { if (typeof f[k]!=='number'||!Number.isFinite(f[k])||Math.abs(f[k])>10000000) fail('Invalid numeric field limit.'); field[k]=f[k]; }
   if (field.min!==undefined&&field.max!==undefined&&field.min>field.max) fail('Numeric minimum exceeds maximum.');
   field.integer=bool(f.integer, 'whole number flag');
  }
  if (f.t==='txt'&&f.maxLength!==undefined) field.maxLength=num(f.maxLength,'text length',4000,true);
  if (f.default!==undefined) {
   if (f.t==='num') { if (typeof f.default!=='number'||!Number.isFinite(f.default)||(field.min!==undefined&&f.default<field.min)||(field.max!==undefined&&f.default>field.max)||(field.integer&&!Number.isInteger(f.default))) fail('Invalid numeric default.'); field.default=f.default; }
   else if (f.t==='multi') { field.default=list(f.default,'default options',100).map(value=>str(value,'default option',200,true));if(new Set(field.default).size!==field.default.length||field.default.some(value=>!field.o.some(o=>o[0]===value)))fail('Default options must be unique and available.'); }
   else if (f.t==='SIZE_BREAKDOWN') fail('Size breakdown defaults are quantities entered on each quotation.');
   else if (f.t!=='dim') { field.default=str(f.default,'field default',4000); if (f.t==='sel'&&field.default!==''&&!field.o.some(o=>o[0]===field.default)) fail('Default option does not exist.'); }
  }
  // Field-local invariants also apply to retained definitions currently masked
  // by a product override or disabled inherited field. Conditions are checked
  // against the complete product projection below.
  const standalone={...field};delete standalone.when;
  const fieldError=DP.fieldDefinitionError({m:'unit',f:[standalone]});if(fieldError)fail(fieldError);
  return field;
}
function product(p, cats, configuration={}) {
 const templates=configuration?.id==='promotional_gift'?{giftTemplate:configuration}:configuration;
 if(p.giftTemplate||p.catalogTemplate){try{
  p={...p,f:list(p.f,'product options',50).map(productField)};
  const ref=DP.templateAssignment(p);if(!ref)fail('Invalid product template assignment.');
  DP.resolveProduct(p,templates);
  p[ref.key]={...ref.assignment,overrides:Object.fromEntries(Object.entries(ref.assignment.overrides||{}).map(([key,field])=>[key,productField(field)]))};
  const all=DP.resolveProduct({...p,[ref.key]:{...p[ref.key],disabled:[]}},templates);
  for(const field of [...all.f,...p.f])if(['sel','multi'].includes(field.t)){const error=DP.optionDefinitionError(all,field);if(error)fail(error);}
  p=DP.resolveProduct(p,templates);
 }catch(error){fail(error.message);}}
 if (!cats.some(c => c.id === p.cat)) fail('Product category does not exist.');
 const priceConfigured=bool(p.priceConfigured,'pricing readiness',true),inactivePending=!priceConfigured;
 const r = { id: p.id, code: str(p.code, 'product code', 80, true), name: str(p.name, 'product name', 200, true), cat: p.cat,
  m: choice(p.m, DP.METHODS, 'pricing method'), rate: p.rate===null&&(inactivePending||p.m==='tier'||p.m==='unit'&&p.tiers?.length)?null:num(p.rate, 'product rate'), min: num(p.min ?? 0, 'minimum charge'), minQty: num(p.minQty ?? p.tiers?.[0]?.[0] ?? 1, 'minimum quantity', 1000000, true), tax: p.tax===null&&inactivePending?null:num(p.tax, 'product tax', 100), taxMode: choice(p.taxMode ?? 'exclusive', DP.TAX_MODES, 'product tax treatment'), on: on(p.on),
  description: text(p.description, 'product description', 4000), image: image(p.image, 'product image'), unit: text(p.unit ?? 'item', 'unit', 80), type: text(p.type ?? 'Product', 'product type', 100), priceConfigured };
 if (!r.minQty) fail('Minimum quantity must be positive.');
 if(p.pricingApproval!==undefined){object(p.pricingApproval,'pricing approval');if(Object.keys(p.pricingApproval).some(key=>!['base','tax'].includes(key)))fail('Invalid pricing approval.');r.pricingApproval={base:bool(p.pricingApproval.base,'base pricing approval',false),tax:bool(p.pricingApproval.tax,'GST approval',false)};}
 if(p.phase2!==undefined)r.phase2=choice(p.phase2,['visiting_card','flex'],'Phase 2 product profile');
 if(p.phase3!==undefined)r.phase3=choice(p.phase3,['tshirt','logo','gift'],'Phase 3 product profile');
 if(p.catalogManifestCode!==undefined){
  const codes=Catalog.manifest.map(entry=>entry.code);
  r.catalogManifestCode=choice(p.catalogManifestCode,codes,'catalog manifest identity');
  const known=codes.find(code=>code.toLowerCase()===p.code.trim().toLowerCase());
  if(known&&known!==r.catalogManifestCode)fail('Catalog manifest identity conflicts with the stable product code.');
 }
 if (p.sizes && ['unit','tier'].includes(p.m)) r.sizes = 1;
 r.tiers = ['unit','tier'].includes(p.m) && p.tiers != null ? list(p.tiers, 'quantity tiers', 100).map(t => {
  if (!Array.isArray(t) || t.length !== 2) fail('Invalid quantity tier.');
  const q = num(t[0], 'tier quantity', 1000000, true); if (!q) fail('Tier quantity must be positive.');
  return [q, num(t[1], 'tier price')];
 }).sort((a,b)=>a[0]-b[0]) : null;
 if ((p.m==='tier' && !r.tiers?.length) || (r.tiers && (!r.tiers.length || new Set(r.tiers.map(t=>t[0])).size!==r.tiers.length))) fail('Quantity tiers must be nonempty and unique.');
 r.f = list(p.f, 'product options', 50).map(productField);
 if (new Set(r.f.map(f=>f.k)).size!==r.f.length) fail('Duplicate product fields.');
 const known = new Set(['qty','w','h','u',...r.f.map(f=>f.k)]);
 const checkCondition = v => { for(const row of v?.conditions??(v?[v]:[]))if(!known.has(row.key))fail('Condition references an unknown field.'); };
 r.f.forEach(f=>checkCondition(f.when));
 r.compatibility=list(p.compatibility??[], 'compatibility rules', 100).map(rule=>{
  object(rule,'compatibility rule'); const when=condition(rule.when);checkCondition(when);
  const field=r.f.find(f=>f.k===rule.field&&f.t==='sel');if(!field)fail('Compatibility rules must reference an option field.');
  const allowed=list(rule.allowed,'compatible options',100).map(v=>str(v,'compatible option',200,true));
  if(!allowed.length||allowed.some(value=>!field.o.some(o=>o[0]===value)))fail('Compatible options must exist in the field.');
  return {...(rule.id!==undefined?{id:str(rule.id,'compatibility rule ID',240,true)}:{}),when,field:field.k,allowed,message:text(rule.message,'compatibility message',500)};
 });
 r.charges=list(p.charges??[], 'additional charges', 100).map(charge=>{
  object(charge,'additional charge');const result={label:str(charge.label,'charge label',200,true),type:choice(charge.type,['f','u','p','a','q'],'charge type'),amount:num(charge.amount,'charge amount')};
  if(charge.when!==undefined){result.when=condition(charge.when);checkCondition(result.when);}return result;
 });
 if(new Set(r.charges.map(c=>c.label)).size!==r.charges.length)fail('Additional charge names must be unique.');
 DP.syncPhase2Rules(r);
 for(const key of ['phase3LegacyFields','catalogLegacyFields'])if(p[key]!==undefined){
  const legacy=product({...r,phase3:undefined,phase3LegacyFields:undefined,catalogLegacyFields:undefined,giftTemplate:undefined,catalogTemplate:undefined,f:p[key],compatibility:[],charges:[],sizes:0},cats);
  r[key]=legacy.f;
 }
 if(new Set(r.compatibility.filter(rule=>rule.id).map(rule=>rule.id)).size!==r.compatibility.filter(rule=>rule.id).length)fail('Compatibility rule IDs must be unique.');
 const definitionError=DP.pricingError({...r,rate:r.rate??0,tax:r.tax??0,priceConfigured:true});if(definitionError)fail(definitionError);
 if(p.giftTemplate||p.catalogTemplate){
  try{const ref=DP.templateAssignment(p),raw=DP.stripProduct(Object.assign(p,r),templates);r.f=raw.f;r[ref.key]=raw[ref.key];}catch(error){fail(error.message);}
 }
 return r;
}
function cfg(v, product) {
  object(v, 'item configuration');
  const quantityError=DP.sizeQuantityError(product,v);if(quantityError)fail(quantityError);
  if(product)v=DP.normalizeConfig(product,v);
  const result = {};
  for (const [k, value] of Object.entries(v)) {
    if (k.startsWith('_')) continue;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k) || ['constructor', 'prototype'].includes(k)) fail('Invalid configuration key.');
    if (value&&typeof value==='object'&&!Array.isArray(value)) {
      object(value, 'size quantities');
      const sizes={};
      for (const [size, amount] of Object.entries(value)) {
        str(size,'size key',80,true);if(['__proto__','constructor','prototype'].includes(size))fail('Invalid size key.');
        sizes[size] = num(amount, 'size quantity', 1000000, true);
      }
      if(Object.keys(sizes).length>100)fail('Too many size quantities.');
      result[k]=sizes;
    } else if(Array.isArray(value))result[k]=list(value,'selected options',100).map(value=>str(value,'selected option',200,true));
    else if (typeof value === 'number') { if (!Number.isFinite(value) || Math.abs(value) > 10000000) fail('Invalid configuration number.'); result[k] = value; }
    else result[k] = str(value, 'configuration value', 4000);
  }
  return result;
}
function validateState(input, previous, user, allocateNumber, options = {}) {
  object(input, 'state');
  list(input.products, 'products');
  authorizeSettingsChanges(input.set,previous.set,user);
  if (!equal(input.cats, previous.cats) && !hasPermission(user, 'product.manage')) fail('Product management permission is required.', 403);
  authorizeProductChanges(input.products, previous.products, user,input.set,previous.set);
  const state = {
    cats: records(input.cats, 'category', c => ({ id: c.id, name: str(c.name, 'category name', 200, true), description: text(c.description, 'category description', 4000), order: num(c.order ?? 0, 'category display order', 1000000, true), on: on(c.on) })),
    set: settings(input.set)
  };
  state.products = records(input.products, 'product', p => {
    const normalized = product(p, state.cats, state.set), saved = previous.products.find(value => value.id === p.id);
    // Existing snapshots remain readable when legacy master definitions need
    // repair. New/changed active or prepared definitions must satisfy the same
    // documented field contract used by preparation and the checklist.
    let changed = !equal(p, saved);
    if (!changed && DP.templateAssignment(normalized))
      changed = !equal(DP.resolveProduct(p, state.set).f, DP.resolveProduct(saved, previous.set).f);
    if (changed && (normalized.on || DP.templateAssignment(normalized))) {
      const errors = Catalog.additionalFieldErrors(DP.resolveProduct(normalized, state.set), state.cats);
      if (errors.length) fail(errors.join(' '));
    }
    return normalized;
  });
  if (new Set(state.products.map(p => p.code.trim().toLowerCase())).size !== state.products.length) fail('Product codes must be unique.');
  const manifestCodes=new Map(Catalog.manifest.map(entry=>[entry.code.toLowerCase(),entry.code])),identities=state.products.map(p=>p.catalogManifestCode||manifestCodes.get(p.code.trim().toLowerCase())).filter(Boolean);
  if(new Set(identities).size!==identities.length)fail('Catalog manifest identities must be unique.');
  for(const p of state.products)if(p.on&&!previous.products.find(saved=>saved.id===p.id)?.on){
    const eligibility=PricingReadiness.eligibility(p,state.set,state.cats);
    if(!eligibility.eligible)throw Object.assign(new Error('Activation blocked: review approved pricing. '+eligibility.errors.map(e=>e.action||e.label).join(' ')),{status:422,code:'ACTIVATION_BLOCKED',details:eligibility});
  }
  state.customers = records(input.customers, 'customer', c => {
    const old = previous.customers.find(x => x.id === c.id);
    const r = { id: c.id, date: date(c.date), wa: text(c.wa, 'customer WhatsApp number', 30), type: text(c.type ?? 'Individual', 'customer type', 100), on: on(c.on ?? 1), createdBy: old ? (old.createdBy || 'System') : (user.id || user.name) };
    for (const k of ['name', 'co', 'person', 'mob', 'email', 'addr', 'gstin', 'notes']) r[k] = text(c[k], `customer ${k}`, ['notes', 'addr'].includes(k) ? 4000 : 200);
    str(r.name, 'customer name', 200, true);
    if (!/^[0-9+ ()-]{10,20}$/.test(r.mob)) fail('Enter a valid customer mobile number.');
    r.wa = r.wa.replace(/[ ()-]/g, '');
    if (r.wa && !/^\+[1-9]\d{7,14}$/.test(r.wa)) fail('WhatsApp number must include + and an international dialing code, using 8-15 digits.');
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) fail('Invalid customer email.');
    return r;
  });
  const oldQuotes = new Map(previous.quotes.map(q => [q.id, q]));
  const now = new Date().toISOString();
  state.quotes = records(input.quotes, 'quotation', q => {
    const old = oldQuotes.get(q.id);
    const source = old || options.duplicateSources?.get(q.id);
    if (!state.customers.some(c => c.id === q.cid)) fail('Quotation customer does not exist.');
    if (!DP.ST.includes(q.status)) fail('Invalid quotation status.');
    if (!old && q.status !== 'Draft') fail('New quotations must start as Draft.');
    if (q.status === 'Approved Internally' && old?.status !== q.status && !hasPermission(user, 'quotation.approve')) fail('Internal approval permission is required.', 403);
    if (q.status === 'Approved Internally' && old?.status !== q.status && state.set.independentApproval && (old?.createdBy || q.createdBy) === user.id) fail('Independent approval requires a different authorized user.', 403);
    const r = { id: q.id, cid: q.cid, date: date(q.date), valid: date(q.valid), status: q.status };
    if (r.valid < r.date) fail('Valid-until date must be on or after quotation date.');
    r.no = old ? old.no : allocateNumber(r.date, state.set.prefix, state.set.sequenceStart);
    for (const k of ['sales', 'ref', 'project', 'subject', 'req']) r[k] = text(q[k], k, k === 'req' ? 4000 : 500);
    r.by = old ? old.by : user.name;
    r.createdBy = old ? (old.createdBy || null) : (user.id || user.name);
    r.customerSnapshot = structuredClone(source?.cid === q.cid ? (source.customerSnapshot || previous.customers.find(c => c.id === q.cid)) : state.customers.find(c => c.id === q.cid));
    r.companySnapshot = structuredClone(source?.companySnapshot || (source ? previous.set : state.set));
    if (q.contact !== undefined) {
      object(q.contact, 'quotation contact');
      if (!equal(q.contact, old?.contact) && !hasPermission(user, 'customer.edit')) fail('Customer edit permission is required to change quotation contact details.', 403);
      r.contact = {};
      for (const k of ['person','mob','wa','email','addr']) if (q.contact[k] !== undefined) r.contact[k] = text(q.contact[k], 'quotation contact ' + k, k === 'addr' ? 4000 : 200);
      if (q.contact.whatsapp !== undefined && q.contact.wa === undefined) r.contact.wa = text(q.contact.whatsapp, 'quotation WhatsApp number', 20);
      if (r.contact.mob && !/^[0-9+ ()-]{10,20}$/.test(r.contact.mob)) fail('Invalid quotation mobile number.');
      if (r.contact.wa) r.contact.wa = r.contact.wa.replace(/[ ()-]/g, '');
      if (r.contact.wa && !/^\+[1-9]\d{7,14}$/.test(r.contact.wa)) fail('Quotation WhatsApp number must use an international dialing code.');
      if (r.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contact.email)) fail('Invalid quotation email.');
      for (const [k, value] of Object.entries(r.contact)) r.customerSnapshot[k === 'whatsapp' ? 'wa' : k] = value;
    }
    r.chargeTax = source?.chargeTax ?? (source ? previous.set.tax : state.set.tax);
    r.chargeTaxMode = source ? (source.chargeTaxMode ?? source.companySnapshot?.taxMode ?? 'exclusive') : state.set.taxMode;
    r.taxDisplay = source ? (source.taxDisplay ?? source.companySnapshot?.taxDisplay ?? 'split') : state.set.taxDisplay;
    r.disc = { t: q.disc?.t, v: num(q.disc?.v, 'discount') };
    if (!['f', 'p'].includes(r.disc.t) || (r.disc.t === 'p' && r.disc.v > 100)) fail('Invalid discount.');
    r.del = num(q.del, 'delivery charge'); r.oth = num(q.oth, 'other charge'); r.terms = terms(q.terms);
    if ((r.del !== (old?.del ?? 0) || r.oth !== (old?.oth ?? 0)) && (r.del || r.oth) && (!hasPermission(user, 'quotation.additional_charges') || (user.role !== 'Administrator' && !state.set.allowAdditionalCharges))) fail('Additional quotation charges are not permitted.', 403);
    r.items = records(q.items, 'quotation item', item => {
      const saved = source?.items.find(i => i.id === item.id);
      const rawProduct = state.products.find(x => x.id === item.pid);
      const p = rawProduct?DP.resolveProduct(rawProduct,state.set):undefined;
      // Only an existing quotation can retain its historical item snapshots.
      // A duplicate is a new quotation and must use current approved pricing.
      const sameSaved = old && saved && saved.pid === item.pid && equal(item.cfg, saved.cfg) && !q._refreshPrices;
      const config = sameSaved ? cfg(item.cfg) : cfg(item.cfg,p), notes = text(item.notes, 'item notes', 4000);
      if (!old || !sameSaved || !equal(item.override, saved.override)) {
        if (!p || !p.on || !state.cats.find(c => c.id === p.cat)?.on) fail('Select an active product from an active category.');
        const errors = Catalog.additionalFieldErrors(p, state.cats);
        if (errors.length) fail(errors.join(' '));
        const eligibility=PricingReadiness.eligibility(rawProduct,state.set,state.cats);
        if(!eligibility.eligible)throw Object.assign(new Error('Pricing blocked: '+eligibility.errors.map(e=>e.action||e.label).join(' ')),{status:422,code:'PRICING_INCOMPLETE',details:eligibility});
      }
      if (sameSaved && equal(item.override, saved.override)) return { ...structuredClone(saved), notes };
      const result = sameSaved ? { sub: saved.override?.originalSub ?? saved.sub } : DP.calc(p, config); if (result.err) fail(result.err);
      if (!Number.isSafeInteger(result.sub) || result.sub > 1000000000000) fail('Item amount exceeds the supported limit.');
      const computed = sameSaved ? { ...structuredClone(saved), notes } : DP.mkItem(p, config, item.id, notes);
      if (sameSaved && saved.override) { computed.sub = saved.override.originalSub; computed.base = saved.override.originalBase; computed.L = structuredClone(saved.override.originalLines); delete computed.override; }
      if (item.override !== undefined) {
        object(item.override, 'manual price override');
        if (!hasPermission(user, 'pricing.override')) fail('Manual pricing override permission is required.', 403);
        const amount = num(item.override.amount, 'overridden item price'), reason = str(item.override.reason, 'override reason', 1000, true);
        computed.override = { amount, reason, originalSub: computed.sub, originalBase: computed.base, originalLines: structuredClone(computed.L), by: user.id || user.name, at: now };
        computed.sub = DP.R(amount); computed.base = Math.min(computed.base, computed.sub);
        computed.L.push(['Authorized price adjustment', computed.sub - computed.override.originalSub]);
      } else if (saved?.override && !hasPermission(user, 'pricing.override')) fail('Manual pricing override permission is required.', 403);
      return computed;
    });
    if (!r.items.length && !['Draft', 'Cancelled'].includes(r.status)) fail('Add an item before changing status.');
    let totals;
    try { totals = DP.totals(r, state.set); }
    catch (error) { fail(error.message); }
    if ((!old || !equal(r.disc, old.disc) || !equal(r.items, old.items)) && !hasPermission(user, 'quotation.discount_unlimited')) {
      if (totals.disc > Math.round(totals.isub * state.set.employeeDiscountLimit / 100) || (state.set.employeeDiscountMax > 0 && totals.disc > DP.R(state.set.employeeDiscountMax))) fail('Discount exceeds the authorized employee limit.', 403);
    }
    if (totals.warn) fail('Discount cannot exceed the product subtotal.');
    if (!Number.isSafeInteger(totals.grand) || totals.grand < 0 || totals.grand > 10000000000000) fail('Quotation total exceeds the supported limit.');
    r.hist = old ? structuredClone(old.hist) : [{ f: '—', t: 'Draft', d: now, u: user.name }];
    if (old && old.status !== r.status) r.hist.push({ f: old.status, t: r.status, d: now, u: user.name, remarks: text(q._statusRemarks, 'status remarks', 2000) });
    return r;
  });
  state.log = structuredClone(previous.log);
  const descriptions = [];
  for (const key of ['cats', 'products', 'customers', 'set']) if (!equal(state[key], previous[key])) descriptions.push(`Updated ${ { cats: 'categories', products: 'catalog/pricing', customers: 'customers', set: 'company settings' }[key]}`);
  for (const q of state.quotes) if (!equal(q, oldQuotes.get(q.id))) descriptions.push(`${oldQuotes.has(q.id) ? 'Updated' : 'Created'} ${q.no} (${q.status})`);
  for (const q of previous.quotes) if (!state.quotes.some(x => x.id === q.id)) descriptions.push(`Deleted ${q.no}`);
  state.log = [...descriptions.map(x => ({ t: now, x, u: user.name })), ...state.log].slice(0, 100);
  return state;
}
module.exports = { validateState, validateProduct:product, fail, str, date, id, num, settings, cfg };
