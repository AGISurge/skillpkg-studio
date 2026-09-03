const { githubUpdateProvider } = require('./electron/updateConfig');

module.exports = {
  extends: null,
  appId: 'com.skillpkg.studio',
  productName: 'SkillPKG Studio',
  directories: {
    app: '.electron-build/app',
    output: 'dist',
  },
  // GitHub rewrites spaces in uploaded asset names. Keep updater metadata and
  // release asset names identical by generating a GitHub-safe name up front.
  artifactName: 'SkillPKG-Studio-${version}-${arch}.${ext}',
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
  nsis: {
    artifactName: 'SkillPKG-Studio-Setup-${version}.${ext}',
  },
  linux: {
    icon: 'assets/icons/linux',
    category: 'Development',
    maintainer: 'SkillPKG <support@skillpkg.com>',
    target: ['AppImage', 'deb'],
  },
};
