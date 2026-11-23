'use strict';
// HMI-Draft: local presentation workshop. Never reads or writes a controller.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {annotateHtml}=require('./lib/source-keys.cjs');
const APP_ROOT = __dirname;
const ROOT = require('./lib/workspace.cjs').resolveWorkspace(APP_ROOT);
const adapter = require(path.join(ROOT,'project/adapter.cjs'));
const PORT = Number(process.env.HMI_DRAFT_PORT || 8250);
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw Error('Ungültiger lokaler Editor-Port.');
const HOST = '127.0.0.1';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
for (const folder of ['baseline', 'data', 'history', 'exports']) fs.mkdirSync(path.join(ROOT, folder), {recursive:true});
const readJson = name => JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
function atomic(name, value) {
  const target = path.join(ROOT, name);
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  fs.writeFileSync(target + '.tmp', text, 'utf8');
  fs.renameSync(target + '.tmp', target);
}
const basePath = path.join(ROOT, 'baseline/manifest.json');
if (!fs.existsSync(basePath)) {
  const {source,html,version,sourceName,sourceRef}=adapter.capture(ROOT);
  fs.writeFileSync(path.join(ROOT, 'baseline', sourceName), source);
  fs.writeFileSync(path.join(ROOT, 'baseline/hmi.html'), html);
  fs.writeFileSync(path.join(ROOT, 'hmi.html'), annotateHtml(html));
  atomic('baseline/manifest.json', {version, source:sourceRef, sourceSha256:sha(source), htmlSha256:sha(html), capturedAt:new Date().toISOString()});
}
const baseline = readJson('baseline/manifest.json');
if(!fs.existsSync(path.join(ROOT,'workspace.json')))atomic('workspace.json',{schema:1,id:crypto.randomUUID(),name:adapter.browser.workspaceName,projectId:adapter.browser.projectId});
const workspaceMeta=readJson('workspace.json');
if (!fs.existsSync(path.join(ROOT, 'data/draft.json'))) atomic('data/draft.json', {
  schema:1, name:adapter.browser.workspaceName, workspaceId:crypto.randomUUID(),version:'A01', stage:'Entwurf', approved:false,
  baseline, serial:0, savedAt:null,
  pages:adapter.pages.map(id=>({id,name:id,visible:true,title:null})),
  actions:[], comments:[]
});
if(!fs.existsSync(path.join(ROOT,'project/source-import.json'))){
  const current=readJson('data/draft.json'),working=fs.readFileSync(path.join(ROOT,'hmi.html'),'utf8');
  const canAnnotate=!current.actions.length&&!current.comments.length;
  const annotated=canAnnotate?annotateHtml(working):working;
  if(annotated!==working)atomic('hmi.html',annotated);
  atomic('project/source-import.json',{keySchema:canAnnotate?1:0,requiresManualMapping:!canAnnotate,baselineHtmlSha256:baseline.htmlSha256,importedHtmlSha256:sha(annotated),createdAt:new Date().toISOString()});
}
// The adapter opts in to individual passive images from its own workspace.
const assetTypes = {png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', ico:'image/x-icon'};
const assets = new Map();
for (const route of adapter.staticAssets || []) {
  if (typeof route !== 'string' || !/^\/[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/i.test(route)) throw Error('Ungültiger Bildpfad im Projektadapter.');
  const filename = route.slice(1);
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (!Object.hasOwn(assetTypes, extension) || assets.has(route)) throw Error('Unbekanntes oder doppelt registriertes Projektbild: ' + route);
  const relative = 'project/assets/' + filename;
  const expected = path.join(fs.realpathSync(ROOT), relative);
  if (path.relative(expected, fs.realpathSync(expected)) !== '' || !fs.statSync(expected).isFile()) throw Error('Projektbild liegt außerhalb des Bildordners: ' + route);
  assets.set(route, {relative, type:assetTypes[extension], bytes:fs.readFileSync(expected)});
}
const preview=adapter.createPreview(baseline);
function bundle() {
  const modelText = fs.readFileSync(path.join(ROOT, 'data/draft.json'), 'utf8');
  const model=JSON.parse(modelText);model.workspaceId=model.workspaceId||workspaceMeta.id;
  return {model, etag:sha(modelText), htmlHash:sha(fs.readFileSync(path.join(ROOT, 'hmi.html'))), baseline, adapter:workspaceMeta.checkpointLabel?{...adapter.browser,checkpointLabel:workspaceMeta.checkpointLabel}:adapter.browser,runtime:{appRoot:APP_ROOT,workspaceRoot:ROOT,workspaceId:workspaceMeta.id,port:PORT}};
}
function safeModel(model) {
  if (!model || model.schema!==1 || model.name!==adapter.browser.workspaceName || model.baseline?.sourceSha256!==baseline.sourceSha256) throw Error('Der Ausgangsstand passt nicht.');
  if (typeof model.version!=='string' || !/^A[0-9]{2,4}$/.test(model.version)) throw Error('Ungültige Arbeitsstand-Kennung.');
  if (!Array.isArray(model.pages) || !model.pages.length || model.pages.length>40 || !Array.isArray(model.actions) || model.actions.length>3000 || !Array.isArray(model.comments) || model.comments.length>1500) throw Error('Entwurfsdaten ungültig oder zu umfangreich.');
  const ids = new Set();
  for (const p of model.pages) {
    if (typeof p.id!=='string' || typeof p.name!=='string' || !p.name.trim() || p.name.length>100 || ids.has(p.id)) throw Error('Seitennamen oder Kennungen ungültig.');
    ids.add(p.id);
  }
  if (!model.pages.some(p=>p.visible)) throw Error('Mindestens eine Seite muss sichtbar bleiben.');
  for (const a of model.actions) {
    if (!['text','move','hide','style','duplicate','component','state-style'].includes(a.type) || typeof a.key!=='string') throw Error('Unbekannte Entwurfsänderung.');
    if(a.type==='component'){
      if(!a.config||!['button','iconbutton','toggle','dropdown','indicator'].includes(a.config.type)||!ids.has(a.page))throw Error('Neuer Baustein ist unvollständig.');
      a.config=require(path.join(APP_ROOT,'public/components.js')).normalizeConfig(a.config);a.requiresBinding=true;
    }
    if(a.type==='state-style'){
      if(!a.recipe||!['binary','options'].includes(a.recipe.mode))throw Error('Zustandsfarbregel ist unvollständig.');
      a.recipe=require(path.join(APP_ROOT,'public/state-styles.js')).normalizeRecipe(a.recipe);
    }
  }
  for (const c of model.comments) if (typeof c.text!=='string' || c.text.length>16000 || !Array.isArray(c.replies)) throw Error('Kommentar ungültig.');
  model.stage='Entwurf'; model.approved=false;
  return model;
}
function markdown(model) {
  const rows = model.comments.map(c=>`## ${c.id} · ${model.pages.find(p=>p.id===c.page)?.name||c.page} · ${c.status}\n\n${c.anchor?.label?'Bereich: '+c.anchor.label+'\n\n':''}${c.text}\n${c.replies.map(r=>'\nAntwort: '+r.text+'\n').join('')}${c.impact?.explanation?'\nAuswirkung: '+c.impact.classification+' · '+c.impact.explanation+'\nBestätigung: '+(c.impact.confirmed?'bestätigt, nur vorgemerkt':'noch offen')+'\nImplementierungsvormerkung: '+(c.impact.implementationNote||'noch zu ergänzen')+'\n':''}`).join('\n');
  return `# HMI-Draft ${model.version}\n\nStatus: Entwurf, nicht freigegeben. Ausschließlich Darstellung.\n\nBasis: ${baseline.version}\n\nQuellhash: ${baseline.sourceSha256}\n\n## Seiten\n\n${model.pages.map(p=>'- '+p.name+(p.visible?'':' (ausgeblendet)')).join('\n')}\n\n## Entwurfsänderungen\n\n${model.actions.map((a,i)=>`${i+1}. ${a.description||a.type} [${a.key}]`).join('\n')||'Noch keine.'}\n\n## Kommentare\n\n${rows||'Noch keine.'}\n`;
}
let writes = Promise.resolve();
const server = http.createServer(async(req,res)=>{
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const send = (status,data,type='application/json; charset=utf-8',extra={})=>{
    const body = Buffer.isBuffer(data)?data:Buffer.from(typeof data==='string'?data:JSON.stringify(data));
    res.writeHead(status, {'Content-Type':type,'Content-Length':body.length,'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:; base-uri 'none'; form-action 'none'",...extra});
    res.end(body);
  };
  try {
    if (![`127.0.0.1:${PORT}`,`localhost:${PORT}`].includes(req.headers.host)) return send(403,{error:'Nur lokaler Zugriff.'});
    if (req.method==='GET') {
      if (url.pathname==='/draft/state') return send(200,bundle());
      if (url.pathname==='/draft/context') {
        const providerPath=path.join(ROOT,'project/context-provider.cjs');
        if(!fs.existsSync(providerPath))return send(200,{available:false,limitations:['Der Programmkontext wird für dieses Projekt noch vorbereitet.']});
        const provider=require(providerPath);return send(200,provider.getContext(url.searchParams.get('command')||''));
      }
      if (url.pathname==='/draft/export') {
        const model = bundle().model;
        const name=`HMI-Draft-${model.version}.${url.searchParams.get('format')==='md'?'md':'json'}`;
        const data=url.searchParams.get('format')==='md'?markdown(model):JSON.stringify({...model,integration:{scope:'presentation-only',controllerAccess:false,requiresMasterApproval:true}},null,2);
        return send(200,data,'text/plain; charset=utf-8',{'Content-Disposition':`attachment; filename="${name}"`});
      }
      const asset = assets.get(url.pathname);
      if (asset) return send(200, asset.bytes, asset.type);
      const previewResponse=preview.get(url);if(previewResponse!==undefined)return send(200,previewResponse);
      const files={'/':'public/index.html','/app.js':'public/app.js','/state-merge.js':'public/state-merge.js','/components.js':'public/components.js','/state-styles.js':'public/state-styles.js','/element-navigator.js':'public/element-navigator.js','/element-navigator.css':'public/element-navigator.css','/app.css':'public/app.css','/notes.css':'public/notes.css','/ux.css':'public/ux.css','/components.css':'public/components.css','/state-styles.css':'public/state-styles.css','/hmi.html':'hmi.html','/baseline.html':'baseline/hmi.html'};
      const file=files[url.pathname];
      if (!file) return send(404,{error:'Nicht vorhanden.'});
      const fileRoot=file.startsWith('public/')?APP_ROOT:ROOT;
      return send(200,fs.readFileSync(path.join(fileRoot,file)),file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
    }
    if (req.method!=='POST') return send(405,{error:'Nicht erlaubt.'});
    if (req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) return send(403,{error:'Nur aus HMI-Draft.'});
    let data='';
    for await (const chunk of req) { data+=chunk; if(Buffer.byteLength(data)>1500000) return send(413,{error:'Datei zu groß.'}); }
    const previewResponse=preview.post(url,data);if(previewResponse!==undefined)return send(200,previewResponse);
    if(url.pathname==='/draft/preview')return send(200,preview.configure?preview.configure(JSON.parse(data)):{supported:false,draftOnly:true});
    if(url.pathname==='/draft/context/check'){
      const providerPath=path.join(ROOT,'project/context-provider.cjs');
      return send(200,fs.existsSync(providerPath)?require(providerPath).checkFreshness():{state:'missing',changedFiles:[],checkedAt:new Date().toISOString()});
    }
    if(url.pathname==='/draft/context/request'){
      const request=JSON.parse(data);atomic('project/context-request.json',{type:'program-context-analysis',projectId:adapter.browser.projectId,at:new Date().toISOString(),selection:request.selection||null,request:String(request.request||'').slice(0,5000),pending:true});return send(200,{ok:true});
    }
    if(url.pathname==='/draft/selection'){
      const selection=JSON.parse(data);atomic('data/selection.json',{page:String(selection.page||'').slice(0,100),command:String(selection.command||'').slice(0,300),key:String(selection.key||'').slice(0,1000),label:String(selection.label||'').slice(0,500),at:new Date().toISOString()});return send(200,{ok:true});
    }
    if (url.pathname==='/draft/save') {
      const input=JSON.parse(data);
      const task=async()=>{
        const current=bundle();
        if(input.etag!==current.etag) return send(409,{error:'Ein neuerer Entwurf ist vorhanden. Bitte neu laden; deine Eingabe bleibt sichtbar.'});
        const model=safeModel(input.model);
        model.serial=current.model.serial+1; model.savedAt=new Date().toISOString();
        atomic(`history/change-${String(model.serial).padStart(6,'0')}.json`, current.model);
        atomic('data/draft.json',model); atomic('data/Kommentare_und_Aenderungen.md',markdown(model));
        send(200,bundle());
      };
      writes=writes.then(task,task).catch(error=>{if(!res.headersSent)send(400,{error:error.message});}); return;
    }
    if (url.pathname==='/draft/snapshot') {
      const model=bundle().model;
      const token=new Date().toISOString().replace(/[:.]/g,'-');
      const folder=`exports/${model.version}-${token}`;
      fs.mkdirSync(path.join(ROOT,folder),{recursive:true});
      const preview=fs.readFileSync(path.join(ROOT,'hmi.html'));
      atomic(`${folder}/draft.json`,model);
      atomic(`${folder}/Kommentare_und_Aenderungen.md`,markdown(model));
      fs.writeFileSync(path.join(ROOT,folder,'hmi.html'),preview);
      const runtimeFiles=['server.cjs','package.json','project/adapter.cjs','project/preview-controller.cjs','project/workspace-source.json','project/source-import.json','project/context-provider.cjs','project/context/model.json','project/context/Programmkontext.md','lib/source-keys.cjs','lib/workspace.cjs','lib/runtime-info.cjs','public/index.html','public/app.js','public/state-merge.js','public/components.js','public/state-styles.js','public/element-navigator.js','public/element-navigator.css','public/app.css','public/notes.css','public/ux.css','public/components.css','public/state-styles.css','Start-HMI-Draft.ps1','Start-HMI-Draft.cmd','Start-Simple-AI-HMI-Editor.ps1','Start-Simple-AI-HMI-Editor.cmd'];
      const editorFiles={};
      for(const file of runtimeFiles){
        const from=path.join(file.startsWith('project/')?ROOT:APP_ROOT,file);if(!fs.existsSync(from))continue;
        const bytes=fs.readFileSync(from);const to=path.join(ROOT,folder,'replay',file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes);editorFiles[file]=sha(bytes);
      }
      for(const file of ['workspace.json','baseline/manifest.json','baseline/'+path.basename(baseline.source),'baseline/hmi.html','README.md','Integrationsvertrag.md','project/HMI-Anforderungen.md']){
        const from=path.join(file==='workspace.json'||file.startsWith('baseline/')||file.startsWith('project/')?ROOT:APP_ROOT,file);if(!fs.existsSync(from))continue;const to=path.join(ROOT,folder,'replay',file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
      }
      const assetFiles = {};
      for (const asset of assets.values()) {
        const target = path.join(ROOT, folder, 'replay', asset.relative);
        fs.mkdirSync(path.dirname(target), {recursive:true});
        fs.writeFileSync(target, asset.bytes);
        assetFiles[asset.relative] = sha(asset.bytes);
      }
      const contextFiles={};
      const cacheRoot=path.join(ROOT,'project/context/sources');
      function archiveContext(directory){
        for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
          if(entry.isSymbolicLink())continue;const source=path.join(directory,entry.name);
          if(entry.isDirectory()){archiveContext(source);continue;}
          if(!/\.(?:h|cpp|ino|json|md)$/i.test(entry.name)||/secret|machine_config|password|credential|\.env/i.test(entry.name))continue;
          const relative=path.relative(ROOT,source).split(path.sep).join('/'),bytes=fs.readFileSync(source);
          const target=path.join(ROOT,folder,'replay',relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);contextFiles[relative]=sha(bytes);
        }
      }
      if(fs.existsSync(cacheRoot))archiveContext(cacheRoot);
      fs.mkdirSync(path.join(ROOT,folder,'replay/data'),{recursive:true});
      fs.writeFileSync(path.join(ROOT,folder,'replay/hmi.html'),preview);
      atomic(`${folder}/replay/data/draft.json`,model);
      atomic(`${folder}/manifest.json`,{name:model.name,version:model.version,serial:model.serial,createdAt:new Date().toISOString(),approved:false,requiresMasterApproval:true,baseline,previewSha256:sha(preview),modelSha256:sha(JSON.stringify(model,null,2)),scope:'presentation-only',editor:{product:'Simple-AI-HMI-Editor',version:JSON.parse(fs.readFileSync(path.join(APP_ROOT,'package.json'),'utf8')).version,files:editorFiles},programContext:{files:contextFiles},assets:{files:assetFiles}});
      fs.copyFileSync(path.join(APP_ROOT,'Integrationsvertrag.md'),path.join(ROOT,folder,'Integrationsvertrag.md'));
      send(200,{ok:true,name:`${model.version}-${token}`,serial:model.serial}); return;
    }
    return send(404,{error:'Nicht vorhanden.'});
  } catch(error) { if(!res.headersSent) send(400,{error:error.message}); }
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(PORT,HOST,()=>{
  atomic('data/server.json',{pid:process.pid,url:`http://${HOST}:${PORT}/`,appRoot:APP_ROOT,workspaceRoot:ROOT,startedAt:new Date().toISOString(),baseline});
  console.log(`HMI-Draft ready: http://${HOST}:${PORT}/ (offline copy only)`);
});
