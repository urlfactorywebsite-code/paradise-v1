'use strict';
const crypto = require('node:crypto');
const { fail, id } = require('./validation');
const { hasPermission, requirePermission, effectivePermissions } = require('./access');
const { PAGES, REGISTRY } = require('./field-registry');
const FIELD_CONTROLS=require('../shared/field-controls');
const {TYPES,choices}=require('../shared/dynamic-values');
const DP=require('../shared/domain');
const MAX_FIELDS = 500, MAX_OPTIONS = 100;
const PRODUCT_PAGES = ['products', 'quotations', 'pricing'];
const columns = `id,base_field_id AS "baseFieldId",page_key AS "pageKey",field_key AS "fieldKey",
 label,field_type AS "fieldType",policy,scope_type AS "scopeType",scope_id AS "scopeId",
 is_required AS "isRequired",is_active AS "isActive",is_visible AS "isVisible",display_order AS "displayOrder",
 configuration,version,created_at AS "createdAt",updated_at AS "updatedAt"`;
const optionColumns = `id,field_id AS "fieldId",value,label,display_order AS "displayOrder",is_active AS "isActive",
 archived_at AS "archivedAt",created_at AS "createdAt",updated_at AS "updatedAt"`;
const own = (o, key) => Object.hasOwn(o, key);
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('An object is required.');
  return value;
}
function keys(value, allowed) {
  object(value);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('Unsupported field configuration property: ' + key);
}
function text(value, label, max = 150) {
  if (typeof value !== 'string' || value.length > max || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) fail('Invalid ' + label + '.');
  return value.trim();
}
function integer(value, max = 10000) {
  if (!Number.isInteger(value) || value < 0 || value > max) fail('Invalid configuration order or limit.');
  return value;
}
function pageKey(value) {
  if (typeof value !== 'string' || !own(PAGES, value)) fail('Unsupported configuration page.');
  return value;
}
const stepperFor=field=>FIELD_CONTROLS.controls.find(control=>control.id===field?.id)?.stepper;
const captionKeys=field=>stepperFor(field)?['label','configuration']:['label'];
function configuration(value, global, field) {
  const stepper=stepperFor(field);
  if(stepper){
    keys(value,['cycleMax']);
    if(!Number.isInteger(value.cycleMax)||value.cycleMax<stepper.min||value.cycleMax>stepper.max)fail('Percentage cycle limit must be a whole number from '+stepper.min+' to '+stepper.max+'.');
    return {cycleMax:value.cycleMax};
  }
  keys(value, global ? ['placeholder', 'helpText', 'maxLength', 'pages'] : ['placeholder', 'helpText', 'maxLength']);
  const result = {};
  for (const [key, max] of [['placeholder', 150], ['helpText', 500]]) {
    if (own(value, key)) result[key] = value[key] === '' ? '' : text(value[key], key, max);
  }
  if (own(value, 'maxLength')) {
    if (integer(value.maxLength, 4000) < 1) fail('maxLength must be positive.');
    result.maxLength = value.maxLength;
  }
  if (global) {
    if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length > Object.keys(PAGES).length || new Set(value.pages).size !== value.pages.length) fail('Global fields require explicit, unique target pages.');
    result.pages = value.pages.map(pageKey).sort();
  }
  return result;
}
function settings(data, previous) {
  const result = { ...previous };
  if (own(data, 'label')) result.label = text(data.label, 'field label');
  for (const key of ['isRequired', 'isActive', 'isVisible']) if (own(data, key)) {
    if (typeof data[key] !== 'boolean') fail('Invalid ' + key + '.');
    result[key] = data[key];
  }
  if (own(data, 'displayOrder')) result.displayOrder = integer(data.displayOrder);
  if (own(data, 'configuration')) result.configuration = configuration(data.configuration, result.scopeType === 'global',result);
  if (result.isRequired && !result.isVisible) fail('A hidden field cannot be required.');
  return result;
}
function optionInput(data, previous = {}) {
  keys(data, previous.id ? ['label', 'isActive', 'displayOrder'] : ['value', 'label', 'isActive', 'displayOrder']);
  if (previous.id && !Object.keys(data).length) fail('No option changes supplied.');
  const result = { ...previous, ...data };
  if (!previous.id && (typeof result.value !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(result.value) || ['constructor', 'prototype', '__proto__'].includes(result.value))) fail('Use an immutable lowercase option key, at most 64 characters.');
  result.label = text(result.label, 'option label');
  if (result.isActive === undefined) result.isActive = true;
  if (typeof result.isActive !== 'boolean') fail('Invalid option activation.');
  result.displayOrder = integer(result.displayOrder === undefined ? 0 : result.displayOrder);
  if (previous.archivedAt && result.isActive) fail('Archived option keys cannot be reused or reactivated.', 409);
  return result;
}
function readable(user) {
  return hasPermission(user, 'fields.view') || hasPermission(user, 'fields.manage');
}
function requireRead(user) {
  if (!readable(user)) fail('Field configuration access is required.', 403);
}
function requirePage(user, page) {
  if (!hasPermission(user, 'fields.manage') && !PAGES[page].some(permission => hasPermission(user, permission))) fail('Page configuration access is required.', 403);
}
function queries(params, allowed) {
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1 || !params.get(key)) fail('Invalid configuration query parameter.');
}
function positive(raw, fallback, max) {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) fail('Invalid pagination.');
  return Number(raw);
}
async function readFields(db,where,values,suffix=''){
 const rows=await db.prepare(`SELECT ${columns} FROM configurable_fields ${where} ${suffix}`).all(...values);
 const options=rows.length?await db.prepare(`SELECT ${optionColumns} FROM configurable_field_options WHERE field_id=ANY(?::text[]) ORDER BY display_order,id`).all(rows.map(row=>row.id)):[];
 const groups=new Map();for(const option of options){if(!groups.has(option.fieldId))groups.set(option.fieldId,[]);groups.get(option.fieldId).push(option);}
 const bindings=rows.some(row=>row.pageKey==='products'&&row.scopeType==='product')?await db.prepare('SELECT field_id AS "fieldId",canonical_key AS key,native_type AS type,option_values AS "optionValues" FROM product_field_bindings WHERE field_id=ANY(?::text[])').all(rows.map(row=>row.id)):[];
 const nativeByField=new Map(bindings.map(binding=>[binding.fieldId,binding]));
 return rows.map(row=>({...row,options:groups.get(row.id)||[],...(nativeByField.has(row.id)?{native:nativeByField.get(row.id)}:{})}));
}
function resolveCandidates(candidates,pages,productId){
 candidates=candidates.filter(field=>field.scopeType!=='product'||field.scopeId===productId);
 const roots=candidates.filter(field=>!field.baseFieldId),result={};
 for(const page of pages)result[page]=roots.filter(root=>root.pageKey===page||root.pageKey==='global'&&root.configuration.pages.includes(page)).map(root=>{
  const overrides=candidates.filter(field=>field.baseFieldId===root.id&&field.pageKey===page);
  const selected=overrides.find(field=>productId&&field.scopeType==='product'&&field.scopeId===productId)||overrides.find(field=>field.scopeType==='page')||root;
  return {...selected,rootFieldId:root.id,qualifiedKey:root.pageKey+'.'+(root.scopeType==='product'?root.scopeId+'.':'')+root.fieldKey,options:selected.options.filter(option=>!option.archivedAt&&option.isActive),retainedOptions:selected.options.filter(option=>option.archivedAt||!option.isActive)};
 }).sort((a,b)=>a.displayOrder-b.displayOrder||a.qualifiedKey.localeCompare(b.qualifiedKey));
 return result;
}
async function resolveFields(db,pages,productId){
 const candidates=await readFields(db,`WHERE (page_key=ANY(?::text[]) OR page_key='global') AND (scope_type<>'product' OR scope_id=?)`,[pages,productId||null],'ORDER BY display_order,id LIMIT 601');
 if(candidates.length>600)fail('Configuration limit exceeded.',409);
 return resolveCandidates(candidates,pages,productId);
}
async function resolveProductFields(db,productIds){
 const candidates=await readFields(db,"WHERE (page_key='products' OR page_key='global') AND (scope_type<>'product' OR scope_id=ANY(?::text[]))",[productIds],'ORDER BY display_order,id LIMIT 10501');
 if(candidates.length>10500)fail('Configuration limit exceeded.',409);
 return new Map(productIds.map(pid=>[pid,resolveCandidates(candidates,['products'],pid).products]));
}
function createDynamicFields({ store, body, json }) {
  const db = store.db;
  const databaseLocation = new URL(db.connectionString);
  const cacheNamespace = [databaseLocation.host, databaseLocation.pathname, db.schema];
  const fields=(...args)=>readFields(db,...args);
  async function get(fieldId) {
    const field = (await fields('WHERE id=?', [id(fieldId)]))[0];
    if (!field) fail('Configurable field not found.', 404);
    return field;
  }
  async function product(productId) {
    if (!(await db.prepare('SELECT id FROM products WHERE id=?').get(id(productId)))) fail('Product not found.', 404);
  }
  const revision = async () => (await db.prepare('SELECT revision FROM field_configuration_state WHERE id=1').get()).revision;
  async function expected(field, version) {
    if (!Number.isInteger(version) || version < 1) fail('A current field version is required.', 428);
    if (field.version !== version) fail('Field configuration changed. Reload before saving.', 409);
  }
  function requiredOptions(field, options) {
    if (choices(field.fieldType) && field.isRequired && field.isActive && field.isVisible && !options.some(option => option.isActive && !option.archivedAt)) fail('A required active dropdown needs an active option.', 409);
  }
  async function audit(user, action, before, fieldId) {
    const after = await get(fieldId);
    await db.prepare(`INSERT INTO field_configuration_audit_logs(id,actor_user_id,field_id,action,before_value,after_value)
      VALUES(?,?,?,?,?::jsonb,?::jsonb)`).run(crypto.randomUUID(), user.id, fieldId, action, before ? JSON.stringify(before) : null, JSON.stringify(after));
    await store.audit(user, 'field_configuration.' + action, 'configurable_fields', fieldId, { message: 'Updated field configuration' });
    await db.exec('UPDATE field_configuration_state SET revision=revision+1 WHERE id=1');
    return { data: after, version: after.version, revision: await revision() };
  }
  // Recheck after obtaining the existing workspace write lock, without hydrating
  // or rewriting any business records. This closes queued permission revocation.
  async function write(user, fn) {
    return store.transaction(async () => {
      const current = await db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
      if (!current?.active || user.token_hash && !(await db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires>?').get(user.token_hash, Date.now()))) fail('Please sign in again.', 401);
      if (current.role !== user.role) fail('Account access changed. Sign in again.', 403);
      const actor = { ...current, permissions: effectivePermissions(current) };
      requirePermission(actor, 'fields.manage');
      return fn(actor);
    });
  }
  async function addOption(fieldId, option) {
    await db.prepare('INSERT INTO configurable_field_options(id,field_id,value,label,display_order,is_active,archived_at) VALUES(?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(), fieldId, option.value, option.label, option.displayOrder, option.isActive, option.archivedAt || null);
  }
  async function create(data, actor, native=null) {
    keys(data, ['baseFieldId', 'pageKey', 'fieldKey', 'label', 'fieldType', 'scopeType', 'scopeId', 'isRequired', 'isActive', 'isVisible', 'displayOrder', 'configuration', 'options']);
    if (own(data, 'baseFieldId')) id(data.baseFieldId);
    if (own(data, 'scopeType') && !['global', 'page', 'product'].includes(data.scopeType)) fail('Invalid scope type.');
    if (own(data, 'fieldType') && !TYPES.includes(data.fieldType)) fail('Unsupported custom field type.');
    const productRoot=!data.baseFieldId&&data.scopeType==='product'&&data.pageKey==='products';
    if(productRoot){if((await db.prepare("SELECT count(*) AS n FROM configurable_fields WHERE scope_type='product' AND base_field_id IS NULL AND scope_id=?").get(id(data.scopeId))).n>=100||(await db.prepare("SELECT count(*) AS n FROM configurable_fields WHERE scope_type='product' AND base_field_id IS NULL").get()).n>=10000)fail('Product field limit reached.',409);}
    else if ((await db.prepare("SELECT count(*) AS n FROM configurable_fields WHERE scope_type<>'product' OR base_field_id IS NOT NULL").get()).n >= MAX_FIELDS) fail('Workspace field limit reached.', 409);
    const base = data.baseFieldId ? await get(data.baseFieldId) : null;
    if (base && (base.baseFieldId || base.policy !== 'configurable')) fail('Only configurable root fields support overrides.');
    if(base?.scopeType==='product')fail('Product-owned roots cannot be overridden.',422);
    const page = data.pageKey === 'global' && !base ? 'global' : pageKey(data.pageKey);
    const scopeType = data.scopeType || (page === 'global' ? 'global' : 'page');
    const scopeId = scopeType === 'global' ? '' : scopeType === 'page' ? page : id(data.scopeId);
    if (data.scopeId !== undefined && data.scopeId !== scopeId) fail('Scope ID does not match its page.');
    if (base) {
      if (base.pageKey !== 'global' && base.pageKey !== page || base.pageKey === 'global' && !base.configuration.pages.includes(page)) fail('The root field does not apply to this page.');
      if (scopeType !== 'product' && !(base.scopeType === 'global' && scopeType === 'page')) fail('Invalid override scope.');
    } else if (!productRoot&&scopeType !== (page === 'global' ? 'global' : 'page')) fail('Create a root before its product override.');
    if (scopeType === 'product') {
      if (!PRODUCT_PAGES.includes(page)) fail('Product inheritance is not meaningful on this page.');
      await product(scopeId);
    }
    const fieldKey = base?.fieldKey || data.fieldKey;
    if (!base && (typeof fieldKey !== 'string' || !/^custom_[a-z][a-z0-9_]{0,55}$/.test(fieldKey))) fail('Custom field keys must begin with custom_ and use lowercase letters, numbers and underscores.');
    if (base && (own(data, 'fieldKey') || own(data, 'fieldType'))) fail('Override identity comes from its root.');
    const fieldType = base?.fieldType || data.fieldType || 'dropdown';
    if (!TYPES.includes(fieldType)) fail('Unsupported custom field type.');
    const defaults = base ? { ...base, configuration: { ...base.configuration } } : {
      label: fieldKey, isRequired: false, isActive: true, isVisible: true, displayOrder: 0, configuration: {},
    };
    delete defaults.configuration.pages;
    const field = settings(data, { ...defaults, fieldType, scopeType });
    field.configuration = configuration(field.configuration, scopeType === 'global');
    if (data.options !== undefined && (!Array.isArray(data.options) || data.options.length > MAX_OPTIONS)) fail('Use at most 100 initial options.');
    const options = data.options ? data.options.map((option,index) => optionInput({...object(option),displayOrder:option.displayOrder===undefined?index:option.displayOrder})) : (base?.options || []);
    if (!choices(fieldType) && options.length) fail('Only choice fields have options.');
    requiredOptions(field, options);
    const fieldId = crypto.randomUUID();
    await db.prepare(`INSERT INTO configurable_fields(id,base_field_id,page_key,field_key,label,field_type,policy,scope_type,scope_id,is_required,is_active,is_visible,display_order,configuration)
      VALUES(?,?,?,?,?,?,'configurable',?,?,?,?,?,?,?::jsonb)`)
      .run(fieldId, base?.id || null, page, fieldKey, field.label, fieldType, scopeType, scopeId, field.isRequired, field.isActive, field.isVisible, field.displayOrder, JSON.stringify(field.configuration));
    for (const option of options) await addOption(fieldId, option);
    if(native)await db.prepare('INSERT INTO product_field_bindings(field_id,product_id,canonical_key,native_type,option_values) VALUES(?,?,?,?,?::jsonb)').run(fieldId,scopeId,native.key,native.type,JSON.stringify(native.optionValues));
    return audit(actor, base ? 'override_created' : 'created', null, fieldId);
  }
  async function prepareProduct(pid,actor){
   const catalog=await store.readProductConfiguration(pid),p=DP.resolveProduct(catalog.product,catalog.settings);
   const existing=(await resolveFields(db,['products'],pid)).products;
   for(const [order,field] of p.f.entries()){
    const nativeOptions=['sel','multi'].includes(field.t)?[...(field.o||[])].sort((a,b)=>(DP.optionMeta(field,a[0]).order??field.o.indexOf(a))-(DP.optionMeta(field,b[0]).order??field.o.indexOf(b))):[];
    const options=nativeOptions.map((option,index)=>({value:'v_'+crypto.createHash('sha256').update(option[0]).digest('hex').slice(0,24),label:DP.optionLabel(field,option[0]),displayOrder:index}));
    // Unusually long legacy names remain in their original catalog editor.
    if(field.l.length>150||options.some(option=>option.label.length>150)||options.length>100)continue;
    const found=existing.find(item=>item.native?.key===field.k);
    if(found){const before=await get(found.id),added=options.filter(option=>!Object.hasOwn(before.native.optionValues,option.value));if(added.length){if(before.options.length+added.length>100)fail('Field option limit reached.',409);const mapping={...before.native.optionValues};for(const option of added){await addOption(found.id,{...option,displayOrder:before.options.length+added.indexOf(option),isActive:true});mapping[option.value]=nativeOptions[options.indexOf(option)][0];}await db.prepare('UPDATE product_field_bindings SET option_values=?::jsonb WHERE field_id=?').run(JSON.stringify(mapping),found.id);await db.prepare('UPDATE configurable_fields SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(found.id);await audit(actor,'native_options_synchronized',before,found.id);}continue;}
    const type={sel:'dropdown',multi:'multi_select',txt:'text',num:'number'}[field.t]||'text';
    await create({pageKey:'products',scopeType:'product',scopeId:pid,fieldKey:'custom_native_'+crypto.createHash('sha256').update(field.k).digest('hex').slice(0,20),fieldType:type,label:field.l,isRequired:field.required===true||field.t==='sel'&&field.required!==false,displayOrder:order,options},actor,{key:field.k,type:field.t,optionValues:Object.fromEntries(options.map((option,index)=>[option.value,nativeOptions[index][0]]))});
   }
  }
  function checkNative(before,after){
   if(!before.native)return;
   if(after.isRequired!==before.isRequired||after.isActive!==before.isActive||after.isVisible!==before.isVisible||after.options.some(option=>!Object.hasOwn(before.native.optionValues,option.value)))fail('Catalog pricing keys and required fields are protected. Add priced variants through the existing product and pricing editors.',409);
  }
  const resolve=(...args)=>resolveFields(db,...args);
  async function saveEditor(before,data){
   keys(data,before.policy==='label_only'?captionKeys(before):['label','isRequired','isActive','isVisible','displayOrder','configuration','options']);
   if(!Object.keys(data).length)fail('No field changes supplied.');
   const field=settings(data,before);
   let options=before.options;
   if(own(data,'options')){
    if(!choices(before.fieldType)||!Array.isArray(data.options)||data.options.length>MAX_OPTIONS)fail('Invalid editor options.');
    const old=new Map(before.options.map(option=>[option.id,option])),seen=new Set(),values=new Set();
    options=data.options.map((row,order)=>{
     keys(row,['id','value','label','isActive','archived']);
     if(row.archived!==undefined&&typeof row.archived!=='boolean')fail('Invalid option archive flag.');
     if(own(row,'id'))id(row.id);
     const saved=row.id?old.get(row.id):null;
     if(row.id&&!saved)fail('Field option not found.',404);
     if(saved&&(seen.has(saved.id)||row.value!==saved.value))fail('Option identity cannot be changed.');
     if(saved)seen.add(saved.id);
     const next=optionInput({...(saved?{}:{value:row.value}),label:row.label,isActive:saved?.archivedAt||row.archived?false:row.isActive??true,displayOrder:order},saved||{});
     if(values.has(next.value))fail('Duplicate option keys.');values.add(next.value);
     if(row.isActive!==undefined&&typeof row.isActive!=='boolean')fail('Invalid option activation.');
     if(saved?.archivedAt&&(row.archived===false||row.isActive===true))fail('Archived options cannot be restored.',409);
     return {...next,archivedAt:saved?.archivedAt||(row.archived?new Date():null)};
    });
    if(seen.size!==old.size)fail('Retain every existing option; archive unwanted options instead of deleting them.');
   }
   requiredOptions(field,options);
   await db.prepare('UPDATE configurable_fields SET label=?,is_required=?,is_active=?,is_visible=?,display_order=?,configuration=?::jsonb WHERE id=?').run(field.label,field.isRequired,field.isActive,field.isVisible,field.displayOrder,JSON.stringify(field.configuration),before.id);
   if(own(data,'options'))for(const option of options){
    if(option.id)await db.prepare('UPDATE configurable_field_options SET label=?,is_active=?,display_order=?,archived_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND field_id=?').run(option.label,option.isActive,option.displayOrder,option.archivedAt,option.id,before.id);
    else await addOption(before.id,option);
   }
  }
  return async function handle(req, res, url, user) {
    const send = (status, value) => { json(res, status, value); return true; };
    const orderRoute=/^\/api\/products\/([A-Za-z0-9_-]{1,80})\/field-order$/.exec(url.pathname);
    if(orderRoute){
     requirePermission(user,'fields.manage');queries(url.searchParams,[]);if(req.method!=='POST')fail('Method not allowed.',405);const input=object(await body(req));keys(input,['fields']);
     if(!Array.isArray(input.fields)||input.fields.length>100||new Set(input.fields.map(row=>row?.id)).size!==input.fields.length)fail('Supply each product field once.');
     const pid=id(orderRoute[1]);return write(user,async actor=>{await product(pid);const before=await fields("WHERE page_key='products' AND scope_type='product' AND scope_id=?",[pid]);if(before.length!==input.fields.length)fail('Retain every product field.');for(const row of input.fields){keys(row,['id','version']);const field=before.find(field=>field.id===row.id);if(!field)fail('Product field not found.',404);await expected(field,row.version);}for(const [index,row]of input.fields.entries()){const field=before.find(field=>field.id===row.id);if(field.displayOrder!==index){await db.prepare('UPDATE configurable_fields SET display_order=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(index,row.id);await audit(actor,'field_reordered',field,row.id);}}return send(200,{data:(await resolveFields(db,['products'],pid)).products,revision:await revision(),productId:pid});});
    }
    const productRoute=/^\/api\/products\/([A-Za-z0-9_-]{1,80})\/field-configuration$/.exec(url.pathname);
    if(productRoute){
     const pid=id(productRoute[1]);queries(url.searchParams,[]);
     if(req.method==='POST'){requirePermission(user,'fields.manage');keys(await body(req),[]);await write(user,actor=>prepareProduct(pid,actor));}
     else if(req.method!=='GET')fail('Method not allowed.',405);
     if(!hasPermission(user,'fields.manage')&&!['product.view','product.manage','quotation.create','quotation.edit_own','quotation.edit_all'].some(permission=>hasPermission(user,permission)))fail('Product configuration access is required.',403);
     return db.readTransaction(async()=>{await product(pid);return send(200,{data:(await resolveFields(db,['products'],pid)).products,revision:await revision(),productId:pid});});
    }
    const route = url.pathname, isConfiguration = route.startsWith('/api/field-configurations'),
      match = /^\/api\/configurable-fields(?:\/([A-Za-z0-9_-]{1,80})(?:\/(options|audit|editor)(?:\/([A-Za-z0-9_-]{1,80}))?)?)?$/.exec(route);
    if (!match && !isConfiguration) return false;
    if (isConfiguration) {
      if (req.method !== 'GET') fail('Method not allowed.', 405);
      if (route === '/api/field-configurations/registry') {
        requireRead(user); queries(url.searchParams, []);
        return send(200, { data: REGISTRY, controls:FIELD_CONTROLS.controls,pages: Object.keys(PAGES), customFieldPrefix: 'custom_', customFieldPolicy: { policy: 'configurable', fieldTypes: TYPES, scopes: ['global', 'page', 'product'], productPages: PRODUCT_PAGES }, limits: { fields: MAX_FIELDS, options: MAX_OPTIONS } });
      }
      if (route !== '/api/field-configurations/resolve') fail('Configuration endpoint not found.', 404);
      queries(url.searchParams, ['pageKeys', 'productId']);
      const pages = (url.searchParams.get('pageKeys') || '').split(',');
      if (!pages.length || pages.length > Object.keys(PAGES).length || new Set(pages).size !== pages.length) fail('Choose unique supported pages.');
      pages.forEach(page => { pageKey(page); requirePage(user, page); });
      const productId = url.searchParams.get('productId');
      if (productId && !pages.some(page => PRODUCT_PAGES.includes(page))) fail('Product scope is not meaningful for these pages.');
      return db.readTransaction(async () => {
        if (productId) await product(productId);
        // A caller revalidates permissions on every request, including cache hits.
        const current = await revision(), etag = '"field-config-' + current + '"';
        res.setHeader('ETag', etag); res.setHeader('Cache-Control', 'private, no-cache'); res.setHeader('Vary', 'Cookie');
        // Include the query in the validator; product/page scopes are not interchangeable.
        const scopedEtag = etag.slice(0, -1) + '-' + crypto.createHash('sha256').update(JSON.stringify([cacheNamespace, user.id, effectivePermissions(user), [...pages].sort(), productId])).digest('hex').slice(0, 24) + '"';
        res.setHeader('ETag', scopedEtag);
        if (req.headers['if-none-match'] === scopedEtag) { res.writeHead(304); res.end(); return true; }
        return send(200, { data: await resolve(pages, productId), revision: current, precedence: ['product', 'page', 'global'] });
      });
    }
    requireRead(user);
    const [, fieldId, child, optionId] = match;
    if (req.method === 'GET') return db.readTransaction(async () => {
      queries(url.searchParams, fieldId && child === 'audit' ? ['page', 'pageSize'] : fieldId ? [] : ['pageKey', 'scopeType', 'scopeId', 'q', 'page', 'pageSize','policy','fieldType']);
      if (child === 'audit') {
        if (optionId) fail('Not found.', 404);
        const field = await get(fieldId), page = positive(url.searchParams.get('page'), 1, 1000000), pageSize = positive(url.searchParams.get('pageSize'), 25, 100);
        const total = (await db.prepare('SELECT count(*) AS n FROM field_configuration_audit_logs WHERE field_id=?').get(field.id)).n;
        const data = await db.prepare(`SELECT id,actor_user_id AS "actorUserId",field_id AS "fieldId",action,before_value AS "beforeValue",after_value AS "afterValue",created_at AS "createdAt" FROM field_configuration_audit_logs WHERE field_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?`).all(field.id, pageSize, (page - 1) * pageSize);
        return send(200, { data, pagination: { page, pageSize, total } });
      }
      if (child) fail('Use the field detail endpoint to retrieve options.', 405);
      if (fieldId) return send(200, { data: await get(fieldId), revision: await revision() });
      const clauses = [], values = [], params = url.searchParams;
      for(const [key,column,allowed]of [['policy','policy',['protected','label_only','configurable']],['fieldType','field_type',[...TYPES,'system']]])if(params.has(key)){if(!allowed.includes(params.get(key)))fail('Invalid field filter.');clauses.push(column+'=?');values.push(params.get(key));}
      for (const [key, column] of [['pageKey', 'page_key'], ['scopeType', 'scope_type'], ['scopeId', 'scope_id']]) if (params.has(key)) {
        const value = params.get(key);
        if (key === 'pageKey' && value !== 'global') pageKey(value);
        if (key === 'scopeType' && !['global', 'page', 'product'].includes(value)) fail('Invalid scope type.');
        if (key === 'scopeId') id(value);
        clauses.push(column + '=?'); values.push(value);
      }
      if (params.has('q')) { clauses.push("(label ILIKE ? ESCAPE '\\' OR field_key ILIKE ? ESCAPE '\\')"); const q = '%' + text(params.get('q'), 'search', 100).replace(/[\\%_]/g, '\\$&') + '%'; values.push(q, q); }
      const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', page = positive(params.get('page'), 1, 1000000), pageSize = positive(params.get('pageSize'), 25, 100);
      const total = (await db.prepare('SELECT count(*) AS n FROM configurable_fields ' + where).get(...values)).n;
      return send(200, { data: await fields(where, [...values, pageSize, (page - 1) * pageSize], 'ORDER BY display_order,id LIMIT ? OFFSET ?'), pagination: { page, pageSize, total }, revision: await revision() });
    });
    requirePermission(user, 'fields.manage');
    queries(url.searchParams, []);
    let envelope;
    if (!fieldId && req.method === 'POST') envelope = ['data'];
    else if (fieldId && !child && req.method === 'PATCH') envelope = ['version', 'data'];
    else if (child === 'editor' && !optionId && req.method === 'PUT') envelope = ['version','data'];
    else if (child === 'options' && !optionId && req.method === 'POST') envelope = ['version', 'data'];
    else if (child === 'options' && optionId === 'reorder' && req.method === 'POST') envelope = ['version', 'optionIds'];
    else if (child === 'options' && optionId && optionId !== 'reorder' && req.method === 'PATCH') envelope = ['version', 'data'];
    else if (child === 'options' && optionId && optionId !== 'reorder' && req.method === 'DELETE') envelope = ['version'];
    else fail('Method not allowed.', 405);
    const input = object(await body(req));
    keys(input, envelope);
    try {
      const result = await write(user, async actor => {
        if (!fieldId) {
          if (req.method !== 'POST') fail('Method not allowed.', 405);
          return create(object(input.data), actor);
        }
        const before = await get(fieldId);
        await expected(before, input.version);
        if (before.policy === 'protected') fail('This field is owned by its canonical workflow or relationship API.', 403);
        let action;
        if(child==='editor'){
          await saveEditor(before,object(input.data));action='editor_saved';
        } else if (!child && req.method === 'PATCH') {
          const data = object(input.data);
          keys(data, before.policy === 'label_only' ? captionKeys(before) : ['label', 'isRequired', 'isActive', 'isVisible', 'displayOrder', 'configuration']);
          if (!Object.keys(data).length) fail('No field changes supplied.');
          const field = settings(data, before); requiredOptions(field, before.options);
          await db.prepare(`UPDATE configurable_fields SET label=?,is_required=?,is_active=?,is_visible=?,display_order=?,configuration=?::jsonb WHERE id=?`)
            .run(field.label, field.isRequired, field.isActive, field.isVisible, field.displayOrder, JSON.stringify(field.configuration), fieldId);
          action = 'updated';
        } else if (child === 'options' && before.policy === 'configurable' && choices(before.fieldType)) {
          if (optionId === 'reorder' && req.method === 'POST') {
            if (input.data !== undefined || !Array.isArray(input.optionIds) || input.optionIds.length !== before.options.length || new Set(input.optionIds).size !== input.optionIds.length || input.optionIds.some(value => !before.options.some(option => option.id === value))) fail('Reorder must contain every option ID exactly once.');
            for (const [order, option] of input.optionIds.entries()) await db.prepare('UPDATE configurable_field_options SET display_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND field_id=?').run(order, option, fieldId);
            action = 'options_reordered';
          } else if (!optionId && req.method === 'POST') {
            if (before.options.length >= MAX_OPTIONS) fail('Field option limit reached.', 409);
            const option = optionInput(object(input.data));
            await addOption(fieldId, option); action = 'option_created';
          } else if (optionId && ['PATCH', 'DELETE'].includes(req.method)) {
            const option = before.options.find(value => value.id === optionId);
            if (!option) fail('Field option not found.', 404);
            if (req.method === 'DELETE' && input.data !== undefined) fail('Archive does not accept option changes.');
            const changed = req.method === 'DELETE' ? { ...option, isActive: false, archivedAt: new Date() } : optionInput(object(input.data), option);
            requiredOptions(before, before.options.map(value => value.id === optionId ? changed : value));
            await db.prepare('UPDATE configurable_field_options SET label=?,is_active=?,display_order=?,archived_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND field_id=?')
              .run(changed.label, changed.isActive, changed.displayOrder, changed.archivedAt, optionId, fieldId);
            action = req.method === 'DELETE' ? 'option_archived' : 'option_updated';
          } else fail('Method not allowed.', 405);
        } else fail('This field or operation does not support option editing.', 405);
        checkNative(before,await get(fieldId));
        await db.prepare('UPDATE configurable_fields SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(fieldId);
        return audit(actor, action, before, fieldId);
      });
      return send(req.method === 'POST' && !optionId ? 201 : 200, result);
    } catch (error) {
      if (error.code === '23505') fail('A field or immutable option key already exists in this scope.', 409);
      throw error;
    }
  };
}
module.exports = { createDynamicFields,resolveFields,resolveProductFields };
