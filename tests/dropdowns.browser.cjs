'use strict';
// Isolated browser checks use synthetic DOM only; no workspace data is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const fixture = `<style>:root{--tx:#163942;--t:#0b5560}*{box-sizing:border-box}body{margin:24px;font:14px Arial}main{max-width:420px}label{display:block;margin-bottom:16px}label>span{display:block;margin-bottom:6px}button,input,select{font:inherit}input{padding:9px}</style>
<main><form id="form"><input id="before" aria-label="Before control"><label><span>Delivery service</span><select name="service" id="service"><option value="standard" selected>Standard delivery</option><option value="express">Express delivery</option><option value="collect" disabled>Collection unavailable</option><optgroup label="Specialist" disabled><option value="overnight">Overnight unavailable</option></optgroup><option value="installation">Delivery and installation</option></select></label><input id="after" aria-label="After control"><button type="reset">Reset form</button></form></main>`;
async function runDropdownChecks(browser) {
  const results = [], exceptions = [];
  async function check(name, run) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', error => exceptions.push(name + ': ' + error.message));
    try {
      await page.setContent(fixture);
      await page.addStyleTag({ path: path.join(root, 'public/dropdowns.css') });
      await page.addScriptTag({ path: path.join(root, 'public/dropdowns.js') });
      await run(page);
      results.push({ name, result: 'PASS' }); console.log('PASS ' + name);
    } catch (error) { results.push({ name, result: 'FAIL', error: error.message }); console.error('FAIL ' + name + ': ' + error.message.split('\n')[0]); }
    finally { await page.close(); }
  }
  const trigger = page => page.getByRole('combobox', { name: 'Delivery service', exact: true });
  const search = page => page.getByRole('searchbox', { name: 'Search Delivery service options', exact: true });
  const choose = async (page, label) => { await trigger(page).click(); await page.getByRole('option', { name: label, exact: true }).click(); };
  await check('Native labels, values, events and unchanged selections are preserved', async page => {
    await page.locator('#service').evaluate(select => { window.events = []; for (const type of ['input', 'change']) select.addEventListener(type, event => events.push(event.type)); });
    await choose(page, 'Express delivery');
    assert.equal(await page.locator('#service').inputValue(), 'express'); assert.deepEqual(await page.evaluate(() => events), ['input', 'change']);
    await choose(page, 'Express delivery'); assert.deepEqual(await page.evaluate(() => events), ['input', 'change']);
    assert.equal(await trigger(page).evaluate(node => node === document.activeElement), true);
  });
  await check('Native form reset restores visible selection without synthetic change events', async page => {
    await choose(page, 'Express delivery');
    await page.locator('#service').evaluate(select => { window.events = []; select.addEventListener('change', () => events.push('change')); });
    await page.getByRole('button', { name: 'Reset form' }).click();
    assert.equal(await page.locator('#service').inputValue(), 'standard');
    await trigger(page).getByText('Standard delivery', { exact: true }).waitFor({ timeout: 1500 });
    assert.deepEqual(await page.evaluate(() => events), []);
  });
  await check('Canceling native form reset preserves the current selection and visible caption', async page => {
    await choose(page, 'Express delivery'); await page.locator('#form').evaluate(form => form.addEventListener('reset', event => event.preventDefault()));
    await page.getByRole('button', { name: 'Reset form' }).click();
    await trigger(page).getByText('Express delivery', { exact: true }).waitFor(); assert.equal(await page.locator('#service').inputValue(), 'express');
  });
  await check('Live option replacement and labels refresh an already open menu', async page => {
    await trigger(page).click(); await search(page).fill('delivery');
    await page.locator('#service').evaluate(select => { select.innerHTML = '<option value="weekend">Weekend delivery</option><option value="scheduled">Scheduled delivery</option>'; });
    await page.getByRole('option', { name: 'Scheduled delivery', exact: true }).waitFor({ timeout: 1500 });
    assert.equal(await search(page).inputValue(), 'delivery');
    await page.getByRole('option', { name: 'Scheduled delivery', exact: true }).click(); assert.equal(await page.locator('#service').inputValue(), 'scheduled');
  });
  await check('Hidden options stay excluded and native option label attributes are respected', async page => {
    await page.locator('#service').evaluate(select => { select.options[0].label = 'Regular delivery'; select.options[1].hidden = true; });
    await trigger(page).getByText('Regular delivery', { exact: true }).waitFor({ timeout: 1500 });
    await trigger(page).click(); assert.equal(await page.getByRole('option', { name: 'Express delivery', exact: true }).count(), 0);
    assert.equal(await page.getByRole('option', { name: 'Regular delivery', exact: true }).count(), 1);
  });
  await check('Keyboard navigation skips disabled choices and disabled option groups', async page => {
    await trigger(page).focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#service').inputValue(), 'express');
  });
  await check('Typing after keyboard opening searches the list immediately', async page => {
    await trigger(page).focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.type('installation');
    assert.equal(await search(page).inputValue(), 'installation'); assert.equal(await page.getByRole('option').count(), 1);
    await page.keyboard.press('Enter'); assert.equal(await page.locator('#service').inputValue(), 'installation');
  });
  await check('Escape, Tab and Shift+Tab return predictable focus', async page => {
    await trigger(page).click(); await page.keyboard.press('Escape'); assert.equal(await trigger(page).evaluate(node => node === document.activeElement), true);
    await trigger(page).click(); await page.keyboard.press('Tab'); assert.equal(await page.locator('#after').evaluate(node => node === document.activeElement), true);
    await trigger(page).click(); await page.keyboard.press('Shift+Tab'); assert.equal(await page.locator('#before').evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator('.dp-select-menu').count(), 0);
  });
  await check('Moving focus outside dismisses the menu and leaves other keyboard input alone', async page => {
    await trigger(page).click(); await page.locator('#after').focus();
    await page.waitForFunction(() => !document.querySelector('.dp-select-menu'), null, { timeout: 1500 });
    await page.keyboard.type('Invoice'); await page.keyboard.press('Home'); await page.keyboard.type('New ');
    assert.equal(await page.locator('#after').inputValue(), 'New Invoice');
  });
  await check('Native hidden and disabled states propagate to the visible control', async page => {
    await trigger(page).click(); await page.locator('#service').evaluate(select => { select.disabled = true; });
    await page.waitForFunction(() => document.querySelector('.dp-select-trigger').disabled && !document.querySelector('.dp-select-menu'));
    await page.locator('#service').evaluate(select => { select.disabled = false; select.hidden = true; });
    await page.waitForFunction(() => document.querySelector('.dp-select').hidden, null, { timeout: 1500 });
    await page.locator('#service').evaluate(select => { select.hidden = false; }); await trigger(page).waitFor({ state: 'visible' });
  });
  await check('Disabled fieldsets preserve native first-legend exception', async page => {
    await page.evaluate(() => { document.querySelector('main').insertAdjacentHTML('beforeend', '<fieldset disabled id="fieldset"><legend><select aria-label="Legend choice"><option>Keep enabled</option></select></legend><select aria-label="Inside fieldset"><option>Disabled</option></select></fieldset>'); });
    const legend = page.getByRole('combobox', { name: 'Legend choice' }); await legend.waitFor(); assert.equal(await legend.isEnabled(), true);
    const field = page.getByRole('combobox', { name: 'Inside fieldset' }); assert.equal(await field.isDisabled(), true);
    await page.locator('#fieldset').evaluate(node => { node.disabled = false; }); await field.waitFor(); assert.equal(await field.isEnabled(), true);
  });
  await check('Required forms focus the visible dropdown when native validation fails', async page => {
    await page.locator('#service').evaluate(select => { select.required = true; select.innerHTML = '<option value="">Choose delivery</option><option value="standard">Standard delivery</option>'; });
    assert.equal(await page.locator('#form').evaluate(form => form.reportValidity()), false);
    assert.equal(await trigger(page).evaluate(node => node === document.activeElement), true);
    assert.equal(await trigger(page).getAttribute('aria-required'), 'true');
    assert.equal(await trigger(page).getAttribute('aria-invalid'), 'true');
    await choose(page, 'Standard delivery'); assert.equal(await trigger(page).getAttribute('aria-invalid'), 'false');
  });
  await check('Plain and externally referenced labels and native tab order remain available', async page => {
    await page.evaluate(() => { document.querySelector('main').insertAdjacentHTML('beforeend', '<label for="plain">Finishing service</label><select id="plain" tabindex="-1"><option>Lamination</option></select><span id="tax-label">Tax treatment</span><select aria-labelledby="tax-label"><option>Exclusive</option></select>'); });
    await page.getByRole('combobox', { name: 'Finishing service', exact: true }).waitFor({ timeout: 1500 });
    assert.equal(await page.getByRole('combobox', { name: 'Finishing service', exact: true }).getAttribute('tabindex'), '-1');
    await page.getByRole('combobox', { name: 'Tax treatment', exact: true }).waitFor({ timeout: 1500 });
  });
  await check('Large lists stay virtualized while scrolling, searching and choosing the last result', async page => {
    await page.locator('#service').evaluate(select => { const fragment = document.createDocumentFragment(); for (let i = 0; i < 10000; i++) { const option = document.createElement('option'); option.value = String(i); option.textContent = 'Customer ' + String(i).padStart(5, '0'); fragment.append(option); } select.replaceChildren(fragment); });
    await trigger(page).click(); assert.ok(await page.getByRole('option').count() <= 20);
    await page.locator('.dp-select-list').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.getByRole('option', { name: 'Customer 09999', exact: true }).waitFor(); assert.ok(await page.getByRole('option').count() <= 20);
    await search(page).fill('09999'); await page.getByRole('option', { name: 'Customer 09999', exact: true }).click(); assert.equal(await page.locator('#service').inputValue(), '9999');
  });
  await check('No-result search and markup-like option labels render safely', async page => {
    await page.locator('#service').evaluate(select => { const option = document.createElement('option'); option.textContent = '<img src=x onerror=alert(1)>'; select.append(option); });
    await trigger(page).click(); await search(page).fill('<img'); await page.getByRole('option', { name: '<img src=x onerror=alert(1)>', exact: true }).waitFor(); assert.equal(await page.locator('.dp-select-menu img').count(), 0);
    await search(page).fill('nonexistent'); await page.getByText('No matching options', { exact: true }).waitFor(); assert.equal(await page.getByRole('option').count(), 0);
  });
  await check('Long labels remain aligned and menus fit narrow and landscape viewports', async page => {
    await page.locator('#service').evaluate(select => { select.options[0].textContent = 'Printed corporate stationery, installation and scheduled delivery '.repeat(5); });
    for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 260 }]) {
      await page.setViewportSize(viewport); await trigger(page).click();
      const rect = await page.locator('.dp-select-menu').boundingBox(); assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1, JSON.stringify({ viewport, rect }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.keyboard.press('Escape');
    }
  });
  await check('Positioned fallback works when browser popovers are unavailable', async page => {
    await page.evaluate(() => { HTMLElement.prototype.showPopover = undefined; });
    await choose(page, 'Express delivery'); assert.equal(await page.locator('#service').inputValue(), 'express');
  });
  await check('Menus fit the visible viewport when a mobile keyboard reduces available space', async page => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { Object.defineProperty(window, 'visualViewport', { configurable: true, value: { width: 390, height: 260, offsetLeft: 0, offsetTop: 120 } }); });
    await trigger(page).click();
    const rect = await page.locator('.dp-select-menu').boundingBox(); assert.ok(rect.x >= 0 && rect.y >= 120 && rect.x + rect.width <= 390 && rect.y + rect.height <= 380, JSON.stringify(rect));
  });
  await check('Removing dynamic controls dismisses menus and multiple selects stay native', async page => {
    await page.evaluate(() => { document.querySelector('main').insertAdjacentHTML('beforeend', '<select multiple size="3" aria-label="Allowed finishes"><option>Matte</option><option>Gloss</option></select>'); });
    assert.equal(await page.getByRole('listbox', { name: 'Allowed finishes' }).count(), 1);
    await trigger(page).click(); await page.locator('#form').evaluate(node => node.remove()); await page.waitForFunction(() => !document.querySelector('.dp-select-menu'));
  });
  await check('Hiding or collapsing a parent section dismisses its open dropdown', async page => {
    await trigger(page).click(); await page.locator('main').evaluate(node => { node.hidden = true; });
    await page.waitForFunction(() => !document.querySelector('.dp-select-menu'), null, { timeout: 1500 });
    await page.locator('main').evaluate(node => { node.hidden = false; const details = document.createElement('details'); details.open = true; details.innerHTML = '<summary>Delivery settings</summary>'; node.before(details); details.append(node); });
    await trigger(page).click(); await page.locator('details').evaluate(node => { node.open = false; });
    await page.waitForFunction(() => !document.querySelector('.dp-select-menu'), null, { timeout: 1500 });
  });
  assert.deepEqual(exceptions, [], 'No dropdown browser exceptions');
  return results;
}
if (require.main === module) (async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try { const results = await runDropdownChecks(browser); fs.mkdirSync(path.join(root, 'test-results'), { recursive: true }); fs.writeFileSync(path.join(root, 'test-results/dropdown-regressions.json'), JSON.stringify({ results }, null, 2)); if (results.some(result => result.result === 'FAIL')) process.exitCode = 1; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { runDropdownChecks };
