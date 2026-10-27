'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { backupDatabase } = require('./backup');
const { fail, id, date, cfg, validateState } = require('./validation');
const { listing, report, csvExport, integer } = require('./queries');
const { quotationPdf } = require('./pdf');
const DP = require('../shared/domain');
const { requirePermission, hasPermission, requireQuoteAccess, scopeState, scopeCatalogData, authorizeChanges } = require('./access');
const { createWhatsApp } = require('./whatsapp');
const names = Object.freeze({
  customers: 'customers',
  products: 'products',
  categories: 'cats',
  quotations: 'quotes',
});
const admin = (user) => {
  if (user.role !== 'Administrator')
    fail('Administrator access is required.', 403);
};
const versionOf = (req, input) => {
  if (req.headers['if-match']) {
    const raw = req.headers['if-match'];
    if (!/^"?\d+"?$/.test(raw)) fail('Invalid If-Match version.');
    return Number(raw.replaceAll('"', ''));
  }
  return input.version;
};
const clean = (input) => {
  const value = input.data || input;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('A record object is required.');
  const data = { ...value };
  for (const key of ['version', 'updatedAt', 'allowDuplicate', 'revision'])
    delete data[key];
  return data;
};
function defaults(key, input, state, user) {
  const data = clean(input),
    today = new Date().toISOString().slice(0, 10);
  if (key === 'customers')
    return {
      date: today,
      name: '',
      co: '',
      person: '',
      mob: '',
      email: '',
      addr: '',
      gstin: '',
      notes: '',
      ...data,
      id: data.id || crypto.randomUUID(),
    };
  if (key === 'cats')
    return { on: 1, ...data, id: data.id || crypto.randomUUID() };
  if (key === 'products')
    return {
      on: 1,
      min: 0,
      rate: null,
      priceConfigured: data.rate !== undefined && data.rate !== null,
      tax: state.set.tax,
      tiers: null,
      f: [],
      ...data,
      id: data.id || crypto.randomUUID(),
    };
  const until = new Date(today + 'T00:00:00Z');
  until.setUTCDate(until.getUTCDate() + state.set.valid);
  return {
    date: today,
    valid: until.toISOString().slice(0, 10),
    cid: '',
    sales: user.name,
    ref: '',
    project: '',
    subject: '',
    req: '',
    items: [],
    disc: { t: 'p', v: 0 },
    del: 0,
    oth: 0,
    terms: structuredClone(state.set.terms),
    status: 'Draft',
    ...data,
    id: data.id || crypto.randomUUID(),
  };
}
function duplicateCustomer(state, data, existingId) {
  const normalize = (s) =>
    String(s || '')
      .trim()
      .toLowerCase();
  return state.customers.find(
    (c) =>
      c.id !== existingId &&
      ['mob', 'email', 'gstin'].some(
        (k) => normalize(data[k]) && normalize(data[k]) === normalize(c[k]),
      ),
  );
}
function createResources({ store, body, json, publicUser, backupDir }) {
  const whatsapp = createWhatsApp({ store, body, json });
  const pricingImports = require('./pricing-import').createPricingImports({store,body,json});
  const requireCatalogRead = (user) => {
    if (!hasPermission(user, 'product.view') && !hasPermission(user, 'product.manage') && !hasPermission(user, 'pricing.manage'))
      fail('You do not have permission for this action.', 403);
  };
  const requireCatalogManagement = user => {
    if(!hasPermission(user,'product.manage')&&!hasPermission(user,'pricing.manage'))fail('Product or pricing management permission is required.',403);
  };
  const catalogTemplates = settings => ['print_product','area_product','promotional_gift','stationery_product'].map(key=>key==='promotional_gift'?(settings.giftTemplate||DP.giftTemplate()):(settings.catalogTemplates?.[key]||DP.catalogTemplate(key)));
  const checklistResponse=(state,revision,filters={})=>{
    const result=require('../shared/catalog').checklist(state,filters),page=result.page||filters.page||1,pageSize=result.pageSize||filters.pageSize||40,total=result.filteredTotal??result.total??result.rows.length;
    const Readiness=require('../shared/pricing-readiness');
    return {...result,rows:result.rows.map(row=>{const p=state.products.find(p=>p.id===row.productId);return p?{...row,activationEligibility:Readiness.eligibility(p,state.set,state.cats)}:row;}),revision,categories:state.cats.map(({id,name})=>({id,name})),templates:catalogTemplates(state.set).map(({id,name})=>({id,name})),pagination:{page,pageSize,total,totalPages:Math.ceil(total/pageSize)}};
  };
  return async function handle(req, res, url, user) {
    const route = url.pathname,
      method = req.method;
    const send = (status, value) => {
      json(res, status, scopeCatalogData(value, user));
      return true;
    };
    const attachment = (content, mime, filename) => {
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      res.end(content);
      return true;
    };
    const stateResponse = (result) => ({ ...scopeState(result, user), user: publicUser(user) });
    if(await pricingImports(req,res,url,user))return true;
    if (await whatsapp(req, res, url, user)) return true;
    if (route === '/api/changes' && method === 'POST') {
      const input = await body(req);
      if (!Number.isInteger(input.revision))
        fail('Workspace revision is required.', 428);
      if (
        !Array.isArray(input.changes) ||
        !input.changes.length ||
        input.changes.length > 200
      )
        fail('Send between 1 and 200 changes.');
      const result = await store.mutate(
        user,
        (s) => {
          const touched = new Set();
          for (const change of input.changes) {
            if (
              !change ||
              !['cats', 'products', 'customers', 'quotes', 'set'].includes(
                change.collection,
              ) ||
              !['upsert', 'delete'].includes(change.action)
            )
              fail('Invalid change operation.');
            const token = `${change.collection}:${change.id || ''}`;
            if (touched.has(token))
              fail('A record can only be changed once per transaction.');
            touched.add(token);
            if (change.collection === 'set') {
              if (change.action !== 'upsert')
                fail('Settings cannot be deleted.');
              s.set = change.record;
              continue;
            }
            const recordId = id(change.id),
              index = s[change.collection].findIndex((x) => x.id === recordId);
            if (change.action === 'delete') {
              if (index < 0) fail('Record no longer exists.', 404);
              s[change.collection].splice(index, 1);
            } else {
              if (!change.record || change.record.id !== recordId)
                fail('Record ID does not match operation.');
              if (index < 0) s[change.collection].unshift(change.record);
              else s[change.collection][index] = change.record;
            }
          }
        },
        input.revision,
      );
      return send(200, stateResponse(result));
    }
    if (route === '/api/catalog' && method === 'GET') {
      requireCatalogRead(user);
      const { state } = await store.readCatalogConfiguration();
      const managesCatalog = hasPermission(user, 'product.manage') || hasPermission(user, 'pricing.manage');
      return send(200, { categories: state.cats.filter((c) => c.on || managesCatalog), products: state.products.filter((p) => p.on || managesCatalog), giftTemplate: state.set.giftTemplate || DP.giftTemplate(),catalogTemplates:state.set.catalogTemplates||{} });
    }
    if(route==='/api/catalog/checklist'&&method==='GET'){
      requireCatalogManagement(user);
      const q=url.searchParams.get('q')||'',category=url.searchParams.get('category')||'',status=url.searchParams.get('status')||'',template=url.searchParams.get('template')||'';
      if(q.length>200||category.length>80||status.length>80||template.length>40)fail('Catalog checklist filter is too long.');
      if(status&&!['Missing','Inactive (Price Pending)','Active','Inactive','Conflict','missing','inactive','active','price_pending','conflict'].includes(status))fail('Invalid catalog status filter.');
      if(template&&!['print_product','area_product','promotional_gift','stationery_product','none'].includes(template))fail('Invalid catalog template filter.');
      const page=integer(url.searchParams.get('page'),1,100000),pageSize=integer(url.searchParams.get('pageSize'),40,100),{state,revision}=await store.readCatalogConfiguration();
      const canonicalStatus={missing:'Missing',inactive:'Inactive',active:'Active',price_pending:'Inactive (Price Pending)',conflict:'Conflict'}[status]||status;
      return send(200,checklistResponse(state,revision,{q,category,status:canonicalStatus,template:template==='none'?'unassigned':template,page,pageSize}));
    }
    if(route==='/api/catalog/prepare'&&method==='POST'){
      requirePermission(user,'product.manage');
      const input=await body(req);if(!Number.isInteger(input.revision))fail('Workspace revision is required.',428);
      if(input.apply!==undefined&&typeof input.apply!=='boolean')fail('Apply must be a boolean.');
      const CC=require('../shared/catalog');
      if(input.apply!==true){
        const {state,revision}=await store.readCatalogConfiguration();if(input.revision!==revision)fail('Catalog changed. Reload before preparing.',409);
        const plan=CC.prepareCatalog(state);return send(200,{applied:false,revision,changes:plan.changes,issues:plan.issues,report:checklistResponse(plan.state,revision)});
      }
      requirePermission(user,'pricing.manage');let changes,issues;
      const result=await store.mutate(user,state=>{const plan=CC.prepareCatalog(state);changes=plan.changes;issues=plan.issues;state.cats=plan.state.cats;state.products=plan.state.products;state.set=plan.state.set;},input.revision);
      return send(200,{applied:true,changes,issues,report:checklistResponse(result.state,result.revision),...stateResponse(result)});
    }
    if(route==='/api/configuration-templates'&&method==='GET'){
      requireCatalogManagement(user);const {settings,revision}=await store.readTemplateConfiguration();return send(200,{data:catalogTemplates(settings),revision});
    }
    const catalogTemplateMatch=/^\/api\/configuration-templates\/(print-product|area-product|stationery-product)$/.exec(route);
    if(catalogTemplateMatch){
      requireCatalogManagement(user);const key=catalogTemplateMatch[1].replaceAll('-','_');
      if(method==='GET'){const {settings,revision}=await store.readTemplateConfiguration();return send(200,{data:settings.catalogTemplates?.[key]||DP.catalogTemplate(key),revision});}
      if(method==='PUT'){
        const input=await body(req);if(!Number.isInteger(input.revision))fail('Workspace revision is required.',428);
        const result=await store.mutate(user,state=>{state.set.catalogTemplates={...(state.set.catalogTemplates||{}),[key]:input.data};},input.revision);
        return send(200,{data:result.state.set.catalogTemplates[key],...stateResponse(result)});
      }
    }
    if(route==='/api/configuration-templates/promotional-gift'){
      requireCatalogRead(user);
      if(method==='GET')return send(200,await store.readGiftTemplate());
      if(method==='PUT'){
        if(!hasPermission(user,'product.manage')&&!hasPermission(user,'pricing.manage'))fail('Product or pricing management permission is required.',403);
        const input=await body(req);if(!Number.isInteger(input.revision))fail('Workspace revision is required.',428);
        const result=await store.mutate(user,state=>{state.set.giftTemplate=input.data;},input.revision);
        return send(200,{data:result.state.set.giftTemplate,revision:result.revision,...stateResponse(result)});
      }
    }
    if (route === '/api/pricing/calculate' && method === 'POST') {
      requireCatalogRead(user);
      if (!hasPermission(user, 'pricing.view')) requirePermission(user, 'pricing.manage');
      const input = await body(req),configuration=await store.readProductConfiguration(id(input.productId)),
        product=DP.resolveProduct(configuration.product,configuration.settings);
      if (!product.on || !configuration.category.on)
        fail('Product is inactive.');
      const fieldErrors = require('../shared/catalog').additionalFieldErrors(product, [configuration.category]);
      if (fieldErrors.length) fail(fieldErrors.join(' '));
      const eligibility=require('../shared/pricing-readiness').eligibility(configuration.product,configuration.settings,[configuration.category]);
      if(!eligibility.eligible)throw Object.assign(new Error('Pricing blocked: '+eligibility.errors.map(e=>e.action||e.label).join(' ')),{status:422,code:'PRICING_INCOMPLETE',details:eligibility});
      const result = DP.calc(product, cfg(input.cfg, product));
      if (result.err) fail(result.err);
      return send(200, { ...result, currency: 'INR', moneyUnit: 'paise' });
    }
    if (route === '/api/quotations/preview' && method === 'POST') {
      const input = await body(req),
        { state } = await store.readState(),
        candidate = structuredClone(state);
      const q = defaults('quotes', input, state, user),
        index = candidate.quotes.findIndex((x) => x.id === q.id);
      if (
        !Array.isArray(q.items) ||
        q.items.some((i) => !i || typeof i !== 'object')
      )
        fail('Quotation items must be an array of items.');
      q.items = q.items.map((i) => ({ ...i, id: i.id || crypto.randomUUID() }));
      if (index >= 0)
        candidate.quotes[index] = { ...candidate.quotes[index], ...q };
      else candidate.quotes.unshift(q);
      authorizeChanges(candidate, state, user);
      const checked = validateState(
        candidate,
        state,
        user,
        () => 'UNSAVED',
      ).quotes.find((x) => x.id === q.id);
      return send(200, {
        quotation: checked,
        totals: DP.totals(checked),
        currency: 'INR',
        moneyUnit: 'paise',
      });
    }
    if (route === '/api/settings') {
      if (method === 'GET') {
        const row = await store.db
          .prepare('SELECT settings,settings_version FROM workspace WHERE id=1')
          .get();
        if (!row) fail('Complete setup.', 409);
        return send(200, {
          data: JSON.parse(row.settings),
          version: row.settings_version,
        });
      }
      if (['PUT', 'PATCH'].includes(method)) {
        requirePermission(user, 'settings.manage');
        const input = await body(req),
          expected = versionOf(req, input);
        const result = await store.mutate(user, async (s) => {
          const version = (
            await store.db
              .prepare('SELECT settings_version FROM workspace WHERE id=1')
              .get()
          ).settings_version;
          if (!Number.isInteger(expected))
            fail('Settings version is required.', 428);
          if (expected !== version)
            fail('Company settings changed. Reload before saving.', 409);
          s.set =
            method === 'PATCH' ? { ...s.set, ...clean(input) } : clean(input);
        });
        return send(200, {
          data: result.state.set,
          version: (
            await store.db
              .prepare('SELECT settings_version FROM workspace WHERE id=1')
              .get()
          ).settings_version,
          revision: result.revision,
        });
      }
    }
    if (
      [
        '/api/reports/summary',
        '/api/dashboard',
        '/api/reports/quotations.csv',
      ].includes(route) &&
      method === 'GET'
    ) {
      const data = await report(store, url.searchParams, user);
      if (route.endsWith('.csv')) {
        await store.audit(user, 'reports.exported', 'reports', '', {
          count: data.count,
        });
        return attachment(
          csvExport(data),
          'text/csv; charset=utf-8',
          'quotation-report.csv',
        );
      }
      if (route === '/api/dashboard') {
        const recent = data.quotes.slice(0, 8);
        delete data.quotes;
        return send(200, {
          ...data,
          recent,
          activity: scopeState(await store.readState(), user).state.log.slice(0, 10),
        });
      }
      delete data.quotes;
      return send(200, data);
    }
    if (route === '/api/audit' && method === 'GET') {
      requirePermission(user, 'audit.view');
      const page = integer(url.searchParams.get('page'), 1, 1000000),
        pageSize = integer(url.searchParams.get('pageSize'), 50, 100);
      const clauses = [],
        values = [];
      for (const [parameter, column] of [
        ['entityType', 'entity_type'],
        ['entityId', 'entity_id'],
        ['actorId', 'actor_id'],
      ])
        if (url.searchParams.get(parameter)) {
          clauses.push(`${column}=?`);
          values.push(url.searchParams.get(parameter));
        }
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      const total = (
        await store.db
          .prepare(`SELECT count(*) AS n FROM audit_events${where}`)
          .get(...values)
      ).n;
      const data = (
        await store.db
          .prepare(
            `SELECT * FROM audit_events${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
          )
          .all(...values, pageSize, (page - 1) * pageSize)
      ).map((x) => ({ ...x, details: JSON.parse(x.details) }));
      return send(200, {
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    }
    if (route === '/api/data/export' && method === 'GET') {
      admin(user);
      const data = {
        format: 'design-paradise-workspace',
        version: 2,
        exportedAt: new Date().toISOString(),
        ...(await store.readState()),
      };
      await store.audit(user, 'workspace.exported', 'workspace', '', {
        revision: data.revision,
      });
      return attachment(
        JSON.stringify(data, null, 2),
        'application/json; charset=utf-8',
        'design-paradise-workspace.json',
      );
    }
    if (route === '/api/backups' && ['GET', 'POST'].includes(method)) {
      admin(user);
      fs.mkdirSync(backupDir, { recursive: true });
      if (method === 'GET')
        return send(200, {
          data: fs
            .readdirSync(backupDir)
            .filter((n) => /^paradise-[A-Za-z0-9-]+\.dump$/.test(n))
            .map((name) => {
              const stat = fs.statSync(path.join(backupDir, name));
              return {
                name,
                bytes: stat.size,
                createdAt: stat.mtime.toISOString(),
              };
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        });
      const result = await backupDatabase(store.db, backupDir);
      await store.audit(user, 'backup.created', 'backup', result.name);
      return send(201, result);
    }
    const backupMatch = /^\/api\/backups\/(paradise-[A-Za-z0-9-]+\.dump)$/.exec(
      route,
    );
    if (backupMatch && method === 'GET') {
      admin(user);
      const file = path.join(backupDir, backupMatch[1]);
      if (!fs.existsSync(file)) fail('Backup not found.', 404);
      await store.audit(user, 'backup.downloaded', 'backup', backupMatch[1]);
      return attachment(
        fs.readFileSync(file),
        'application/octet-stream',
        backupMatch[1],
      );
    }
    if (route === '/api/quotations/expire' && method === 'POST') {
      admin(user);
      const input = await body(req),
        asOf = date(input.asOf || new Date().toISOString().slice(0, 10));
      let count = 0;
      const result = await store.mutate(
        user,
        (s) => {
          for (const q of s.quotes)
            if (
              q.valid < asOf &&
              [
                'Pending Internal Review',
                'Approved Internally',
                'Sent to Customer',
              ].includes(q.status)
            ) {
              q.status = 'Expired';
              count++;
            }
        },
        input.revision,
      );
      return send(200, { count, ...stateResponse(result) });
    }
    const customerQuotes =
      /^\/api\/customers\/([A-Za-z0-9_-]+)\/quotations$/.exec(route);
    if (customerQuotes && method === 'GET') {
      requirePermission(user, 'customer.view');
      await store.get('customers', customerQuotes[1]);
      url.searchParams.set('customer', customerQuotes[1]);
      return send(200, await listing(store, 'quotes', url.searchParams, user));
    }
    const quoteAction =
      /^\/api\/quotations\/([A-Za-z0-9_-]+)\/(status|duplicate|reprice|history|pdf)$/.exec(
        route,
      );
    if (quoteAction) {
      const [, recordId, action] = quoteAction;
      if (method === 'GET' && ['history', 'pdf'].includes(action)) {
        const record = await store.get('quotes', recordId);
        requireQuoteAccess(user, record.data);
        if (action === 'history')
          return send(200, { data: record.data.hist, version: record.version });
        if (!record.data.items.length)
          fail('Add an item before generating a PDF.');
        requirePermission(user, 'quotation.download_pdf');
        const buffer = quotationPdf(
          record.data,
          (await store.readState()).state,
        );
        await store.audit(user, 'quotation.pdf_generated', 'quotes', recordId);
        return attachment(
          buffer,
          'application/pdf',
          record.data.no.replace(/[^A-Za-z0-9_-]/g, '-') + '.pdf',
        );
      }
      if (
        method === 'POST' &&
        ['status', 'duplicate', 'reprice'].includes(action)
      ) {
        const input = await body(req),
          copies = new Map();
        let savedId = recordId;
        const result = await store.mutate(
          user,
          async (s) => {
            const source = await store.expectVersion(
                'quotes',
                recordId,
                versionOf(req, input),
                user,
              ),
              q = s.quotes.find((x) => x.id === recordId);
            requireQuoteAccess(user, source);
            if (action === 'status') {
              q.status = input.status;
              q._statusRemarks = input.remarks ?? input.reason ?? '';
            }
            if (action === 'reprice') q._refreshPrices = true;
            if (action === 'duplicate') {
              const copy = structuredClone(source);
              savedId = crypto.randomUUID();
              copy.id = savedId;
              copy.status = 'Draft';
              copy.date = new Date().toISOString().slice(0, 10);
              const until = new Date(copy.date);
              until.setUTCDate(until.getUTCDate() + s.set.valid);
              copy.valid = until.toISOString().slice(0, 10);
              copies.set(copy.id, source);
              s.quotes.unshift(copy);
            }
          },
          undefined,
          { duplicateSources: copies },
        );
        return send(action === 'duplicate' ? 201 : 200, {
          ...(await store.get('quotes', savedId)),
          revision: result.revision,
        });
      }
    }
    const match =
      /^\/api\/(customers|products|categories|quotations)(?:\/([A-Za-z0-9_-]+))?$/.exec(
        route,
      );
    if (!match) return false;
    const key = names[match[1]],
      recordId = match[2];
    if (method === 'GET') {
      if (key === 'customers') requirePermission(user, 'customer.view');
      if (['cats', 'products'].includes(key)) requireCatalogRead(user);
      const record = recordId ? await store.get(key, recordId) : null;
      if (key === 'quotes' && record) requireQuoteAccess(user, record.data);
      return send(
        200,
        record || await listing(store, key, url.searchParams, user),
      );
    }
    if (key === 'cats') requirePermission(user, 'product.manage');
    if (key === 'products' && !hasPermission(user, 'product.manage') && !hasPermission(user, 'pricing.manage'))
      fail('You do not have permission for this action.', 403);
    if (method === 'POST' && !recordId) {
      const input = await body(req);
      let savedId;
      const result = await store.mutate(user, (s) => {
        const data = defaults(key, input, s, user);
        savedId = id(data.id);
        if (s[key].some((x) => x.id === savedId))
          fail('Record ID already exists.', 409);
        if (
          key === 'customers' &&
          !input.allowDuplicate &&
          duplicateCustomer(s, data)
        )
          fail(
            'A customer already uses that mobile, email, or GSTIN. Set allowDuplicate only after reviewing the match.',
            409,
          );
        if (key === 'quotes') {
          if (
            !Array.isArray(data.items) ||
            data.items.some((i) => !i || typeof i !== 'object')
          )
            fail('Quotation items must be an array of items.');
          data.items = data.items.map((i) => ({
            ...i,
            id: i.id || crypto.randomUUID(),
          }));
        }
        s[key].unshift(data);
      });
      return send(201, {
        ...(await store.get(key, savedId)),
        revision: result.revision,
      });
    }
    if (recordId && ['PATCH', 'PUT', 'DELETE'].includes(method)) {
      const input = await body(req);
      const result = await store.mutate(user, async (s) => {
        const current = await store.expectVersion(
          key,
          recordId,
          versionOf(req, input),
          user,
        );
        if (method === 'DELETE') {
          if (key === 'customers' && s.quotes.some((q) => q.cid === recordId))
            fail('This customer has quotations and cannot be deleted.', 409);
          if (key === 'cats' && s.products.some((p) => p.cat === recordId))
            fail('Move or remove products before deleting this category.', 409);
          s[key] = s[key].filter((x) => x.id !== recordId);
          return;
        }
        const updated = {
          ...(method === 'PATCH' ? current : {}),
          ...clean(input),
          id: recordId,
        };
        if (key === 'quotes') {
          if (
            !Array.isArray(updated.items) ||
            updated.items.some((i) => !i || typeof i !== 'object')
          )
            fail('Quotation items must be an array of items.');
          updated.status = current.status;
          updated.items = updated.items.map((i) => ({
            ...i,
            id: i.id || crypto.randomUUID(),
          }));
        }
        if (
          key === 'customers' &&
          !input.allowDuplicate &&
          duplicateCustomer(s, updated, recordId)
        )
          fail('A customer already uses that mobile, email, or GSTIN.', 409);
        s[key][s[key].findIndex((x) => x.id === recordId)] = updated;
      });
      return send(
        200,
        method === 'DELETE'
          ? { ok: true, revision: result.revision }
          : { ...(await store.get(key, recordId)), revision: result.revision },
      );
    }
    fail('Method not allowed.', 405);
  };
}
module.exports = { createResources };
