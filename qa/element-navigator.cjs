'use strict';
// Isolated memory-DOM checks. No server, browser, controller, Git or user-data writes.
// JSDOM is an explicit QA-only dependency, never a dependency of the editor app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const jsdomModule = option('--jsdom') || process.env.HMI_QA_JSDOM;
let JSDOM, VirtualConsole, ResourceLoader;
try { ({JSDOM, VirtualConsole, ResourceLoader} = require(jsdomModule ? path.resolve(jsdomModule) : 'jsdom')); }
catch (error) { throw new Error('JSDOM ist ausschließlich eine QA-Abhängigkeit. --jsdom <absolutes Modulverzeichnis> oder HMI_QA_JSDOM angeben. ' + error.message); }
const appRoot = path.resolve(__dirname, '..');
const api = require(path.join(appRoot, 'public/element-navigator.js'));
const source = fs.readFileSync(path.join(appRoot, 'public/element-navigator.js'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'public/element-navigator.css'), 'utf8');
const checks = [], errors = [], doms = [];
let unexpectedNetwork = 0;
class OfflineResources extends ResourceLoader {
  fetch() { unexpectedNetwork++; return null; }
}
function memory(html = '<!doctype html><html><body></body></html>') {
  const bridge = new VirtualConsole(); bridge.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {runScripts: 'outside-only', resources: new OfflineResources(), url: 'https://navigator.invalid/', virtualConsole: bridge});
  dom.window.fetch = () => { unexpectedNetwork++; throw Error('Netzwerk ist in dieser Prüfung gesperrt.'); };
  dom.window.XMLHttpRequest = function () { unexpectedNetwork++; throw Error('Netzwerk ist in dieser Prüfung gesperrt.'); };
  doms.push(dom); return dom;
}
function check(name, test) {
  try { test(); checks.push({name, passed: true}); }
  catch (error) { checks.push({name, passed: false, error: error.stack}); }
}
function keys() {
  const map = new WeakMap(); let serial = 0;
  return element => element.id ? '#' + element.id : map.get(element) || (map.set(element, 'test:' + ++serial), map.get(element));
}
const fixture = `<!doctype html><html><head><style>.not-shown,.draft-hidden{display:none!important}</style></head><body>
  <div class="panel" id="global"><strong>Betriebsart</strong><button id="start" disabled>Start / Fortsetzen</button></div>
  <section data-page="Overview" id="overview"><h1>Übersicht</h1>
    <div class="panel" id="tools"><h2>Werkzeuge</h2><div class="panel" id="clamp"><h3>Zange 2</h3><button id="open">Öffnen <span aria-hidden="true">⇧</span></button></div></div>
    <div class="process" id="process"><div class="node" id="station"><small>01 · BANDZUFÜHRUNG</small><strong>Vorschub 1</strong><span id="movingValue">4 · Wartet</span></div></div>
    <table><tbody><tr><td>A6 Form schließen</td><td><select id="force" aria-label="Force e 0"><option>Normal</option><option>Force 1</option></select></td></tr></tbody></table>
    <div class="panel" id="runtime-hidden" hidden><h2>Verborgener Wiederanlauf</h2><button id="hidden-command">Ausführen</button></div>
    <div class="panel not-shown" id="css-hidden"><button id="css-command">CSS versteckt</button></div>
    <div class="panel draft-hidden" id="draft-hidden"><h2>Ausgeblendeter Entwurf</h2><button id="draft-child">Kein zweiter Treffer</button></div>
    <div data-draft-decoration><h2 id="decoration">Editor-Dekoration</h2><button>Pin löschen</button></div>
    <div class="shc-editor"><button id="editor-command">Baustein übernehmen</button></div>
    <div class="shc-component" id="new-toggle" aria-label="Neuer Antrieb · neue Funktion, Programmierung offen"><span class="shc-badge">Neue Funktion</span><button class="shc-control shc-toggle"><span class="shc-label">Neuer Antrieb</span><span class="shc-state">1 · EIN</span></button><div class="shc-purpose">Beschreibung</div></div>
  </section>
  <section data-page="Hand" id="hand" hidden><h1>Handbetrieb</h1><div class="panel" id="hand-panel"><h2>Vorschub 2</h2><button id="forward">Vor</button></div></section>
  <section data-page="Setup" id="setup" hidden><h1>Setup</h1>
    <label for="ssid" id="ssid-label">WLAN-Name</label><input id="ssid" value="SSID-NICHT-AUSGEBEN">
    <label id="password-label">Passwort<input id="password" type="password" value="NIE-AUSGEBEN"></label>
    <label id="profile-label">Betriebsprofil<select id="profile"><option>Mit SGM</option><option>Ohne SGM</option></select></label>
    <span id="a-label">Freigabe</span><span id="b-label">Ventil</span><input id="referenced" aria-labelledby="a-label b-label">
    <input id="hidden-input" type="hidden" value="SECRET"><textarea id="note" placeholder="Beschreibung"></textarea>
  </section>
  <div hidden role="alertdialog"><h2 id="modal-title">Unsichtbarer Dialog</h2><button id="modal-button">Bestätigen</button></div>
  <dialog><button id="closed-dialog">Geschlossener Dialog</button></dialog>
  <div aria-hidden="true"><button id="aria-hidden">Unsichtbar</button></div>
  <script>window.shouldNeverRun = true;</script>
</body></html>`;
const hmi = memory(fixture), document = hmi.window.document, getKey = keys();
const entries = () => api.collect(document, {getKey});
const byId = id => entries().find(entry => entry.element.id === id);
const uiDom = memory(), ui = uiDom.window.document;
const host = ui.createElement('div'); ui.body.append(host);
const picked = []; let sourceClicks = 0, sourceFocuses = 0;
document.getElementById('open').addEventListener('click', () => sourceClicks++);
document.getElementById('open').addEventListener('focus', () => sourceFocuses++);
let navigator;
const input = value => { navigator.input.value = value; navigator.input.dispatchEvent(new uiDom.window.Event('input', {bubbles: true})); };
const key = (target, value, extra = {}) => {
  const event = new uiDom.window.KeyboardEvent('keydown', {key: value, bubbles: true, cancelable: true, ...extra});
  target.dispatchEvent(event); return event;
};

