const { app, BrowserWindow } = require('electron/main');
const isDev = require('electron-is-dev');
const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    },
  });
  const urlLocation = isDev
    ? 'http://localhost:3000'
    : `file://${__dirname}/index.html`;
  // win.loadFile('index.html');
  win.loadURL(urlLocation);
};

app.on('ready', () => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
