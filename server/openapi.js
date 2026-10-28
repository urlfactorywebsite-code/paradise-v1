'use strict';
const DP = require('../shared/domain');
const { PERMISSIONS } = require('./access');
const str = { type: 'string' }, object = { type: 'object', additionalProperties: true };
const schemas = {
  Permissions: { type: ['array', 'null'], items: { type: 'string', enum: PERMISSIONS }, uniqueItems: true, description: 'Null inherits the employee defaults; an array replaces them. Administrator permissions are always complete.' },
  Error: { type: 'object', required: ['error'], properties: { error: str, requestId: str, code:str, details:object } },
  Login: { type: 'object', required: ['username', 'password'], properties: { username: str, password: { type: 'string', minLength: 12, maxLength: 128, format: 'password' } } },
  Setup: { type: 'object', required: ['name', 'username', 'password'], properties: { name: str, username: str, password: { type: 'string', minLength: 12, maxLength: 128, format: 'password' }, demo: { type: 'boolean', default: false } } },
  Customer: { type: 'object', required: ['name', 'mob'], properties: { ...Object.fromEntries(['id', 'name', 'co', 'person', 'mob', 'wa', 'type', 'email', 'gstin', 'addr', 'notes', 'date'].map(k => [k, str])), on: { type: 'integer', enum: [0, 1] }, createdBy: { type: 'string', readOnly: true } } },
  Category: { type: 'object', required: ['name'], properties: { id: str, name: str, on: { type: 'integer', enum: [0, 1] } } },
  Product: { type: 'object', required: ['name', 'code', 'cat', 'm'], properties: { id: str, name: str, code: str, cat: str, m: { type: 'string', enum: ['unit', 'area', 'fixed'] }, rate: { type: 'number', minimum: 0 }, min: { type: 'number', minimum: 0 }, tax: { type: 'number', minimum: 0, maximum: 100 }, on: { type: 'integer', enum: [0, 1] }, sizes: { type: 'integer', enum: [0, 1] }, tiers: { type: ['array', 'null'], items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 } }, f: { type: 'array', items: object, description: 'Configurable fields: {k,l,t}; t is sel, txt or dim. A sel field has o:[[label,chargeType,amount]], where chargeType is f,u,p,a.' } } },
  Quote: { type: 'object', required: ['cid'], properties: { id: str, no: { type: 'string', readOnly: true }, cid: str, date: { type: 'string', format: 'date' }, valid: { type: 'string', format: 'date' }, sales: str, ref: str, project: str, subject: str, req: str, items: { type: 'array', items: { type: 'object', required: ['pid', 'cfg'], properties: { id: str, pid: str, cfg: object, notes: str } } }, disc: { type: 'object', properties: { t: { type: 'string', enum: ['p', 'f'] }, v: { type: 'number', minimum: 0 } } }, del: { type: 'number', minimum: 0 }, oth: { type: 'number', minimum: 0 }, terms: { type: 'array', items: str }, status: { type: 'string', enum: DP.ST, description: 'New quotes must be Draft. Use the status action to change a saved status.' }, by: { type: 'string', readOnly: true }, hist: { type: 'array', items: object, readOnly: true } } },
  Version: { type: 'object', required: ['version'], properties: { version: { type: 'integer', minimum: 1 } } },
  Settings: { type: 'object', properties: { ...Object.fromEntries(['name', 'tag', 'addr', 'phone', 'email', 'web', 'gstin', 'prefix'].map(k => [k, str])), tax: { type: 'number', minimum: 0, maximum: 100 }, valid: { type: 'integer', minimum: 0, maximum: 3650 }, showNotes: { type: 'boolean' }, terms: { type: 'array', items: str } } },
};
const ref = name => ({ $ref: '#/components/schemas/' + name });
Object.assign(schemas.Category.properties, { description: str, order: { type: 'integer', minimum: 0 } });
Object.assign(schemas.Product.properties, {
  m: { type: 'string', enum: DP.METHODS }, taxMode: { type: 'string', enum: DP.TAX_MODES },
  minQty: { type: 'integer', minimum: 1, maximum: 1000000 },
  description: str, image: { type: 'string', description: 'PNG/JPEG data URL' }, unit: str, type: str,
  priceConfigured: { type: 'boolean', description: 'An unconfigured product must remain inactive.' },
  f: { type: 'array', maxItems: 50, items: object, description: 'Data-driven fields {k,l,t,required,default,when}; t is sel,txt,dim,num. sel choices: o:[[label,chargeType,amount]], chargeType f,u,p,a,q. Numeric fields support min,max,integer; text fields support maxLength; conditions use {key,equals}.' },
  compatibility: { type: 'array', items: object, description: '{when:{key,equals},field,allowed:[option],message}' },
  charges: { type: 'array', items: object, description: '{label,type:f|u|p|a|q,amount,when?:{key,equals}}. Decimal INR amounts, or a percentage for type p.' },
});
Object.assign(schemas.Quote.properties, { createdBy: { type: ['string', 'null'], readOnly: true },
  contact: { type: 'object', properties: Object.fromEntries(['person', 'mob', 'wa', 'email', 'addr'].map((k) => [k, str])) } });
