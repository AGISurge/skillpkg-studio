const { autoUpdater } = require('electron-updater');
const {
  githubUpdateProvider,
  isUpdateEnabledForPlatform,
  updateChannel,
} = require('./updateConfig');

const APP_UPDATE_STATE_CHANNEL = 'app-update-state';

const normalizeSource = (source, fallback = 'automatic') =>
  source === 'manual' || source === 'automatic' ? source : fallback;

const createInitialState = ({ app, platform, enabled }) => ({
  enabled,
  platform,
  status: enabled ? 'idle' : 'disabled',
  source: 'automatic',
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
  let initialCheckStarted = false;
  let checking = false;
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

  const checkForUpdates = async ({ source = 'manual' } = {}) => {
    const nextSource = normalizeSource(source, state.source);
    if (!enabled) return state;
    if (checking) {
      if (nextSource === 'manual' && state.source !== 'manual') {
        return setState({ source: 'manual' });
      }
      return state;
    }
    if (downloading || state.status === 'downloaded') return state;
    checking = true;
    const recordError = (error) => {
      checking = false;
      setState({
        status: 'error',
        source: state.source === 'manual' ? 'manual' : nextSource,
        error: error?.message || String(error),
      });
    };

    try {
      configureUpdater();
      setState({
        status: 'checking',
        source: nextSource,
        version: null,
        percent: 0,
        error: null,
      });
      await updater.checkForUpdates();
    } catch (error) {
      recordError(error);
    } finally {
      checking = false;
    }

    return state;
  };

  const startChecking = () => {
    if (!enabled || initialCheckStarted) return state;
    initialCheckStarted = true;
    void checkForUpdates({ source: 'automatic' });
    return state;
  };

  const downloadUpdate = async ({ source } = {}) => {
    if (!enabled) return state;
    if (downloading) return state;
    if (state.status !== 'available') return state;
    downloading = true;
    setState({
      status: 'downloading',
      source: normalizeSource(source, state.source),
      percent: 0,
      error: null,
    });
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
    checking = false;
    const updateInfo = normalizeUpdateInfo(info);
    setState({
      status: 'available',
      version: updateInfo.version,
      percent: 0,
      error: null,
    });
  });

  updater.on('update-not-available', () => {
    checking = false;
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
    checking = false;
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
    checkForUpdates,
    downloadUpdate,
    installNow,
    getState,
  };
};

const registerUpdateIpcHandlers = ({ ipcMain, updateService }) => {
  ipcMain.handle('get-app-update-state', async () => updateService.getState());
  ipcMain.handle('check-app-update', async (_event, options) =>
    updateService.checkForUpdates(options));
  ipcMain.handle('download-app-update', async (_event, options) =>
    updateService.downloadUpdate(options));
  ipcMain.handle('install-app-update-now', async () => updateService.installNow());
};

module.exports = {
  APP_UPDATE_STATE_CHANNEL,
  createUpdateService,
  registerUpdateIpcHandlers,
};
