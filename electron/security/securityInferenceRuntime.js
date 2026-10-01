const {
  SEMANTIC_DIMENSIONS,
  mergeSemanticAssessments,
  createSemanticEvidenceValidator,
  emptySemanticAssessments,
} = require('./semanticPolicy');
const { createUserPrompt } = require('./semanticPrompt');
const { splitSemanticDocuments } = require('./semanticChunker');
const {
  MAX_SAFE_SEQUENCES,
  resolveCapabilities,
} = require('./hostCapabilities');
const { createLimiter } = require('./asyncPool');
const { createNodeLlamaAdapter } = require('./llamaAdapter');
const { createEvidenceSources, createGenerationSchema, parseGeneration } = require('./semanticProtocol');
const { resolveSkillTimeoutMs } = require('./semanticTimeout');

const CHUNK_TIMEOUT_MS = 60_000;
const SKILL_TIMEOUT_MS = 8 * 60_000;
const TIMEOUT_SIGNAL = Symbol('semantic-timeout-signal');

const createAbortSignal = (signals) => {
  const active = signals.filter(Boolean);
  if (!active.length) return undefined;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active);
  const controller = new AbortController();
  const abort = (signal) => {
    if (controller.signal.aborted) return;
    if (signal[TIMEOUT_SIGNAL]) controller.signal[TIMEOUT_SIGNAL] = signal[TIMEOUT_SIGNAL];
    controller.abort(signal.reason);
  };
  for (const signal of active) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    signal.addEventListener('abort', () => abort(signal), { once: true });
  }
  return controller.signal;
};

const createTimeout = (milliseconds, reason) => {
  const controller = new AbortController();
  controller.signal[TIMEOUT_SIGNAL] = reason;
  const timer = setTimeout(() => controller.abort(new Error(reason)), milliseconds);
  timer.unref?.();
  return { controller, dispose: () => clearTimeout(timer) };
};

const hasExactlyOneDimensionKey = (output) => SEMANTIC_DIMENSIONS.every((dimension) => {
  const escaped = dimension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (String(output).match(new RegExp(`"${escaped}"\\s*:`, 'g')) || []).length === 1;
});

const classifyFailure = (error, signal) => {
  if (signal?.aborted) {
    if (signal[TIMEOUT_SIGNAL]) return 'timeout';
    const reason = String(
      signal.reason?.message
      || signal.reason
      || error?.message
      || error
      || '',
    );
    return reason.includes('timeout') ? 'timeout' : 'inference-failed';
  }
  if (error?.code === 'SEMANTIC_SCHEMA_INVALID') return 'schema-invalid';
  if (error?.code === 'SEMANTIC_EVIDENCE_INVALID') return 'evidence-invalid';
  return 'inference-failed';
};

