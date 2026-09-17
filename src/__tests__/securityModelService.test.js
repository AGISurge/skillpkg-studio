const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const {
  createSecurityModelService,
} = require('../../electron/security/securityModelService');

describe('security model service', () => {
  let tempRoot;
  const modelBytes = Buffer.from('GGUFfixture-model');
  const artifact = {
    modelId: 'test-model',
    filename: 'test.gguf',
    url: 'https://example.test/model.gguf',
    commit: 'test-commit',
    size: modelBytes.length,
    sha256: crypto.createHash('sha256').update(modelBytes).digest('hex'),
  };
  const responseFor = (bytes, contentLength = bytes.length) => ({
    ok: true,
    status: 200,
    body: Readable.toWeb(Readable.from([bytes])),
    headers: {
      get: (name) => name.toLowerCase() === 'content-length'
        ? String(contentLength)
        : null,
    },
  });

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'security-model-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test('downloads, hashes, checks GGUF magic, and atomically installs the fixed artifact', async () => {
    const states = [];
    const service = createSecurityModelService({
      userDataPath: tempRoot,
      artifact,
      emit: (state) => states.push(state),
      fetchImpl: async () => responseFor(modelBytes),
    });

    await expect(service.download()).resolves.toEqual({ ok: true });
    await expect(service.getStatus()).resolves.toEqual(expect.objectContaining({
      kind: 'ready',
      size: modelBytes.length,
      sha256: artifact.sha256,
      source: 'download',
    }));
    expect(states.map((state) => state.kind)).toEqual(expect.arrayContaining([
      'downloading',
      'verifying',
      'ready',
    ]));
    const modelPath = path.join(
      tempRoot,
      'security-models',
      artifact.modelId,
      artifact.filename,
    );
    await expect(fs.readFile(modelPath)).resolves.toEqual(modelBytes);
    await expect(fs.readdir(path.dirname(modelPath))).resolves.not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.part$/)]),
    );
  });

  test('rejects a bad import without replacing an installed model', async () => {
    const validSource = path.join(tempRoot, 'valid.gguf');
    const invalidSource = path.join(tempRoot, 'invalid.gguf');
    await fs.writeFile(validSource, modelBytes);
    await fs.writeFile(invalidSource, Buffer.from('NOPEfixture-model'));
    const service = createSecurityModelService({
      userDataPath: tempRoot,
      artifact,
    });

    await expect(service.importModel(validSource)).resolves.toEqual({ ok: true });
    await expect(service.importModel(invalidSource)).resolves.toEqual({
      ok: false,
      reason: 'model-sha256-invalid',
    });
    await expect(service.getStatus()).resolves.toEqual(expect.objectContaining({
      kind: 'ready',
    }));
    const modelPath = path.join(
      tempRoot,
      'security-models',
      artifact.modelId,
      artifact.filename,
    );
    await expect(fs.readFile(modelPath)).resolves.toEqual(modelBytes);
  });

  test('refuses model replacement and deletion while inference is busy', async () => {
    const service = createSecurityModelService({
      userDataPath: tempRoot,
      artifact,
      isBusy: () => true,
    });
    await expect(service.download()).resolves.toEqual({ ok: false, reason: 'busy' });
    await expect(service.importModel('/tmp/model.gguf')).resolves.toEqual({
      ok: false,
      reason: 'busy',
    });
    await expect(service.remove()).resolves.toEqual({ ok: false, reason: 'busy' });
  });

  test('rejects wrong content length and invalid GGUF data', async () => {
    const wrongSize = createSecurityModelService({
      userDataPath: tempRoot,
      artifact,
      fetchImpl: async () => responseFor(modelBytes, modelBytes.length + 1),
    });
    await expect(wrongSize.download()).resolves.toEqual({
      ok: false,
      reason: 'model-size-invalid',
    });

    const invalidBytes = Buffer.from('NOPEfixture-model');
    const invalidArtifact = {
      ...artifact,
      size: invalidBytes.length,
      sha256: crypto.createHash('sha256').update(invalidBytes).digest('hex'),
    };
    const invalidGguf = createSecurityModelService({
      userDataPath: path.join(tempRoot, 'invalid'),
      artifact: invalidArtifact,
      fetchImpl: async () => responseFor(invalidBytes, 0),
    });
    await expect(invalidGguf.download()).resolves.toEqual({
      ok: false,
      reason: 'model-gguf-invalid',
    });
  });
});
