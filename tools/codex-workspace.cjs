'use strict';
// Read-only project selection for Codex. Do not require adapters/workspace.cjs:
// adapters are project code, and the general workspace resolver may create a demo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function localAbsolute(value, paths = path) {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f]/.test(value) || /^[\\/]{2}/.test(value)) return false;
  return paths === path.win32 ? /^[a-zA-Z]:[\\/]/.test(value) : paths.isAbsolute(value);
}
function samePath(left, right, paths = path) {
  const normalize = value => {
    const resolved = paths.resolve(value);
    return paths === path.win32 ? resolved.toLocaleLowerCase('en-US') : resolved;
  };
  return normalize(left) === normalize(right);
}
function inside(root, target, paths = path) {
  const relative = paths.relative(paths.resolve(root), paths.resolve(target));
  return relative === '' || relative !== '..' && !relative.startsWith('..' + paths.sep) && !paths.isAbsolute(relative);
}
function projectSlug(projectRoot) {
  return (path.basename(projectRoot).toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'projekt');
}
const canonical = value => fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && value === value.trim() && !/[\u0000-\u001f]/.test(value);

function safeFile(root, relative) {
  const filename = path.resolve(root, relative);
  if (!inside(root, filename)) throw Error('Pfad verlässt den zugeordneten Arbeitsbereich: ' + relative);
  if (!fs.existsSync(filename)) return null;
  if (!inside(root, canonical(filename))) throw Error('Dateiverknüpfung verlässt den zugeordneten Arbeitsbereich: ' + relative);
  return fs.statSync(filename).isFile() ? filename : null;
}
function jsonFile(root, relative) {
  const filename = safeFile(root, relative);
  if (!filename) return null;
  const value = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Kein JSON-Objekt: ' + relative);
  return value;
}
function proposal(appRoot, projectRoot) {
  const workspaceParent = path.join(appRoot, 'workspaces');
  if (fs.existsSync(workspaceParent) && (!fs.statSync(workspaceParent).isDirectory() || !inside(appRoot, canonical(workspaceParent)))) return null;
  const slug = projectSlug(projectRoot); let suffix = 1;
  let target = path.join(workspaceParent, slug);
  while (fs.existsSync(target)) target = path.join(workspaceParent, slug + '-' + ++suffix);
  return inside(workspaceParent, target) ? target : null;
}

