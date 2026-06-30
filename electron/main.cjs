const { app, BrowserWindow, ipcMain, screen, globalShortcut, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

const STORE_PATH = path.join(app.getPath('userData'), 'mera_note_store.json');

// Cap the stored note so a compromised renderer can't exhaust the disk.
const MAX_NOTE_BYTES = 1_000_000; // ~1 MB of text

// Content-Security-Policy. Production is fully locked to local resources
// (no remote origins). Dev additionally permits the Vite dev server and its
// HMR websocket, and the eval/inline that the React refresh runtime needs.
function contentSecurityPolicy() {
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self' ws://localhost:5173 http://localhost:5173",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-src 'none'",
    ].join('; ');
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Inline styles only: the UI sets element style attributes / CSS vars.
    // This does NOT permit inline scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
    "form-action 'none'",
  ].join('; ');
}

function applySecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy()],
      },
    });
  });
}

function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: 350,
    height: 350,
    x: width - 400,
    y: 100,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Block in-page navigation to any external origin, and refuse to open new
  // windows. The app only ever runs its own local/dev content.
  const allowedOrigin = isDev ? 'http://localhost:5173' : null;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!allowedOrigin || !url.startsWith(allowedOrigin)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Send genuine external links to the user's browser rather than an
    // in-app Electron window; deny the navigation either way.
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Load saved state if any
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
      if (data.bounds) {
        mainWindow.setBounds(data.bounds);
      }
    }
  } catch (err) {
    console.error('Failed to load window bounds:', err);
  }

  mainWindow.on('close', () => {
    // Save window state
    try {
      let data = {};
      if (fs.existsSync(STORE_PATH)) {
        data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
      }
      data.bounds = mainWindow.getBounds();
      fs.writeFileSync(STORE_PATH, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save window state', e);
    }
  });

  // Keep window always on top in all workspaces
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

app.whenReady().then(() => {
  applySecurityPolicy();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  setupGlobalShortcut();
  setupIPC();
});

// Setup Global Shortcut
function setupGlobalShortcut() {
  // We had to switch from Double ESC to a standard global shortcut 
  // because the native keylogger library caused the PC to slow down and the app to crash.
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true);
        mainWindow.focus();
      }
    }
  });
}

// Only accept IPC from our own window's main frame. Rejects messages from
// any unexpected sender (e.g. a subframe or a stray webContents).
function isTrustedSender(event) {
  return (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents
  );
}

// Coerce/validate an untrusted note payload before it touches disk.
function sanitizeNote(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  let text = typeof p.text === 'string' ? p.text : '';
  if (Buffer.byteLength(text, 'utf-8') > MAX_NOTE_BYTES) {
    text = Buffer.from(text, 'utf-8').subarray(0, MAX_NOTE_BYTES).toString('utf-8');
  }
  return {
    text,
    color: typeof p.color === 'string' ? p.color.slice(0, 64) : '#fff4e6',
    textColor: typeof p.textColor === 'string' ? p.textColor.slice(0, 64) : '#333333',
    fontSize:
      Number.isFinite(p.fontSize) ? Math.min(Math.max(p.fontSize, 10), 72) : 16,
  };
}

function setupIPC() {
  ipcMain.handle('load-note', (event) => {
    if (!isTrustedSender(event)) return { text: '', color: '#fff4e6', textColor: '#333333', fontSize: 16 };
    try {
      if (fs.existsSync(STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
        return {
          text: data.text || '',
          color: data.color || '#fff4e6',
          textColor: data.textColor || '#333333',
          fontSize: data.fontSize || 16
        };
      }
    } catch (err) {
      console.error('Failed to load note data:', err);
    }
    return { text: '', color: '#fff4e6', textColor: '#333333', fontSize: 16 };
  });

  ipcMain.on('save-note', (event, payload) => {
    if (!isTrustedSender(event)) return;
    const note = sanitizeNote(payload);
    try {
      let data = {};
      if (fs.existsSync(STORE_PATH)) {
        data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
      }
      data.text = note.text;
      data.color = note.color;
      data.textColor = note.textColor;
      data.fontSize = note.fontSize;
      fs.writeFileSync(STORE_PATH, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save note data:', e);
    }
  });

  ipcMain.on('close-app', (event) => {
    if (!isTrustedSender(event)) return;
    if (mainWindow) {
      mainWindow.hide();
    }
  });

  ipcMain.on('move-window', (event, payload) => {
    if (!isTrustedSender(event)) return;
    const dx = payload && Number.isFinite(payload.dx) ? payload.dx : 0;
    const dy = payload && Number.isFinite(payload.dy) ? payload.dy : 0;
    if (mainWindow && (dx !== 0 || dy !== 0)) {
      const [x, y] = mainWindow.getPosition();
      mainWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
