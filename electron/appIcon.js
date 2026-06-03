const fs = require('fs');
const path = require('path');

const APP_ID = 'com.agisurge.skillpkgstudio';
const APP_NAME = 'Skillpkg Studio';

const firstExistingPath = (paths) =>
  paths.find((candidatePath) => fs.existsSync(candidatePath)) || null;

const ICON_ROOT = firstExistingPath([
  path.join(__dirname, 'assets', 'icons'),
  path.join(__dirname, '..', 'assets', 'icons'),
]);

const getPlatformIconPath = (platform = process.platform) => {
  if (!ICON_ROOT) return null;

  if (platform === 'win32') {
    return firstExistingPath([
      path.join(ICON_ROOT, 'windows', 'icon.ico'),
      path.join(ICON_ROOT, 'windows', '256x256.png'),
      path.join(ICON_ROOT, 'icon.png'),
    ]);
  }

  if (platform === 'darwin') {
    return firstExistingPath([
      path.join(ICON_ROOT, 'macos', 'icon.icns'),
      path.join(ICON_ROOT, 'macos', '512x512.png'),
      path.join(ICON_ROOT, 'icon.png'),
    ]);
  }

  return firstExistingPath([
    path.join(ICON_ROOT, 'linux', '512x512.png'),
    path.join(ICON_ROOT, 'linux', '256x256.png'),
    path.join(ICON_ROOT, 'icon.png'),
  ]);
};

const getDockIconPath = () =>
  ICON_ROOT
    ? firstExistingPath([
      path.join(ICON_ROOT, 'macos', '512x512.png'),
      path.join(ICON_ROOT, 'macos', '1024x1024.png'),
      path.join(ICON_ROOT, 'icon.png'),
    ])
    : null;

module.exports = {
  APP_ID,
  APP_NAME,
  ICON_ROOT,
  getDockIconPath,
  getPlatformIconPath,
};