schemas.FieldCondition = { oneOf: [
 { type: 'object', required: ['key','equals'], properties: { key: str, equals: { oneOf: [str,{type:'number'},{type:'array',items:{type:['string','number']}}] } } },
 { type: 'object', required: ['mode','conditions'], properties: {
  mode: {type:'string',enum:['ALL','ANY']},
  conditions: {type:'array',minItems:1,maxItems:50,items:{type:'object',required:['key','operator','value'],properties:{key:str,operator:{type:'string',enum:['equals','not_equals']},value:{type:['string','number']}}}},
 } },
] };
schemas.ProductField = { type:'object', required:['k','l','t'], properties: {
 k:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]{0,39}$'},l:{type:'string',maxLength:150},
 t:{type:'string',enum:['sel','txt','num','dim','multi','SIZE_BREAKDOWN']},required:{type:'boolean'},
 when:{$ref:'#/components/schemas/FieldCondition'},default:{},
 show_on_customer_pdf:{type:'boolean',description:'Customer specification visibility. Internal field identifiers, internal_only and item notes always remain private. Omitted preserves legacy visibility.'},
 internal_only:{type:'boolean',default:false},
 o:{type:'array',items:{type:'array',minItems:1,maxItems:3},description:'Authorized pricing readers receive [label,chargeType,amount]; chargeType f,u,p,a,q. Without pricing.view or pricing.manage, reads return [label] and omit private master pricing. On existing definitions only, omitted hidden values are preserved server-side before independent write authorization. Multi-select values are a unique array of selected labels.'},
 min:{type:'number'},max:{type:'number'},integer:{type:'boolean'},maxLength:{type:'integer',minimum:0,maximum:4000},
 sizes:{type:'array',minItems:1,maxItems:100,items:{type:'object',required:['key','label'],properties:{key:str,label:str,enabled:{type:'boolean',default:true},price:{type:'number',minimum:0,default:0,description:'Existing-model per-unit surcharge in INR.'}}}},
} };
schemas.Product.properties.f = {type:'array',maxItems:50,items:{$ref:'#/components/schemas/ProductField'},description:'One reusable SIZE_BREAKDOWN field can drive quantity. Existing product.sizes/cfg.sz remains supported. Unknown references, invalid operators and circular visibility dependencies are rejected. Changed active or prepared documented catalog products must retain their product-specific fields: Catalogue Page Count is unconditional, required, numeric, integer and minimum 1; Bill Book Number of Copies is unconditional and required with Admin-managed choices. Existing unchanged quotation snapshots remain readable.'};
schemas.Product.properties.phase2={type:'string',enum:['visiting_card','flex'],description:'Explicit product-editor setup profile. Preserves rates and historical quotes; managed shape/bundle constraints are synchronized server-side.'};
schemas.GiftTemplate={type:'object',required:['id','version','name','f'],additionalProperties:false,properties:{id:{const:'promotional_gift'},version:{const:1},name:{type:'string',maxLength:150},f:{type:'array',minItems:7,maxItems:7,items:{$ref:'#/components/schemas/ProductField'}}},description:'Single shared set of model, material, color, customization, printing, packaging and artwork definitions. Product fields/options/rates can override these definitions.'};
schemas.GiftTemplateUpdate={type:'object',required:['revision','data'],properties:{revision:{type:'integer',minimum:1},data:{$ref:'#/components/schemas/GiftTemplate'}}};
schemas.Product.properties.phase3={type:'string',enum:['tshirt','logo','gift']};
schemas.Product.properties.giftTemplate={type:'object',properties:{id:{const:'promotional_gift'},map:{type:'object',additionalProperties:{type:'string'}},disabled:{type:'array',items:str,uniqueItems:true},overrides:{type:'object',additionalProperties:{$ref:'#/components/schemas/ProductField'}}},description:'Reference to workspace giftTemplate. f contains local fields only; resolve template + mapped local fields + explicit overrides before rendering/calculating. Saved item snapshots contain the resolved fields.'};
schemas.Settings.properties.giftTemplate={$ref:'#/components/schemas/GiftTemplate'};
schemas.CatalogTemplate={type:'object',required:['id','version','name','f'],additionalProperties:false,properties:{id:{enum:['print_product','area_product','stationery_product']},version:{const:1},name:{type:'string',maxLength:150},f:{type:'array',minItems:4,maxItems:4,items:{$ref:'#/components/schemas/ProductField'}}},description:'Shared Print, Area or Stationery definitions. Gift reuses GiftTemplate. Product-specific options, additional fields and rules are retained through the existing projection engine. Option rates, derived quantity policies and replacement rate bases require pricing.manage even before any product uses the template.'};
schemas.CatalogAssignment={type:'object',required:['id'],properties:{id:{enum:['print_product','area_product','stationery_product']},map:{type:'object',additionalProperties:str},disabled:{type:'array',items:str,uniqueItems:true},required:{type:'array',items:str,uniqueItems:true,description:'Known semantic shared-field keys required by this product. The shared definition still supplies labels, options and other metadata; explicit complete field overrides remain authoritative.'},overrides:{type:'object',additionalProperties:{$ref:'#/components/schemas/ProductField'}},order:{type:'array',items:str,uniqueItems:true}},description:'One template reference per product. Mappings and overrides preserve stable field keys; ordering can include shared and local fields. Dual/nested/circular assignments are rejected.'};
schemas.Product.properties.giftTemplate.properties.required=schemas.CatalogAssignment.properties.required;
schemas.Product.properties.catalogTemplate={$ref:'#/components/schemas/CatalogAssignment'};
schemas.Product.properties.rate={type:['number','null'],minimum:0,description:'Null is explicitly unconfigured and allowed only for an inactive product with priceConfigured:false. An approved intentional zero remains numeric zero.'};
schemas.Product.properties.tax={type:['number','null'],minimum:0,maximum:100,description:'Null retains an unconfigured GST rate; activation and quotation pricing require approved numeric configuration.'};
schemas.Product.properties.priceConfigured={type:'boolean',default:true};
schemas.Product.properties.m={type:'string',enum:DP.METHODS};
schemas.Settings.properties.catalogTemplates={type:'object',additionalProperties:false,properties:Object.fromEntries(['print_product','area_product','stationery_product'].map(key=>[key,{$ref:'#/components/schemas/CatalogTemplate'}]))};
Object.assign(schemas.ProductField.properties,{
 multiline:{type:'boolean'},minSelections:{type:'integer',minimum:0,maximum:100},maxSelections:{type:'integer',minimum:0,maximum:100},allowCustom:{type:'boolean'},
 customCharge:{type:'object',required:['type','amount','approved'],properties:{type:{enum:['f','u','p','a','q']},amount:{type:['number','null'],minimum:0},approved:{type:'boolean'}},description:'Custom selection values require an explicitly approved configured rate, including an explicitly approved zero rate.'},
 optionMeta:{type:'object',additionalProperties:{type:'object',properties:{label:str,enabled:{type:'boolean'},approved:{type:'boolean'},order:{type:'integer',minimum:0},includesEyelets:{type:'boolean'},quantityRule:{type:'string',enum:['none','corners','perimeter']},quantityKey:str,geometry:{type:'object',properties:{custom:{type:'boolean'},w:{type:'number',exclusiveMinimum:0},h:{type:'number',exclusiveMinimum:0},u:{type:'string',enum:Object.keys(DP.AF)}}}}},description:'Keyed by stable option value. Display names can change without rewriting saved selections. Null option amounts require approved:false; unavailable/unapproved choices cannot be newly selected.'},
 legacyTextDefault:{type:'string',maxLength:4000,description:'Retained previous free-text default for Admin mapping. Not substituted for an approved rate.'},rateBasis:{type:'string',enum:['area']},quantityRule:{type:'string',enum:['eyelets']},eyeletPolicy:{type:'object',required:['approved','spacingFt','corners'],properties:{approved:{type:'boolean'},spacingFt:{const:2},corners:{const:4}}},
});
schemas.Quote.properties.items.items.properties.cfg = {type:'object',additionalProperties:true,description:'Field-key values: strings, numeric values, multi-select string arrays, and SIZE_BREAKDOWN objects mapping size keys to nonnegative integer quantities. Size sums determine quantity. Unknown/disabled sizes are rejected; hidden values are stripped server-side.'};
schemas.Quote.properties.items.items.properties.override = { type: 'object', required: ['amount', 'reason'], properties: {
  amount: { type: 'number', minimum: 0, description: 'New subtotal in INR; requires pricing.override.' }, reason: { type: 'string', minLength: 1, maxLength: 1000 } } };
