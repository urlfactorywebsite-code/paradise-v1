'use strict';
const DP = require('../shared/domain');
const { PERMISSIONS } = require('./access');
const str = { type: 'string' }, object = { type: 'object', additionalProperties: true };
const schemas = {
  Permissions: { type: ['array', 'null'], items: { type: 'string', enum: PERMISSIONS }, uniqueItems: true, description: 'Null inherits the employee defaults; an array replaces them. Administrator permissions are always complete.' },
  Error: { type: 'object', required: ['error'], properties: { error: str, requestId: str } },
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
add('/api/catalog', 'get', 'Catalog and categories');
add('/api/pricing/calculate', 'post', 'Validate configuration and calculate integer-paise price', { type: 'object', required: ['productId', 'cfg'], properties: { productId: str, cfg: object } });
add('/api/quotations/preview', 'post', 'Validate and preview without saving', 'Quote');
for (const action of ['duplicate', 'reprice']) add('/api/quotations/{id}/' + action, 'post', action === 'duplicate' ? 'Duplicate quote preserving saved prices and assigning a new number' : 'Explicitly refresh saved item prices from current catalog', 'Version', { created: action === 'duplicate' });
add('/api/quotations/{id}/status', 'post', 'Change quotation status with server history', { type: 'object', required: ['version', 'status'], properties: { version: { type: 'integer' }, status: { type: 'string', enum: DP.ST }, remarks: { type: 'string', maxLength: 2000 } } });
add('/api/quotations/{id}/history', 'get', 'Quotation status history');
add('/api/quotations/{id}/pdf', 'get', 'Download a server-generated saved quotation', null, { mime: 'application/pdf', response: { type: 'string', format: 'binary' } });
add('/api/quotations/expire', 'post', 'Administrator: expire overdue pending/sent quotes', { type: 'object', properties: { revision: { type: 'integer' }, asOf: { type: 'string', format: 'date' } } });
add('/api/settings', 'get', 'Company settings and version');
for (const method of ['put', 'patch']) add('/api/settings', method, 'Administrator: update company settings', { type: 'object', required: ['version', 'data'], properties: { version: { type: 'integer' }, data: ref('Settings') } });
for (const route of ['/api/dashboard', '/api/reports/summary']) add(route, 'get', 'Server report totals and breakdowns', null, { list: true });
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
module.exports = { openapi: '3.1.0', info: { title: 'Design Paradise API', version: '3.1.0', description: 'Single-company quotation backend with backend-enforced configurable permissions and immutable creator scopes. Uses cookie sessions and X-CSRF-Token for writes. Catalog/charges use INR decimal amounts; computed amounts use integer paise. WhatsApp manual click-to-chat prepares an authenticated PDF and records honest manual results; automated provider delivery is not configured. Public hosting and outbound email are separate infrastructure integrations.' }, servers: [{ url: '/' }], paths, components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'paradise_session' }, csrf: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' } }, schemas } };
