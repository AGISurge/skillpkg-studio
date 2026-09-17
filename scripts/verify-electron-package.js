#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const walk = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
};

const expectedNativePrefix = (platform, arch) => {
  if (platform === 'mac') return `mac-${arch}`;
  if (platform === 'win') return `win-${arch}`;
  return `linux-${arch}`;
};

const verifyPackage = async ({ platform, arch }) => {
  const asarPaths = walk(distDir).filter((file) => path.basename(file) === 'app.asar');
  if (asarPaths.length !== 1) {
    throw new Error(`Expected one app.asar in dist, found ${asarPaths.length}.`);
  }
  const asarPath = asarPaths[0];
  const resourcesDir = path.dirname(asarPath);
  const asarFiles = asar.listPackage(asarPath);
  const unpackedFiles = walk(path.join(resourcesDir, 'app.asar.unpacked'));
  const nativePrefix = expectedNativePrefix(platform, arch);
  const llamaNativeFiles = unpackedFiles.filter((file) => (
    file.includes(`${path.sep}@node-llama-cpp${path.sep}`)
    && file.includes(`${path.sep}bins${path.sep}${nativePrefix}`)
    && file.endsWith('.node')
  ));
  if (!llamaNativeFiles.length) {
    throw new Error(`Missing unpacked ${nativePrefix} node-llama-cpp binary.`);
  }
  if (!asarFiles.some((file) => file.includes('node_modules/node-llama-cpp/'))) {
    throw new Error('node-llama-cpp runtime files are missing from app.asar.');
  }
  const mainBundle = asar.extractFile(asarPath, 'main.cjs').toString('utf8');
  if (!mainBundle.includes('import("node-llama-cpp")')) {
    throw new Error('The Main bundle does not preserve the external node-llama-cpp import.');
  }
  const ggufFiles = [...asarFiles, ...walk(resourcesDir)]
    .filter((file) => file.toLowerCase().endsWith('.gguf'));
  if (ggufFiles.length) throw new Error('A GGUF model was included in the application package.');

  const { getLlama } = await import('node-llama-cpp');
  const llama = await getLlama({ build: 'never', skipDownload: true });
  await llama.dispose();
  console.log(`Verified ${platform}-${arch} node-llama-cpp package layout.`);
};

if (require.main === module) {
  const platform = process.argv[2];
  const arch = process.argv[3];
  if (!['mac', 'linux', 'win'].includes(platform) || !arch) {
    console.error('Usage: verify-electron-package.js <mac|linux|win> <arch>');
    process.exit(1);
  }
  verifyPackage({ platform, arch }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { expectedNativePrefix, verifyPackage };
