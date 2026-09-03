const EventEmitter = require('events');

jest.mock('electron-updater', () => ({
  autoUpdater: new (require('events'))(),
}));

const { createUpdateService } = require('../../electron/updateService');

const createFakeUpdater = () => {
  const updater = new EventEmitter();
  updater.setFeedURL = jest.fn();
  updater.checkForUpdates = jest.fn(async () => undefined);
  updater.downloadUpdate = jest.fn(async () => undefined);
  updater.quitAndInstall = jest.fn();
  return updater;
};

const createService = (options = {}) => {
  const updater = options.updater || createFakeUpdater();
  const send = jest.fn();
  const service = createUpdateService({
    app: { getVersion: () => '0.1.0', isPackaged: true },
    BrowserWindow: {
      getAllWindows: () => [{ webContents: { send } }],
    },
    updater,
    dev: false,
    platform: options.platform || 'darwin',
    config: {
      provider: {
        provider: 'github',
        owner: 'ExampleOrg',
        repo: 'example-app',
        private: false,
      },
      channel: 'latest',
      ...options.config,
    },
  });
  return { service, updater, send };
};

test('enables updates on linux by default', () => {
  const { service, updater } = createService({ platform: 'linux' });

  expect(service.getState()).toEqual(expect.objectContaining({
    enabled: true,
    status: 'idle',
    source: 'automatic',
  }));

  service.startChecking();

  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

test('uses app.isPackaged to disable updates in development by default', () => {
  const updater = createFakeUpdater();
  const service = createUpdateService({
    app: { getVersion: () => '0.1.0', isPackaged: false },
    BrowserWindow: {
      getAllWindows: () => [],
    },
    updater,
    platform: 'darwin',
    config: {
      provider: {
        provider: 'github',
        owner: 'ExampleOrg',
        repo: 'example-app',
        private: false,
      },
      channel: 'latest',
    },
  });

  expect(service.getState()).toEqual(expect.objectContaining({
    enabled: false,
    status: 'disabled',
  }));

  service.startChecking();

  expect(updater.checkForUpdates).not.toHaveBeenCalled();
});

test('keeps update setup errors inside update state', () => {
  const updater = createFakeUpdater();
  updater.setFeedURL.mockImplementation(() => {
    throw new Error('bad feed');
  });
  const { service } = createService({ updater, platform: 'darwin' });

  expect(() => service.startChecking()).not.toThrow();
  expect(service.getState()).toEqual(expect.objectContaining({
    enabled: true,
    status: 'error',
    error: 'bad feed',
  }));
});

test('keeps synchronous update check errors inside update state', () => {
  const updater = createFakeUpdater();
  updater.checkForUpdates.mockImplementation(() => {
    throw new Error('check failed');
  });
  const { service } = createService({ updater, platform: 'darwin' });

  expect(() => service.startChecking()).not.toThrow();
  expect(service.getState()).toEqual(expect.objectContaining({
    enabled: true,
    status: 'error',
    error: 'check failed',
  }));
});

test('allows a manual retry after an update check error', async () => {
  const updater = createFakeUpdater();
  updater.checkForUpdates
    .mockRejectedValueOnce(new Error('check failed'))
    .mockResolvedValueOnce(undefined);
  const { service } = createService({ updater, platform: 'darwin' });

  await service.checkForUpdates({ source: 'manual' });
  expect(service.getState()).toEqual(expect.objectContaining({
    status: 'error',
    source: 'manual',
  }));

  await service.checkForUpdates({ source: 'manual' });
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  expect(service.getState()).toEqual(expect.objectContaining({
    status: 'checking',
    source: 'manual',
  }));
});

test('records available update version on supported platforms', () => {
  const { service, updater } = createService({ platform: 'darwin' });

  service.startChecking();
  updater.emit('update-available', { version: '0.2.0' });

  expect(updater.setFeedURL).toHaveBeenCalledWith({
    provider: 'github',
    owner: 'ExampleOrg',
    repo: 'example-app',
    private: false,
    channel: 'latest',
  });
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(service.getState()).toEqual(expect.objectContaining({
    enabled: true,
    status: 'available',
    source: 'automatic',
    version: '0.2.0',
  }));
});

test('runs the automatic startup check only once', () => {
  const { service, updater } = createService({ platform: 'darwin' });

  service.startChecking();
  service.startChecking();

  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

test('allows repeated manual checks after no update is available', async () => {
  const { service, updater } = createService({ platform: 'darwin' });

  await service.checkForUpdates({ source: 'manual' });
  updater.emit('update-not-available');
  await service.checkForUpdates({ source: 'manual' });

  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  expect(service.getState()).toEqual(expect.objectContaining({
    status: 'checking',
    source: 'manual',
  }));
});

test('ignores concurrent manual update checks', async () => {
  let resolveCheck;
  const updater = createFakeUpdater();
  updater.checkForUpdates.mockImplementation(() => new Promise((resolve) => {
    resolveCheck = resolve;
  }));
  const { service } = createService({ updater, platform: 'darwin' });

  const firstCheck = service.checkForUpdates({ source: 'manual' });
  const secondCheck = service.checkForUpdates({ source: 'manual' });

  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  resolveCheck();
  await Promise.all([firstCheck, secondCheck]);
});

test('switches an in-flight automatic check to manual interaction mode', async () => {
  let resolveCheck;
  const updater = createFakeUpdater();
  updater.checkForUpdates.mockImplementation(() => new Promise((resolve) => {
    resolveCheck = resolve;
  }));
  const { service } = createService({ updater, platform: 'darwin' });

  service.startChecking();
  const state = await service.checkForUpdates({ source: 'manual' });

  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(state.source).toBe('manual');
  resolveCheck();
});

test('downloads available update and marks it downloaded', async () => {
  const { service, updater } = createService({ platform: 'win32' });

  updater.emit('update-available', { version: '0.2.0' });
  await service.downloadUpdate({ source: 'manual' });
  updater.emit('update-downloaded', { version: '0.2.0' });

  expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  expect(service.getState()).toEqual(expect.objectContaining({
    status: 'downloaded',
    source: 'manual',
    version: '0.2.0',
    percent: 100,
  }));
});

test('installNow quits and installs downloaded update', () => {
  const { service, updater } = createService({ platform: 'darwin' });

  updater.emit('update-available', { version: '0.2.0' });
  updater.emit('update-downloaded', { version: '0.2.0' });
  service.installNow();

  expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
});
