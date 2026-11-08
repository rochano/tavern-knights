// Desktop / Steam build. Serves www/ through an app:// protocol so fetch() of
// sfx/audio works exactly like on the website (file:// would block it).
const { app, BrowserWindow, protocol, net, Menu, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WWW = path.join(__dirname, '..', 'www');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 450,
    backgroundColor: '#000000',
    fullscreen: !process.argv.includes('--windowed'),
    autoHideMenuBar: true,
    title: 'Tavern Knights',
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadURL('app://game/index.html' + (process.env.TK_LANG ? '?lang=' + process.env.TK_LANG : ''));

  // F11 / Alt+Enter toggle fullscreen, F12 devtools in dev only
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
    if (input.key === 'F12' && !app.isPackaged) win.webContents.toggleDevTools();
  });
  // Links (e.g. the about page) open in the user's browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); shell.openExternal(url); }
  });
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(WWW, decodeURIComponent(pathname)));
    if (!file.startsWith(WWW)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
