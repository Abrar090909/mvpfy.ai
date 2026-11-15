import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { resolveTheme, THEME_BACKGROUND } from '../shared/types';
import * as path from 'node:path';
import { registerIpc } from './ipc';
import { installNavigationGuards } from './security';
import { notify } from './services/notify';
import { ensureDirs } from './paths';
import { setRunEventSink, stopAllRuns } from './services/runs';
import { sweepRunArtifacts } from './services/agents';
import { readState } from './services/store';
import { resolveUserEnvironment } from './services/shell';
import { initAutoUpdates } from './services/updates';
import { primeLocalDockerContext } from './services/docker';

/** App bootstrap: window lifecycle plus wiring of services to the renderer. */

// Before any window exists, so no webContents is ever created without it.
installNavigationGuards();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'mvpfy by feature1',
    // The canvas colour of the chosen theme, so the window does not open white
    // (or in the other theme) for the moment before the page has painted.
    backgroundColor:
      THEME_BACKGROUND[resolveTheme(readState().settings.theme, !nativeTheme.shouldUseDarkColors)],
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload needs nothing but `electron` (contextBridge, ipcRenderer).
      sandbox: true,
      // Needed for the embedded Preview/IDE panes (<webview> tags), which
      // installNavigationGuards locks down as they attach.
      webviewTag: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

app.whenReady().then(() => {
  // Started, not awaited: the window opens while the login shell answers, and
  // every IPC handler waits for it (see registerIpc) before spawning anything.
  const environment = resolveUserEnvironment()
    .then(primeLocalDockerContext)
    .catch(() => undefined);
  ensureDirs();
  readState(); // seeds the linked-workspace allowlist before any IPC arrives
  sweepRunArtifacts(); // clears per-run scratch (incl. tokens) a crash left behind
  setRunEventSink({
    output: (ev) => sendToRenderer('run-output', ev),
    exit: (ev) => sendToRenderer('run-exit', ev),
  });
  registerIpc(environment);
  // Registered here rather than in ipc.ts: a notification needs the window, to
  // stay quiet while it is focused and to come back when the toast is clicked.
  ipcMain.handle('notify', (_ev, notice: { title: string; body: string }) =>
    notify(mainWindow, notice)
  );
  initAutoUpdates((status) => sendToRenderer('update-status', status));
  // Brand the dock in dev; packaged builds use build/icon.icns.
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(path.join(app.getAppPath(), 'assets', 'icon.png'));
    } catch {
      // Non-fatal: fall back to the default Electron icon.
    }
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopAllRuns();
  if (process.platform !== 'darwin') app.quit();
});

// Cmd+Q, the Dock's Quit and an update's quitAndInstall all end the app
// without window-all-closed firing, which left agents — running with their
// permission checks off — still editing repos with nobody watching.
app.on('before-quit', () => stopAllRuns());
