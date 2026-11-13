/* Deliberate administrator-only reset. Unlock state never survives a render. */
'use strict';
const resetSettingsView = V.set;
let resetClicks = 0, resetToken = null, resetStep = 0, resetSelection = [], resetCounts = null;
V.set = () => {
  resetClicks = 0; resetToken = null; resetStep = 0; resetSelection = []; resetCounts = null;
  return resetSettingsView() + (admin() ? `<section class="card data-reset" id="data-reset"><h2>Reset selected data</h2><p class="reset-warning"><strong>Warning: permanent deletion.</strong> Choose which created records to delete: quotations, customers or delivery addresses. Nothing is selected automatically when you open reset.</p><p class="mu">Demo/seed records, products, categories, pricing, accounts, Settings and backups are kept. Quotation numbering continues from its current value. Other sessions will be signed out after reset. Create a database backup above before continuing.</p><p id="reset-unlock-status" aria-live="polite">Click the red unlock button 5 times to enable Reset data.</p><div class="row"><button type="button" class="reset-danger" id="reset-unlock" onclick="unlockDataReset()">Unlock reset (0/5)</button><button type="button" class="reset-danger" id="reset-data" disabled onclick="startDataReset()">Reset data</button></div></section>` : '');
};
function unlockDataReset() {
  if (busy || !admin() || resetClicks >= 5) return;
  resetClicks++;
  $('#reset-unlock').textContent = `Unlock reset (${resetClicks}/5)`;
  if (resetClicks === 5) {
    $('#reset-unlock').disabled = true;
    $('#reset-data').disabled = false;
    $('#reset-unlock-status').textContent = 'Reset data is enabled. Select data, then confirm three warning popups before deletion.';
    $('#reset-data').focus();
  }
}
function relockDataReset() {
  resetClicks = 0; resetStep = 0; resetToken = null; resetSelection = []; resetCounts = null;
  const unlock = $('#reset-unlock'), reset = $('#reset-data');
  if (unlock) { unlock.textContent = 'Unlock reset (0/5)'; unlock.disabled = false; if (unlock.dataset.wasDisabled !== undefined) unlock.dataset.wasDisabled = '0'; }
  if (reset) { reset.disabled = true; if (reset.dataset.wasDisabled !== undefined) reset.dataset.wasDisabled = '1'; }
  if ($('#reset-unlock-status')) $('#reset-unlock-status').textContent = 'Click the red unlock button 5 times to enable Reset data.';
}
function cancelDataReset() {
  if (busy) return;
  const dialog = $('#data-reset-dialog');
  if (dialog) { dialog.close(); dialog.remove(); }
  relockDataReset();
  $('#reset-unlock')?.focus();
}
function startDataReset() {
  if (busy || !admin() || resetClicks !== 5 || resetToken) return;
  showResetDialog('Choose data to reset', `<p>Select only the created data you want to delete. Demo/seed records and all catalog/configuration data are protected.</p><div class="reset-options"><label class="checkbox"><input type="checkbox" name="reset-selection" value="quotations" onchange="updateResetSelection()"> Created quotations</label><p class="mu">Includes their items, status history, sharing history and stored sharing PDFs.</p><label class="checkbox"><input type="checkbox" name="reset-selection" value="customers" onchange="updateResetSelection()"> Created customers</label><p class="mu">Also selects delivery addresses. Quotations referencing these customers must be selected too; protected demo quotations are always kept.</p><label class="checkbox"><input type="checkbox" name="reset-selection" value="deliveryAddresses" onchange="updateResetSelection()"> Delivery addresses</label><p class="mu">Clears the address book, including addresses added to demo customers. Saved quotation snapshots are kept for retained quotations.</p></div><div class="row"><button type="button" class="b2" autofocus onclick="cancelDataReset()">Cancel reset</button><button type="button" class="reset-danger" id="reset-review" disabled onclick="prepareDataReset()">Review selected data</button></div>`);
}
function updateResetSelection() {
  const customers = $('#data-reset-dialog input[value="customers"]');
  const addresses = $('#data-reset-dialog input[value="deliveryAddresses"]');
  if (customers.checked) addresses.checked = true;
  addresses.disabled = customers.checked;
  $('#reset-review').disabled = !document.querySelector('#data-reset-dialog input[name="reset-selection"]:checked');
}
async function prepareDataReset() {
  if (busy || !admin() || resetClicks !== 5 || resetToken) return;
  const selection = [...document.querySelectorAll('#data-reset-dialog input[name="reset-selection"]:checked')].map(input => input.value);
  if (!selection.length) return;
  lock(true);
  try {
    const result = await api('/api/data/reset/prepare', { method: 'POST', body: JSON.stringify({ revision: REV, selection }) });
    resetToken = result.token; resetStep = 1; resetSelection = result.selection; resetCounts = result.counts;
  } catch (error) { $('#data-reset-dialog')?.remove(); relockDataReset(); failure(error); }
  finally { lock(false); }
  if (resetToken) showDataResetWarning();
}
function showResetDialog(title, content) {
  $('#data-reset-dialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'data-reset-dialog';
  dialog.className = 'data-reset-dialog';
  dialog.setAttribute('aria-labelledby', 'reset-warning-heading');
  dialog.innerHTML = `<h2 id="reset-warning-heading">${esc(title)}</h2>${content}`;
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancelDataReset(); });
  document.body.append(dialog);
  dialog.showModal();
}
function showDataResetWarning() {
  const labels = { quotations: 'Created quotations', customers: 'Created customers', deliveryAddresses: 'Delivery addresses' };
  const summary = `<ul>${resetSelection.map(key => `<li>${labels[key]}: <strong>${resetCounts[key]}</strong></li>`).join('')}</ul>${resetSelection.includes('quotations') ? `<p class="mu">Related sharing entries and PDFs to delete: ${resetCounts.sharingHistory}.</p>` : ''}`;
  const messages = [
    'Only the selected created records listed below will be permanently deleted. Review your selection before continuing.',
    'Demo/seed records, products, categories, pricing and Settings will stay. Deleting quotations also removes their related sharing history and stored PDFs. Saved address snapshots stay on quotations you keep. Make sure you have a backup.',
    'Final confirmation: permanently delete the selected created data now? This cannot be undone here. Unselected data and demo/seed records are kept. Other sessions will be signed out.',
  ];
  showResetDialog(`Warning ${resetStep} of 3`, `<p id="reset-warning-message" class="reset-warning">${messages[resetStep - 1]}</p>${summary}<div class="row"><button type="button" class="b2" autofocus onclick="cancelDataReset()">Cancel reset</button><button type="button" class="reset-danger" id="reset-confirm" onclick="confirmDataReset()">${resetStep === 3 ? 'Delete selected data permanently' : 'I understand, continue'}</button></div>`);
  $('#data-reset-dialog').setAttribute('aria-describedby', 'reset-warning-message');
}
async function confirmDataReset() {
  if (busy || !admin() || !resetToken || resetStep < 1 || resetStep > 3) return;
  lock(true);
  let completed = false, next = false;
  try {
    const result = await api('/api/data/reset/confirm', { method: 'POST', body: JSON.stringify({ token: resetToken, step: resetStep }) });
    if (resetStep === 3) {
      completed = true;
      Q = null; SETD = null; S = null; SAVED = null;
    } else { resetToken = result.token; resetStep++; next = true; }
  } catch (error) {
    $('#data-reset-dialog')?.remove();
    relockDataReset(); failure(error, true);
  } finally { lock(false); }
  if (completed) { $('#data-reset-dialog')?.remove(); location.reload(); }
  else if (next) showDataResetWarning();
}
