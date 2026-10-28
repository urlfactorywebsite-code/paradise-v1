/* Shared single-select control. Native selects remain the form and event source. */
(() => {
  'use strict';
  const controls = new WeakMap(), triggers = new WeakMap(), rowHeight = 40;
  let active = null, sequence = 0;
  const element = (tag, className) => { const node = document.createElement(tag); if (className) node.className = className; return node; };
  function labelFor(select) {
    const referenced = (select.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
    const label = select.labels?.[0];
    const labelText = label && Array.from(label.childNodes, node => node.nodeType === Node.TEXT_NODE ? node.textContent : node.matches?.('select,input,textarea,button,.dp-select') ? '' : node.textContent).join(' ').trim();
    return referenced || select.getAttribute('aria-label') || labelText || select.title || select.options[0]?.label || 'Choose an option';
  }
  function sync(control) {
    const { select, button, caption, wrap } = control;
    const text = select.options[select.selectedIndex]?.label || 'Choose an option';
    if (caption.textContent !== text) caption.textContent = text;
    button.title = text;
    control.label = labelFor(select); button.setAttribute('aria-label', control.label);
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-invalid']) {
      if (select.hasAttribute(attribute)) button.setAttribute(attribute, select.getAttribute(attribute)); else button.removeAttribute(attribute);
    }
    if (control.invalid && !select.hasAttribute('aria-invalid')) button.setAttribute('aria-invalid', String(!select.validity.valid));
    const disabled = select.matches(':disabled');
    if (button.disabled !== disabled) button.disabled = disabled;
    wrap.hidden = select.hidden;
    button.setAttribute('aria-required', String(select.required));
    if ((disabled || select.hidden) && active === control) close(false);
  }
  function refresh(control) {
    sync(control);
    if (active !== control) return;
    control.options = Array.from(control.select.options, (option, index) => ({ index, label: option.label, search: option.label.toLocaleLowerCase(), disabled: option.matches(':disabled'), hidden: option.hidden || option.parentElement.hidden })).filter(option => !option.hidden);
    filter(control);
  }
  function close(restoreFocus = false) {
    if (!active) return;
    const control = active; active = null;
    if (typeof control.menu?.hidePopover === 'function' && control.menu.matches(':popover-open')) control.menu.hidePopover();
    control.menu?.remove(); control.menu = null;
    control.button.setAttribute('aria-expanded', 'false');
    control.button.removeAttribute('aria-activedescendant');
    control.button.removeAttribute('aria-controls');
    if (restoreFocus && control.button.isConnected) control.button.focus({ preventScroll: true });
  }
  function position(control) {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
    const viewportWidth = viewport?.width || innerWidth, viewportHeight = viewport?.height || innerHeight;
    const rect = control.button.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 260), viewportWidth - 24);
    const below = topEdge + viewportHeight - rect.bottom - 12, above = rect.top - topEdge - 12;
    const placeAbove = below < 240 && above > below;
    const height = Math.max(40, Math.min(280, (placeAbove ? above : below) - 104));
    control.list.style.height = Math.min(height, Math.max(1, control.matches.length) * rowHeight) + 'px';
    Object.assign(control.menu.style, { width: width + 'px', maxHeight: Math.max(0, viewportHeight - 16) + 'px', left: Math.max(left + 12, Math.min(rect.left, left + viewportWidth - width - 12)) + 'px', top: '0px' });
    const top = placeAbove ? rect.top - control.menu.offsetHeight - 6 : rect.bottom + 6;
    control.menu.style.top = Math.max(topEdge + 8, Math.min(top, topEdge + viewportHeight - control.menu.offsetHeight - 8)) + 'px';
  }
  function paint(control) {
    if (active !== control) return;
    const { list, stage, matches, options } = control;
    const start = Math.max(0, Math.floor(list.scrollTop / rowHeight) - 3);
    const end = Math.min(matches.length, start + Math.ceil((list.clientHeight || 280) / rowHeight) + 7);
    const nodes = document.createDocumentFragment();
    for (let index = start; index < end; index++) {
      const option = options[matches[index]], row = element('div', 'dp-select-option');
      row.id = control.id + '-option-' + option.index;
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.index === control.select.selectedIndex));
      row.setAttribute('aria-disabled', String(option.disabled)); row.setAttribute('aria-posinset', String(index + 1)); row.setAttribute('aria-setsize', String(matches.length));
      row.dataset.matchIndex = index; row.style.top = index * rowHeight + 'px'; row.title = option.label;
      row.classList.toggle('is-active', index === control.current);
      const label = element('span'); label.textContent = option.label; row.append(label);
      if (option.index === control.select.selectedIndex) { const mark = element('span', 'dp-select-check'); mark.textContent = '✓'; mark.setAttribute('aria-hidden', 'true'); row.append(mark); }
      nodes.append(row);
    }
    stage.replaceChildren(nodes);
    const current = options[matches[control.current]], id = current ? control.id + '-option-' + current.index : '';
    for (const node of [control.button, control.search]) {
      if (id && document.getElementById(id)) node.setAttribute('aria-activedescendant', id); else node.removeAttribute('aria-activedescendant');
    }
  }
  function filter(control) {
    const query = control.search.value.trim().toLocaleLowerCase();
    control.matches = control.options.flatMap((option, index) => option.search.includes(query) ? [index] : []);
    control.current = control.matches.findIndex(index => control.options[index].index === control.select.selectedIndex);
    if (control.current < 0 || control.options[control.matches[control.current]]?.disabled) control.current = control.matches.findIndex(index => !control.options[index].disabled);
    control.stage.style.height = control.matches.length * rowHeight + 'px';
    control.empty.hidden = control.matches.length > 0;
    control.status.textContent = control.matches.length + (control.matches.length === 1 ? ' option' : ' options');
    control.list.scrollTop = Math.max(0, control.current * rowHeight - rowHeight * 2);
    position(control); paint(control);
  }
  function open(control, focusSearch = true) {
    sync(control);
    if (control.button.disabled || !control.select.isConnected) return;
    close(); active = control;
    const menu = element('div', 'dp-select-menu'); menu.setAttribute('popover', 'manual'); control.menu = menu;
    const search = element('input', 'dp-select-search'); search.type = 'search'; search.placeholder = 'Search options…'; search.autocomplete = 'off'; search.spellcheck = false;
    search.setAttribute('aria-label', 'Search ' + control.label + ' options'); search.setAttribute('aria-controls', control.id + '-list'); search.setAttribute('aria-autocomplete', 'list'); control.search = search;
    const list = element('div', 'dp-select-list'); list.id = control.id + '-list'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', control.label + ' options'); control.list = list;
    const stage = element('div', 'dp-select-stage'); stage.setAttribute('role', 'presentation'); control.stage = stage;
    const empty = element('div', 'dp-select-empty'); empty.textContent = 'No matching options'; control.empty = empty;
    const status = element('div', 'dp-select-count'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); control.status = status;
    list.append(stage, empty); menu.append(search, list, status); control.wrap.append(menu);
    control.button.setAttribute('aria-expanded', 'true'); control.button.setAttribute('aria-controls', list.id);
    if (typeof menu.showPopover === 'function') menu.showPopover(); else { menu.removeAttribute('popover'); menu.dataset.open = 'true'; }
    refresh(control);
    if (focusSearch) search.focus({ preventScroll: true });
    search.addEventListener('input', () => filter(control));
    let frame = 0;
    list.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(control); }); }, { passive: true });
    // Keep focus in the popup until selection. A focusable page container must
    // not receive mousedown focus and dismiss the menu before its click fires.
    menu.addEventListener('mousedown', event => {
      if (event.target.closest('[data-match-index]')) event.preventDefault();
    });
    menu.addEventListener('click', event => {
      const row = event.target.closest('[data-match-index]'); if (!row) return;
      event.preventDefault(); choose(control, Number(row.dataset.matchIndex));
    });
  }
  function choose(control, matchIndex) {
    const option = control.options[control.matches[matchIndex]]; if (!option || option.disabled) return;
    if (control.select.matches(':disabled') || !control.select.options[option.index] || control.select.options[option.index].matches(':disabled')) return;
    const changed = control.select.selectedIndex !== option.index;
    control.select.selectedIndex = option.index; sync(control); close(true);
    if (changed) { control.select.dispatchEvent(new Event('input', { bubbles: true })); control.select.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  function move(control, index, direction) {
    index = Math.max(0, Math.min(index, control.matches.length - 1));
    while (index >= 0 && index < control.matches.length && control.options[control.matches[index]].disabled) index += direction;
    if (index < 0 || index >= control.matches.length) return;
    control.current = index;
    if (index * rowHeight < control.list.scrollTop) control.list.scrollTop = index * rowHeight;
    else if ((index + 1) * rowHeight > control.list.scrollTop + control.list.clientHeight) control.list.scrollTop = (index + 1) * rowHeight - control.list.clientHeight;
    paint(control);
  }
  function enhance(select) {
    if (controls.has(select) || select.multiple || select.size > 1 || select.dataset.nativeSelect !== undefined) return;
    const label = labelFor(select), tabIndex = select.getAttribute('tabindex');
    const wrap = element('span', 'dp-select'); wrap.style.cssText = select.style.cssText;
    if (select.style.width === 'auto') wrap.dataset.auto = 'true';
    const button = element('button', 'dp-select-trigger'); button.type = 'button'; button.setAttribute('role', 'combobox'); button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', label);
    if (tabIndex !== null) button.setAttribute('tabindex', tabIndex);
    if (select.getAttribute('aria-describedby')) button.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
    const caption = element('span', 'dp-select-caption'), arrow = element('span', 'dp-select-arrow'); arrow.setAttribute('aria-hidden', 'true');
    button.append(caption, arrow); select.before(wrap); wrap.append(select, button);
    select.removeAttribute('style'); select.classList.add('dp-select-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const control = { select, wrap, button, caption, label, id: 'dp-select-' + (++sequence), menu: null };
    controls.set(select, control); triggers.set(button, control); sync(control);
    select.addEventListener('input', () => refresh(control));
    select.addEventListener('change', () => refresh(control));
    select.addEventListener('focus', () => button.focus());
    select.addEventListener('invalid', event => { event.preventDefault(); control.invalid = true; sync(control); button.focus(); });
  }
  function scan(root) {
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.tagName === 'SELECT') enhance(root);
    else for (const select of root.querySelectorAll('select')) enhance(select);
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('.dp-select-trigger'), control = button && triggers.get(button);
    if (control) { event.preventDefault(); active === control ? close(true) : open(control); }
    else if (active && !active.menu?.contains(event.target)) close(false);
  });
  document.addEventListener('keydown', event => {
    const control = active || triggers.get(event.target);
    if (!control || control.select.matches(':disabled') || event.target !== control.button && !control.menu?.contains(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const { key } = event;
    if (key === 'Tab') { if (active) { const button = active.button; close(false); button.focus({ preventScroll: true }); } return; }
    if (key === 'Escape' && active) { event.preventDefault(); event.stopImmediatePropagation(); close(true); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(key)) {
      if (!active && !['ArrowDown', 'ArrowUp'].includes(key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!active) { open(control); if (key === 'ArrowUp' && active === control) move(control, control.matches.length - 1, -1); return; }
      const direction = key === 'Home' ? 1 : key === 'End' ? -1 : ['ArrowUp', 'PageUp'].includes(key) ? -1 : 1;
      const next = key === 'Home' ? 0 : key === 'End' ? control.matches.length - 1 : control.current + direction * (key.startsWith('Page') ? 6 : 1);
      move(control, next, direction);
    } else if (key === 'Enter' || key === ' ' && event.target === control.button) {
      event.preventDefault(); event.stopImmediatePropagation(); active ? choose(control, control.current) : open(control);
    } else if (!active && key.length === 1 && !event.altKey) { open(control); control.search.value = key; filter(control); event.preventDefault(); }
  }, true);
  document.addEventListener('focusin', event => { if (active && event.target !== active.button && !active.menu?.contains(event.target)) close(false); });
  document.addEventListener('reset', event => {
    // The browser applies default selections after reset-event dispatch completes.
    setTimeout(() => { if (!event.defaultPrevented) for (const select of event.target.elements || []) if (controls.has(select)) { const control = controls.get(select); control.invalid = false; refresh(control); } }, 0);
  });
  let positionFrame = 0;
  document.addEventListener('scroll', event => {
    if (!active || active.menu?.contains(event.target) || positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0; if (!active) return;
      const rect = active.button.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) close(false); else position(active);
    });
  }, { capture: true, passive: true });
  window.addEventListener('resize', () => { if (active) position(active); }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { if (active) position(active); }, { passive: true });
  window.visualViewport?.addEventListener('scroll', () => { if (active) position(active); }, { passive: true });
  new MutationObserver(records => {
    if (active && (!active.select.isConnected || (typeof active.button.checkVisibility === 'function' ? !active.button.checkVisibility() : !active.button.getClientRects().length) || active.select.closest('#modal')?.style.display === 'none')) close(false);
    const changed = new Set();
    for (const record of records) {
      const source = record.target.nodeType === Node.ELEMENT_NODE ? record.target.closest('select') : record.target.parentElement?.closest('select');
      if (source && controls.has(source)) changed.add(controls.get(source));
      if (record.type === 'attributes' && record.target.tagName === 'FIELDSET') for (const select of record.target.querySelectorAll('select')) if (controls.has(select)) changed.add(controls.get(select));
      for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'SELECT' || !node.closest('.dp-select'))) scan(node);
    }
    for (const control of changed) refresh(control);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'required', 'hidden', 'open', 'label', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-invalid'], characterData: true });
  scan(document);
  window.ParadiseSelect = Object.freeze({ enhance: scan, close: () => close(false) });
})();
