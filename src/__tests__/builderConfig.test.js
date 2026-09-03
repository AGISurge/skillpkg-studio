const builderConfig = require('../../electron-builder.config.cjs');

test('uses GitHub-safe default updater artifact names', () => {
  expect(builderConfig.artifactName).toBe(
    'SkillPKG-Studio-${version}-${arch}.${ext}',
  );
  expect(builderConfig.artifactName).not.toMatch(/\s/);
});

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
