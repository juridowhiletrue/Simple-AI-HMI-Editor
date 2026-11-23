'use strict';
// Portable core suite: synthetic data only; never auto-selects a private workspace.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const suites=[['check.cjs',['--self-test']],['check.cjs',[]],['state-merge.cjs',[]],['source-keys.cjs',[]],['components.cjs',[]],['state-styles.cjs',[]],['project-import.cjs',[]],['automation-demo.cjs',[]]];
if(fs.existsSync(path.join(__dirname,'element-navigator.cjs')))suites.push(['element-navigator.cjs',[]]);
if(process.platform==='win32')suites.push(['startup-capture.cjs',[]]);
const failed=[];
for(const [file,args] of suites){
  const result=spawnSync(process.execPath,[path.join(__dirname,file),...args],{cwd:ROOT,stdio:'inherit',windowsHide:true,timeout:120000});
  if(result.error||result.status!==0){failed.push(file);if(result.error)console.error(file+': '+result.error.message);}
}
console.log(JSON.stringify({passed:failed.length===0,suites:suites.length,failed,scope:'portable-editor-core',privateWorkspaceSelected:false}));
process.exitCode=failed.length?1:0;