function inspectWorkspace(workspaceRoot, registration, starterPath, projectRoot, layout) {
  const problems = [];
  const read = relative => {
    try { return jsonFile(workspaceRoot, relative); }
    catch (error) { problems.push({code: 'invalid-artifact', file: relative, message: error.message}); return null; }
  };
  const requireFile = relative => {
    try { const file = safeFile(workspaceRoot, relative); if (!file) problems.push({code: 'missing-artifact', file: relative}); return file; }
    catch (error) { problems.push({code: 'unsafe-artifact', file: relative, message: error.message}); return null; }
  };
  requireFile('project/adapter.cjs'); requireFile('hmi.html');
  const baselineFile = requireFile('baseline/manifest.json'), draftFile = requireFile('data/draft.json');
  const baseline = baselineFile ? read('baseline/manifest.json') : null, draft = draftFile ? read('data/draft.json') : null;
  const metadata = read('workspace.json');
  if (metadata && !validId(metadata.id)) problems.push({code: 'invalid-workspace-id', file: 'workspace.json'});
  if (draft?.workspaceId != null && !validId(draft.workspaceId)) problems.push({code: 'invalid-workspace-id', file: 'data/draft.json'});
  const baselineHtml = requireFile('baseline/hmi.html');
  const communication = {
    selectionPath: path.join(workspaceRoot, 'data/selection.json'),
    analysisRequestPath: path.join(workspaceRoot, 'project/context-request.json'),
    draftPath: path.join(workspaceRoot, 'data/draft.json'),
    commentsPath: path.join(workspaceRoot, 'data/Kommentare_und_Aenderungen.md')
  };
  for (const relative of ['data/selection.json', 'project/context-request.json', 'data/Kommentare_und_Aenderungen.md']) {
    try { safeFile(workspaceRoot, relative); }
    catch (error) { problems.push({code: 'unsafe-communication-artifact', file: relative, message: error.message}); }
  }
  if (!starterPath) problems.push({code: 'missing-starter'});
  let sourceFreshness = 'unknown';
  if (baseline) {
    if (typeof baseline.version !== 'string' || !baseline.version.trim() || !validHash(baseline.sourceSha256) || !validHash(baseline.htmlSha256)) problems.push({code: 'invalid-baseline-metadata'});
    if (baselineHtml && validHash(baseline.htmlSha256) && hash(baselineHtml) !== baseline.htmlSha256.toLowerCase()) problems.push({code: 'baseline-html-mismatch'});
    const sourceName = typeof baseline.source === 'string' ? path.win32.basename(path.posix.basename(baseline.source)) : '';
    if (!sourceName || sourceName === '.' || sourceName === '..') problems.push({code: 'baseline-source-name-missing'});
    else {
      const original = requireFile(path.join('baseline', sourceName));
      if (original && validHash(baseline.sourceSha256) && hash(original) !== baseline.sourceSha256.toLowerCase()) problems.push({code: 'baseline-source-mismatch'});
    }
    if (draft && (!draft.baseline || draft.baseline.sourceSha256 !== baseline.sourceSha256 || draft.baseline.htmlSha256 !== baseline.htmlSha256)) problems.push({code: 'draft-baseline-mismatch'});
    // This checks only the recorded HMI source, never claims the whole program
    // was inspected, and never refreshes an existing draft automatically.
    if (typeof baseline.source === 'string' && !path.isAbsolute(baseline.source) && !path.win32.isAbsolute(baseline.source) && validHash(baseline.sourceSha256)) {
      try { const current = safeFile(projectRoot, baseline.source); if (current) sourceFreshness = hash(current) === baseline.sourceSha256.toLowerCase() ? 'current' : 'changed'; } catch (_) { /* Unknown source freshness. */ }
    }
  }
  return {
    workspaceRoot, layout, projectId: typeof registration.projectId === 'string' ? registration.projectId : null,
    workspaceId: validId(draft?.workspaceId) ? draft.workspaceId : validId(metadata?.id) ? metadata.id : null,
    baselineVersion: typeof baseline?.version === 'string' ? baseline.version : null,
    baseline: baseline ? {version: baseline.version || null, source: baseline.source || null, sourceSha256: baseline.sourceSha256 || null, htmlSha256: baseline.htmlSha256 || null, capturedAt: baseline.capturedAt || null} : null,
    communication, sourceFreshness, programContext: 'not-assessed', problems
  };
}

