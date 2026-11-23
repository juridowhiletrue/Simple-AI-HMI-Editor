'use strict';
// Temporary filesystem and direct child-process checks only. No editor, browser,
// live workspace, server, external command, Git or controller is started.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const api = require('../tools/codex-workspace.cjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-hmi-codex-'));
const checks = [], cleanupFailures = [];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const originalSource = '<program>offline-test-source</program>\n', originalHtml = '<section data-page="Test">Test-HMI</section>\n';
const baseline = {version: 'test-1', source: 'Hmi/page.h', sourceSha256: digest(originalSource), htmlSha256: digest(originalHtml), capturedAt: '2026-11-20T00:00:00.000Z'};
function write(file, content) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2)); }
function fixture(name) {
  const root = path.join(tempRoot, name), appRoot = path.join(root, 'Editor App'), projectRoot = path.join(root, 'Programmprojekt');
  fs.mkdirSync(appRoot, {recursive: true}); fs.mkdirSync(projectRoot, {recursive: true});
  write(path.join(appRoot, 'Start-Smart-HMI-Editor.ps1'), 'throw "Der Starter darf von der Zuordnung niemals ausgeführt werden."');
  write(path.join(projectRoot, 'Hmi/page.h'), originalSource);
  return {root, appRoot, projectRoot};
}
function workspace(location, projectRoot, overrides = {}) {
  write(path.join(location, 'project/workspace-source.json'), {sourceRoot: projectRoot, projectId: 'Testprojekt', readOnly: true, ...overrides});
  write(path.join(location, 'project/adapter.cjs'), 'throw Error("Adapter darf durch Zuordnung nicht geladen werden");');
  write(path.join(location, 'baseline/manifest.json'), baseline); write(path.join(location, 'baseline/page.h'), originalSource);
  write(path.join(location, 'baseline/hmi.html'), originalHtml); write(path.join(location, 'hmi.html'), originalHtml);
  write(path.join(location, 'data/draft.json'), {schema: 1, workspaceId: 'test-private-workspace', baseline, comments: []});
}
function inventory(directory, result = {}, relative = '') {
  for (const entry of fs.readdirSync(path.join(directory, relative), {withFileTypes: true})) {
    const child = path.join(relative, entry.name), filename = path.join(directory, child), stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) result[child] = {type: 'link', target: fs.readlinkSync(filename)};
    else if (stat.isDirectory()) { result[child] = {type: 'directory', mtime: stat.mtimeMs}; inventory(directory, result, child); }
    else result[child] = {type: 'file', sha256: digest(fs.readFileSync(filename)), mtime: stat.mtimeMs};
  }
  return result;
}
function check(name, run) { try { run(); checks.push({name, passed: true}); } catch (error) { checks.push({name, passed: false, error: error.stack}); } }
function withFs(overrides) {
  const module = {exports: {}};
  const localRequire = name => name === 'node:fs' ? {...fs, ...overrides} : require(name);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../tools/codex-workspace.cjs'), 'utf8'), {require: localRequire, module, exports: module.exports, __dirname: path.join(__dirname, '../tools'), process}, {filename: 'codex-workspace-simulated-fs.cjs'});
  return module.exports;
}

