const { autoUpdater } = require('electron-updater');
const {
  githubUpdateProvider,
  isUpdateEnabledForPlatform,
  updateChannel,
} = require('./updateConfig');

const APP_UPDATE_STATE_CHANNEL = 'app-update-state';

const createInitialState = ({ app, platform, enabled }) => ({
  enabled,
  platform,
  status: enabled ? 'idle' : 'disabled',
  currentVersion: app.getVersion(),
  version: null,
  percent: 0,
  error: null,
});

const normalizeUpdateInfo = (info) => ({
  version: typeof info?.version === 'string' ? info.version : null,
});

const resolveIsDev = ({ app, dev }) => {
  if (typeof dev === 'boolean') return dev;
  if (app) return !app.isPackaged;
  return process.env.NODE_ENV === 'development';
};

const createUpdateService = ({
  app,
  BrowserWindow,
  updater = autoUpdater,
  platform = process.platform,
  dev,
  config = {},
} = {}) => {
  const isDev = resolveIsDev({ app, dev });
  const enabled =
    !isDev &&
    (typeof config.enabled === 'boolean'
      ? config.enabled
      : isUpdateEnabledForPlatform(platform));
  let state = createInitialState({ app, platform, enabled });
  let checkingStarted = false;
  let downloading = false;

  const setState = (patch) => {
    state = { ...state, ...patch };
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(APP_UPDATE_STATE_CHANNEL, state);
    });
    return state;
  };

  const configureUpdater = () => {
    if (!enabled) return;
    const provider = config.provider || githubUpdateProvider;
    const channel = config.channel || provider.channel || updateChannel;

    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.channel = channel;
    updater.setFeedURL({ ...provider, channel });
  };

  const startChecking = () => {
    if (!enabled || checkingStarted) return state;
    checkingStarted = true;

    const recordError = (error) => {
      setState({
        status: 'error',
        error: error?.message || String(error),
      });
    };

    try {
      configureUpdater();
      setState({ status: 'checking', error: null });
      Promise.resolve(updater.checkForUpdates()).catch(recordError);
    } catch (error) {
      recordError(error);
    }

    return state;
  };

  const downloadUpdate = async () => {
    if (!enabled) return state;
    if (downloading) return state;
    if (state.status !== 'available' && state.status !== 'error') return state;
    downloading = true;
    setState({ status: 'downloading', percent: 0, error: null });
    try {
      await updater.downloadUpdate();
    } catch (error) {
      downloading = false;
      setState({
        status: 'available',
        error: error?.message || String(error),
      });
    }
    return state;
  };

  const installNow = () => {
    if (!enabled || state.status !== 'downloaded') return state;
    updater.quitAndInstall(false, true);
    return state;
  };

  const getState = () => state;

  updater.on('checking-for-update', () => {
    setState({ status: 'checking', error: null });
  });

  updater.on('update-available', (info) => {
    const updateInfo = normalizeUpdateInfo(info);
    setState({
      status: 'available',
      version: updateInfo.version,
      percent: 0,
      error: null,
    });
  });

  updater.on('update-not-available', () => {
    setState({ status: 'not-available', version: null, percent: 0, error: null });
  });

  updater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
      error: null,
    });
  });

  updater.on('update-downloaded', (info) => {
    downloading = false;
    const updateInfo = normalizeUpdateInfo(info);
    setState({
      status: 'downloaded',
      version: updateInfo.version || state.version,
      percent: 100,
      error: null,
    });
  });

  updater.on('error', (error) => {
    downloading = false;
    const nextStatus =
      state.status === 'downloading' || state.version ? 'available' : 'error';
    setState({
      status: nextStatus,
      error: error?.message || String(error),
    });
  });

  return {
    startChecking,
    downloadUpdate,
    installNow,
    getState,
  };
};

const registerUpdateIpcHandlers = ({ ipcMain, updateService }) => {
  ipcMain.handle('get-app-update-state', async () => updateService.getState());
  ipcMain.handle('download-app-update', async () => updateService.downloadUpdate());
  ipcMain.handle('install-app-update-now', async () => updateService.installNow());
};

module.exports = {
  APP_UPDATE_STATE_CHANNEL,
  createUpdateService,
  registerUpdateIpcHandlers,
};
