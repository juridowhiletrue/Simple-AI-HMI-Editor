'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const app = path.resolve(__dirname, '..');

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function capturedStart(workspace, port) {
  return new Promise((resolve, reject) => {
    const args = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      '& $env:HMI_QA_WORKER -NoLogo -NoProfile -ExecutionPolicy Bypass -File $env:HMI_QA_STARTER -NoBrowser | Out-String; exit $LASTEXITCODE'];
    const launcher = spawn('powershell.exe', args, {
      windowsHide: true, cwd: app, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HMI_EDITOR_WORKSPACE: workspace, HMI_DRAFT_PORT: String(port),
        HMI_QA_WORKER: 'powershell.exe', HMI_QA_STARTER: path.join(app, 'Start-Simple-AI-HMI-Editor.ps1') }
    });
    let output = '', errors = '';
    launcher.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    launcher.stderr.setEncoding('utf8').on('data', chunk => { errors += chunk; });
    const timeout = setTimeout(() => {
      launcher.stdout.destroy();
      launcher.stderr.destroy();
      launcher.kill();
      reject(new Error('Der Starter hat seine Ausgabepipe nach 15 Sekunden noch nicht geschlossen.'));
    }, 15000);
    launcher.once('error', error => { clearTimeout(timeout); reject(error); });
    launcher.once('close', code => {
      clearTimeout(timeout);
      try {
        assert.equal(code, 0, errors);
        resolve(JSON.parse(output));
      } catch (error) { reject(error); }
    });
  });
}

async function run() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-ai-hmi-start-'));
  const port = await freePort();
  const url = 'http://127.0.0.1:' + port + '/';
  const pidFile = path.join(workspace, 'data/server.json');
  try {
    fs.cpSync(path.join(app, 'templates/demo'), path.join(workspace, 'project'), { recursive: true });
    const cold = await capturedStart(workspace, port);
    assert.equal(cold.workspaceRoot, workspace);
    assert.equal(cold.reusedServer, false);
    assert.equal(cold.url, url);
    const record = JSON.parse(fs.readFileSync(pidFile));
    for (const stream of ['stdout', 'stderr']) {
      assert(fs.statSync(path.join(workspace, 'data', 'server.' + stream + '.txt')).isFile());
    }
    const warm = await capturedStart(workspace, port);
    assert.equal(warm.reusedServer, true);
    assert.equal(warm.workspaceRoot, workspace);
    assert.equal(JSON.parse(fs.readFileSync(pidFile)).pid, record.pid);
    console.log('Windows-Kaltstart: Ausgabepipe geschlossen, identischer Server beim Wiederaufruf.');
  } finally {
    if (fs.existsSync(pidFile)) {
      const record = JSON.parse(fs.readFileSync(pidFile));
      const response = await fetch(url + 'draft/state', { signal: AbortSignal.timeout(3000) });
      const state = await response.json();
      assert.equal(record.workspaceRoot, workspace);
      assert.equal(record.url, url);
      assert.equal(state.runtime.workspaceRoot, workspace);
      assert.equal(state.runtime.appRoot, app);
      process.kill(record.pid);
      for (let i = 0; i < 40; i++) {
        try { process.kill(record.pid, 0); } catch { break; }
        await delay(50);
      }
    }
    assert.equal(path.dirname(workspace), os.tmpdir());
    assert.match(path.basename(workspace), /^simple-ai-hmi-start-[A-Za-z0-9]+$/);
    fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
if (process.platform === 'win32') run().catch(error => { console.error(error); process.exitCode = 1; });
