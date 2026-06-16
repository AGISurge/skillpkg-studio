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

test('disables updates on linux by default', () => {
  const { service, updater } = createService({ platform: 'linux' });

  expect(service.getState()).toEqual(expect.objectContaining({
    enabled: false,
    status: 'disabled',
  }));

  service.startChecking();

  expect(updater.checkForUpdates).not.toHaveBeenCalled();
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
    version: '0.2.0',
  }));
});

test('downloads available update and marks it downloaded', async () => {
  const { service, updater } = createService({ platform: 'win32' });

  updater.emit('update-available', { version: '0.2.0' });
  await service.downloadUpdate();
  updater.emit('update-downloaded', { version: '0.2.0' });

  expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  expect(service.getState()).toEqual(expect.objectContaining({
    status: 'downloaded',
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
