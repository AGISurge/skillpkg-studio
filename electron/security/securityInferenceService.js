const {
  SEMANTIC_DIMENSIONS,
  mergeSemanticAssessments,
  parseSemanticAssessments,
  validateSemanticEvidence,
  emptySemanticAssessments,
} = require('./semanticPolicy');
const { createUserPrompt, createPrompt, SEMANTIC_SYSTEM_PROMPT } = require('./semanticPrompt');
const { splitSemanticDocuments, estimateTokens } = require('./semanticChunker');
const {
  CONTEXT_SIZE,
  MAX_CHUNKS,
  MAX_OUTPUT_TOKENS,
  resolveCapabilities,
} = require('./hostCapabilities');
const { createLimiter } = require('./asyncPool');
const { createNodeLlamaAdapter } = require('./llamaAdapter');

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

const createSecurityInferenceService = ({
  adapterFactory = createNodeLlamaAdapter,
  chunkTimeoutMs = CHUNK_TIMEOUT_MS,
  skillTimeoutMs = SKILL_TIMEOUT_MS,
  capabilities: capabilityOverrides,
} = {}) => {
  const capabilities = resolveCapabilities(capabilityOverrides);
  const limiter = createLimiter(capabilities.sequences);
  let loadChain = Promise.resolve();
  let adapter = null;
  let adapterModelPath = '';
  let disposed = false;
  let running = 0;
  const shutdownController = new AbortController();

  const loadAdapter = (modelPath) => {
    const run = loadChain.then(async () => {
      if (adapter && adapterModelPath === modelPath) return adapter;
      if (adapter) await adapter.dispose();
      adapter = await adapterFactory({
        modelPath,
        capabilities,
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
  }) => {
    if (disposed) return { ok: false, reason: 'inference-failed' };
    const chunks = splitSemanticDocuments(documents, capabilities);
    if (!chunks) return { ok: false, reason: 'corpus-too-large' };
    if (!chunks.length) {
      return { ok: true, assessments: emptySemanticAssessments(), chunkCount: 0 };
    }

    let loadedAdapter;
    try {
      loadedAdapter = await loadAdapter(modelSnapshot.modelPath);
    } catch (_error) {
      return { ok: false, reason: 'load-failed' };
    }

    const skillTimeout = createTimeout(skillTimeoutMs, 'skill-timeout');
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
      await Promise.all(chunks.map(async (chunk, index) => {
        if (failure || skillSignal?.aborted) return;
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
            return;
          }
          const output = await loadedAdapter.generate({
            prompt: createUserPrompt({
              skillName,
              description,
              chunk,
              chunkIndex: index,
              chunkCount: chunks.length,
            }),
            signal: chunkSignal,
          });
          if (failure) return;
          if (chunkSignal?.aborted) {
            fail({
              ok: false,
              reason: String(chunkSignal.reason || '').includes('timeout')
                ? 'timeout'
                : 'inference-failed',
            });
            return;
          }
          if (!hasExactlyOneDimensionKey(output)) {
            fail({ ok: false, reason: 'schema-invalid' });
            return;
          }
          let parsed;
          try {
            parsed = JSON.parse(output);
          } catch (_error) {
            fail({ ok: false, reason: 'schema-invalid' });
            return;
          }
          const shaped = parseSemanticAssessments(parsed);
          if (!shaped.ok) {
            fail(shaped);
            return;
          }
          const evidenced = validateSemanticEvidence(shaped.assessments, documents);
          if (!evidenced.ok) {
            fail(evidenced);
            return;
          }
          chunkAssessments[index] = evidenced.assessments;
          onChunk?.({ index: index + 1, count: chunks.length, done: true });
        } catch (error) {
          fail({ ok: false, reason: classifyFailure(error, chunkSignal) });
        } finally {
          chunkTimeout.dispose();
          limiter.release();
        }
      }));
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
  CONTEXT_SIZE,
  MAX_CHUNKS,
  MAX_OUTPUT_TOKENS,
  SEMANTIC_SYSTEM_PROMPT,
  SKILL_TIMEOUT_MS,
  createNodeLlamaAdapter,
  createPrompt,
  createSecurityInferenceService,
  createUserPrompt,
  estimateTokens,
  hasExactlyOneDimensionKey,
  splitSemanticDocuments,
};
