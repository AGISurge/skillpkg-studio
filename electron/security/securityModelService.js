const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MODEL_ID = 'qwen3.5-2b-q4_k_m';
const MODEL_FILENAME = 'Qwen3.5-2B-Q4_K_M.gguf';
const MODEL_URL = 'https://hf-mirror.com/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf';
const MODEL_COMMIT = 'f6d5376be1edb4d416d56da11e5397a961aca8ae';
const MODEL_SIZE = 1_280_835_840;
const MODEL_SHA256 = 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223';
const GGUF_MAGIC = Buffer.from('GGUF');

const fileExists = async (filePath) => {
  const stat = await fsp.stat(filePath).catch(() => null);
  return Boolean(stat?.isFile());
};

const readMagic = async (filePath) => {
  const handle = await fsp.open(filePath, 'r');
  try {
    const magic = Buffer.alloc(GGUF_MAGIC.length);
    const { bytesRead } = await handle.read(magic, 0, magic.length, 0);
    return bytesRead === magic.length && magic.equals(GGUF_MAGIC);
  } finally {
    await handle.close();
  }
};

const calculateSha256 = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const verifyModelFile = async (filePath, expectedDigest = MODEL_SHA256) => {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile() || stat.size !== MODEL_SIZE) throw new Error('model-size-invalid');
  if (!await readMagic(filePath)) throw new Error('model-gguf-invalid');
  if (!expectedDigest) return { size: stat.size, sha256: '' };
  const digest = await calculateSha256(filePath);
  if (digest !== expectedDigest) throw new Error('model-sha256-invalid');
  return { size: stat.size, sha256: digest };
};

