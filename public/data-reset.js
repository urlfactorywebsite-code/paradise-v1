/* Deliberate administrator-only reset. Unlock state never survives a render. */
'use strict';
const resetSettingsView = V.set;
let resetClicks = 0, resetToken = null, resetStep = 0;
V.set = () => {
  resetClicks = 0; resetToken = null; resetStep = 0;
  return resetSettingsView() + (admin() ? `<section class="card data-reset" id="data-reset"><h2>Reset all business data</h2><p class="reset-warning"><strong>Warning: permanent deletion.</strong> This clears customers, delivery addresses, quotations, products, product and customer categories, pricing imports, sharing history, stored sharing PDFs and previous audit history. Quotation numbering starts again. No demo or sample data will be added.</p><p class="mu">Accounts, saved Settings, general field settings and existing backup files are kept. Other sessions will be signed out. Create a database backup above before continuing.</p><p id="reset-unlock-status" aria-live="polite">Click the red unlock button 5 times to enable Reset data.</p><div class="row"><button type="button" class="reset-danger" id="reset-unlock" onclick="unlockDataReset()">Unlock reset (0/5)</button><button type="button" class="reset-danger" id="reset-data" disabled onclick="startDataReset()">Reset data</button></div></section>` : '');
};
function unlockDataReset() {
  if (busy || !admin() || resetClicks >= 5) return;
  resetClicks++;
  $('#reset-unlock').textContent = `Unlock reset (${resetClicks}/5)`;
  if (resetClicks === 5) {
    $('#reset-unlock').disabled = true;
    $('#reset-data').disabled = false;
    $('#reset-unlock-status').textContent = 'Reset data is enabled. Three warning popups must be confirmed before any data is deleted.';
    $('#reset-data').focus();
  }
}
function relockDataReset() {
  resetClicks = 0; resetStep = 0; resetToken = null;
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
async function startDataReset() {
  if (busy || !admin() || resetClicks !== 5 || resetToken) return;
  lock(true);
  try {
    const result = await api('/api/data/reset/prepare', { method: 'POST', body: JSON.stringify({ revision: REV }) });
    resetToken = result.token; resetStep = 1;
  } catch (error) { relockDataReset(); failure(error, true); }
  finally { lock(false); }
  if (resetToken) showDataResetWarning();
}
function showDataResetWarning() {
  $('#data-reset-dialog')?.remove();
  const messages = [
    'This will permanently delete ALL customers, delivery addresses, quotations, products and categories in this workspace. Continue?',
    'Pricing imports, sharing history, stored sharing PDFs and previous audit history will also be deleted. Quotation numbering starts again. No demo or sample records will be created. Make sure you have a backup.',
    'Final confirmation: delete all business data now? This cannot be undone here. Accounts, saved Settings, general field settings and backup files are kept. Other sessions will be signed out.',
  ];
  const dialog = document.createElement('dialog');
  dialog.id = 'data-reset-dialog';
  dialog.className = 'data-reset-dialog';
  dialog.setAttribute('aria-labelledby', 'reset-warning-heading');
  dialog.setAttribute('aria-describedby', 'reset-warning-message');
  dialog.innerHTML = `<h2 id="reset-warning-heading">Warning ${resetStep} of 3</h2><p id="reset-warning-message" class="reset-warning">${messages[resetStep - 1]}</p><div class="row"><button type="button" class="b2" autofocus onclick="cancelDataReset()">Cancel reset</button><button type="button" class="reset-danger" id="reset-confirm" onclick="confirmDataReset()">${resetStep === 3 ? 'Delete all data permanently' : 'I understand, continue'}</button></div>`;
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancelDataReset(); });
  document.body.append(dialog);
  dialog.showModal();
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
