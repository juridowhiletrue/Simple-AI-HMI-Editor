'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {annotateHtml} = require('../lib/source-keys.cjs');
const resolver = require('./codex-workspace.cjs');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');

function extractHtml(source) {
  if (/^\s*(?:<!doctype\s+html[^>]*>\s*)?<html\b/i.test(source)) return source;
  const candidates = [];
  const rawStrings = /R"([^\s()\\]{0,16})\(([\s\S]*?)\)\1"/g;
  for (const match of source.matchAll(rawStrings)) {
    if (/<!doctype\s+html\b|<html\b/i.test(match[2]) && /<\/html>/i.test(match[2])) candidates.push(match[2]);
  }
  if (candidates.length !== 1) throw Error('Quelle enthält keine eindeutig vollständige HTML-HMI.');
  return candidates[0];
}

function candidates(project) {
  const found = [];
  const skip = new Set(['.git','.local','node_modules','workspaces','build','dist','vendor','output']);
  function visit(dir, depth) {
    if (depth > 7) return;
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const file = path.join(dir,entry.name);
      if (entry.isDirectory()) { if (!skip.has(entry.name)) visit(file,depth+1); }
      else if (/\.(?:html?|h|hpp|ino|cpp)$/i.test(entry.name) && fs.statSync(file).size < 4_000_000) {
        try { extractHtml(fs.readFileSync(file,'utf8')); found.push(path.relative(project,file)); } catch { /* Not a complete HMI document. */ }
      }
    }
  }
  visit(project,0);
  return found;
}

function initialize({project,source,appRoot=path.resolve(__dirname,'..')}) {
  if (!path.isAbsolute(project)) throw Error('--project benötigt einen absoluten Projektpfad.');
  project = fs.realpathSync(project);
  const existing = resolver.resolveProject({appRoot,projectRoot:project});
  if (existing.reason !== 'no-registered-workspace') return existing;
  if (!source) {
    const options = candidates(project);
    if (options.length !== 1) return {...existing,reason:options.length?'ambiguous-hmi-sources':'no-hmi-source',candidates:options};
    source = options[0];
  }
  if (path.isAbsolute(source)) throw Error('--source muss relativ zum Projekt sein.');
  const file = fs.realpathSync(path.resolve(project,source));
  const relative = path.relative(project,file);
  if (relative.startsWith('..'+path.sep) || relative === '..' || path.isAbsolute(relative)) throw Error('HMI-Quelle liegt außerhalb des Projekts.');
  const bytes = fs.readFileSync(file);
  const original = extractHtml(bytes.toString('utf8'));
  const pages = [...new Set([...original.matchAll(/\bdata-page\s*=\s*["']([^"']+)["']/g)].map(m=>m[1]))];
  const sourceHash = digest(bytes);
  const root = existing.proposedWorkspaceRoot;
  if (!root || fs.existsSync(root)) throw Error('Neuer privater Zielordner fehlt oder ist bereits belegt.');
  // Validate the complete source before creating any workspace files.
  const id = crypto.randomUUID(), version = 'import-'+sourceHash.slice(0,12);
  const name = path.basename(project), sourceName = path.basename(file);
  const manifest = {version,source:relative.split(path.sep).join('/'),sourceSha256:sourceHash,htmlSha256:digest(original),capturedAt:new Date().toISOString()};
  const json = (relative,value) => fs.writeFileSync(path.join(root,relative),JSON.stringify(value,null,2)+'\n');
  for (const sub of ['project','baseline','data']) fs.mkdirSync(path.join(root,sub),{recursive:true});
  fs.writeFileSync(path.join(root,'baseline',sourceName),bytes);
  fs.writeFileSync(path.join(root,'baseline/hmi.html'),original);
  fs.writeFileSync(path.join(root,'hmi.html'),annotateHtml(original));
  json('project/workspace-source.json',{schema:1,sourceRoot:project,projectId:name,programContext:'not-assessed'});
  json('baseline/manifest.json',manifest);
  json('workspace.json',{schema:1,id,name,projectId:name});
  json('data/draft.json',{schema:1,name,workspaceId:id,version:'A01',stage:'Entwurf',approved:false,baseline:manifest,serial:0,savedAt:null,pages:(pages.length?pages:['HMI']).map(id=>({id,name:id,visible:true,title:null})),actions:[],comments:[]});
  const config = {projectId:name,workspaceName:name,productName:'Simple-AI-HMI-Editor',defaultPages:pages.length?pages:['HMI'],blocks:'.panel,.grid,.node,main,section',previewControls:[]};
  const adapter = "'use strict';\nconst fs=require('node:fs');const path=require('node:path');\n"+
    'const browser='+JSON.stringify(config)+';\n'+
    "module.exports={pages:browser.defaultPages,browser,capture(){const p=path.join(__dirname,'../baseline');return {source:fs.readFileSync(path.join(p,"+JSON.stringify(sourceName)+")),html:fs.readFileSync(path.join(p,'hmi.html'),'utf8'),version:"+JSON.stringify(version)+",sourceName:"+JSON.stringify(sourceName)+",sourceRef:"+JSON.stringify(manifest.source)+"};},"+
    "createPreview(){return {get(){return {draftOnly:true,unmapped:true};},post(){return {result:16,draftOnly:true,detail:'Projektadapter für interaktive Befehle noch zu prüfen.'};},configure(){return {enabled:false,draftOnly:true,unmapped:true};}};}};\n";
  fs.writeFileSync(path.join(root,'project/adapter.cjs'),adapter);
  fs.writeFileSync(path.join(root,'project/HMI-Anforderungen.md'),'# HMI-Entwurf\n\nQuelle und Projektzuordnung geprüft. Programmzusammenhang und interaktive API-Beispieldaten sind noch zuzuordnen.\n');
  return resolver.resolveProject({appRoot,projectRoot:project});
}

if (require.main === module) {
  try {
    const args=process.argv.slice(2), options={};
    while (args.length) {
      const flag=args.shift(), value=args.shift();
      if (!['--project','--source'].includes(flag) || !value || options[flag.slice(2)]) throw Error('Aufruf: --project <absoluter Pfad> [--source <relative HMI-Datei>]');
      options[flag.slice(2)]=value;
    }
    if (!options.project) throw Error('--project fehlt.');
    const result=initialize(options);
    console.log(JSON.stringify(result,null,2));
    process.exitCode=result.status==='ready'?0:2;
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
module.exports={extractHtml,candidates,initialize};
