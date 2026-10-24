/* Account lifecycle, recovery and reports backed by dedicated APIs. */
const settingsView = V.set;
V.set = () => settingsView() + `<div class="card"><h2>Data and recovery</h2><p class="mu">Export business records, or create a database backup that also contains accounts. Store database backups privately.</p><div class="row"><button class="b2" onclick="downloadApi('/api/data/export','design-paradise-workspace.json')">Export workspace JSON</button><button onclick="createBackup()">Create database backup</button><button class="b2" onclick="showAudit(1)">View audit history</button><a href="/api.html" target="_blank" rel="noopener">API reference</a></div><div id="backup-list" class="mu">Loading backups…</div></div>`;
async function loadBackendSettings() {
  if (!admin()) return;
  try {
    const result = await api('/api/backups');
    const element = $('#backup-list');
    if (element) element.innerHTML = result.data.length ? result.data.slice(0, 10).map(b => `<div class="row"><span>${esc(new Date(b.createdAt).toLocaleString())} · ${(b.bytes / 1024).toFixed(1)} KB</span><button class="s b2" onclick="downloadApi('/api/backups/${encodeURIComponent(b.name)}','${b.name}')">Download backup</button></div>`).join('') : 'No database backups have been created here yet.';
  } catch (error) { const element = $('#backup-list'); if (element) element.textContent = error.message; }
}
async function createBackup() {
  if (busy || !admin()) return; lock(true);
  try { await api('/api/backups', { method: 'POST', body: '{}' }); await loadBackendSettings(); toast('Database backup created'); }
  catch (error) { failure(error); } finally { lock(false); }
}
async function loadTeam() {
  try {
    const data = await api('/api/users'); TEAM = data.users;
    const element = $('#team-list');
    if (element) element.innerHTML = `<table><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr>${TEAM.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${u.active ? 'Active' : 'Inactive'}${u.mustChangePassword ? ' · Password change required' : ''}</td><td><button class="s b2" onclick="editUser('${u.id}')">Edit access</button>${u.id !== AUTH.id ? ` <button class="s b2" onclick="resetUserPassword('${u.id}')">Reset password</button> <button class="s bd" onclick="deleteUser('${u.id}')">Remove</button>` : ''}</td></tr>`).join('')}</table>`;
  } catch (error) { const element = $('#team-list'); if (element) element.textContent = error.message; if (error.status === 401) failure(error); }
}
function editUser(id) {
  const user = TEAM.find(u => u.id === id); if (!user) return;
  modal(`<h2>Edit team member</h2><form onsubmit="event.preventDefault();saveUser('${id}',${user.version})"><div class="grid">${fld('Name', `<input id="edit_user_name" required maxlength="100" value="${esc(user.name)}">`)}${fld('Username', `<input id="edit_user_username" required maxlength="64" value="${esc(user.username)}">`)}${fld('Role', `<select id="edit_user_role"><option ${user.role === 'Employee' ? 'selected' : ''}>Employee</option><option ${user.role === 'Administrator' ? 'selected' : ''}>Administrator</option></select>`)}</div><label class="checkbox"><input id="edit_user_active" type="checkbox" ${user.active ? 'checked' : ''}> Active account</label><p class="mu">Changing access invalidates this person's existing sessions. At least one administrator must remain active.</p><button type="submit">Save account</button></form>`, 600);
}
async function saveUser(id, version) {
  if (busy) return;
  const data = { version, name: $('#edit_user_name').value, username: $('#edit_user_username').value, role: $('#edit_user_role').value, active: $('#edit_user_active').checked };
  lock(true);
  try { await api('/api/users/' + id, { method: 'PATCH', body: JSON.stringify(data) }); closeM(); await loadTeam(); if (id === AUTH.id) { const fresh = await api('/api/auth/status'); AUTH = fresh.user; CSRF = fresh.csrfToken; render(); } toast('Account updated'); }
  catch (error) { failure(error); } finally { lock(false); }
}
function resetUserPassword(id) {
  const user = TEAM.find(u => u.id === id);
  modal(`<h2>Reset password for ${esc(user.name)}</h2><p class="mu">Existing sessions will be signed out. This person must change the temporary password after signing in.</p><form onsubmit="event.preventDefault();submitPasswordReset('${id}',${user.version})">${fld('Temporary password', '<input id="reset_user_password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>')}<br><button type="submit">Reset password</button></form>`, 500);
}
async function submitPasswordReset(id, version) {
  if (busy) return; const password = $('#reset_user_password').value; lock(true);
  try { await api('/api/users/' + id + '/reset-password', { method: 'POST', body: JSON.stringify({ password, version }) }); closeM(); await loadTeam(); toast('Password reset; share the temporary password securely.'); }
  catch (error) { failure(error); } finally { lock(false); }
}
function deleteUser(id) {
  const user = TEAM.find(u => u.id === id);
  ask(`Remove the account for ${esc(user.name)}? Their sessions will be revoked. Quotation and audit history remain.`, async () => {
    if (busy) return; lock(true);
    try { await api('/api/users/' + id, { method: 'DELETE', body: JSON.stringify({ version: user.version }) }); await loadTeam(); toast('Account removed'); }
    catch (error) { failure(error); } finally { lock(false); }
  }, 'Delete');
}
async function sessionsForm() {
  try {
    const { sessions } = await api('/api/auth/sessions');
    modal(`<h2>Your active sessions</h2><p class="mu">Each sign-in creates a session. Revoke sessions you no longer use.</p>${sessions.map(s => `<div class="card"><b>${s.current ? 'This session' : 'Another session'}</b><div class="mu">Started ${esc(new Date(s.createdAt).toLocaleString())}<br>Last seen ${esc(new Date(s.lastSeen).toLocaleString())}</div>${s.current ? '' : `<button class="s bd" onclick="revokeSession('${s.id}')">Revoke session</button>`}</div>`).join('')}<button class="b2" onclick="revokeSession()">Sign out all other sessions</button>`, 560);
  } catch (error) { failure(error); }
}
async function revokeSession(id) {
  try { await api('/api/auth/sessions' + (id ? '/' + id : ''), { method: 'DELETE' }); await sessionsForm(); toast('Sessions updated'); }
  catch (error) { failure(error); }
}
async function showAudit(page = 1) {
  try {
    const { data, pagination } = await api('/api/audit?page=' + page);
    modal(`<h2>Audit history</h2><div class="tw"><table><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr>${data.map(e => `<tr><td>${esc(new Date(e.at).toLocaleString())}</td><td>${esc(e.actor_name)}</td><td>${esc(e.action)}</td><td>${esc(e.details.message || e.entity_id)}</td></tr>`).join('')}</table></div><div class="row"><span>Page ${page} of ${Math.max(1, pagination.totalPages)} · ${pagination.total} events</span>${page > 1 ? `<button class="b2" onclick="showAudit(${page - 1})">Previous</button>` : ''}${page < pagination.totalPages ? `<button class="b2" onclick="showAudit(${page + 1})">Next</button>` : ''}</div>`, 950);
  } catch (error) { failure(error); }
}
let reportRequest = 0;
V.rep = () => `<h1>Reports</h1><div class="note">Totals are quoted values, not revenue or payments received.</div><div class="row">${fld('From date', `<input type="date" value="${RF.a}" onchange="RF.a=this.value;refreshReports()">`)}${fld('To date', `<input type="date" value="${RF.b}" onchange="RF.b=this.value;refreshReports()">`)}<button class="b2" onclick="repCsv()">Export visible reports to CSV</button></div><div id="server-reports" aria-live="polite">Loading reports…</div>`;
async function loadServerReports() {
  const request = ++reportRequest, query = typeof reportQuery==='function'?reportQuery():new URLSearchParams(); if (RF.a) query.set('from', RF.a); if (RF.b) query.set('to', RF.b);
  try {
    const data = await api('/api/reports/summary?' + query); const element = $('#server-reports'); if (!element || request !== reportRequest) return;
    const table = (title, rows, columns = ['Group', 'Count', 'Quoted value']) => `<div class="card tw"><h2>${esc(title)}</h2><table><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') : '<tr><td>No quotations match these dates.</td></tr>'}</table></div>`;
    const rows = items => items.map(i => [i.name || i.key, i.count, inr(i.quotedValue)]);
    element.innerHTML = `<div class="cards"><div class="card"><b>${data.count}</b><span>Quotations</span></div><div class="card"><b>${inr(data.quotedValue)}</b><span>Quoted value</span></div></div>` + table('Quotations by status', rows(data.byStatus)) + table('Quotations created by date', rows(data.byDate)) + table('Quotations by employee', rows(data.byEmployee||data.bySalesperson)) + table('Most frequently quoted products', data.products.map(p => [p.name, p.timesQuoted, p.quantity]), ['Product', 'Times quoted', 'Total quantity']) + table('Customer-wise history', rows(data.byCustomer)) + table('Approved vs rejected', rows(data.byStatus.filter(s => ['Customer Approved', 'Customer Rejected'].includes(s.key)))) + table('Expired quotations', data.expired.map(q=>[q.number,q.customer,inr(q.quotedValue)]), ['Quotation','Customer','Quoted value']);
  } catch (error) { const element = $('#server-reports'); if (element) element.textContent = error.message; }
}
const customersView = V.cust;
V.cust = () => {
  let html = customersView();
  for (const c of S.customers) { const edit = `onclick="custForm('${c.id}')">Edit</button>`; html = html.replace(edit, edit + ` <button class="s bd" onclick="deleteCustomer('${c.id}')">Delete</button>`); }
  return html;
};
function deleteCustomer(id) {
  if (S.quotes.some(q => q.cid === id)) { toast('Customers with quotations cannot be deleted.', 'er'); return; }
  ask(`Delete ${esc(cust(id).name)}?`, async () => {
    if (busy) return; lock(true);
    try { const record = await api('/api/customers/' + id); await api('/api/customers/' + id, { method: 'DELETE', body: JSON.stringify({ version: record.version }) }); adopt(await api('/api/state')); render(); toast('Customer deleted'); }
    catch (error) { failure(error); } finally { lock(false); }
  }, 'Delete');
}
async function dupQ(id) {
  if (busy) return; lock(true);
  try { const source = await api('/api/quotations/' + id); const copied = await api('/api/quotations/' + id + '/duplicate', { method: 'POST', body: JSON.stringify({ version: source.version }) }); adopt(await api('/api/state')); Q = null; render(); toast('Duplicated as ' + copied.data.no); }
  catch (error) { failure(error); } finally { lock(false); }
}
