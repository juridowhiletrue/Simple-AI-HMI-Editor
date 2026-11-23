'use strict';
const path=require('node:path');
const fs=require('node:fs');
const appRoot=path.resolve(__dirname,'..');
const workspaceRoot=require('./workspace.cjs').resolveWorkspace(appRoot);
let workspaceId=null;
try{workspaceId=JSON.parse(fs.readFileSync(path.join(workspaceRoot,'workspace.json'),'utf8')).id||null;}catch{}
function startBackgroundServer() {
  const log = name => path.join(workspaceRoot, 'data', 'server.' + name + '.txt');
  const handles = [];
  try {
    handles.push(fs.openSync(log('stdout'), 'w'));
    handles.push(fs.openSync(log('stderr'), 'w'));
    // Only the two workspace logs reach the server. The caller can collect its JSON and exit.
    const child = require('node:child_process').spawn(process.execPath, [path.join(appRoot, 'server.cjs')], {
      cwd: appRoot, windowsHide: true, detached: true, stdio: ['ignore', handles[0], handles[1]]
    });
    child.once('error', error => { console.error(error.message); process.exitCode = 1; });
    child.unref();
  } finally {
    for (const descriptor of handles) fs.closeSync(descriptor);
  }
}
if (require.main === module) {
  if (process.argv[2] === '--start-server') startBackgroundServer();
  else console.log(JSON.stringify({appRoot,workspaceRoot,workspaceId,product:'Simple-AI-HMI-Editor'}));
}
module.exports={appRoot,workspaceRoot,workspaceId};
