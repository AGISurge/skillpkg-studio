const builderConfig = require('../../electron-builder.config.cjs');

test('uses GitHub-safe Windows updater artifact names', () => {
  expect(builderConfig.nsis).toEqual(expect.objectContaining({
    artifactName: 'SkillPKG-Studio-Setup-${version}.${ext}',
  }));
});

test('builds both Linux auto-update targets', () => {
  expect(builderConfig.linux.target).toEqual(expect.arrayContaining([
    'AppImage',
    'deb',
  ]));
});
