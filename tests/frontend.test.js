'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const DP = require('../shared/domain');
const { validateState } = require('../server/validation');

const ADMIN = { id: 'admin', name: 'Administrator', username: 'admin', role: 'Administrator' };
const EMPLOYEE = { id: 'employee', name: 'Employee', username: 'employee', role: 'Employee' };
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  .replace(/start\(\);\s*$/, '');
const clone = value => JSON.parse(JSON.stringify(value));

// Keep the real rendering, event handlers, API client, save/reload workflows and
// server validator. Only browser DOM primitives and the HTTP transport are fake.
function harness(user = EMPLOYEE) {
  const elements = new Map();
  function element() {
    return {
      innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, disabled: false,
      children: [], append(child) { this.children.push(child); }, remove() {},
    };
  }
  function node(selector) {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  }
  for (const selector of ['#app', '#modal', '#connection', '#toast', '#cc', '#its', '#sm']) node(selector);
  let state = DP.seed({ demo: true });
  let revision = 1;
  let authorized = true;
  let duplicateUsername = false;
  let sequence = 5;
  let stateWrites = 0;
  const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => clone(data) });
  const snapshot = () => ({ state: clone(state), revision, user: clone(user) });
  const context = vm.createContext({
    DP, console, crypto: crypto.webcrypto, AbortController,
    setTimeout(callback, ms) { const timer = setTimeout(callback, ms); timer.unref(); return timer; },
    clearTimeout,
    location: { hash: '#new' },
    window: { addEventListener() {} },
    document: {
      body: { classList: { toggle() {} } },
      querySelector(selector) { return elements.get(selector) || null; },
      querySelectorAll() { return [...elements.values()]; },
      createElement: element, addEventListener() {},
    },
    async fetch(route, options = {}) {
      const method = options.method || 'GET';
      if (route === '/api/auth/login') {
        authorized = true;
        return response(200, { user, csrfToken: 'renewed-csrf-token' });
      }
      if (!authorized) return response(401, { error: 'Please sign in to continue.' });
      if (route === '/api/state' && method === 'GET') return response(200, snapshot());
      if (route === '/api/changes' && method === 'POST') {
        stateWrites++;
        const body = JSON.parse(options.body);
        if (body.revision !== revision) return response(409, { error: 'Changes were saved in another session.' });
        try {
          const candidate=clone(state);for(const change of body.changes){if(change.collection==='set'){candidate.set=change.record;continue}const index=candidate[change.collection].findIndex(x=>x.id===change.id);if(change.action==='delete')candidate[change.collection].splice(index,1);else if(index<0)candidate[change.collection].unshift(change.record);else candidate[change.collection][index]=change.record;}
          state = validateState(candidate, state, user,
            (date, prefix) => `${prefix}/${date.slice(0, 4)}/${String(++sequence).padStart(4, '0')}`);
          revision++;
          return response(200, snapshot());
        } catch (error) {
          return response(error.status || 500, { error: error.message });
        }
      }
      if (route === '/api/users' && method === 'POST' && duplicateUsername) {
        return response(409, { error: 'Username already exists.' });
      }
      if (route === '/api/users' && method === 'GET') return response(200, { users: [user] });
      throw new Error(`Unexpected test request: ${method} ${route}`);
    },
  });
  vm.runInContext(source, context, { filename: 'public/app.js' });
  const run = code => vm.runInContext(code, context);
  context.initial = snapshot();
  run('adopt(initial);CSRF="initial-csrf-token";');
  return {
    run, node,
    json(code) { return clone(run(code)); },
    state: () => clone(state),
    writes: () => stateWrites,
    expire() { authorized = false; },
    rejectDuplicateUsername() { duplicateUsername = true; },
    remoteChange(mutate) {
      const candidate = clone(state);
      mutate(candidate);
      state = validateState(candidate, state, ADMIN, () => { throw new Error('Unexpected remote new quote'); });
      revision++;
    },
  };
}

function editDraft(app) {
  app.run("Q=clone(S.quotes.find(quote=>quote.status==='Draft'));Q.project='Preserved employee project';");
  return app.run('Q.id');
}

function assertApprovalAndDraft(app, id) {
  const draft = app.json('Q');
  const saved = app.state().quotes.find(quote => quote.id === id);
  assert.equal(draft.status, 'Approved Internally');
  assert.deepEqual(draft.hist, saved.hist);
  assert.equal(draft.no, saved.no);
  assert.equal(draft.by, saved.by);
  assert.equal(draft.chargeTax, saved.chargeTax);
  assert.equal(draft.project, 'Preserved employee project', 'Editable draft data must survive recovery');
}

