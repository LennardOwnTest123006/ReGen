/* ReGen - Electron main process.
 *
 * Deliberately minimal: one window, no node access in the page, no remote
 * content. The renderer is the same static build that runs on the web and
 * inside the Android WebView, so all three platforms run identical game
 * code and only the shell differs. */
'use strict';
const { app, BrowserWindow, shell, screen, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const GAME_INDEX = path.join(__dirname, '..', 'game', 'index.html');
const isDev = !app.isPackaged;
let win = null;

/* Window geometry is remembered between sessions. */
function stateFile() { return path.join(app.getPath('userData'), 'window-state.json'); }

function loadState() {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8');
    const s = JSON.parse(raw);
    if (typeof s.width === 'number' && typeof s.height === 'number') return s;
  } catch (e) { /* first run, or an unreadable file: fall back to defaults */ }
  return null;
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({
      x: b.x, y: b.y, width: b.width, height: b.height,
      maximized: win.isMaximized(), fullscreen: win.isFullScreen()
    }));
  } catch (e) { /* losing window position is not worth surfacing */ }
}

/* A window that fits the display, never larger than the work area. */
function defaultBounds() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1440, Math.max(960, Math.round(area.width * 0.82)));
  const height = Math.min(880, Math.max(560, Math.round(width * 9 / 16)));
  return { width, height };
}

function createWindow() {
  const saved = loadState();
  const def = defaultBounds();

  win = new BrowserWindow({
    width: saved ? saved.width : def.width,
    height: saved ? saved.height : def.height,
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    minWidth: 720,
    minHeight: 420,
    title: 'ReGen',
    backgroundColor: '#070a14',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'brand', 'out', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
      devTools: isDev
    }
  });

  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => {
    if (saved && saved.fullscreen) win.setFullScreen(true);
    else if (saved && saved.maximized) win.maximize();
    win.show();
    win.focus();
  });

  win.on('close', saveState);
  win.on('closed', () => { win = null; });

  /* Keep the app sealed: links open in the user's browser, nothing
   * navigates the game window away from the local build. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12' && isDev) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.webContents.on('render-process-gone', (e, details) => {
    console.error('[ReGen] renderer gone:', details.reason);
    if (details.reason !== 'clean-exit') win.reload();
  });

  win.loadFile(GAME_INDEX);
}

/* Only one copy of the game may run; a second launch focuses the first. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
