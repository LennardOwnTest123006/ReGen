/* Boots the real game inside Electron under a virtual display, watches for
 * renderer errors, and screenshots the result. Run via tools/check-electron.mjs. */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'build', 'shots');
fs.mkdirSync(shots, { recursive: true });
const problems = [];

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 720, show: true,
    backgroundColor: '#070a14',
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.js'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      backgroundThrottling: false, offscreen: false
    }
  });

  win.webContents.on('console-message', (e, level, message, line, source) => {
    if (level >= 2) problems.push(`console(${level}): ${message} @ ${source}:${line}`);
  });
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    problems.push(`did-fail-load ${code} ${desc} ${url}`);
  });
  win.webContents.on('preload-error', (e, p, err) => problems.push(`preload-error ${err.message}`));

  await win.loadFile(path.join(root, 'game', 'index.html'));
  await new Promise(r => setTimeout(r, 2500));

  const state = await win.webContents.executeJavaScript(`(function(){
    try {
      if (!window.RG || !RG.game) return { ok:false, why:'RG.game missing' };
      var fatal = document.getElementById('fatal');
      if (fatal && fatal.style.display === 'flex') {
        return { ok:false, why:'fatal overlay: ' + document.getElementById('fatal-detail').textContent };
      }
      RG.game.startGame(false);
      return { ok:true, state: RG.game.state, native: !!window.ReGenNative,
               nativePlatform: window.ReGenNative && window.ReGenNative.platform };
    } catch (e) { return { ok:false, why: e.message }; }
  })()`);

  if (!state.ok) problems.push('renderer: ' + state.why);
  if (!state.native) problems.push('preload bridge missing in the renderer');

  await new Promise(r => setTimeout(r, 2500));

  const after = await win.webContents.executeJavaScript(`(function(){
    RG.UI.closeAll();
    return { state: RG.game.state, world: RG.game.world.id,
             hp: RG.game.player.hp, frame: RG.game.frame,
             saved: !RG.Save.isMemoryOnly() };
  })()`);
  if (after.state !== 'play') problems.push('game did not reach play state (got ' + after.state + ')');
  if (after.frame < 60) problems.push('game loop advanced only ' + after.frame + ' frames');
  if (!after.saved) problems.push('localStorage is unavailable under file:// in Electron');

  await new Promise(r => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(shots, 'electron-window.png'), img.toPNG());

  if (problems.length) {
    console.log('ELECTRON SELFTEST FAILURES:');
    for (const p of problems) console.log('  - ' + p);
    app.exit(1);
  } else {
    console.log('Electron self-test passed: ' + JSON.stringify(after));
    app.exit(0);
  }
});

setTimeout(() => { console.log('ELECTRON SELFTEST TIMEOUT'); app.exit(2); }, 45000);
