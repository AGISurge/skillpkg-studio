const DEFAULT_UPDATE_SERVER_URL = 'https://oss.skillpkg.com/studio';

const updateChannel = process.env.SKILLPKG_UPDATE_CHANNEL || 'latest';

const trimTrailingSlash = (value) => String(value).replace(/\/+$/, '');

const updateServerUrl =
  process.env.SKILLPKG_UPDATE_SERVER_URL ||
  `${trimTrailingSlash(DEFAULT_UPDATE_SERVER_URL)}/${updateChannel}`;

const platformUpdateEnabled = {
  darwin: true,
  win32: true,
  linux: false,
};

const isUpdateEnabledForPlatform = (platform = process.platform) =>
  Boolean(platformUpdateEnabled[platform]);

module.exports = {
  updateServerUrl,
  updateChannel,
  platformUpdateEnabled,
  isUpdateEnabledForPlatform,
};