Object.assign(schemas.Settings.properties, {
  employeeDiscountLimit: { type: 'number', minimum: 0, maximum: 100, default: 10 },
  employeeDiscountMax: { type: 'number', minimum: 0, default: 0, description: 'INR amount cap; zero leaves only the percentage cap.' },
  allowAdditionalCharges: { type: 'boolean', default: true }, independentApproval: { type: 'boolean', default: true },
  taxMode: { type: 'string', enum: DP.TAX_MODES }, taxDisplay: { type: 'string', enum: ['split', 'igst'] },
  sequenceStart: { type: 'integer', minimum: 1, maximum: 999999999 }, currency: { type: 'string', enum: ['INR'] },
  ...Object.fromEntries(['logo', 'signature', 'footer', 'customerNotes'].map((key) => [key, str])),
});
const paths = {};
schemas.Quote.properties.internalNotes = { type: 'string', maxLength: 4000, description: 'Private staff quotation notes in the existing JSON body. Requires existing quotation create/edit access. Excluded from customer preview projections, PDFs and automatic WhatsApp content; distinct from customer terms.' };
function add(path, method, summary, request, options = {}) {
  const operation = { summary, tags: [options.tag || path.split('/')[2]], operationId: method + path.replace(/[^A-Za-z0-9]/g, '_'), security: options.public ? [] : [{ session: [], ...(method === 'get' ? {} : { csrf: [] }) }], responses: { [method === 'post' && options.created ? '201' : '200']: { description: 'Success. Monetary totals use integer paise unless a CSV column explicitly says INR.', content: { [options.mime || 'application/json']: { schema: options.response || object } } }, ...Object.fromEntries([400, 401, 403, 404, 409, 413, 422, 428, 429, 500].map(code => [code, { description: { 409: 'Stale version or conflicting record', 428: 'Version/revision required', 422: 'Invalid input' }[code] || 'Request rejected', content: { 'application/json': { schema: ref('Error') } } }])) } };
  operation.parameters = [...path.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: str }));
  if (options.list) operation.parameters.push(...['q', 'page', 'pageSize', 'sort', 'direction', 'active', 'category', 'status', 'customer', 'salesperson', 'employee', 'from', 'to', 'min', 'max'].map(name => ({ name, in: 'query', schema: ['page', 'pageSize'].includes(name) ? { type: 'integer', minimum: 1, ...(name === 'pageSize' ? { maximum: 100 } : {}) } : str })));
  if (request) operation.requestBody = { required: true, content: { 'application/json': { schema: typeof request === 'string' ? ref(request) : request } } };
  if (options.description) operation.description = options.description;
  (paths[path] ||= {})[method] = operation;
}
add('/api/health', 'get', 'Health and database schema', null, { public: true });
add('/api/ready', 'get', 'Database readiness', null, { public: true });
add('/api/auth/status', 'get', 'Setup state and current session with CSRF token', null, { public: true });
add('/api/auth/setup', 'post', 'Create first administrator and workspace', 'Setup', { public: true, created: true });
add('/api/auth/login', 'post', 'Sign in', 'Login', { public: true });
add('/api/auth/logout', 'post', 'Invalidate current session');
add('/api/auth/me', 'get', 'Current account');
add('/api/auth/password', 'post', 'Change password; revoke previous sessions', { type: 'object', required: ['currentPassword', 'password'], properties: { currentPassword: str, password: { type: 'string', minLength: 12, maxLength: 128 } } });
add('/api/auth/sessions', 'get', 'List your active sessions');
add('/api/auth/sessions', 'delete', 'Revoke all your other sessions');
add('/api/auth/sessions/{id}', 'delete', 'Revoke one of your other sessions');
add('/api/state', 'get', 'Bootstrap screens with permission-scoped workspace state', null, { description: 'Quotations, dashboard activity and all quote APIs enforce immutable creator ownership. Employees inherit own-only access unless explicitly granted quotation.view_all.' });
add('/api/state', 'put', 'Compatibility whole-workspace save', { type: 'object', required: ['state', 'revision'], properties: { state: object, revision: { type: 'integer' } } });
add('/api/changes', 'post', 'Atomically commit changed records', { type: 'object', required: ['revision', 'changes'], properties: { revision: { type: 'integer' }, changes: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', required: ['collection', 'action'], properties: { collection: { type: 'string', enum: ['cats', 'products', 'customers', 'quotes', 'set'] }, action: { type: 'string', enum: ['upsert', 'delete'] }, id: str, record: object } } } } });
for (const [route, name] of [['customers', 'Customer'], ['products', 'Product'], ['categories', 'Category'], ['quotations', 'Quote']]) {
  add('/api/' + route, 'get', 'Search and paginate ' + route, null, { list: true });
  add('/api/' + route, 'post', 'Create ' + name, { type: 'object', properties: { data: ref(name), allowDuplicate: { type: 'boolean', default: false } }, required: ['data'] }, { created: true });
  add('/api/' + route + '/{id}', 'get', 'Get record, version and updatedAt');
  for (const method of ['put', 'patch']) add('/api/' + route + '/{id}', method, method === 'put' ? 'Replace record' : 'Update selected record fields', { type: 'object', required: ['data', 'version'], properties: { data: ref(name), version: { type: 'integer' }, allowDuplicate: { type: 'boolean', default: false } } }, { description: 'Send the returned record version or an If-Match header. A stale record is rejected with 409. Quote status changes use the status endpoint.' });
  add('/api/' + route + '/{id}', 'delete', 'Delete record with dependency and role checks', 'Version');
}
add('/api/customers/{id}/quotations', 'get', 'Customer quotation history', null, { list: true });
paths['/api/products'].get.parameters.push(
 {name:'view',in:'query',schema:{type:'string',enum:['catalog']},description:'Optional display projection: paginated lightweight catalog rows, global total/unique attention counts and backend categories. Uses canonical activation eligibility; definitions, option metadata and base prices are omitted. GST is restricted without pricing read permission. Existing default listing is unchanged. Name/code-only trimmed search; fixed name/id order; out-of-range pages clamp to the last page.'},
 {name:'readiness',in:'query',schema:{type:'string',enum:['ready','attention','configuration','pricing']},description:'Catalog view only. Ready requires active product and canonical eligibility. Attention includes inactive or ineligible products. Configuration/pricing select the failed check group; all filters AND together.'}
);
add('/api/catalog', 'get', 'Catalog and categories');
add('/api/configuration-templates/promotional-gift','get','Read the shared promotional gift template and workspace revision');
add('/api/configuration-templates/promotional-gift','put','Update shared gift definitions with product and independent pricing authorization; rejects stale workspace revisions','GiftTemplateUpdate');
add('/api/configuration-templates','get','Authorized catalog/pricing manager: list all four shared configuration templates and current revision',null,{description:'Master option prices and pricing approvals are returned only with pricing.view or pricing.manage; catalog managers can read and edit safe field definitions without receiving prices.'});
for(const template of ['print-product','area-product','stationery-product']){
 add('/api/configuration-templates/'+template,'get','Read the shared '+template+' template');
 add('/api/configuration-templates/'+template,'put','Update shared '+template+' definitions with independent catalog/pricing permissions',{type:'object',required:['revision','data'],properties:{revision:{type:'integer',minimum:1},data:{$ref:'#/components/schemas/CatalogTemplate'}}});
}
add('/api/catalog/checklist','get','Authorized manager: verify documented SRS products, global counts and independent configuration/pricing readiness',null,{list:true,description:'Filters q/category/status/template and page/pageSize affect rows only; counts always describe the full required manifest. Status reflects actual activation and explicit pricing readiness; conflicting identities have a separate Conflict status. Lowercase status aliases are accepted; template=none selects unassigned products. Template field references are resolved without loading quotation history.'});
paths['/api/catalog/checklist'].get.parameters.push({name:'template',in:'query',schema:{type:'string',enum:['print_product','area_product','promotional_gift','stationery_product','none']}});
add('/api/catalog/prepare','post','Preview or explicitly apply idempotent missing-record/template preparation',{type:'object',required:['revision'],properties:{revision:{type:'integer',minimum:1},apply:{type:'boolean',default:false}}},{description:'Default apply:false returns a nonmutating review plan. apply:true requires product.manage and pricing.manage, uses the existing atomic workspace transaction, preserves existing IDs/rates/active products/history and creates only genuinely missing inactive products with null unconfigured base/GST rates. No activation or pricing import occurs.'});
add('/api/pricing/calculate', 'post', 'Validate configuration and calculate integer-paise price', { type: 'object', required: ['productId', 'cfg'], properties: { productId: str, cfg: object } }, {description:'Requires active product/category, pricing read permission and valid documented product-specific field definitions. New and changed quotation items and new duplicates enforce the same field contract; unchanged historical items retain saved specifications and amounts.'});
add('/api/quotations/preview', 'post', 'Validate and preview without saving', 'Quote');
for (const action of ['duplicate', 'reprice']) add('/api/quotations/{id}/' + action, 'post', action === 'duplicate' ? 'Duplicate a quote using current approved prices and assigning a new number' : 'Explicitly refresh saved item prices from current catalog', 'Version', { created: action === 'duplicate' });
add('/api/quotations/{id}/status', 'post', 'Change quotation status with server history', { type: 'object', required: ['version', 'status'], properties: { version: { type: 'integer' }, status: { type: 'string', enum: DP.ST }, remarks: { type: 'string', maxLength: 2000 } } });
add('/api/quotations/{id}/history', 'get', 'Quotation status history');
add('/api/quotations/{id}/pdf', 'get', 'Download a server-generated saved quotation', null, { mime: 'application/pdf', response: { type: 'string', format: 'binary' } });
add('/api/quotations/expire', 'post', 'Administrator: expire overdue pending/sent quotes', { type: 'object', properties: { revision: { type: 'integer' }, asOf: { type: 'string', format: 'date' } } });
add('/api/settings', 'get', 'Company settings and version');
for (const method of ['put', 'patch']) add('/api/settings', method, 'Administrator: update company settings', { type: 'object', required: ['version', 'data'], properties: { version: { type: 'integer' }, data: ref('Settings') } });
add('/api/dashboard', 'get', 'Permission-scoped quotation dashboard with stored aggregates and bounded recent/attention records', null, {
  list: true,
  description: 'Uses quotation.view_own/view_all independently of report grants. Inclusive from/to filter quotation dates. Preserves existing report breakdowns and returns kpis, six stable recent quotations with stored total/customer/company/creator/createdAt, six deduplicated attention records and attentionTotal. Review alerts use the real Pending Internal Review status; no review threshold is configured (reviewThresholdHours:null). Expiry alerts use the existing expirable statuses and actual valid-until dates from today through expiryWindowDays:7; this is a display horizon, not an expiry/status policy. canReview also enforces independent approval. Timezone is valid process TZ or Asia/Kolkata; today uses that calendar. All monetary totals are integer paise and quoted value includes every selected status, not recognized revenue. No data or status is changed.',
  response: { type: 'object', additionalProperties: true, properties: {
    count: { type: 'integer', minimum: 0 }, quotedValue: { type: 'integer', minimum: 0 },
    currency: { const: 'INR' }, moneyUnit: { const: 'paise' },
    kpis: { type: 'object', properties: Object.fromEntries(['total', 'draft', 'pendingReview', 'quotedValue'].map((key) => [key, { type: 'integer', minimum: 0 }])) },
    recent: { type: 'array', maxItems: 6, items: { ...schemas.Quote, properties: { ...schemas.Quote.properties, total: { type: 'integer' }, customer: str, company: str, creator: str, createdAt: { type: ['string', 'null'] } } } },
    attention: { type: 'array', maxItems: 6, items: { type: 'object', properties: {
      id: str, no: str, cid: str, customer: str, company: str, status: { enum: DP.ST }, valid: { type: 'string', format: 'date' }, total: { type: 'integer' },
      reason: { enum: ['review', 'expiry'] }, pendingSince: { type: ['string', 'null'] }, canReview: { type: 'boolean' },
    } } }, attentionTotal: { type: 'integer', minimum: 0 }, timezone: str, today: { type: 'string', format: 'date' },
    reviewThresholdHours: { type: 'null' }, expiryWindowDays: { const: 7 },
  } },
});
add('/api/search', 'get', 'Bounded global quotation/customer lookup', null, {
  description: 'Searches quotation numbers and saved customer names/company names using quotation.view_own/view_all; customers require customer.view. Returns minimal display fields only. q is at most 200 characters; empty q returns no records. page defaults to 1; pageSize defaults to 5 and is at most 10 per result category. Each category paginates independently, with the shared page and totalPages equal to the larger category page count. SQL wildcard characters are literal. No data is changed.',
  response: { type: 'object', properties: {
    quotations: { type: 'array', maxItems: 10, items: { type: 'object', properties: { id: str, no: str, date: str, status: { enum: DP.ST }, customer: str } } },
    customers: { type: 'array', maxItems: 10, items: { type: 'object', properties: { id: str, name: str, co: str } } },
    pagination: { type: 'object', properties: Object.fromEntries(['page', 'pageSize', 'total', 'totalPages'].map((key) => [key, { type: 'integer', minimum: key === 'page' || key === 'pageSize' ? 1 : 0 }])) },
  } },
});
paths['/api/search'].get.parameters.push(
  { name: 'q', in: 'query', schema: { type: 'string', maxLength: 200 } },
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10, default: 5 } },
);
add('/api/reports/summary', 'get', 'Server report totals and breakdowns', null, { list: true });
add('/api/reports/quotations.csv', 'get', 'Download filtered report CSV', null, { list: true, mime: 'text/csv', response: { type: 'string' } });
add('/api/users', 'get', 'Administrator: list active and inactive accounts');
add('/api/users', 'post', 'Create an account with configurable permissions', { ...schemas.Setup, properties: { ...schemas.Setup.properties, role: { type: 'string', enum: ['Administrator', 'Employee'] }, permissions: ref('Permissions') } }, { created: true });
add('/api/users/{id}', 'get', 'Administrator: get account');
add('/api/users/{id}', 'patch', 'Edit account access and revoke changed sessions; protect last administrator', { type: 'object', required: ['version'], properties: { version: { type: 'integer' }, name: str, username: str, role: { type: 'string', enum: ['Administrator', 'Employee'] }, active: { type: 'boolean' }, permissions: ref('Permissions') } });
add('/api/permissions', 'get', 'Supported permissions and inherited employee defaults');
add('/api/whatsapp/settings', 'get', 'Manual sharing configuration and limitations');
add('/api/whatsapp/config', 'get', 'Sanitized manual sharing template for permitted sharing users');
add('/api/whatsapp/settings', 'patch', 'Configure manual sharing and message template', { type: 'object', required: ['version'], properties: { version: { type: 'integer', minimum: 1 }, enabled: { type: 'boolean' }, mode: { type: 'string', enum: ['manual'] }, messageTemplate: str } }, { description: 'Requires settings.manage. Only manual click-to-chat is available. No provider secrets are accepted or returned. Placeholders: {customerName}, {quotationNumber}, {companyName}, {total}, {validUntil}; double-brace snake-case aliases are supported.' });
const sharingInput = { type: 'object', required: ['version'], properties: { version: { type: 'integer', minimum: 1 }, number: str, message: { type: 'string', maxLength: 4000 }, saveNumber: { type: 'boolean', default: false, description: 'Save the reviewed destination to the customer in the same transaction. Requires customer.edit.' } } };
add('/api/quotations/{id}/whatsapp', 'post', 'Prepare a manual WhatsApp PDF handoff', sharingInput, { created: true, description: 'Requires quotation.share_whatsapp and quotation.download_pdf plus quotation access. Saves an immutable authenticated PDF snapshot and Prepared attempt; returns data, pdfUrl, clickToChatUrl, instructions and automatedDelivery:false. Opening the chat does not attach or send the PDF, and quotation status does not change.' });
add('/api/whatsapp/history', 'get', 'Permission-scoped sharing attempts', null, { list: true, description: 'Additional filters: quotationId, customerId, actorId, status (Prepared, Manually Confirmed, Failed). No delivery claims are made for a manual handoff.' });
add('/api/whatsapp/history/{id}', 'get', 'View one permitted sharing attempt');
add('/api/whatsapp/history/{id}/pdf', 'get', 'Download the exact protected PDF retained for this sharing attempt', null, { mime: 'application/pdf', response: { type: 'string', format: 'binary' } });
add('/api/whatsapp/history/{id}/status', 'post', 'Record a manual result without claiming verified delivery', { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['Manually Confirmed', 'Failed'] }, notes: { type: 'string', maxLength: 2000 } } });
add('/api/whatsapp/history/{id}/retry', 'post', 'Retry a failed attempt with a new saved history entry', sharingInput, { created: true, description: 'One successor is allowed per failed attempt. If the quotation version changed, start a fresh sharing workflow to review the updated PDF and message.' });
add('/api/users/{id}', 'delete', 'Administrator: remove account, retain business history', 'Version');
add('/api/users/{id}/reset-password', 'post', 'Administrator: set temporary password and revoke sessions', { type: 'object', required: ['version', 'password'], properties: { version: { type: 'integer' }, password: { type: 'string', minLength: 12, maxLength: 128 } } });
add('/api/audit', 'get', 'Administrator: paginated durable audit trail', null, { list: true });
add('/api/data/export', 'get', 'Administrator: export business records without credentials');
add('/api/backups', 'get', 'Administrator: list database backups');
add('/api/backups', 'post', 'Administrator: create consistent online database backup', null, { created: true });
add('/api/backups/{name}', 'get', 'Administrator: download private database backup', null, { mime: 'application/octet-stream', response: { type: 'string', format: 'binary' } });
schemas.Product.properties.pricingApproval={type:'object',additionalProperties:false,required:['base','tax'],properties:{base:{type:'boolean'},tax:{type:'boolean'}},description:'Independent pending import approvals. Protected pricing metadata, omitted without pricing read permission. Imports never change on.'};
schemas.Product.properties.rate={type:['number','null'],minimum:0,description:'INR rate. Null is unconfigured; pure tier pricing does not require an irrelevant base rate.'};
schemas.Product.properties.tax={type:['number','null'],minimum:0,maximum:100};
schemas.ActivationEligibility={type:'object',properties:{productId:str,revision:{type:'integer'},eligible:{type:'boolean'},active:{type:'boolean'},status:{enum:['Blocked','Eligible','Valid']},checks:{type:'array',items:object},errors:{type:'array',items:object},warning:str}};
add('/api/products/{id}/activation-eligibility','get','Backend configuration and applicable approved pricing checklist',null,{response:ref('ActivationEligibility'),description:'Requires product.manage or pricing.manage. Every inactive-to-active mutation uses this service centrally. Active inconsistent masters retain their status with warnings; unsupported new pricing is blocked.'});
add('/api/pricing/template','get','Download current authorized XLSX pricing workbook',null,{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',response:{type:'string',format:'binary'},description:'Requires pricing.view or pricing.manage plus catalog access. Four sheets; pending prices remain blank. No temporary file persistence.'});
add('/api/pricing/imports/limits','get','Pricing-manager upload size, row count and preview lifetime limits');
add('/api/pricing/imports/preview','post','Validate XLSX and create a signed nonmutating row preview',null,{description:'Requires pricing.manage and CSRF. Raw binary application/vnd.openxmlformats-officedocument.spreadsheetml.sheet body; X-File-Name contains the URL-encoded .xlsx filename. Defaults: 5 MiB / 5000 data rows. Invalid literal rows return valid:false, structured errors and no token. Valid payloads bind session, actor, workspace revision and 15-minute expiry.'});
paths['/api/pricing/imports/preview'].post.requestBody={required:true,content:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{schema:{type:'string',format:'binary'}}}};
paths['/api/pricing/imports/preview'].post.parameters=[{name:'X-File-Name',in:'header',required:true,schema:str}];
add('/api/pricing/imports/confirm','post','Revalidate and atomically UPSERT approved prices without activation',{type:'object',additionalProperties:false,required:['previewToken'],properties:{previewToken:str}},{description:'Requires pricing.manage and CSRF. Signed payload only; reject stale revision (409), expiry (410), tampering/session mismatch (403). Revalidates current permissions and rows. Transaction includes rate updates and protected import history/audit. Repeated same-token confirmation returns its existing receipt. Discount Limit changes additionally require settings.manage.'});
add('/api/pricing/imports','get','Confidential applied-import history, 20 records per page',null,{description:'Requires pricing.manage. Positive page query parameter; contains counts/actor metadata, no uploaded workbook.'});
add('/api/pricing/imports/{id}','get','Confidential import receipt with old/new rate values',null,{description:'Requires pricing.manage. Old/new numeric rates are kept separately from generic non-price audit metadata.'});
module.exports = { openapi: '3.1.0', info: { title: 'Design Paradise API', version: '3.2.0', description: 'Single-company quotation backend with backend-enforced configurable permissions and immutable creator scopes. Uses cookie sessions and X-CSRF-Token for writes. Catalog/charges use INR decimal amounts; computed amounts use integer paise. WhatsApp manual click-to-chat prepares an authenticated PDF and records honest manual results; automated provider delivery is not configured. Public hosting and outbound email are separate infrastructure integrations.' }, servers: [{ url: '/' }], paths, components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'paradise_session' }, csrf: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' } }, schemas } };
