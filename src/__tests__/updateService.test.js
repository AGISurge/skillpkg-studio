const EventEmitter = require('events');

jest.mock('electron-updater', () => ({
  autoUpdater: new (require('events'))(),
}));

jest.mock('electron-is-dev', () => false);

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
    app: { getVersion: () => '0.1.0' },
    BrowserWindow: {
      getAllWindows: () => [{ webContents: { send } }],
    },
    updater,
    dev: false,
    platform: options.platform || 'darwin',
    config: {
      url: 'https://updates.example.com/app',
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

test('records available update version on supported platforms', () => {
  const { service, updater } = createService({ platform: 'darwin' });

  service.startChecking();
  updater.emit('update-available', { version: '0.2.0' });

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