check('Windows-Pfade: absolut lokal, ohne UNC-, Geräte- oder Laufwerksrelativ-Pfade', () => {
  assert.equal(api.localAbsolute('C:\\Projekt mit Leerzeichen', path.win32), true);
  for (const candidate of ['..\\Projekt', 'C:Projekt', '\\Projekt', '\\\\server\\share\\Projekt', '\\\\?\\C:\\Projekt', 'C:\\x\u0000y']) assert.equal(api.localAbsolute(candidate, path.win32), false, candidate);
  assert.equal(api.samePath('C:\\Projekte\\Plant-A\\', 'c:/projekte/Plant-A', path.win32), true);
});
check('Pfadgrenzen unterscheiden Nachbarordner und Traversal', () => {
  assert.equal(api.inside('C:\\Editor\\workspaces', 'C:\\Editor\\workspaces\\wf', path.win32), true);
  assert.equal(api.inside('C:\\Editor\\workspaces', 'C:\\Editor\\workspaces-alt', path.win32), false);
  assert.equal(api.inside('C:\\Editor\\workspaces', 'C:\\Editor\\workspaces\\..\\source', path.win32), false);
});
check('Direkter privater Workspace ist eindeutig, hashgeprüft und Codex zugeordnet', () => {
  const item = fixture('private'), expected = path.join(item.appRoot, 'workspaces/test'); workspace(expected, item.projectRoot);
  const before = inventory(item.root), result = api.resolveProject(item);
  assert.equal(result.status, 'ready'); assert.equal(result.role, 'Codex-Werkzeug'); assert.ok(api.samePath(result.workspaceRoot, fs.realpathSync(expected)));
  assert.equal(result.layout, 'private-workspace'); assert.equal(result.baselineVersion, 'test-1'); assert.equal(result.sourceFreshness, 'current');
  assert.equal(result.programContext, 'not-assessed'); assert.equal(result.serverState, 'not-checked'); assert.equal(result.launch.serverStarted, false);
  assert.equal(result.launch.environment.HMI_EDITOR_WORKSPACE, result.workspaceRoot); assert.deepEqual(inventory(item.root), before);
});
check('Communication-Dateipfade entsprechen den tatsächlichen lokalen Serverartefakten', () => {
  const item = fixture('communication'), location = path.join(item.appRoot, 'workspaces/test'); workspace(location, item.projectRoot);
  const result = api.resolveProject(item);
  const expected = {selectionPath: path.join(location, 'data/selection.json'), analysisRequestPath: path.join(location, 'project/context-request.json'), draftPath: path.join(location, 'data/draft.json'), commentsPath: path.join(location, 'data/Kommentare_und_Aenderungen.md')};
  for (const field of Object.keys(expected)) assert.ok(api.samePath(result.communication[field], expected[field]), field);
  assert.equal(fs.existsSync(result.communication.selectionPath), false); assert.equal(fs.existsSync(result.communication.analysisRequestPath), false);
});
check('Älterer Entwurf verwendet die validierte ID aus workspace.json', () => {
  const item = fixture('metadata-id'), location = path.join(item.appRoot, 'workspaces/test'); workspace(location, item.projectRoot);
  write(path.join(location, 'data/draft.json'), {schema: 1, baseline, comments: []});
  write(path.join(location, 'workspace.json'), {schema: 1, id: '30b04494-fb7e-4eb4-a511-a609cb6aaee7'});
  const before = inventory(item.root), result = api.resolveProject(item);
  assert.equal(result.status, 'ready'); assert.equal(result.workspaceId, '30b04494-fb7e-4eb4-a511-a609cb6aaee7'); assert.deepEqual(inventory(item.root), before);
});
check('Ungültige Workspace-ID wird nicht als verlässliche Identität ausgegeben', () => {
  const item = fixture('invalid-id'), location = path.join(item.appRoot, 'workspaces/test'); workspace(location, item.projectRoot);
  write(path.join(location, 'data/draft.json'), {schema: 1, baseline, comments: []});
  write(path.join(location, 'workspace.json'), {schema: 1, id: {invalid: true}});
  const result = api.resolveProject(item); assert.equal(result.status, 'needs-setup'); assert.equal(result.workspaceId, null);
  assert.ok(result.problems.some(problem => problem.code === 'invalid-workspace-id'));
});
check('Explizite alte Staging-Registrierung bleibt lesbar', () => {
  const item = fixture('legacy'); workspace(item.appRoot, item.projectRoot);
  const result = api.resolveProject(item); assert.equal(result.status, 'ready'); assert.equal(result.layout, 'legacy-staging'); assert.ok(api.samePath(result.workspaceRoot, fs.realpathSync(item.appRoot)));
});
check('Projekt-Eltern und verschachtelte Workspaces werden nicht als Treffer angenommen', () => {
  const item = fixture('no-parent'), parent = path.dirname(item.projectRoot);
  workspace(path.join(item.appRoot, 'workspaces/parent'), parent);
  workspace(path.join(item.appRoot, 'workspaces/group/nested'), item.projectRoot);
  const result = api.resolveProject(item); assert.equal(result.status, 'needs-setup'); assert.equal(result.reason, 'no-registered-workspace');
  assert.equal(typeof result.codexRequest, 'string');
  assert.equal(api.inside(path.join(item.appRoot, 'workspaces'), result.proposedWorkspaceRoot), true);
  assert.equal(api.inside(item.projectRoot, result.proposedWorkspaceRoot), false); assert.equal(fs.existsSync(result.proposedWorkspaceRoot), false);
});
check('Neuer Vorschlag kollidiert nicht mit vorhandenen privaten Ordnern', () => {
  const item = fixture('collision'), parent = path.join(item.appRoot, 'workspaces'); fs.mkdirSync(path.join(parent, api.projectSlug(item.projectRoot)), {recursive: true});
  const result = api.resolveProject(item); assert.match(result.proposedWorkspaceRoot, /-2$/); assert.equal(fs.existsSync(result.proposedWorkspaceRoot), false);
});
check('Mehrere explizite Zuordnungen werden nicht stillschweigend ausgewählt', () => {
  const item = fixture('ambiguous'); workspace(path.join(item.appRoot, 'workspaces/a'), item.projectRoot); workspace(path.join(item.appRoot, 'workspaces/b'), item.projectRoot);
  const result = api.resolveProject(item); assert.equal(result.reason, 'ambiguous-workspaces'); assert.equal(result.status, 'needs-setup'); assert.equal(result.matches.length, 2); assert.equal(result.workspaceRoot, null);
});
check('Fehlende Entwurfsdatei ergibt needs-setup statt Autoimport oder Demo', () => {
  const item = fixture('incomplete'), location = path.join(item.appRoot, 'workspaces/test'); workspace(location, item.projectRoot); fs.unlinkSync(path.join(location, 'data/draft.json'));
  const before = inventory(item.root), result = api.resolveProject(item);
  assert.equal(result.reason, 'incomplete-workspace'); assert.equal(result.status, 'needs-setup'); assert.equal(result.launch, null);
  assert.ok(result.problems.some(problem => problem.file === 'data/draft.json')); assert.deepEqual(inventory(item.root), before);
});
check('Baseline- oder Draft-Drift wird nicht als ready ausgegeben', () => {
  const item = fixture('drift'), location = path.join(item.appRoot, 'workspaces/test'); workspace(location, item.projectRoot);
  write(path.join(location, 'baseline/hmi.html'), 'drift'); assert.ok(api.resolveProject(item).problems.some(problem => problem.code === 'baseline-html-mismatch'));
  write(path.join(location, 'baseline/hmi.html'), originalHtml); write(path.join(location, 'baseline/page.h'), 'drift'); assert.ok(api.resolveProject(item).problems.some(problem => problem.code === 'baseline-source-mismatch'));
  write(path.join(location, 'baseline/page.h'), originalSource); write(path.join(location, 'data/draft.json'), {baseline: {...baseline, sourceSha256: '0'.repeat(64)}});
  assert.ok(api.resolveProject(item).problems.some(problem => problem.code === 'draft-baseline-mismatch'));
});
check('Geänderte Originalquelle bleibt erhalten und wird als Abgleichbedarf gemeldet', () => {
  const item = fixture('source-change'), location = path.join(item.appRoot, 'workspaces/test'); workspace(location, item.projectRoot); write(path.join(item.projectRoot, 'Hmi/page.h'), 'new-version');
  const before = inventory(item.root), result = api.resolveProject(item);
  assert.equal(result.status, 'ready'); assert.equal(result.sourceFreshness, 'changed'); assert.equal(result.needsSourceReview, true); assert.deepEqual(inventory(item.root), before);
});
check('Fehlende aktuelle HMI-Quelle bedeutet unbekannte Frische, keine erfundene Analyse', () => {
  const item = fixture('source-unknown'), location = path.join(item.appRoot, 'workspaces/test'); workspace(location, item.projectRoot); fs.unlinkSync(path.join(item.projectRoot, 'Hmi/page.h'));
  const result = api.resolveProject(item); assert.equal(result.status, 'ready'); assert.equal(result.sourceFreshness, 'unknown'); assert.equal(result.programContext, 'not-assessed');
});
check('Ungültige fremde Registrierung führt nicht zum Lesen/Laden fremden Codes', () => {
  const item = fixture('bad-registration'), other = path.join(item.appRoot, 'workspaces/other');
  write(path.join(other, 'project/workspace-source.json'), '{broken');
  write(path.join(other, 'project/adapter.cjs'), 'process.exit(99)');
  const result = api.resolveProject(item); assert.equal(result.status, 'needs-setup'); assert.ok(result.warnings.some(warning => warning.code === 'invalid-registration'));
});
check('Simulierte Junction-Wurzel wird anhand des aufgelösten Ziels abgewiesen', () => {
  const item = fixture('junction-parent'), external = path.join(item.root, 'outside'), parent = path.join(item.appRoot, 'workspaces');
  fs.mkdirSync(external); fs.mkdirSync(parent);
  const fakeRealpath = value => api.samePath(value, parent) ? external : fs.realpathSync(value); fakeRealpath.native = fakeRealpath;
  const result = withFs({realpathSync: fakeRealpath}).resolveProject(item);
  assert.equal(result.status, 'needs-setup'); assert.equal(result.reason, 'unsafe-workspace-parent'); assert.equal(result.proposedWorkspaceRoot, null);
});
check('Simulierter verlinkter Workspace wird nicht als direkter Projektordner geladen', () => {
  const item = fixture('junction-child'), parent = path.join(item.appRoot, 'workspaces'); fs.mkdirSync(parent);
  const fakeReadDir = (value, options) => api.samePath(value, parent) ? [{name: 'test', isDirectory: () => true, isSymbolicLink: () => true}] : fs.readdirSync(value, options);
  const result = withFs({readdirSync: fakeReadDir}).resolveProject(item); assert.equal(result.reason, 'no-registered-workspace'); assert.equal(result.workspaceRoot, null);
});
check('Simulierter auswärts verlinkter Kommunikationspfad blockiert ready', () => {
  const item = fixture('junction-file'), location = path.join(item.appRoot, 'workspaces/test'); workspace(location, item.projectRoot);
  const selection = path.join(location, 'data/selection.json'), external = path.join(item.root, 'outside.json');
  write(selection, {}); write(external, {private: 'nicht-lesen'});
  const fakeRealpath = value => api.samePath(value, selection) ? external : fs.realpathSync(value); fakeRealpath.native = fakeRealpath;
  let outsideReads = 0;
  const fakeRead = (file, ...rest) => { if (api.samePath(file, external)) outsideReads++; return fs.readFileSync(file, ...rest); };
  const result = withFs({realpathSync: fakeRealpath, readFileSync: fakeRead}).resolveProject(item);
  assert.equal(result.status, 'needs-setup'); assert.ok(result.problems.some(problem => problem.code === 'unsafe-communication-artifact'));
  assert.equal(outsideReads, 0);
});
check('Fehlender Projektordner wird nicht angelegt', () => {
  const item = fixture('missing-project'); item.projectRoot = path.join(item.root, 'Noch nicht vorhanden');
  const result = api.resolveProject(item); assert.equal(result.reason, 'project-directory-missing'); assert.equal(fs.existsSync(item.projectRoot), false);
});
check('Relative und Netzwerk-Projektpfade werden vor Dateizugriff abgewiesen', () => {
  const item = fixture('invalid-project');
  assert.throws(() => api.resolveProject({...item, projectRoot: '..'}), /absoluter lokaler/);
  assert.throws(() => api.resolveProject({...item, projectRoot: '\\\\unreachable.invalid\\project'}), /UNC/);
});
check('CLI erhält Leerzeichen/Sonderzeichen ohne Shell und schreibt ein einziges JSON', () => {
  const item = fixture('cli & paths'), location = path.join(item.appRoot, 'workspaces/test'); workspace(location, item.projectRoot);
  const cli = path.join(item.appRoot, 'tools/codex-workspace.cjs'); write(cli, fs.readFileSync(path.join(__dirname, '../tools/codex-workspace.cjs'), 'utf8'));
  const before = inventory(item.root), result = spawnSync(process.execPath, [cli, '--project', item.projectRoot], {encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, ''); assert.equal(JSON.parse(result.stdout).status, 'ready'); assert.deepEqual(inventory(item.root), before);
  const rejected = spawnSync(process.execPath, [cli, '--project', '../relative'], {encoding: 'utf8', windowsHide: true});
  assert.equal(rejected.status, 2); assert.equal(JSON.parse(rejected.stdout).reason, 'invalid-request');
});
check('CLI importiert ohne Seiteneffekt und akzeptiert keine unbemerkten Extraargumente', () => {
  assert.throws(() => api.main(['--project', tempRoot, '--force']), /Aufruf/);
  assert.throws(() => api.main([]), /Aufruf/);
});
check('Kurzer Codex-Skill besitzt vollständige eindeutige Frontmatter ohne Scaffold', () => {
  const skill = fs.readFileSync(path.join(__dirname, '../codex-skill/smart-hmi-editor/SKILL.md'), 'utf8');
  const header = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/); assert.ok(header);
  const rows = header[1].split(/\r?\n/); assert.equal(rows.length, 2);
  assert.equal(rows[0], 'name: smart-hmi-editor'); assert.ok(rows[1].startsWith('description: '));
  const description = rows[1].slice('description: '.length); assert.ok(description.length > 20 && description.length <= 1024);
  assert.doesNotMatch(description, /[<>]|\[TODO:/); assert.doesNotMatch(skill, /^\[TODO:/m);
});

// Delete only this exact, resolved test directory within the native temporary
// root. A junction itself is unlinked first, never followed recursively.
function cleanup(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name), stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) { try { fs.unlinkSync(target); } catch (_) { fs.rmdirSync(target); } }
    else if (stat.isDirectory()) { cleanup(target); fs.rmdirSync(target); }
    else fs.unlinkSync(target);
  }
}
try {
  if (!api.inside(fs.realpathSync(os.tmpdir()), fs.realpathSync(tempRoot)) || !path.basename(tempRoot).startsWith('smart-hmi-codex-')) throw Error('Ungültige temporäre Prüfgrenze.');
  cleanup(tempRoot); fs.rmdirSync(tempRoot);
} catch (error) { cleanupFailures.push(error.message); }
const report = {passed: checks.every(check => check.passed) && !cleanupFailures.length, at: new Date().toISOString(), node: process.version, checks, cleanupFailures, scope: 'temporary-filesystem and direct CLI only; no real project mutations; no server, adapter, browser or device execution'};
fs.writeFileSync(path.join(__dirname, 'codex-workspace-results.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({passed: report.passed, checks: checks.length, failed: checks.filter(check => !check.passed), cleanupFailures}, null, 2) + '\n');
if (!report.passed) process.exitCode = 1;
