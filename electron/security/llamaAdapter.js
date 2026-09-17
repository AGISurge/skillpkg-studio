const { SEMANTIC_JSON_SCHEMA } = require('./semanticPolicy');
const { SEMANTIC_SYSTEM_PROMPT } = require('./semanticPrompt');
const {
  CONTEXT_SIZE,
  MAX_OUTPUT_TOKENS,
  MAX_SAFE_SEQUENCES,
  resolveCapabilities,
} = require('./hostCapabilities');
const { createMutex } = require('./asyncPool');

const disposeQuietly = async (value) => {
  try {
    await value?.dispose?.();
  } catch (_error) {
    // Native llama objects can already be torn down during abort.
  }
};

const createNodeLlamaAdapter = async ({
  modelPath,
  capabilities: capabilityOverrides,
  llamaModule,
} = {}) => {
  const capabilities = resolveCapabilities(capabilityOverrides);
  const module = llamaModule || await import('node-llama-cpp');
  const llama = await module.getLlama({ build: 'never', skipDownload: true });
  const model = await llama.loadModel({
    modelPath,
    gpuLayers: capabilities.gpuLayers,
    defaultContextFlashAttention: capabilities.flashAttention !== false,
  });
  const grammar = await llama.createGrammarForJsonSchema(SEMANTIC_JSON_SCHEMA);
  const context = await model.createContext({
    contextSize: capabilities.contextSize || CONTEXT_SIZE,
    sequences: MAX_SAFE_SEQUENCES,
    flashAttention: capabilities.flashAttention !== false,
    batchSize: capabilities.batchSize,
    ...(capabilities.threads ? { threads: capabilities.threads } : {}),
  });
  const generateLock = createMutex();
  let disposed = false;

  const diagnostics = {
    sequences: MAX_SAFE_SEQUENCES,
    batchSize: capabilities.batchSize,
    contextSize: context.contextSize || capabilities.contextSize || CONTEXT_SIZE,
    gpuLayers: model.gpuLayers ?? capabilities.gpuLayers,
    flashAttention: capabilities.flashAttention !== false,
  };

  return {
    diagnostics,
    async generate({ prompt, signal }) {
      if (disposed) throw new Error('inference-adapter-disposed');
      return generateLock(async () => {
        if (disposed) throw new Error('inference-adapter-disposed');
        const sequence = context.getSequence();
        const session = new module.LlamaChatSession({
          contextSequence: sequence,
          autoDisposeSequence: false,
          systemPrompt: SEMANTIC_SYSTEM_PROMPT,
        });
        try {
          return await session.prompt(prompt, {
            grammar,
            maxTokens: capabilities.maxOutputTokens || MAX_OUTPUT_TOKENS,
            temperature: 0,
            signal,
            budgets: { thoughtTokens: 0 },
          });
        } finally {
          // Dispose the sequence instead of resetChatHistory(). The latter
          // reads hybrid recurrent KV from the Electron main thread while
          // llama_decode may still be running on a libuv worker.
          session.dispose?.({ disposeSequence: true });
        }
      });
    },
    async dispose() {
      disposed = true;
      await disposeQuietly(context);
      await disposeQuietly(model);
      await disposeQuietly(llama);
    },
  };
};

module.exports = {
  createNodeLlamaAdapter,
};