const createSecurityInferenceRuntime = ({
  adapterFactory = createNodeLlamaAdapter,
  chunkTimeoutMs = CHUNK_TIMEOUT_MS,
  skillTimeoutMs = SKILL_TIMEOUT_MS,
  loadTimeoutMs = 120_000,
  capabilities: capabilityOverrides,
} = {}) => {
  const capabilities = resolveCapabilities(capabilityOverrides);
  const limiter = createLimiter(MAX_SAFE_SEQUENCES);
  let loadChain = Promise.resolve();
  let adapter = null;
  let adapterModelPath = '';
  let disposed = false;
  let running = 0;
  const shutdownController = new AbortController();

  const loadAdapter = (modelPath, signal, onProgress) => {
    const run = loadChain.then(async () => {
      if (signal?.aborted) throw signal.reason;
      if (adapter && adapterModelPath === modelPath) return adapter;
      if (adapter) {
        const previous = adapter;
        adapter = null;
        adapterModelPath = '';
        await previous.dispose();
      }
      adapter = await adapterFactory({
        modelPath,
        capabilities,
        signal,
        onLoadProgress: (percent) => onProgress?.({ stage: 'loading', percent: Math.round(percent * 100) }),
      });
      adapterModelPath = modelPath;
      return adapter;
    });
    loadChain = run.then(() => undefined, () => undefined);
    return run;
  };

  const analyzeNow = async ({
    modelSnapshot,
    skillName,
    description,
    documents,
    signal,
    onChunk,
    onProgress,
  }) => {
    if (disposed) return { ok: false, reason: 'inference-failed' };
    const chunks = splitSemanticDocuments(documents, capabilities);
    if (!chunks.length) {
      return { ok: true, assessments: emptySemanticAssessments(), chunkCount: 0 };
    }
    onChunk?.({ index: 0, count: chunks.length, done: false });
    const validateEvidence = createSemanticEvidenceValidator(documents);

    let loadedAdapter;
    const loadTimeout = createTimeout(loadTimeoutMs, 'load-timeout');
    const loadSignal = createAbortSignal([signal, shutdownController.signal, loadTimeout.controller.signal]);
    onProgress?.({ stage: 'loading', percent: 0 });
    try {
      loadedAdapter = await loadAdapter(modelSnapshot.modelPath, loadSignal, onProgress);
      if (loadSignal?.aborted) throw loadSignal.reason;
    } catch (error) {
      return { ok: false, reason: loadSignal?.aborted ? classifyFailure(error, loadSignal) : 'load-failed' };
    } finally {
      loadTimeout.dispose();
    }

    const skillTimeout = createTimeout(resolveSkillTimeoutMs({
      chunkCount: chunks.length, chunkTimeoutMs, skillTimeoutMs,
    }), 'skill-timeout');
    const cancelChunks = new AbortController();
    const skillSignal = createAbortSignal([
      signal,
      shutdownController.signal,
      skillTimeout.controller.signal,
      cancelChunks.signal,
    ]);
    const chunkAssessments = new Array(chunks.length);
    let failure = null;

    const fail = (result) => {
      if (failure) return;
      failure = result;
      cancelChunks.abort(new Error(result.reason));
    };

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        if (failure || skillSignal?.aborted) break;
        onChunk?.({ index: index + 1, count: chunks.length, done: false });
        await limiter.acquire();
        const chunkTimeout = createTimeout(chunkTimeoutMs, 'chunk-timeout');
        const chunkSignal = createAbortSignal([skillSignal, chunkTimeout.controller.signal]);
        try {
          if (failure || chunkSignal?.aborted) {
            if (!failure) {
              fail({
                ok: false,
                reason: String(chunkSignal.reason || '').includes('timeout')
                  ? 'timeout'
                  : 'inference-failed',
              });
            }
            break;
          }
          const progress = { stage: 'generating', chunkIndex: index + 1, chunkCount: chunks.length,
            generatedTokens: 0, completedDimensions: 0, totalDimensions: SEMANTIC_DIMENSIONS.length };
          const sources = createEvidenceSources(chunks[index]);
          onProgress?.(progress);
          const output = await loadedAdapter.generate({
            schema: createGenerationSchema(sources),
            prompt: createUserPrompt({
              skillName,
              description,
              chunk: chunks[index],
              chunkIndex: index,
              chunkCount: chunks.length,
            }),
            signal: chunkSignal,
            onProgress: (update) => onProgress?.({ ...progress, ...update }),
          });
          if (failure) break;
          if (chunkSignal?.aborted) {
            fail({
              ok: false,
              reason: String(chunkSignal.reason || '').includes('timeout')
                ? 'timeout'
                : 'inference-failed',
            });
            break;
          }
          if (!hasExactlyOneDimensionKey(output)) {
            fail({ ok: false, reason: 'schema-invalid' });
            break;
          }
          onProgress?.({ stage: 'validating', chunkIndex: index + 1, chunkCount: chunks.length });
          let parsed;
          try {
            parsed = JSON.parse(output);
          } catch (_error) {
            fail({ ok: false, reason: 'schema-invalid' });
            break;
          }
          const shaped = parseGeneration(parsed, sources);
          if (!shaped.ok) {
            fail(shaped);
            break;
          }
          const evidenced = validateEvidence(shaped.assessments);
          if (!evidenced.ok) {
            fail(evidenced);
            break;
          }
          chunkAssessments[index] = evidenced.assessments;
          onChunk?.({ index: index + 1, count: chunks.length, done: true });
        } catch (error) {
          fail({ ok: false, reason: classifyFailure(error, chunkSignal) });
          break;
        } finally {
          chunkTimeout.dispose();
          limiter.release();
        }
      }
      if (failure) return failure;
      if (skillSignal?.aborted) {
        return {
          ok: false,
          reason: String(skillSignal.reason || '').includes('timeout')
            ? 'timeout'
            : 'inference-failed',
        };
      }
      if (chunkAssessments.some((entry) => !entry)) {
        return { ok: false, reason: 'inference-failed' };
      }
      return {
        ok: true,
        assessments: mergeSemanticAssessments(chunkAssessments),
        chunkCount: chunks.length,
        diagnostics: loadedAdapter.diagnostics || {
          sequences: capabilities.sequences,
          batchSize: capabilities.batchSize,
        },
      };
    } catch (error) {
      return failure || { ok: false, reason: classifyFailure(error, skillSignal) };
    } finally {
      skillTimeout.dispose();
    }
  };

  const analyze = async (input) => {
    if (disposed) return { ok: false, reason: 'inference-failed' };
    running += 1;
    try {
      return await analyzeNow(input);
    } finally {
      running -= 1;
    }
  };

  const dispose = async () => {
    disposed = true;
    shutdownController.abort(new Error('inference-service-disposed'));
    limiter.failWaiting(new Error('inference-service-disposed'));
    while (running > 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (adapter) await adapter.dispose();
    adapter = null;
    adapterModelPath = '';
  };

  const releaseIdle = async () => {
    if (running || !adapter) return false;
    await loadChain.catch(() => {});
    if (running || !adapter) return false;
    await adapter.dispose();
    adapter = null;
    adapterModelPath = '';
    return true;
  };

  return {
    analyze,
    dispose,
    isBusy: () => running > 0,
    releaseIdle,
    getCapabilities: () => capabilities,
  };
};

module.exports = {
  CHUNK_TIMEOUT_MS,
  SKILL_TIMEOUT_MS,
  createSecurityInferenceRuntime,
  hasExactlyOneDimensionKey,
  splitSemanticDocuments,
};