check('CommonJS und Browser-API ohne Fremdabhängigkeit', () => {
  assert.equal(typeof api.collect, 'function'); assert.equal(typeof api.render, 'function');
  uiDom.window.eval(source); assert.equal(typeof uiDom.window.SmartHMINavigator.collect, 'function');
  const style = ui.createElement('style'); style.textContent = css; ui.head.append(style);
  assert.ok(ui.styleSheets.length);
});
check('Seiten, Bereiche, Überschriften und echte Bedienelemente werden gesammelt', () => {
  assert.equal(byId('overview').kind, 'Seite'); assert.equal(byId('tools').label, 'Werkzeuge');
  assert.equal(byId('open').label, 'Öffnen'); assert.equal(byId('open').kind, 'Schaltfläche');
  assert.equal(byId('global').page, ''); assert.equal(byId('station').label, 'Vorschub 1');
  assert.equal(byId('process').label, 'Prozessübersicht'); assert.equal(byId('start').element.disabled, true);
});
check('Inaktive Seiten bleiben mit ihren tatsächlichen Bereichsnamen durchsuchbar', () => {
  assert.equal(byId('hand').page, 'Hand'); assert.equal(byId('hand').label, 'Handbetrieb');
  assert.equal(byId('hand-panel').label, 'Vorschub 2'); assert.equal(byId('forward').page, 'Hand');
  const named = api.collect(document, {getKey, pageName: page => page === 'Hand' ? 'Einrichten' : page});
  assert.equal(named.find(entry => entry.key === '#hand').label, 'Einrichten');
});
check('Inaktive inert-Seiten bleiben suchbar, inert-Teilbereiche nicht', () => {
  document.getElementById('hand').setAttribute('inert', '');
  assert.ok(byId('forward')); document.getElementById('hand').removeAttribute('inert');
  document.getElementById('clamp').setAttribute('inert', '');
  assert.equal(byId('open'), undefined); document.getElementById('clamp').removeAttribute('inert');
});
check('Runtime-versteckte Dialoge, CSS-Inhalte und versteckte Eingaben fehlen', () => {
  for (const id of ['runtime-hidden', 'hidden-command', 'css-hidden', 'css-command', 'modal-title', 'modal-button', 'closed-dialog', 'aria-hidden', 'hidden-input']) assert.equal(byId(id), undefined, id);
});
check('Editor-Dekoration und Baustein-Editoren fehlen', () => {
  assert.equal(byId('decoration'), undefined); assert.equal(byId('editor-command'), undefined);
  assert.ok(entries().every(entry => !entry.element.closest('[data-draft-decoration]')));
});
check('Ausgeblendeter Entwurfsbereich bleibt einmal erreichbar', () => {
  assert.equal(byId('draft-hidden').hidden, true); assert.equal(byId('draft-hidden').label, 'Ausgeblendeter Entwurf');
  assert.equal(byId('draft-child'), undefined);
});
check('Neue SHC-Komponenten erscheinen einmal mit dem Funktionsnamen', () => {
  const matches = entries().filter(entry => entry.element.closest('.shc-component'));
  assert.equal(matches.length, 1); assert.equal(matches[0].key, '#new-toggle');
  assert.equal(matches[0].label, 'Neuer Antrieb'); assert.equal(matches[0].kind, 'Neuer Schalter');
});
check('Labels nutzen Beschriftungen und keine Eingabe-, Passwort- oder Optionswerte', () => {
  assert.equal(byId('ssid').label, 'WLAN-Name'); assert.equal(byId('password').label, 'Passwort');
  assert.equal(byId('profile-label').label, 'Betriebsprofil'); assert.equal(byId('profile').label, 'Betriebsprofil');
  assert.equal(byId('referenced').label, 'Freigabe Ventil'); assert.equal(byId('note').label, 'Beschreibung');
  const text = entries().map(entry => entry.label).join(' ');
  assert.doesNotMatch(text, /NIE-AUSGEBEN|SSID-NICHT-AUSGEBEN|Force 1|Mit SGM/);
});
check('Generische Force-Controls bekommen den sichtbaren Signalnamen', () => {
  assert.equal(byId('force').label, 'A6 Form schließen · Force e 0'); assert.equal(byId('force').kind, 'Auswahlliste');
});
check('Elternschlüssel verlaufen von außen nach innen', () => {
  assert.deepEqual(byId('open').parentKeys, ['#overview', '#tools', '#clamp']);
  assert.deepEqual(byId('global').parentKeys, []);
});
check('Statuswerte blähen den Navigator auch bei vielen Aktualisierungen nicht auf', () => {
  const before = entries().length;
  for (let index = 0; index < 250; index++) { const value = document.createElement('span'); value.id = 'runtime-value-' + index; value.textContent = 'Wartet ' + index; document.getElementById('station').append(value); }
  assert.equal(entries().length, before); assert.equal(byId('movingValue'), undefined);
});
check('collect schreibt weder Attribute noch Zustand und führt HMI-Skripte nicht aus', () => {
  const before = document.documentElement.outerHTML; entries(); assert.equal(document.documentElement.outerHTML, before);
  assert.equal(hmi.window.shouldNeverRun, undefined); assert.equal(sourceClicks, 0); assert.equal(sourceFocuses, 0);
});
check('Ungültige oder doppelte Schlüssel werden nicht zu falschen Auswahlzielen', () => {
  const seen = api.collect(document, {getKey: element => element.id === 'open' || element.id === 'forward' ? 'duplicate' : element.id === 'ssid' ? null : getKey(element)});
  assert.equal(seen.filter(entry => entry.key === 'duplicate').length, 1);
  assert.equal(seen.find(entry => entry.key === 'duplicate').element.id, 'open');
  assert.ok(!seen.some(entry => entry.element.id === 'ssid'));
  assert.throws(() => api.collect(document), /getKey/);
});
check('Render trennt Editor-Dokument von HMI und erzeugt native sichere Controls', () => {
  navigator = api.render(host, {document, getKey, pages: [{id: 'Overview', name: 'Dashboard'}, {id: 'Hand', name: 'Einrichten'}, {id: 'Setup', name: 'Einstellungen'}], onSelect: entry => picked.push(entry)});
  assert.equal(navigator.element.ownerDocument, ui); assert.equal(navigator.getEntries()[0].element.ownerDocument, document);
  assert.equal(ui.querySelector('label[for="' + navigator.input.id + '"]').textContent.includes('Element suchen'), true);
  assert.equal(ui.querySelector('[role="tree"],[role="listbox"],[role="combobox"]'), null);
  assert.ok(navigator.list.querySelectorAll('button[type="button"]').length > 10);
});
check('Suchbegriffe kombinieren Name, Seite, Art und Elternkontext ohne Umlaut-Hürde', () => {
  input('dashboard zange offnen schaltflache'); assert.deepEqual(navigator.getResults().map(entry => entry.key), ['#open']);
  input('einrichten vor'); assert.ok(navigator.getResults().some(entry => entry.key === '#forward'));
  input('form schliessen auswahlliste'); assert.deepEqual(navigator.getResults().map(entry => entry.key), ['#force']);
});
check('Seitenfilter verwendet technische IDs und verständliche Seitennamen', () => {
  input(''); navigator.setPageFilter('Hand');
  assert.equal(navigator.pageSelect.value, 'Hand'); assert.ok(navigator.getResults().every(entry => entry.page === 'Hand'));
  assert.equal(navigator.pageSelect.selectedOptions[0].textContent, 'Einrichten');
  navigator.pageSelect.value = 'Setup'; navigator.pageSelect.dispatchEvent(new uiDom.window.Event('change', {bubbles: true}));
  assert.ok(navigator.getResults().every(entry => entry.page === 'Setup'));
  navigator.setPageFilter('');
});
check('Resultatklick wählt nur aus und betätigt keine HMI-Funktion', () => {
  input('zange offnen'); navigator.list.querySelector('button').click();
  assert.equal(picked.at(-1).element, document.getElementById('open'));
  assert.equal(navigator.list.querySelector('button').getAttribute('aria-current'), 'true');
  assert.equal(sourceClicks, 0); assert.equal(sourceFocuses, 0); assert.equal(document.activeElement, document.body);
});
check('Pfeile navigieren nur im Suchbereich und Enter im Suchfeld wählt einmal', () => {
  input('schaltflache'); navigator.focus(); const resultButtons = Array.from(navigator.list.querySelectorAll('button'));
  assert.equal(key(navigator.input, 'ArrowDown').defaultPrevented, true); assert.equal(ui.activeElement, resultButtons[0]);
  key(resultButtons[0], 'ArrowDown'); assert.equal(ui.activeElement, resultButtons[1]);
  key(resultButtons[1], 'ArrowUp'); assert.equal(ui.activeElement, resultButtons[0]);
  key(resultButtons[0], 'ArrowUp'); assert.equal(ui.activeElement, navigator.input);
  key(navigator.input, 'ArrowUp'); assert.equal(ui.activeElement, resultButtons.at(-1));
  const count = picked.length; key(navigator.input, 'Enter'); assert.equal(picked.length, count + 1);
  assert.equal(key(resultButtons[0], 'Enter').defaultPrevented, false, 'Enter auf Buttons bleibt natives Buttonverhalten.');
});
check('Escape, Tab, Schreibshortcuts und Seitenfilter werden nicht abgefangen', () => {
  let escapes = 0; const listener = event => { if (event.key === 'Escape') escapes++; }; ui.addEventListener('keydown', listener);
  assert.equal(key(navigator.input, 'Escape').defaultPrevented, false); assert.equal(escapes, 1);
  assert.equal(key(navigator.input, 'Tab').defaultPrevented, false);
  assert.equal(key(navigator.input, 'ArrowDown', {ctrlKey: true}).defaultPrevented, false);
  assert.equal(key(navigator.input, 'z', {ctrlKey: true}).defaultPrevented, false);
  assert.equal(key(navigator.pageSelect, 'ArrowDown').defaultPrevented, false);
  ui.removeEventListener('keydown', listener);
});
check('Leere Treffer bleiben verständlich und Enter führt keine andere Aktion aus', () => {
  input('xyz-unauffindbar'); const count = picked.length;
  assert.equal(navigator.getResults().length, 0); assert.match(navigator.list.textContent, /Kein passendes Element/);
  assert.equal(key(navigator.input, 'Enter').defaultPrevented, true); assert.equal(picked.length, count);
});
check('Refresh erhält Suche und fokussierten Treffer bei geänderten Bezeichnungen', () => {
  input('offnen'); navigator.list.querySelector('button').focus();
  document.getElementById('open').append(document.createTextNode(' sicher'));
  navigator.refresh(); assert.equal(navigator.input.value, 'offnen');
  assert.equal(ui.activeElement.dataset.key, '#open'); assert.match(ui.activeElement.textContent, /Öffnen sicher/);
  navigator.input.focus(); navigator.input.setSelectionRange(1, 3); navigator.refresh();
  assert.equal(ui.activeElement, navigator.input); assert.equal(navigator.input.selectionStart, 1); assert.equal(navigator.input.selectionEnd, 3);
});
check('Neue Quelle und neuer Filter sind ohne zweite Instanz aktualisierbar', () => {
  const replacement = memory('<section data-page="Service"><h1>Wartung</h1><button id="maintain">Prüfen</button></section>');
  navigator.refresh({document: replacement.window.document, pages: [{id: 'Service', name: 'Service'}], pageFilter: 'Service'});
  input('prufen'); assert.deepEqual(navigator.getResults().map(entry => entry.key), ['#maintain']);
  navigator.refresh({document, pageFilter: '', pages: [{id: 'Overview', name: 'Dashboard'}, {id: 'Hand', name: 'Einrichten'}, {id: 'Setup', name: 'Einstellungen'}]});
});
check('Text mit HTML-Zeichen wird als Text gerendert, nie als Markup', () => {
  const button = document.createElement('button'); button.id = 'hostile'; button.textContent = '<img src=x onerror=alert(1)> & Entwurf';
  document.getElementById('overview').append(button); navigator.refresh(); input('onerror');
  assert.equal(navigator.getResults().length, 1); assert.equal(navigator.list.querySelector('img'), null);
  assert.match(navigator.list.textContent, /<img src=x onerror=alert\(1\)>/);
});
check('Echte Komponentenpalette bleibt als einzelnes Bauteil auffindbar', () => {
  const components = require(path.join(appRoot, 'public/components.js'));
  const component = components.create({type: 'dropdown', label: 'Material wählen', options: [{value: 'a', label: 'Aluminium'}, {value: 'b', label: 'Kunststoff'}]}, {document, isTesting: () => false});
  document.getElementById('setup').append(component); navigator.refresh(); input('material');
  assert.equal(navigator.getResults().length, 1); assert.equal(navigator.getResults()[0].kind, 'Neue Auswahlliste');
  assert.equal(navigator.getResults()[0].label, 'Material wählen');
});
check('Ungültiger Adapter löscht bestehende Host-Inhalte nicht', () => {
  const otherHost = ui.createElement('div'); otherHost.textContent = 'Erhalten'; ui.body.append(otherHost);
  assert.throws(() => api.render(otherHost, {document}), /getKey/); assert.equal(otherHost.textContent, 'Erhalten'); otherHost.remove();
});
check('Fehlendes Quell-HMI wird nicht versehentlich durch die Editor-Oberfläche ersetzt', () => {
  const otherHost = ui.createElement('div'); otherHost.textContent = 'Erhalten'; ui.body.append(otherHost);
  assert.throws(() => api.render(otherHost, {getKey}), /HMI-Dokument/); assert.equal(otherHost.textContent, 'Erhalten'); otherHost.remove();
});
check('Destroy entfernt nur eigene Oberfläche und unterbindet spätere Rückrufe', () => {
  input('material'); const detachedButton = navigator.list.querySelector('button'), count = picked.length;
  const sibling = ui.createElement('span'); sibling.textContent = 'Außerhalb'; host.append(sibling);
  navigator.destroy(); assert.equal(host.textContent, 'Außerhalb'); detachedButton.click(); assert.equal(picked.length, count);
  navigator.refresh(); navigator.focus(); assert.equal(navigator.getEntries().length, 0);
});