const createSecurityModelService = ({
  userDataPath,
  emit,
  isBusy = () => false,
  prepareMutation = async () => {},
  fetchImpl = globalThis.fetch,
  artifact = {},
}) => {
  const spec = {
    modelId: MODEL_ID,
    filename: MODEL_FILENAME,
    url: MODEL_URL,
    commit: MODEL_COMMIT,
    size: MODEL_SIZE,
    sha256: MODEL_SHA256,
    ...artifact,
  };
  const modelDir = path.join(userDataPath, 'security-models', spec.modelId);
  const modelPath = path.join(modelDir, spec.filename);
  const metadataPath = path.join(modelDir, 'metadata.json');
  let state = { kind: 'missing', modelId: spec.modelId };
  let operation = null;
  let initialized = false;

  const publish = (next) => {
    state = next;
    emit?.(next);
    return next;
  };

  const readMetadata = async () => {
    try {
      const value = JSON.parse(await fsp.readFile(metadataPath, 'utf8'));
      return value?.sha256 === spec.sha256 ? value : null;
    } catch (_error) {
      return null;
    }
  };

  const writeMetadata = async (source) => {
    const tempPath = `${metadataPath}.${process.pid}.part`;
    await fsp.writeFile(tempPath, `${JSON.stringify({
      modelId: spec.modelId,
      filename: spec.filename,
      source,
      url: spec.url,
      commit: spec.commit,
      size: spec.size,
      sha256: spec.sha256,
      installedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    await fsp.rename(tempPath, metadataPath);
  };

  const inspect = async () => {
    initialized = true;
    if (!await fileExists(modelPath)) {
      return publish({ kind: 'missing', modelId: spec.modelId });
    }
    try {
      const metadata = await readMetadata();
      if (metadata) {
        const stat = await fsp.stat(modelPath);
        if (stat.size !== spec.size || !await readMagic(modelPath)) {
          throw new Error('model-invalid');
        }
        return publish({
          kind: 'ready',
          modelId: spec.modelId,
          path: modelPath,
          size: spec.size,
          sha256: spec.sha256,
          source: ['download', 'import', 'existing'].includes(metadata.source)
            ? metadata.source
            : 'existing',
        });
      }
      publish({ kind: 'verifying', modelId: spec.modelId, source: 'existing' });
      const stat = await fsp.stat(modelPath);
      if (stat.size !== spec.size || !await readMagic(modelPath)) throw new Error('model-invalid');
      const digest = await calculateSha256(modelPath);
      if (digest !== spec.sha256) throw new Error('model-sha256-invalid');
      await writeMetadata('existing');
      return publish({
        kind: 'ready',
        modelId: spec.modelId,
        path: modelPath,
        size: spec.size,
        sha256: spec.sha256,
        source: 'existing',
      });
    } catch (error) {
      return publish({
        kind: 'error',
        modelId: spec.modelId,
        error: String(error?.message || error || 'model-invalid'),
      });
    }
  };

  const getStatus = async () => {
    if (!initialized) await inspect();
    return state;
  };

  const getSnapshot = async () => {
    const current = await getStatus();
    if (current.kind === 'ready') {
      return {
        kind: 'ready',
        modelId: spec.modelId,
        modelPath: current.path,
        modelSha256: spec.sha256,
      };
    }
    if (current.kind === 'error') return { kind: 'invalid' };
    return { kind: 'missing' };
  };

  const rejectBusy = () => {
    if (operation || isBusy()) return { ok: false, reason: 'busy' };
    return null;
  };

  const prepareModelMutation = async () => {
    const busy = rejectBusy();
    if (busy) return busy;
    await prepareMutation();
    return rejectBusy();
  };

  const installStream = async ({ source, readable, abortController }) => {
    await fsp.mkdir(modelDir, { recursive: true });
    const tempPath = path.join(modelDir, `${spec.filename}.${process.pid}.${Date.now()}.part`);
    let receivedBytes = 0;
    const hash = crypto.createHash('sha256');
    const verifier = new Transform({
      transform(chunk, _encoding, callback) {
        receivedBytes += chunk.length;
        hash.update(chunk);
        publish({
          kind: 'downloading',
          modelId: spec.modelId,
          source,
          receivedBytes,
          totalBytes: spec.size,
          percent: Math.min(100, receivedBytes / spec.size * 100),
        });
        callback(null, chunk);
      },
    });
    try {
      await pipeline(readable, verifier, fs.createWriteStream(tempPath, { flags: 'wx' }), {
        signal: abortController.signal,
      });
      publish({ kind: 'verifying', modelId: spec.modelId, source });
      if (receivedBytes !== spec.size) throw new Error('model-size-invalid');
      if (hash.digest('hex') !== spec.sha256) throw new Error('model-sha256-invalid');
      if (!await readMagic(tempPath)) throw new Error('model-gguf-invalid');
      const existingMetadata = await readMetadata();
      if (await fileExists(modelPath) && existingMetadata?.sha256 === spec.sha256) {
        await fsp.unlink(tempPath);
      } else {
        await fsp.unlink(modelPath).catch(() => {});
        await fsp.rename(tempPath, modelPath);
      }
      await writeMetadata(source);
      publish({
        kind: 'ready',
        modelId: spec.modelId,
        path: modelPath,
        size: spec.size,
        sha256: spec.sha256,
        source,
      });
      return { ok: true };
    } catch (error) {
      await fsp.unlink(tempPath).catch(() => {});
      if (abortController.signal.aborted) {
        await inspect();
        return { ok: false, reason: 'canceled' };
      }
      const existing = await inspect();
      if (existing.kind !== 'ready') {
        publish({
          kind: 'error',
          modelId: spec.modelId,
          error: String(error?.message || error),
        });
      }
      return { ok: false, reason: String(error?.message || error) };
    }
  };

  const download = async () => {
    const busy = rejectBusy();
    if (busy) return busy;
    const current = await getStatus();
    if (current.kind === 'ready') return { ok: true, reused: true };
    const preparationFailure = await prepareModelMutation();
    if (preparationFailure) return preparationFailure;
    if (typeof fetchImpl !== 'function') return { ok: false, reason: 'download-unavailable' };
    const abortController = new AbortController();
    operation = { kind: 'download', abortController };
    try {
      publish({
        kind: 'downloading',
        modelId: spec.modelId,
        source: 'download',
        receivedBytes: 0,
        totalBytes: spec.size,
        percent: 0,
      });
      const response = await fetchImpl(spec.url, { signal: abortController.signal });
      if (!response.ok || !response.body) throw new Error(`model-download-http-${response.status}`);
      const contentLength = Number(response.headers.get('content-length'));
      if (contentLength && contentLength !== spec.size) throw new Error('model-size-invalid');
      return await installStream({
        source: 'download',
        readable: Readable.fromWeb(response.body),
        abortController,
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        await inspect();
        return { ok: false, reason: 'canceled' };
      }
      publish({
        kind: 'error',
        modelId: spec.modelId,
        error: String(error?.message || error),
      });
      return { ok: false, reason: String(error?.message || error) };
    } finally {
      operation = null;
    }
  };

  const importModel = async (sourcePath) => {
    const preparationFailure = await prepareModelMutation();
    if (preparationFailure) return preparationFailure;
    const abortController = new AbortController();
    operation = { kind: 'import', abortController };
    try {
      return await installStream({
        source: 'import',
        readable: fs.createReadStream(sourcePath),
        abortController,
      });
    } finally {
      operation = null;
    }
  };

  const cancelDownload = async () => {
    if (!operation || operation.kind !== 'download') return { ok: false, reason: 'not-downloading' };
    operation.abortController.abort();
    return { ok: true };
  };

  const remove = async () => {
    const preparationFailure = await prepareModelMutation();
    if (preparationFailure) return preparationFailure;
    await fsp.rm(modelDir, { recursive: true, force: true });
    publish({ kind: 'missing', modelId: spec.modelId });
    initialized = true;
    return { ok: true };
  };

  return {
    cancelDownload,
    download,
    getSnapshot,
    getStatus,
    importModel,
    inspect,
    remove,
  };
};

module.exports = {
  MODEL_COMMIT,
  MODEL_FILENAME,
  MODEL_ID,
  MODEL_SHA256,
  MODEL_SIZE,
  MODEL_URL,
  createSecurityModelService,
  verifyModelFile,
};
