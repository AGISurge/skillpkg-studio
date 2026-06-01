const DEFAULT_UPDATE_SERVER_URL = 'https://updates.skillpkg.com/skillpkg-studio';

const updateServerUrl =
  process.env.SKILLPKG_UPDATE_SERVER_URL || DEFAULT_UPDATE_SERVER_URL;

const updateChannel = process.env.SKILLPKG_UPDATE_CHANNEL || 'latest';

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
