const builderConfig = require('../../electron-builder.config.cjs');
const {
  expectedNativePrefix,
  hasPackedLlamaRuntime,
} = require('../../scripts/verify-electron-package');

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

test('keeps the local inference runtime external and unpacked', () => {
  expect(builderConfig.beforeBuild).toBeUndefined();
  expect(builderConfig.asar).toBe(true);
  expect(builderConfig.files).toEqual(expect.arrayContaining([
    '!node_modules/node-llama-cpp/bins/**/*',
    'node_modules/node-llama-cpp/bins/${os}-${arch}*/**/*',
    '!**/*.gguf',
  ]));
  expect(builderConfig.asarUnpack).toEqual(expect.arrayContaining([
    'node_modules/node-llama-cpp/bins',
    'node_modules/node-llama-cpp/llama/localBuilds',
    'node_modules/@node-llama-cpp/*',
  ]));
});

test('checks the release matrix against target-specific native packages', () => {
  expect(expectedNativePrefix('mac', 'arm64')).toBe('mac-arm64');
  expect(expectedNativePrefix('linux', 'x64')).toBe('linux-x64');
  expect(expectedNativePrefix('win', 'x64')).toBe('win-x64');
});

test('detects node-llama-cpp in POSIX asar listings', () => {
  expect(hasPackedLlamaRuntime([
    '/node_modules/node-llama-cpp/package.json',
  ])).toBe(true);
});

test('detects node-llama-cpp in Windows asar listings', () => {
  expect(hasPackedLlamaRuntime([
    '\\node_modules\\node-llama-cpp\\package.json',
  ])).toBe(true);
  expect(hasPackedLlamaRuntime([
    '\\node_modules\\other\\package.json',
  ])).toBe(false);
});
