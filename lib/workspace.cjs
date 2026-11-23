'use strict';
const fs=require('node:fs');
const path=require('node:path');
function resolveWorkspace(appRoot){
  const localConfig=path.join(appRoot,'.editor-local.json');
  let configured=null;
  if(fs.existsSync(localConfig))configured=JSON.parse(fs.readFileSync(localConfig,'utf8')).workspace;
  const requested=process.env.HMI_EDITOR_WORKSPACE||configured;
  if(requested){
    const location=path.resolve(appRoot,requested);
    if(!fs.existsSync(path.join(location,'project/adapter.cjs')))throw Error('Der gewählte Arbeitsbereich hat noch keinen Projektadapter: '+location);
    return location;
  }
  // Temporary compatibility for the original staging layout; no parent-project import.
  if(fs.existsSync(path.join(appRoot,'project/adapter.cjs')))return appRoot;
  const demo=path.join(appRoot,'workspaces/demo');
  fs.mkdirSync(path.join(demo,'project'),{recursive:true});
  for(const file of ['adapter.cjs','Demo-HMI.html','preview-controller.cjs'])fs.copyFileSync(path.join(appRoot,'templates/demo',file),path.join(demo,'project',file));
  return demo;
}
module.exports={resolveWorkspace};
