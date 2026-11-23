'use strict';
// Syntax only. Never executes app modules or opens/copies a workspace.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const ROOTS=new Set(['public','lib','qa','templates','tools']);
const SKIP=new Set(['.git','.local','node_modules','workspaces','project','baseline','data','history','exports','output','build','dist','tmp','results','artifacts','screenshots','replay','quarantine']);
const isCode=name=>/\.(?:cjs|mjs|js)$/i.test(name)&&!/(?:^|[-_])results?(?:[-_.]|$)/i.test(name);
function collectJavaScript(appRoot,fileSystem=fs){
  const result=[];
  function walk(dir,relative=''){
    const entries=fileSystem.readdirSync(dir,{withFileTypes:true});
    for(const entry of entries){
      if(entry.isSymbolicLink())continue;
      const rel=relative?relative+'/'+entry.name:entry.name;
      if(entry.isDirectory()){
        const name=entry.name.toLowerCase();
        if((SKIP.has(name)&&!(name==='project'&&relative.startsWith('templates/')))||entry.name.startsWith('.'))continue;
        if(!relative&&!ROOTS.has(entry.name))continue;
        // A project directory in a versioned generic template is intentional.
        if(entry.name==='project'&&!relative.startsWith('templates/'))continue;
        walk(path.join(dir,entry.name),rel);
      }else if(entry.isFile()&&isCode(entry.name))result.push(rel);
    }
  }
  walk(path.resolve(appRoot));return result.sort();
}
function checkSyntax(appRoot,runner=spawnSync){
  const files=collectJavaScript(appRoot),failures=[];
  for(const relative of files){
    const result=runner(process.execPath,['--check',path.join(appRoot,...relative.split('/'))],{cwd:appRoot,encoding:'utf8',windowsHide:true,timeout:15000});
    if(result.error||result.status!==0)failures.push({file:relative,error:result.error?.message||result.stderr||result.stdout||'Syntaxprüfung nicht abgeschlossen.'});
  }
  return {passed:failures.length===0,files,failures};
}
function selfTest(){
  const tree={
    '':['server.cjs','scratch-results.js','package.json','public/','lib/','qa/','templates/','tools/','workspaces/','node_modules/','project/','baseline/','.local/','linked@'],
    'public':['app.js','style.css','module.mjs'],
    'lib':['helper.cjs'],
    'qa':['test.cjs','test-results.json','test-results.cjs','results/','artifacts/','.scratch/'],
    'templates':['demo/'],
    'templates/demo':['adapter.cjs','project/'],
    'templates/demo/project':['example.cjs'],
    'tools':['codex-workspace.cjs']
  };
  const fixtureRoot=path.resolve(ROOT,'qa-virtual-root');
  const mock={readdirSync(dir){
    const key=path.relative(fixtureRoot,dir).replace(/\\/g,'/');
    assert.ok(Object.hasOwn(tree,key),'Ein privates Verzeichnis wurde betreten: '+key);
    return tree[key].map(value=>({name:value.replace(/[/@]$/,''),isDirectory:()=>value.endsWith('/'),isFile:()=>!value.endsWith('/')&&!value.endsWith('@'),isSymbolicLink:()=>value.endsWith('@')}));
  }};
  const files=collectJavaScript(fixtureRoot,mock);
  assert.deepEqual(files,['lib/helper.cjs','public/app.js','public/module.mjs','qa/test.cjs','server.cjs','templates/demo/adapter.cjs','templates/demo/project/example.cjs','tools/codex-workspace.cjs']);
  console.log(JSON.stringify({passed:true,scope:'syntax-file-selection',selected:files.length,privateDirectoriesRead:false}));
}
if(require.main===module){
  try{
    if(process.argv.includes('--self-test'))selfTest();
    else{
      const args=process.argv.slice(2),position=args.indexOf('--app-root');
      if(position>=0&&!args[position+1])throw Error('--app-root benötigt einen Ordner.');
      const appRoot=position<0?ROOT:path.resolve(args[position+1]);
      const report=checkSyntax(appRoot);
      for(const failure of report.failures)console.error(failure.file+'\n'+failure.error.trim());
      console.log(JSON.stringify({passed:report.passed,checked:report.files.length,scope:'generic-javascript-syntax-only',workspacesRead:false}));
      process.exitCode=report.passed?0:1;
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={collectJavaScript,checkSyntax};
