'use strict';
// Actual editor modules in a virtual two-root filesystem/HTTP; no live mutations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const APP_ROOT=path.resolve(__dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const copy=value=>JSON.parse(JSON.stringify(value));
const checks=[],warnings=[],integrationReasons=[];
const within=(base,target)=>{const r=path.relative(base,target);return r===''||r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function check(name,test){test();checks.push(name);}
function collect(directory,prefix='',result={}){
  if(!fs.existsSync(directory))return result;
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw Error('Audit follows no link: '+entry.name);
    const name=prefix?prefix+'/'+entry.name:entry.name,full=path.join(directory,entry.name);
    if(entry.isDirectory())collect(full,name,result);else if(entry.isFile())result[name]=fs.readFileSync(full);
  }
  return result;
}
function resolveReadOnlyWorkspace(){
  const at=process.argv.indexOf('--workspace');let requested=at>=0?process.argv[at+1]:process.env.HMI_EDITOR_WORKSPACE;
  const config=path.join(APP_ROOT,'.editor-local.json');if(!requested&&fs.existsSync(config))requested=readJson(config).workspace;
  if(requested)return path.resolve(APP_ROOT,requested);
  for(const rel of ['workspaces/plant-a','.','workspaces/demo'])if(fs.existsSync(path.join(APP_ROOT,rel,'project/adapter.cjs')))return path.resolve(APP_ROOT,rel);
  return null;
}
function coreSeed(){
  const seed={};for(const name of ['server.cjs','package.json','README.md','Integrationsvertrag.md','Start-HMI-Draft.ps1','Start-HMI-Draft.cmd','Start-Simple-AI-HMI-Editor.ps1','Start-Simple-AI-HMI-Editor.cmd'])if(fs.existsSync(path.join(APP_ROOT,name)))seed[name]=fs.readFileSync(path.join(APP_ROOT,name));
  for(const folder of ['lib','public','templates'])collect(path.join(APP_ROOT,folder),folder,seed);return seed;
}
function workspaceSeed(root){
  const seed={};for(const folder of ['baseline','project'])collect(path.join(root,folder),folder,seed);
  for(const name of ['hmi.html','data/draft.json','data/Kommentare_und_Aenderungen.md','workspace.json'])if(fs.existsSync(path.join(root,name)))seed[name]=fs.readFileSync(path.join(root,name));return seed;
}
function makeVirtualServer(core,workspace=null,options={}){
  const container=path.resolve(path.parse(APP_ROOT).root,'__simple_ai_hmi_editor_audit_virtual__'),app=path.join(container,'Simple-AI-HMI-Editor with spaces');
  const workspaceRelative=options.workspaceRelative||'workspaces/private-review',env={...(options.env||{})};if(workspace)env.HMI_EDITOR_WORKSPACE=workspaceRelative;
  const files=new Map(),dirs=new Set([container]),writes=[],reads=[],outsideAttempts=[],modules=new Map();
  function normalize(file){const target=path.resolve(String(file));if(!within(container,target)){outsideAttempts.push(target);throw Error('Virtual sandbox blocks external path: '+target);}return target;}
  function parents(file){let p=path.dirname(file);while(within(container,p)){dirs.add(p);if(p===container)break;p=path.dirname(p);}}
  function put(file,bytes,record=false){const target=normalize(file);parents(target);files.set(target,Buffer.isBuffer(bytes)?Buffer.from(bytes):Buffer.from(String(bytes)));if(record)writes.push(target);}
  for(const [name,bytes]of Object.entries(core))put(path.join(app,name),bytes);
  if(workspace)for(const [name,bytes]of Object.entries(workspace))put(path.join(app,workspaceRelative,name),bytes);
  function stat(file){const target=normalize(file);if(!files.has(target)&&!dirs.has(target))throw Error('ENOENT '+target);return {size:files.get(target)?.length||0,mtimeMs:1,isDirectory:()=>dirs.has(target),isFile:()=>files.has(target),isSymbolicLink:()=>false};}
  const fakeFs={
    existsSync(file){try{const p=normalize(file);return files.has(p)||dirs.has(p);}catch{return false;}},
    mkdirSync(file){const p=normalize(file);parents(p);dirs.add(p);},statSync:stat,lstatSync:stat,
    readFileSync(file,encoding){const p=normalize(file);reads.push(p);if(!files.has(p))throw Error('Virtual file not seeded: '+p);const value=files.get(p);return encoding?value.toString(typeof encoding==='string'?encoding:encoding.encoding):Buffer.from(value);},
    writeFileSync:(file,bytes)=>put(file,bytes,true),
    renameSync(from,to){const source=normalize(from);assert.ok(files.has(source));put(to,files.get(source),true);files.delete(source);},
    copyFileSync(from,to){const source=normalize(from);assert.ok(files.has(source),'Missing copy source '+source);put(to,files.get(source),true);},
    cpSync(from,to){const source=normalize(from),target=normalize(to);if(files.has(source))return put(target,files.get(source),true);for(const [file,bytes]of [...files])if(within(source,file))put(path.join(target,path.relative(source,file)),bytes,true);},
    readdirSync(directory,options){const root=normalize(directory),names=new Map();for(const name of [...dirs,...files.keys()])if(name!==root&&within(root,name)){const rel=path.relative(root,name),first=rel.split(path.sep)[0];if(first)names.set(first,path.join(root,first));}return [...names].map(([name,full])=>options?.withFileTypes?{name,isDirectory:()=>dirs.has(full),isFile:()=>files.has(full),isSymbolicLink:()=>false}:name);}
  };
  let handler,listener,captureCalls=0;
  const fakeHttp={createServer(callback){handler=callback;return {on(){return this;},listen(port,host,callback){listener={port,host};callback();}};}};
  const globals={Buffer,URL,structuredClone,console:{log(){},error(){}},process:{pid:3137,exitCode:0,env}};
  function requireFrom(from,name){
    if(name==='node:fs')return fakeFs;if(name==='node:path')return path;if(name==='node:crypto')return crypto;if(name==='node:http')return fakeHttp;
    if(path.isAbsolute(name)||name.startsWith('./')||name.startsWith('../')){
      let file=normalize(path.resolve(from,name));if(!path.extname(file))file+='.cjs';if(modules.has(file))return modules.get(file).exports;
      const module={exports:{}};modules.set(file,module);
      if(file.endsWith('.json'))module.exports=JSON.parse(fakeFs.readFileSync(file,'utf8'));
      else vm.runInNewContext(fakeFs.readFileSync(file,'utf8'),{...globals,__dirname:path.dirname(file),__filename:file,module,exports:module.exports,require:child=>requireFrom(path.dirname(file),child)},{filename:file});
      if(file.endsWith(path.join('project','adapter.cjs'))&&typeof module.exports.capture==='function'){const capture=module.exports.capture;module.exports={...module.exports,capture(...args){captureCalls++;return capture(...args);}};}return module.exports;
    }
    throw Error('Unexpected dependency '+name);
  }
  const source=fakeFs.readFileSync(path.join(app,'server.cjs'),'utf8');vm.runInNewContext(source,{...globals,__dirname:app,require:name=>requireFrom(app,name)},{filename:'audited-two-root-server.cjs'});
  const serverFile=[...files.keys()].find(file=>file.endsWith(path.join('data','server.json')));assert.ok(serverFile,'Server must record its own workspace PID record');const root=path.dirname(path.dirname(serverFile));
  async function request(route,body,headers={}){
    const encoded=body===undefined?'':typeof body==='string'?body:JSON.stringify(body),req={url:route,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:'+listener.port,...headers},async *[Symbol.asyncIterator](){if(encoded)yield Buffer.from(encoded);}};
    let finish,timer;const done=new Promise(resolve=>finish=resolve),res={headersSent:false,writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},end(bytes){const text=Buffer.isBuffer(bytes)?bytes.toString('utf8'):String(bytes);finish({status:this.status,headers:this.headers,text,json:()=>JSON.parse(text)});}};
    try{await handler(req,res);return await Promise.race([done,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Virtual HTTP response timed out '+route)),2000))]);}finally{clearTimeout(timer);}
  }
  return {app,root,container,files,writes,reads,outsideAttempts,listener,request,put,get captureCalls(){return captureCalls;},serverSha256:hash(source)};
}
function textAttributes(html,name){const stripped=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'');return [...stripped.matchAll(new RegExp('(?:\\s|<)'+name+'\\s*=\\s*(["\x27])(.*?)\\1','gi'))].map(m=>m[2]);}
function inspectArtifacts(workspace){
  const baseline=readJson(path.join(workspace,'baseline/manifest.json')),model=readJson(path.join(workspace,'data/draft.json')),original=fs.readFileSync(path.join(workspace,'baseline/hmi.html')),working=fs.readFileSync(path.join(workspace,'hmi.html'));
  check('Gesicherte Originalquelle entspricht ihrem Hash',()=>assert.equal(hash(fs.readFileSync(path.join(workspace,'baseline',path.basename(baseline.source)))),baseline.sourceSha256));
  check('Originalansicht entspricht ihrem Hash',()=>assert.equal(hash(original),baseline.htmlSha256));
  check('Maschinenentwurf bleibt ausdrücklich nicht freigegeben',()=>{assert.equal(model.approved,false);assert.equal(model.stage,'Entwurf');assert.equal(model.baseline.sourceSha256,baseline.sourceSha256);});
  const ids=textAttributes(working.toString(),'id');check('Keine doppelten statischen IDs in der Arbeitsansicht',()=>assert.equal(new Set(ids).size,ids.length));
  if(hash(working)!==baseline.htmlSha256&&model.actions.some(a=>/(^|\/)[a-z][a-z0-9-]*:\d+(\/|$)/i.test(a.key)))integrationReasons.push('Rohansicht geändert: positionsabhängige Gestaltungsschlüssel neu zuordnen.');
  if(JSON.stringify(textAttributes(original.toString(),'data-cmd').sort())!==JSON.stringify(textAttributes(working.toString(),'data-cmd').sort()))integrationReasons.push('Befehlsbindungen der Arbeitsansicht separat prüfen.');
  if(model.actions.some(a=>a.requiresBinding))integrationReasons.push('Neue/duplizierte Bedienelemente brauchen eine fachlich bestätigte Bindung.');
  const snapshots=[],exports=path.join(workspace,'exports');
  if(fs.existsSync(exports))for(const entry of fs.readdirSync(exports,{withFileTypes:true}).filter(e=>e.isDirectory())){
    const folder=path.join(exports,entry.name),meta=path.join(folder,'manifest.json');if(!fs.existsSync(meta))continue;
    const manifest=readJson(meta),draft=fs.readFileSync(path.join(folder,'draft.json'));
    check('Snapshot-Modelhash '+entry.name,()=>assert.equal(hash(draft),manifest.modelSha256));check('Snapshot-Ansichthash '+entry.name,()=>assert.equal(hash(fs.readFileSync(path.join(folder,'hmi.html'))),manifest.previewSha256));
    const fingerprints=manifest.editor?.files||manifest.editorFilesSha256||manifest.editorHashes;
    if(!fingerprints){warnings.push('Historischer Snapshot ohne Editorbindung: '+entry.name);snapshots.push({name:entry.name,replayPinned:false});continue;}
    for(const [relative,expected]of Object.entries(fingerprints)){
      const archived=['replay','replay/app','replay/workspace','editor'].map(prefix=>path.resolve(folder,prefix,relative)).find(file=>within(folder,file)&&fs.existsSync(file));
      if(archived)check('Archivierter Editor-/Adapterhash '+entry.name+' / '+relative,()=>assert.equal(hash(fs.readFileSync(archived)),expected));else warnings.push('Historischer Fingerprint nicht im Replay vorhanden: '+entry.name+' / '+relative);
    }
    snapshots.push({name:entry.name,replayPinned:true});
  }
  return {baseline,model,workingHash:hash(working),snapshots,protectedFiles:{'data/draft.json':hash(fs.readFileSync(path.join(workspace,'data/draft.json'))),'hmi.html':hash(working)}};
}
async function snapshotReplay(run,current,label){
  const snap=await run.request('/draft/snapshot',{});check(label+' · Snapshot erfolgreich',()=>assert.equal(snap.status,200,snap.text));
  const folder=path.join(run.root,'exports',snap.json().name),manifest=JSON.parse(run.files.get(path.join(folder,'manifest.json')).toString());
  check(label+' · Snapshot hat korrekte Daten-/Ansichthashes',()=>{assert.equal(hash(run.files.get(path.join(folder,'draft.json'))),manifest.modelSha256);assert.equal(hash(run.files.get(path.join(folder,'hmi.html'))),manifest.previewSha256);});
  check(label+' · Produkt/Version sind fixiert',()=>{assert.equal(manifest.editor.product,'Simple-AI-HMI-Editor');assert.ok(manifest.editor.version);});
  for(const [relative,expected]of Object.entries(manifest.editor.files)){
    const archived=['replay','replay/app','replay/workspace'].map(prefix=>path.join(folder,prefix,relative)).find(file=>run.files.has(file));check(label+' · Replayhash '+relative,()=>{assert.ok(archived,relative);assert.equal(hash(run.files.get(archived)),expected);});
  }
  const replay=path.join(folder,'replay'),flat={};for(const [file,bytes]of run.files)if(within(replay,file))flat[path.relative(replay,file)]=bytes;
  let core=flat,workspace=null,options={};
  if(flat[path.join('app','server.cjs')]){core={};workspace={};for(const [name,bytes]of Object.entries(flat)){if(name.startsWith('app'+path.sep))core[name.slice(4)]=bytes;else if(name.startsWith('workspace'+path.sep))workspace[name.slice(10)]=bytes;}options.workspaceRelative='workspaces/replay';}
  const restored=makeVirtualServer(core,workspace,options),result=(await restored.request('/draft/state')).json();
  check(label+' · Archiv startet ohne Elternprojekt',()=>assert.equal(restored.captureCalls,0));
  check(label+' · Archiv erhält Serial, Basis und Notizen',()=>{assert.equal(result.model.serial,current.model.serial);assert.equal(result.model.baseline.sourceSha256,current.model.baseline.sourceSha256);assert.deepEqual(result.model.comments,current.model.comments);});return manifest;
}
(async()=>{
  const core=coreSeed(),workspace=resolveReadOnlyWorkspace(),artifacts=workspace&&fs.existsSync(path.join(workspace,'baseline/manifest.json'))?inspectArtifacts(workspace):null;
  const demo=makeVirtualServer(core),demoState=(await demo.request('/draft/state')).json();
  check('Default-Demo startet vollständig ohne WF-Dateien',()=>{assert.equal(demoState.adapter.projectId,'Demo');assert.equal(demoState.model.name,'Demo');assert.equal(demo.root,path.join(demo.app,'workspaces/demo'));assert.equal(demo.captureCalls,1);assert.equal(demo.outsideAttempts.length,0);});
  check('Demo hat eine eigene stabile Workspace-ID',()=>assert.ok(demoState.model.workspaceId));
  check('Demo-Ansicht enthält keine private Anlagen-HMI',()=>assert.doesNotMatch(demo.files.get(path.join(demo.root,'hmi.html')).toString(),/Private-Customer-HMI|Plant-A/));
  check('Demo schreibt nur in ihren ignorierten Workspace',()=>assert.ok(demo.writes.every(file=>within(demo.root,file))));
  check('Server bindet ausschließlich Loopback',()=>{assert.equal(demo.listener.host,'127.0.0.1');assert.equal(demo.listener.port,8250);});
  const demoFixture={};for(const [file,bytes]of demo.files)if(within(demo.root,file)&&!file.endsWith(path.join('data','server.json')))demoFixture[path.relative(demo.root,file)]=bytes;
  const fixture=artifacts?workspaceSeed(workspace):demoFixture,isolated=makeVirtualServer(core,fixture,{workspaceRelative:'workspaces/Private review with spaces'}),state=(await isolated.request('/draft/state')).json();
  check('Expliziter Workspace benutzt vorhandene Baseline statt Neuimport',()=>{assert.equal(isolated.captureCalls,0);assert.notEqual(isolated.root,isolated.app);});
  check('Core-Assets liegen nicht im privaten ROOT',()=>assert.equal(isolated.files.has(path.join(isolated.root,'public/app.js')),false));
  for(const route of ['/','/app.js','/state-merge.js','/components.js','/app.css','/notes.css','/components.css','/hmi.html','/baseline.html']){const response=await isolated.request(route);check('Zwei-Root-Ressource '+route,()=>assert.equal(response.status,200,route));}
  for(const route of ['/server.cjs','/data/draft.json','/project/adapter.cjs','/workspaces/Private review with spaces/data/draft.json','/../../Plant/arduino_secrets.h']){const response=await isolated.request(route);check('Privater Dateipfad ist keine HTTP-Dateiroute '+route,()=>assert.equal(response.status,404));}
  const command=await isolated.request('/api/cmd','20261120,3137,1,100,start');check('Default-Testadapter führt keinen Maschinenbefehl aus',()=>{assert.equal(command.json().draftOnly,true);assert.equal(command.json().result,16);});
  const changed=copy(state.model);changed.approved=true;changed.stage='production';changed.comments.push({id:'virtual-audit-note',number:9999,page:changed.pages[0].id,text:'Virtueller Prüfeintrag; keine Nutzerdatenänderung.',replies:[],status:'offen'});
  changed.actions.push({id:'virtual-audit-component',type:'component',key:'component:virtual-audit',page:changed.pages[0].id,config:{schema:1,type:'button',label:'Virtuelles Element',behavior:'message'},requiresBinding:true});
  changed.actions.push({id:'virtual-audit-style',type:'state-style',key:'#virtual-indicator',recipe:{mode:'binary',valueSource:'manual',manualValue:'0',offColor:'#cc4249',onColor:'#16835e',target:'background'}});
  const saved=await isolated.request('/draft/save',{model:changed,etag:state.etag});check('Komponente/Zustandsstil und Notiz bleiben Entwurf',()=>{assert.equal(saved.status,200,saved.text);assert.equal(saved.json().model.actions.length,changed.actions.length);assert.equal(saved.json().model.comments.length,changed.comments.length);assert.equal(saved.json().model.approved,false);assert.equal(saved.json().model.stage,'Entwurf');});
  const current=saved.json(),stale=await isolated.request('/draft/save',{model:changed,etag:state.etag});check('409 schützt vor Überschreiben neuer Daten',()=>assert.equal(stale.status,409));
  const invalid=copy(current.model);invalid.version='../outside';const rejected=await isolated.request('/draft/save',{model:invalid,etag:current.etag});check('Ungültiger Snapshotpfad wird abgefangen',()=>assert.equal(rejected.status,400));
  check('Fehlgeschlagene Saves erhalten alle Arbeitsdaten',()=>assert.deepEqual(JSON.parse(isolated.files.get(path.join(isolated.root,'data/draft.json')).toString()),current.model));
  const foreign=await isolated.request('/draft/save',{model:changed,etag:current.etag},{origin:'https://unrelated.invalid'});check('Andere Origin kann nicht speichern',()=>assert.equal(foreign.status,403));
  const context=await isolated.request('/draft/context?command=hand');check('Kontext fehlt ehrlich oder ist als geprüfter Cache lesbar',()=>{assert.equal(context.status,200);const data=context.json();assert.equal(typeof data.available,'boolean');if(data.available)assert.ok(data.sourceVersion&&data.analyzedAt);});
  const unknown=await demo.request('/draft/context');check('Demo erfindet keinen WF-Programmkontext',()=>assert.equal(unknown.json().available,false));
  const manifest=await snapshotReplay(isolated,current,'Privater Zwei-Root-Workspace');
  for(const file of Object.keys(fixture).filter(file=>/^project[\\/](?:adapter|preview-controller|context-provider)\.cjs$/.test(file)||/^project[\\/]workspace-source\.json$/.test(file)))check('Snapshot enthält Workspace-Abhängigkeit '+file,()=>assert.ok(manifest.editor.files[file]||manifest.editor.files[file.replace(/\\/g,'/')],file));
  check('Saves/Snapshots schreiben nur in den privaten Workspace',()=>assert.ok(isolated.writes.every(file=>within(isolated.root,file))));
  check('Editorcode bleibt trotz privater Änderungen unverändert',()=>{for(const [file,bytes]of Object.entries(core))assert.equal(hash(isolated.files.get(path.join(isolated.app,file))),hash(bytes),file);});
  if(artifacts)check('Keine echte HMI oder Arbeitsdatei wurde geändert',()=>{for(const [file,expected]of Object.entries(artifacts.protectedFiles))assert.equal(hash(fs.readFileSync(path.join(workspace,file))),expected);});
  integrationReasons.push('App-Git-Autorisierung ist keine Freigabe einer WF-HMI-Implementierung.');
  const report={passed:true,at:new Date().toISOString(),node:process.version,checks:checks.length,scenarios:checks,warnings,appRoot:APP_ROOT,workspaceRoot:workspace,baseline:artifacts?.baseline||null,snapshots:artifacts?.snapshots||[],integrationGate:{ready:false,reasons:[...new Set(integrationReasons)]},serverSha256:isolated.serverSha256,network:false,gitOperations:false,controllerAccess:false,userDataWritten:false,scope:'Actual core/project modules in virtual two-root FS/HTTP; default demo without WF; actual artifacts only read.'};
  fs.writeFileSync(path.join(__dirname,'integration-audit-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,warnings:warnings.length,demoWithoutWF:true,network:false,userDataWritten:false}));
})().catch(error=>{fs.writeFileSync(path.join(__dirname,'integration-audit-results.json'),JSON.stringify({passed:false,at:new Date().toISOString(),checks:checks.length,scenarios:checks,error:error.stack,network:false,gitOperations:false,controllerAccess:false,userDataWritten:false},null,2));console.error(error.stack);process.exitCode=1;});