function resolveProject({appRoot = path.resolve(__dirname, '..'), projectRoot} = {}) {
  if (!localAbsolute(appRoot)) throw new TypeError('appRoot muss ein absoluter lokaler Pfad sein.');
  if (!localAbsolute(projectRoot)) throw new TypeError('--project muss ein absoluter lokaler Projektpfad sein; relative, UNC- und Gerätepfade werden nicht geöffnet.');
  appRoot = canonical(appRoot); projectRoot = path.resolve(projectRoot);
  const warnings = [], base = {
    product: 'Smart HMI Editor', role: 'Codex-Werkzeug', status: 'needs-setup', readOnly: true,
    appRoot, projectRoot, workspaceRoot: null, projectId: null, baselineVersion: null,
    starterPath: null, serverState: 'not-checked', programContext: 'not-assessed', warnings
  };
  for (const name of ['Start-Smart-HMI-Editor.ps1', 'Start-HMI-Draft.ps1']) {
    try { const starter = safeFile(appRoot, name); if (starter) { base.starterPath = starter; break; } } catch (_) { /* No unsafe starter. */ }
  }
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) return {...base, reason: 'project-directory-missing', proposedWorkspaceRoot: proposal(appRoot, projectRoot)};
  projectRoot = canonical(projectRoot); base.projectRoot = projectRoot;
  const candidates = [], workspaceParent = path.join(appRoot, 'workspaces');
  if (fs.existsSync(workspaceParent)) {
    if (!fs.statSync(workspaceParent).isDirectory() || !inside(appRoot, canonical(workspaceParent))) return {...base, reason: 'unsafe-workspace-parent', proposedWorkspaceRoot: null};
    for (const child of fs.readdirSync(workspaceParent, {withFileTypes: true})) {
      // Direct, real directories only: no recursively discovered/linked projects.
      if (!child.isDirectory() || child.isSymbolicLink()) continue;
      const directory = canonical(path.join(workspaceParent, child.name));
      if (inside(canonical(workspaceParent), directory)) candidates.push({root: directory, layout: 'private-workspace'});
    }
  }
  // Legacy staging support requires its own explicit sourceRoot registration.
  // The current directory and its parents never identify a project implicitly.
  if (fs.existsSync(path.join(appRoot, 'project/workspace-source.json'))) candidates.push({root: appRoot, layout: 'legacy-staging'});
  const matches = [];
  for (const candidate of candidates) {
    let registration;
    try { registration = jsonFile(candidate.root, 'project/workspace-source.json'); }
    catch (_) { warnings.push({code: 'invalid-registration', workspace: path.basename(candidate.root)}); continue; }
    if (!registration || !localAbsolute(registration.sourceRoot)) continue;
    let registeredRoot = path.resolve(registration.sourceRoot);
    try { if (fs.existsSync(registeredRoot)) registeredRoot = canonical(registeredRoot); } catch (_) { /* Exact lexical identity may still apply. */ }
    if (samePath(projectRoot, registeredRoot)) matches.push({candidate, registration});
  }
  if (!matches.length) return {...base, reason: 'no-registered-workspace', proposedWorkspaceRoot: proposal(appRoot, projectRoot),
    codexRequest: 'Vorhandene HMI und relevanten Programmzusammenhang anhand echter Projektquellen prüfen und belegen. Einen passenden privaten Offline-Adapter im vorgeschlagenen Editor-Workspace vorbereiten; Originalprojekt und App-Kern dabei nicht vermischen. Diese Zuordnung hat noch nichts importiert oder verstanden.'};
  if (matches.length > 1) return {...base, reason: 'ambiguous-workspaces', matches: matches.map(item => ({workspaceRoot: item.candidate.root, layout: item.candidate.layout, projectId: item.registration.projectId || null})), proposedWorkspaceRoot: null};
  const match = matches[0], workspace = inspectWorkspace(match.candidate.root, match.registration, base.starterPath, projectRoot, match.candidate.layout);
  const ready = workspace.problems.length === 0;
  return {...base, ...workspace, status: ready ? 'ready' : 'needs-setup', reason: ready ? 'registered-workspace' : 'incomplete-workspace',
    proposedWorkspaceRoot: null, needsSourceReview: workspace.sourceFreshness !== 'current',
    launch: ready ? {starterPath: base.starterPath, environment: {HMI_EDITOR_WORKSPACE: workspace.workspaceRoot}, previewHost: '127.0.0.1', serverStarted: false} : null};
}

function main(argv) {
  if (argv.length !== 2 || argv[0] !== '--project') throw new TypeError('Aufruf: node tools/codex-workspace.cjs --project <absoluter lokaler Projektpfad>');
  return resolveProject({projectRoot: argv[1]});
}
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + '\n'); }
  catch (error) { process.stdout.write(JSON.stringify({status: 'needs-setup', readOnly: true, reason: 'invalid-request', error: error.message}, null, 2) + '\n'); process.exitCode = 2; }
}
module.exports = {resolveProject, localAbsolute, samePath, inside, projectSlug, main};
