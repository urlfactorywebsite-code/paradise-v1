'use strict';
const DP = require('../shared/domain');
const str = { type: 'string' }, object = { type: 'object', additionalProperties: true };
const schemas = {
  Error: { type: 'object', required: ['error'], properties: { error: str, requestId: str } },
  Login: { type: 'object', required: ['username', 'password'], properties: { username: str, password: { type: 'string', minLength: 12, maxLength: 128, format: 'password' } } },
  Setup: { type: 'object', required: ['name', 'username', 'password'], properties: { name: str, username: str, password: { type: 'string', minLength: 12, maxLength: 128, format: 'password' }, demo: { type: 'boolean', default: false } } },
  Customer: { type: 'object', required: ['name', 'mob'], properties: Object.fromEntries(['id', 'name', 'co', 'person', 'mob', 'email', 'gstin', 'addr', 'notes', 'date'].map(k => [k, str])) },
  Category: { type: 'object', required: ['name'], properties: { id: str, name: str, on: { type: 'integer', enum: [0, 1] } } },
  Product: { type: 'object', required: ['name', 'code', 'cat', 'm'], properties: { id: str, name: str, code: str, cat: str, m: { type: 'string', enum: ['unit', 'area', 'fixed'] }, rate: { type: 'number', minimum: 0 }, min: { type: 'number', minimum: 0 }, tax: { type: 'number', minimum: 0, maximum: 100 }, on: { type: 'integer', enum: [0, 1] }, sizes: { type: 'integer', enum: [0, 1] }, tiers: { type: ['array', 'null'], items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 } }, f: { type: 'array', items: object, description: 'Configurable fields: {k,l,t}; t is sel, txt or dim. A sel field has o:[[label,chargeType,amount]], where chargeType is f,u,p,a.' } } },
  Quote: { type: 'object', required: ['cid'], properties: { id: str, no: { type: 'string', readOnly: true }, cid: str, date: { type: 'string', format: 'date' }, valid: { type: 'string', format: 'date' }, sales: str, ref: str, project: str, subject: str, req: str, items: { type: 'array', items: { type: 'object', required: ['pid', 'cfg'], properties: { id: str, pid: str, cfg: object, notes: str } } }, disc: { type: 'object', properties: { t: { type: 'string', enum: ['p', 'f'] }, v: { type: 'number', minimum: 0 } } }, del: { type: 'number', minimum: 0 }, oth: { type: 'number', minimum: 0 }, terms: { type: 'array', items: str }, status: { type: 'string', enum: DP.ST, description: 'New quotes must be Draft. Use the status action to change a saved status.' }, by: { type: 'string', readOnly: true }, hist: { type: 'array', items: object, readOnly: true } } },
  Version: { type: 'object', required: ['version'], properties: { version: { type: 'integer', minimum: 1 } } },
  Settings: { type: 'object', properties: { ...Object.fromEntries(['name', 'tag', 'addr', 'phone', 'email', 'web', 'gstin', 'prefix'].map(k => [k, str])), tax: { type: 'number', minimum: 0, maximum: 100 }, valid: { type: 'integer', minimum: 0, maximum: 3650 }, showNotes: { type: 'boolean' }, terms: { type: 'array', items: str } } },
};
const ref = name => ({ $ref: '#/components/schemas/' + name });
const paths = {};
function add(path, method, summary, request, options = {}) {
  const operation = { summary, tags: [options.tag || path.split('/')[2]], operationId: method + path.replace(/[^A-Za-z0-9]/g, '_'), security: options.public ? [] : [{ session: [], ...(method === 'get' ? {} : { csrf: [] }) }], responses: { [method === 'post' && options.created ? '201' : '200']: { description: 'Success. Monetary totals use integer paise unless a CSV column explicitly says INR.', content: { [options.mime || 'application/json']: { schema: options.response || object } } }, ...Object.fromEntries([400, 401, 403, 404, 409, 413, 422, 428, 429, 500].map(code => [code, { description: { 409: 'Stale version or conflicting record', 428: 'Version/revision required', 422: 'Invalid input' }[code] || 'Request rejected', content: { 'application/json': { schema: ref('Error') } } }])) } };
  operation.parameters = [...path.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: str }));
  if (options.list) operation.parameters.push(...['q', 'page', 'pageSize', 'sort', 'direction', 'active', 'category', 'status', 'customer', 'salesperson', 'from', 'to', 'min', 'max'].map(name => ({ name, in: 'query', schema: ['page', 'pageSize'].includes(name) ? { type: 'integer', minimum: 1, ...(name === 'pageSize' ? { maximum: 100 } : {}) } : str })));
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
add('/api/state', 'get', 'Bootstrap existing screens with workspace state');
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
add('/api/quotations/{id}/status', 'post', 'Change quotation status with server history', { type: 'object', required: ['version', 'status'], properties: { version: { type: 'integer' }, status: { type: 'string', enum: DP.ST } } });
add('/api/quotations/{id}/history', 'get', 'Quotation status history');
add('/api/quotations/{id}/pdf', 'get', 'Download a server-generated saved quotation', null, { mime: 'application/pdf', response: { type: 'string', format: 'binary' } });
add('/api/quotations/expire', 'post', 'Administrator: expire overdue pending/sent quotes', { type: 'object', properties: { revision: { type: 'integer' }, asOf: { type: 'string', format: 'date' } } });
add('/api/settings', 'get', 'Company settings and version');
for (const method of ['put', 'patch']) add('/api/settings', method, 'Administrator: update company settings', { type: 'object', required: ['version', 'data'], properties: { version: { type: 'integer' }, data: ref('Settings') } });
for (const route of ['/api/dashboard', '/api/reports/summary']) add(route, 'get', 'Server report totals and breakdowns', null, { list: true });
add('/api/reports/quotations.csv', 'get', 'Download filtered report CSV', null, { list: true, mime: 'text/csv', response: { type: 'string' } });
add('/api/users', 'get', 'Administrator: list active and inactive accounts');
add('/api/users', 'post', 'Administrator: create account', { ...schemas.Setup, properties: { ...schemas.Setup.properties, role: { type: 'string', enum: ['Administrator', 'Employee'] } } }, { created: true });
add('/api/users/{id}', 'get', 'Administrator: get account');
add('/api/users/{id}', 'patch', 'Administrator: edit access; protect last administrator', { type: 'object', required: ['version'], properties: { version: { type: 'integer' }, name: str, username: str, role: { type: 'string', enum: ['Administrator', 'Employee'] }, active: { type: 'boolean' } } });
add('/api/users/{id}', 'delete', 'Administrator: remove account, retain business history', 'Version');
add('/api/users/{id}/reset-password', 'post', 'Administrator: set temporary password and revoke sessions', { type: 'object', required: ['version', 'password'], properties: { version: { type: 'integer' }, password: { type: 'string', minLength: 12, maxLength: 128 } } });
add('/api/audit', 'get', 'Administrator: paginated durable audit trail', null, { list: true });
add('/api/data/export', 'get', 'Administrator: export business records without credentials');
add('/api/backups', 'get', 'Administrator: list database backups');
add('/api/backups', 'post', 'Administrator: create consistent online database backup', null, { created: true });
add('/api/backups/{name}', 'get', 'Administrator: download private database backup', null, { mime: 'application/octet-stream', response: { type: 'string', format: 'binary' } });
module.exports = { openapi: '3.1.0', info: { title: 'Design Paradise API', version: '2.0.0', description: 'Single-company quotation backend. Uses cookie sessions and X-CSRF-Token for writes. Catalog/charges use INR decimal amounts; computed amounts use integer paise. Internal approval/catalog/settings/team/audit/backups require Administrator. Public hosting and outbound email are separate infrastructure integrations.' }, servers: [{ url: '/' }], paths, components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'paradise_session' }, csrf: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' } }, schemas } };
