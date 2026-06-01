const { updateChannel, updateServerUrl } = require('./electron/updateConfig');

module.exports = {
  extends: null,
  appId: 'com.skillpkg.studio',
  productName: 'SkillPKG Studio',
  directories: {
    output: 'dist',
  },
  files: [
    'build/**/*',
    'electron/**/*',
    'assets/icons/**/*',
    'main.js',
    'preload.js',
    'package.json',
  ],
  publish: [
    {
      provider: 'generic',
      url: updateServerUrl,
      channel: updateChannel,
    },
  ],
  mac: {
    icon: 'assets/icons/macos/icon.icns',
    target: ['dmg', 'zip'],
  },
  win: {
    icon: 'assets/icons/windows/icon.ico',
    target: ['nsis'],
  },
  linux: {
    icon: 'assets/icons/linux',
    category: 'Development',
    target: ['AppImage', 'deb'],
  },
};