const hmiPath = option('--hmi') || (option('--workspace') && path.join(path.resolve(option('--workspace')), 'hmi.html'));
const actualHmi = {tested: false};
if (hmiPath) check('Haupttestprojekt: echte WF-HMI passiv über alle sieben Seiten gesammelt', () => {
  const html = fs.readFileSync(path.resolve(hmiPath), 'utf8'), actual = memory(html), sourceDocument = actual.window.document;
  const before = sourceDocument.documentElement.outerHTML, candidates = api.collect(sourceDocument, {getKey: keys()});
  const pages = Array.from(sourceDocument.querySelectorAll('section[data-page]')).map(element => element.dataset.page);
  assert.equal(pages.length, 7); assert.equal(candidates.filter(entry => entry.kind === 'Seite').length, 7);
  for (const page of pages) assert.ok(candidates.some(entry => entry.page === page && entry.kind !== 'Seite'), page);
  assert.equal(new Set(candidates.map(entry => entry.key)).size, candidates.length);
  assert.ok(candidates.length > 50 && candidates.length < 250, 'Sinnvoller, begrenzter Umfang: ' + candidates.length);
  assert.ok(!candidates.some(entry => entry.element.closest('script,style,#confirmDialog,#skipDialog')));
  assert.ok(!candidates.some(entry => entry.element.id === 'modeBadge' || entry.element.id === 'bandMetric'));
  assert.equal(sourceDocument.documentElement.outerHTML, before);
  Object.assign(actualHmi, {tested: true, sha256: crypto.createHash('sha256').update(html).digest('hex'), pages: pages.length, entries: candidates.length, scriptsExecuted: false, sourceMutations: false});
});
check('Keine Netzwerkaufrufe und keine unerwarteten DOM-/CSS-Fehler', () => {
  assert.equal(unexpectedNetwork, 0); assert.deepEqual(errors, []);
});
for (const dom of doms) dom.window.close();
const report = {passed: checks.every(item => item.passed), at: new Date().toISOString(), node: process.version, checks, actualHmi, unexpectedNetwork, jsdomErrors: errors, scope: 'isolated-memory-dom; source HTML read only; no HMI scripts executed', userDataWrites: false};
fs.writeFileSync(path.join(__dirname, 'element-navigator-results.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'element-navigator-results.md'), '# Prüfung des Elementnavigators\n\n' + report.at + '\n\n' + checks.filter(item => item.passed).length + '/' + checks.length + ' Prüfungen bestanden.\n\n' + checks.map(item => '- ' + (item.passed ? 'BESTANDEN' : 'FEHLER') + ' · ' + item.name + (item.passed ? '' : '\n  ' + item.error.split('\n').slice(0, 3).join('\n  '))).join('\n') + '\n\nPrüfgrenze: ausschließlich isolierte Memory-DOMs. Keine Browserdarstellung, Screenreader-Abnahme oder reale HMI-/Geräteprüfung. Der WF-Durchlauf liest die echte HTML-Kopie; ihre Skripte werden nicht ausgeführt.\n\nAufruf: `node qa/element-navigator.cjs --jsdom <absolutes JSDOM-Modulverzeichnis> --workspace <absoluter privater WF-Arbeitsordner>`\n');
process.stdout.write(JSON.stringify({passed: report.passed, checks: checks.length, failed: checks.filter(item => !item.passed), actualHmi, unexpectedNetwork, jsdomErrors: errors}, null, 2) + '\n');
if (!report.passed) process.exitCode = 1;
