const { githubUpdateProvider } = require('./electron/updateConfig');

module.exports = {
  extends: null,
  appId: 'com.skillpkg.studio',
  productName: 'SkillPKG Studio',
  directories: {
    app: '.electron-build/app',
    output: 'dist',
  },
  compression: 'maximum',
  beforeBuild: async () => false,
  files: [
    '**/*',
  ],
  publish: [
    githubUpdateProvider,
  ],
  mac: {
    icon: 'assets/icons/macos/icon.icns',
    notarize: true,
    target: ['dmg', 'zip'],
  },
  win: {
    icon: 'assets/icons/windows/icon.ico',
    target: ['nsis'],
  },
  linux: {
    icon: 'assets/icons/linux',
    category: 'Development',
    maintainer: 'SkillPKG <support@skillpkg.com>',
    target: ['AppImage', 'deb'],
  },
};
