#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');
const defaultOutDir = path.join(projectRoot, '.electron-build', 'app');

function parseArgs(argv) {
  const options = {
    outDir: defaultOutDir,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out-dir') {
      options.outDir = path.resolve(projectRoot, argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--out-dir=')) {
      options.outDir = path.resolve(projectRoot, arg.slice('--out-dir='.length));
    }
  }

  return options;
}

function copySqlWasm(outDir) {
  const wasmSource = require.resolve('sql.js/dist/sql-wasm.wasm');
  fs.copyFileSync(wasmSource, path.join(outDir, 'sql-wasm.wasm'));
}

async function buildEntry({ entryPoint, outfile }) {
  await esbuild.build({
    entryPoints: [path.join(projectRoot, entryPoint)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'electron/main'],
    legalComments: 'none',
    minify: true,
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });

  await Promise.all([
    buildEntry({
      entryPoint: 'main.js',
      outfile: path.join(options.outDir, 'main.cjs'),
    }),
    buildEntry({
      entryPoint: 'preload.js',
      outfile: path.join(options.outDir, 'preload.cjs'),
    }),
  ]);
  copySqlWasm(options.outDir);

  console.log(`Built Electron bundles in ${path.relative(projectRoot, options.outDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
