#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const electronBuildDir = path.join(projectRoot, '.electron-build');
const stagedAppDir = path.join(electronBuildDir, 'app');
const builderConfig = path.join(projectRoot, 'electron-builder.config.cjs');
const electronBuilderCli = require.resolve('electron-builder/cli.js');

const platformMap = {
  darwin: 'mac',
  win32: 'win',
  linux: 'linux',
};

const linuxArtifactExtensions = [
  '.AppImage',
  '.deb',
  '.rpm',
  '.snap',
  '.pacman',
  '.apk',
  '.tar.gz',
  '.tar.xz',
  '.tar.bz2',
];

function parseArgs(argv) {
  const options = {
    platform: platformMap[process.platform] || process.platform,
    sign: false,
    publish: 'never',
    skipBuild: false,
    extraBuilderArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--sign') {
      options.sign = true;
    } else if (arg === '--skip-build') {
      options.skipBuild = true;
    } else if (arg === '--platform' || arg === '-p') {
      options.platform = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--platform=')) {
      options.platform = arg.slice('--platform='.length);
    } else if (arg === '--publish') {
      options.publish = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--publish=')) {
      options.publish = arg.slice('--publish='.length);
    } else if (arg === '--') {
      options.extraBuilderArgs.push(...argv.slice(index + 1));
      break;
    } else {
      options.extraBuilderArgs.push(arg);
    }
  }

  options.platform = normalizePlatform(options.platform);
  return options;
}

function normalizePlatform(platform) {
  const value = String(platform || '').toLowerCase();
  if (value === 'darwin' || value === 'macos' || value === 'osx') return 'mac';
  if (value === 'windows') return 'win';
  if (value === 'current') return platformMap[process.platform] || process.platform;
  if (['mac', 'win', 'linux', 'all'].includes(value)) return value;

  throw new Error(
    `Unsupported platform "${platform}". Use mac, win, linux, all, or current.`,
  );
}

function run(command, args, env = {}) {
  const childEnv = {
    ...process.env,
    ...env,
  };

  for (const [key, value] of Object.entries(childEnv)) {
    if (value === null) {
      delete childEnv[key];
    }
  }

  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: childEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command === 'npm',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
}

function hasCommand(command) {
  const check = process.platform === 'win32' ? 'where' : 'which';
  const args = [command];
  const result = spawnSync(check, args, {
    cwd: projectRoot,
    stdio: 'ignore',
    shell: false,
  });
  return result.status === 0;
}

function getBuilderEnv(options) {
  if (options.sign) {
    return {};
  }

  return {
    APPLE_API_KEY: null,
    APPLE_API_KEY_ID: null,
    APPLE_API_ISSUER: null,
    APPLE_APP_SPECIFIC_PASSWORD: null,
    APPLE_ID: null,
    APPLE_TEAM_ID: null,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    CSC_LINK: null,
    CSC_NAME: null,
  };
}

function printSigningNotes(options) {
  if (!options.sign) {
    console.log('Signing disabled. Pass --sign to enable macOS or Linux signing.');
    return;
  }

  if (options.platform === 'mac' || options.platform === 'all') {
    console.log('macOS signing enabled through electron-builder.');
    console.log('Use CSC_LINK/CSC_KEY_PASSWORD or CSC_NAME for the signing identity.');
  }

  if (options.platform === 'linux' || options.platform === 'all') {
    console.log('Linux artifact signing enabled. GPG detached signatures will be created.');
    console.log('Optional env: LINUX_GPG_KEY_ID, LINUX_GPG_PASSPHRASE.');
  }
}

function getBuilderPlatforms(platform) {
  if (platform === 'all') {
    return ['--mac', '--win', '--linux'];
  }
  return [`--${platform}`];
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function isLinuxArtifact(file) {
  const name = path.basename(file);
  return linuxArtifactExtensions.some((extension) => name.endsWith(extension));
}

function getNewLinuxArtifacts(startedAt) {
  return listFiles(distDir).filter((file) => {
    if (!isLinuxArtifact(file)) {
      return false;
    }

    const stat = fs.statSync(file);
    return stat.mtimeMs >= startedAt;
  });
}

function createChecksum(file) {
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const checksumFile = `${file}.sha256`;
  fs.writeFileSync(checksumFile, `${checksum}  ${path.basename(file)}\n`);
  console.log(`Created ${path.relative(projectRoot, checksumFile)}`);
}

function signLinuxArtifacts(startedAt) {
  if (!hasCommand('gpg')) {
    throw new Error('Linux signing requires gpg to be installed and available in PATH.');
  }

  const artifacts = getNewLinuxArtifacts(startedAt);
  if (artifacts.length === 0) {
    console.log('No new Linux artifacts found to sign.');
    return;
  }

  for (const artifact of artifacts) {
    const signatureFile = `${artifact}.sig`;
    const args = ['--batch', '--yes', '--armor', '--detach-sign', '--output', signatureFile];

    if (process.env.LINUX_GPG_KEY_ID) {
      args.push('--local-user', process.env.LINUX_GPG_KEY_ID);
    }

    if (process.env.LINUX_GPG_PASSPHRASE) {
      args.push('--pinentry-mode', 'loopback', '--passphrase', process.env.LINUX_GPG_PASSPHRASE);
    }

    args.push(artifact);
    run('gpg', args);
    console.log(`Signed ${path.relative(projectRoot, artifact)}`);
    createChecksum(artifact);
  }
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required build input: ${path.relative(projectRoot, source)}`);
  }

  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    filter: (sourcePath) => path.basename(sourcePath) !== '.DS_Store',
  });
}

function writeStagedPackageJson() {
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
  );
  const stagedPackage = {
    name: rootPackage.name,
    version: rootPackage.version,
    private: true,
    main: 'main.cjs',
  };

  fs.writeFileSync(
    path.join(stagedAppDir, 'package.json'),
    `${JSON.stringify(stagedPackage, null, 2)}\n`,
  );
}

function prepareStagedApp() {
  fs.rmSync(stagedAppDir, { recursive: true, force: true });
  fs.mkdirSync(stagedAppDir, { recursive: true });

  copyDir(path.join(projectRoot, 'build'), path.join(stagedAppDir, 'build'));
  copyDir(path.join(projectRoot, 'assets', 'icons'), path.join(stagedAppDir, 'assets', 'icons'));
  writeStagedPackageJson();
  run(process.execPath, [
    path.join(projectRoot, 'scripts', 'build-electron.js'),
    '--out-dir',
    path.relative(projectRoot, stagedAppDir),
  ]);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const buildStartedAt = Date.now();

  printSigningNotes(options);

  if (!options.skipBuild) {
    run('npm', ['run', 'build']);
  }

  prepareStagedApp();

  const builderArgs = [
    '--config',
    builderConfig,
    ...getBuilderPlatforms(options.platform),
    '--publish',
    options.publish,
    ...options.extraBuilderArgs,
  ];

  run(process.execPath, [electronBuilderCli, ...builderArgs], getBuilderEnv(options));

  if (
    options.sign &&
    (options.platform === 'linux' || options.platform === 'all')
  ) {
    signLinuxArtifacts(buildStartedAt);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