test('conflict reload preserves employee edits and cannot silently revert a newer internal approval', async () => {
  const app = harness();
  const id = editDraft(app);
  app.remoteChange(state => { state.quotes.find(quote => quote.id === id).status = 'Approved Internally'; });
  assert.equal(await app.run('saveQ(false)'), false);
  assert.equal(app.run('conflict'), true);
  assert.equal(app.state().quotes.find(quote => quote.id === id).status, 'Approved Internally');

  await app.run('reloadState()');
  assert.equal(app.run('conflict'), false);
  assertApprovalAndDraft(app, id);
  assert.equal(await app.run('saveQ(false)'), true);
  const saved = app.state().quotes.find(quote => quote.id === id);
  assert.equal(saved.status, 'Approved Internally');
  assert.equal(saved.project, 'Preserved employee project');
  assert.equal(saved.hist.at(-1).t, 'Approved Internally');
  assert.equal(saved.hist.at(-1).u, ADMIN.name);
});

test('signing in again as the same employee rebases approval metadata while keeping the draft', async () => {
  const app = harness();
  const id = editDraft(app);
  app.remoteChange(state => { state.quotes.find(quote => quote.id === id).status = 'Approved Internally'; });
  app.expire();
  assert.equal(await app.run('saveQ(false)'), false);
  assert.equal(app.run('AUTH'), null);
  assert.equal(app.run('Q.project'), 'Preserved employee project');

  app.node('#auth_username').value = EMPLOYEE.username;
  app.node('#auth_password').value = 'Valid-local-password-2026';
  await app.run('signIn(false)');
  assert.equal(app.run('AUTH.id'), EMPLOYEE.id);
  assertApprovalAndDraft(app, id);
  assert.equal(await app.run('saveQ(false)'), true);
  assert.equal(app.state().quotes.find(quote => quote.id === id).status, 'Approved Internally');
});

test('duplicate username errors do not put unrelated workspace saves into revision-conflict mode', async () => {
  const app = harness(ADMIN);
  app.rejectDuplicateUsername();
  for (const [field, value] of Object.entries({
    team_name: 'Another Person', team_username: 'admin', team_password: 'Valid-local-password-2026', team_role: 'Employee',
  })) app.node(`#${field}`).value = value;
  await app.run('addUser()');
  assert.equal(app.run('conflict'), false);
  assert.match(app.run('connection.text'), /Username already exists/i);
  app.run("S.customers[0].notes='Customer update after duplicate username';");
  assert.equal(await app.run('persist()'), true);
  assert.equal(app.state().customers[0].notes, 'Customer update after duplicate username');
});

test('area configurator exposes usable dimensions even when the catalog lacks a dimension field', async () => {
  const app = harness(ADMIN);
  app.run("prod('p5').f=prod('p5').f.filter(field=>field.t!=='dim');Q=newQ();Q.cid=S.customers[0].id;openCfg('p5');");
  const html = app.node('#modal').innerHTML;
  assert.match(html, /<input[^>]*placeholder="Width"/);
  assert.match(html, /<input[^>]*placeholder="Height"/);
  assert.match(html, /<select[^>]*onchange="cs_\('u',this.value\)"/);

  app.run("cs_('w','10');cs_('h','4');cs_('qty','2');cs_('u','ft');addItem();");
  const item = app.json('Q.items[0]');
  assert.equal(item.cfg.w, 10);
  assert.equal(item.cfg.h, 4);
  assert.equal(item.qty, 2);
  assert.equal(item.base, 112000, '14 rupees per square foot times 10×4 feet times 2 pieces');
  assert.equal(await app.run('saveQ(false)'), true);
  assert.equal(app.state().quotes[0].items[0].base, 112000);
});

test('a quotation deleted during conflict recovery is not silently recreated by Save', async () => {
  const app = harness();
  const id = editDraft(app);
  app.remoteChange(state => { state.quotes = state.quotes.filter(quote => quote.id !== id); });
  assert.equal(await app.run('saveQ(false)'), false);
  await app.run('reloadState()');
  const writes = app.writes();
  assert.equal(await app.run('saveQ(false)'), false);
  assert.equal(app.writes(), writes, 'Missing quotation must not submit an implicit create');
  assert.ok(app.state().quotes.every(quote => quote.id !== id));
  assert.equal(app.run('Q.project'), 'Preserved employee project');
  assert.match(app.node('#app').innerHTML, /Save as new Draft/);
});
