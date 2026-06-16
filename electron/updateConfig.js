const updateChannel = process.env.SKILLPKG_UPDATE_CHANNEL || 'latest';

const githubOwner = process.env.SKILLPKG_UPDATE_GITHUB_OWNER || 'AGISurge';
const githubRepo = process.env.SKILLPKG_UPDATE_GITHUB_REPO || 'skillpkg-studio';

const githubUpdateProvider = {
  provider: 'github',
  owner: githubOwner,
  repo: githubRepo,
  channel: updateChannel,
  private: false,
  vPrefixedTagName: true,
};

const platformUpdateEnabled = {
  darwin: true,
  win32: true,
  linux: false,
};

const isUpdateEnabledForPlatform = (platform = process.platform) =>
  Boolean(platformUpdateEnabled[platform]);

module.exports = {
  updateChannel,
  githubOwner,
  githubRepo,
  githubUpdateProvider,
  platformUpdateEnabled,
  isUpdateEnabledForPlatform,
};
