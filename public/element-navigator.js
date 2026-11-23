(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.SmartHMINavigator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STRUCTURES = '[data-page],section,article,form,fieldset,.panel,.process,.node,.loop,.system-strip,.standalone,.shc-component';
  const CANDIDATES = STRUCTURES + ',button,label,input,select,textarea,h1,h2,h3,h4,h5,h6';
  const DECORATION = '[data-draft-decoration],.draft-empty,.draft-pin,.draft-selection,.shc-editor,.shc-badge,.shc-purpose,.shc-output';
  const NON_LABEL_TEXT = 'script,style,template,noscript,svg,option,input,select,textarea,[aria-hidden="true"],[hidden],.shc-state,.shc-selected,.shc-indicator,.shc-icon,.shc-toggle-track,.shc-badge,.shc-type,.shc-output,.shc-purpose';
  let instanceNumber = 0;
  const compact = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const short = value => {
    const text = compact(value);
    return text.length > 110 ? text.slice(0, 107).trimEnd() + '…' : text;
  };
  const searchable = value => compact(value).toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');

  function readable(element) {
    if (!element) return '';
    const parts = [];
    function visit(node) {
      if (node.nodeType === 3) parts.push(node.nodeValue);
      else if (node.nodeType === 1 && !node.matches(NON_LABEL_TEXT)) {
        for (const child of node.childNodes) visit(child);
      }
    }
    for (const child of element.childNodes) visit(child);
    return compact(parts.join(' '));
  }

  function structuralHeading(element) {
    for (const selector of ['h1,h2,h3,h4,h5,h6,legend', 'strong', 'small']) {
      for (const candidate of element.querySelectorAll(selector)) {
        const hidden = candidate.closest('[hidden]');
        if (candidate.parentElement && candidate.parentElement.closest(STRUCTURES) === element &&
            !candidate.closest(DECORATION) && (!hidden || hidden.hasAttribute('data-page')) &&
            !candidate.closest('[aria-hidden="true"]') && readable(candidate)) return readable(candidate);
      }
    }
    return '';
  }

  function referencedLabel(element) {
    const ids = compact(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
    return compact(ids.map(id => readable(element.ownerDocument.getElementById(id))).join(' '));
  }

  function nativeLabel(element) {
    const labels = element.labels ? Array.from(element.labels) : [];
    if (!labels.length && element.closest('label')) labels.push(element.closest('label'));
    return compact(labels.map(readable).join(' '));
  }

  function kindFor(element) {
    if (element.matches('.shc-component')) {
      if (element.querySelector('.shc-toggle')) return 'Neuer Schalter';
      if (element.querySelector('.shc-select')) return 'Neue Auswahlliste';
      if (element.querySelector('.shc-control.shc-indicator')) return 'Neue Anzeige';
      return 'Neue Schaltfläche';
    }
    if (element.hasAttribute('data-page')) return 'Seite';
    if (/^H[1-6]$/.test(element.tagName)) return 'Überschrift';
    if (element.tagName === 'LABEL') return 'Beschriftung';
    if (element.tagName === 'SELECT') return 'Auswahlliste';
    if (element.tagName === 'TEXTAREA') return 'Textfeld';
    if (element.tagName === 'BUTTON' || element.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(element.type)) return 'Schaltfläche';
    if (element.tagName === 'INPUT') return /^(checkbox|radio)$/i.test(element.type) ? 'Schalter' : 'Eingabe';
    if (element.matches('.system-strip')) return 'Statusbereich';
    if (element.matches('.process')) return 'Prozessübersicht';
    if (element.matches('.node')) return 'Prozessstation';
    return 'Bereich';
  }

  function labelFor(element, page, pageName) {
    if (element.matches('.shc-component')) {
      return short(readable(element.querySelector('.shc-label')) || compact(element.getAttribute('aria-label')).replace(/\s*·\s*neue Funktion.*$/i, '') || 'Neuer Baustein');
    }
    if (element.hasAttribute('data-page')) return short(typeof pageName === 'function' && pageName(page) || structuralHeading(element) || page || 'Seite');
    const accessible = compact(element.getAttribute('aria-label')) || referencedLabel(element);
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName)) {
      const row = element.closest('tr');
      const rowLabel = row && readable(row.querySelector('th,td'));
      if (accessible) return short(rowLabel && /^force\b/i.test(accessible) ? rowLabel + ' · ' + accessible : accessible);
      return short(nativeLabel(element) || rowLabel || element.getAttribute('placeholder') || element.getAttribute('title') ||
        (/^(button|submit|reset)$/i.test(element.type) ? element.value : '') || kindFor(element));
    }
    if (accessible) return short(accessible);
    if (element.matches(STRUCTURES)) {
      return short(structuralHeading(element) || (element.matches('.loop') ? 'Bandschlaufe' : '') ||
        (element.matches('.system-strip') ? 'Anlagenstatus' : '') || (element.matches('.standalone') ? 'Standalone-Hinweis' : '') || kindFor(element));
    }
    return short(readable(element) || element.getAttribute('title') || kindFor(element));
  }

  // Inactive page roots are still searchable. Runtime-hidden controls and dialogs
  // are not. A deliberately hidden draft block is kept once, for orientation.
  function visibilityChecker(document) {
    const styles = new WeakMap();
    function styleOf(element) {
      if (!styles.has(element)) {
        let style = null;
        try { style = document.defaultView && document.defaultView.getComputedStyle(element); } catch (_) { /* Detached document. */ }
        styles.set(element, style);
      }
      return styles.get(element);
    }
    return function excluded(element) {
      if (element.closest(DECORATION) || element.matches('input[type="hidden"]')) return true;
      const hiddenDraft = element.closest('.draft-hidden');
      if (hiddenDraft && hiddenDraft !== element) return true;
      for (let node = element; node; node = node.parentElement) {
        if (node.matches('script,style,template,noscript')) return true;
        if (node.hasAttribute('data-page')) continue;
        if (node.hasAttribute('inert')) return true;
        if (node.hidden || node.getAttribute('aria-hidden') === 'true' || node.tagName === 'DIALOG' && !node.open) return true;
        if (node.matches('.draft-hidden')) continue;
        const style = styleOf(node);
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden')) return true;
      }
      return false;
    };
  }

  function collect(document, options = {}) {
    if (!document || typeof document.querySelectorAll !== 'function') throw new TypeError('collect benötigt ein HMI-Dokument.');
    if (typeof options.getKey !== 'function') throw new TypeError('collect benötigt getKey für stabile Elementanker.');
    const excluded = visibilityChecker(document), entries = [], byElement = new Map(), keys = new Set();
    for (const element of document.querySelectorAll(CANDIDATES)) {
      if (element.closest('.shc-component') && !element.matches('.shc-component') || excluded(element)) continue;
      const key = options.getKey(element);
      if (typeof key !== 'string' || !key.trim() || keys.has(key)) continue;
      const section = element.closest('[data-page]'), page = section ? section.getAttribute('data-page') : '';
      const entry = {key, page, label: labelFor(element, page, options.pageName), kind: kindFor(element), element, parentKeys: []};
      if (element.matches('.draft-hidden')) entry.hidden = true;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (byElement.has(parent)) entry.parentKeys.unshift(byElement.get(parent).key);
      }
      keys.add(key); byElement.set(element, entry); entries.push(entry);
    }
    return entries;
  }

  /**
   * Render into a dedicated host in the editor document, using options.document
   * as the source HMI document. page is always the technical data-page ID.
   * pages: [{id,name}], pageFilter: '' (all) or one page ID.
   * Only onSelect is called; source elements are never clicked or focused here.
   */
  function render(container, options = {}) {
    if (!container || !container.ownerDocument) throw new TypeError('render benötigt einen DOM-Container.');
    let settings = Object.assign({}, options), entries = [], matches = [], disposed = false, selectedKey = null;
    let pageFilter = String(options.pageFilter || '');
    const ui = container.ownerDocument, number = ++instanceNumber;
    const create = (tag, className, text) => {
      const element = ui.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const root = create('div', 'shn-navigator'), searchLabel = create('label', 'shn-field', 'Element suchen');
    const input = create('input', 'shn-search'); input.type = 'search'; input.id = 'shn-search-' + number;
    input.placeholder = 'Name, Seite oder Art …'; input.autocomplete = 'off'; input.spellcheck = false; searchLabel.htmlFor = input.id;
    const filterLabel = create('label', 'shn-field shn-page-field', 'Seite');
    const pageSelect = create('select', 'shn-page'); pageSelect.id = 'shn-page-' + number; filterLabel.htmlFor = pageSelect.id;
    const count = create('p', 'shn-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
    const list = create('ul', 'shn-results'); list.setAttribute('aria-label', 'Gefundene HMI-Elemente');
    const hint = create('p', 'shn-hint', '↑ ↓ durch Treffer · Enter auswählen');
    searchLabel.append(input); filterLabel.append(pageSelect); root.append(searchLabel, filterLabel, count, list, hint);

    function pageName(page) {
      if (!page) return 'Seitenübergreifend';
      const record = (Array.isArray(settings.pages) ? settings.pages : []).find(item => (typeof item === 'string' ? item : item.id) === page);
      return compact(typeof record === 'string' ? record : record && record.name) || page;
    }
    function select(entry) {
      if (disposed) return;
      selectedKey = entry.key;
      for (const button of list.querySelectorAll('button')) {
        button.classList.toggle('is-selected', button.dataset.key === selectedKey);
        if (button.dataset.key === selectedKey) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
      if (typeof settings.onSelect === 'function') settings.onSelect(entry);
    }
    function buttons() { return Array.from(list.querySelectorAll('button')); }
    function repaint() {
      const focusedKey = list.contains(ui.activeElement) ? ui.activeElement.dataset.key : null;
      const byKey = new Map(entries.map(entry => [entry.key, entry]));
      const words = searchable(input.value).split(' ').filter(Boolean);
      matches = entries.filter(entry => {
        if (pageFilter && entry.page !== pageFilter) return false;
        const context = entry.parentKeys.map(key => byKey.get(key)?.label || '').join(' ');
        const text = searchable([entry.label, entry.kind, entry.page, pageName(entry.page), context, entry.hidden ? 'ausgeblendet' : ''].join(' '));
        return words.every(word => text.includes(word));
      });
      list.replaceChildren();
      count.textContent = matches.length === 1 ? '1 Element gefunden' : matches.length + ' Elemente gefunden';
      if (!matches.length) {
        list.append(create('li', 'shn-empty', 'Kein passendes Element. Suche oder Seitenfilter ändern.'));
        return;
      }
      for (const entry of matches) {
        const item = create('li'), button = create('button', 'shn-result'); button.type = 'button'; button.dataset.key = entry.key;
        button.classList.toggle('is-selected', entry.key === selectedKey);
        if (entry.key === selectedKey) button.setAttribute('aria-current', 'true');
        const parent = [...entry.parentKeys].reverse().map(key => byKey.get(key)).find(value => value && value.kind !== 'Seite');
        const meta = [pageName(entry.page), entry.kind, parent && parent.label, entry.hidden && 'Ausgeblendet'].filter(Boolean).join(' · ');
        button.append(create('span', 'shn-label', entry.label), create('span', 'shn-meta', meta));
        button.setAttribute('aria-label', entry.label + ' · ' + meta);
        button.addEventListener('click', () => select(entry)); item.append(button); list.append(item);
      }
      if (focusedKey) {
        const restore = buttons().find(button => button.dataset.key === focusedKey);
        (restore || input).focus();
      }
    }
    function updatePages() {
      const ids = new Set();
      for (const page of Array.isArray(settings.pages) ? settings.pages : []) {
        const id = typeof page === 'string' ? page : page.id;
        if (id) ids.add(id);
      }
      for (const entry of entries) if (entry.page) ids.add(entry.page);
      if (pageFilter) ids.add(pageFilter);
      pageSelect.replaceChildren();
      const all = create('option', '', 'Alle Seiten'); all.value = ''; pageSelect.append(all);
      for (const id of ids) { const option = create('option', '', pageName(id)); option.value = id; pageSelect.append(option); }
      pageSelect.value = pageFilter;
    }
    function refresh(nextOptions = {}) {
      if (disposed) return;
      settings = Object.assign({}, settings, nextOptions);
      if (Object.prototype.hasOwnProperty.call(nextOptions, 'pageFilter')) pageFilter = String(nextOptions.pageFilter || '');
      if (!settings.document || typeof settings.document.querySelectorAll !== 'function') throw new TypeError('render benötigt das HMI-Dokument als document.');
      entries = collect(settings.document, {getKey: settings.getKey, pageName});
      updatePages(); repaint();
    }
    input.addEventListener('input', repaint);
    pageSelect.addEventListener('change', () => { pageFilter = pageSelect.value; repaint(); });
    root.addEventListener('keydown', event => {
      if (disposed || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const resultButtons = buttons(), index = resultButtons.indexOf(event.target);
      if (event.target === input) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (resultButtons.length) { event.preventDefault(); resultButtons[event.key === 'ArrowDown' ? 0 : resultButtons.length - 1].focus(); }
        } else if (event.key === 'Enter') { event.preventDefault(); if (matches[0]) select(matches[0]); }
      } else if (index >= 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        if (event.key === 'ArrowUp' && index === 0) input.focus();
        else resultButtons[Math.max(0, Math.min(resultButtons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
      }
    });

    // Validate and collect before replacing the host, so an invalid key adapter
    // cannot erase the previous host content.
    refresh(); container.replaceChildren(root);
    return Object.freeze({
      element: root, input, pageSelect, list,
      focus() { if (!disposed) { input.focus(); input.select(); } },
      refresh,
      setPageFilter(id) { if (!disposed) { pageFilter = String(id || ''); updatePages(); repaint(); } },
      getEntries() { return entries.slice(); },
      getResults() { return matches.slice(); },
      destroy() { disposed = true; root.remove(); entries = []; matches = []; }
    });
  }

  return Object.freeze({collect, render});
});
