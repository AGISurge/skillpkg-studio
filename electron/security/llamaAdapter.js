const { SEMANTIC_DIMENSIONS } = require('./semanticPolicy');
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
  signal,
  onLoadProgress,
} = {}) => {
  const capabilities = resolveCapabilities(capabilityOverrides);
  const module = llamaModule || await import('node-llama-cpp');
  const llama = await module.getLlama({ build: 'never', skipDownload: true });
  let model;
  let context;
  try {
    if (signal?.aborted) throw signal.reason;
    model = await llama.loadModel({
      modelPath,
      gpuLayers: capabilities.gpuLayers,
      defaultContextFlashAttention: capabilities.flashAttention !== false,
      loadSignal: signal,
      onLoadProgress,
    });
    context = await model.createContext({
      contextSize: capabilities.contextSize || CONTEXT_SIZE,
      sequences: MAX_SAFE_SEQUENCES,
      flashAttention: capabilities.flashAttention !== false,
      batchSize: capabilities.batchSize,
      ...(capabilities.threads ? { threads: capabilities.threads } : {}),
    });
    if (signal?.aborted) throw signal.reason;
  } catch (error) {
    await disposeQuietly(context);
    await disposeQuietly(model);
    await disposeQuietly(llama);
    throw error;
  }
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
    async generate({ prompt, signal, onProgress, schema }) {
      if (disposed) throw new Error('inference-adapter-disposed');
      return generateLock(async () => {
        if (disposed) throw new Error('inference-adapter-disposed');
        if (signal?.aborted) throw signal.reason;
        const grammar = await llama.createGrammarForJsonSchema(schema);
        const sequence = context.getSequence();
        const session = new module.LlamaChatSession({
          contextSequence: sequence,
          autoDisposeSequence: false,
          systemPrompt: SEMANTIC_SYSTEM_PROMPT,
          // Auto-opened thoughts can consume the opening JSON token even with a zero thought budget.
          chatWrapper: new module.QwenChatWrapper({ variation: '3.5', thoughts: 'discourage' }),
        });
        let output = '';
        let generatedTokens = 0;
        let lastProgressAt = 0;
        try {
          return await session.prompt(prompt, {
            grammar,
            maxTokens: capabilities.maxOutputTokens || MAX_OUTPUT_TOKENS,
            temperature: 0,
            signal,
            budgets: { thoughtTokens: 0 },
            onToken: (tokens) => { generatedTokens += tokens.length; },
            onTextChunk: (text) => {
              output += text;
              const now = Date.now();
              if (now - lastProgressAt < 100) return;
              lastProgressAt = now;
              // Count closed assessments; token count alone cannot predict total output length.
              const completedDimensions = SEMANTIC_DIMENSIONS.filter((dimension) => {
                const marker = `"${dimension}"`;
                const start = output.indexOf(marker);
                if (start < 0) return false;
                const objectStart = output.indexOf('{', start + marker.length);
                if (objectStart < 0) return false;
                let depth = 0;
                let quoted = false;
                let escaped = false;
                for (let index = objectStart; index < output.length; index += 1) {
                  const char = output[index];
                  if (quoted) {
                    if (escaped) escaped = false;
                    else if (char === '\\') escaped = true;
                    else if (char === '"') quoted = false;
                  } else if (char === '"') quoted = true;
                  else if (char === '{') depth += 1;
                  else if (char === '}' && --depth === 0) return true;
                }
                return false;
              }).length;
              onProgress?.({ generatedTokens, completedDimensions });
            },
          });
        } finally {
          // Await native teardown before the next job can reuse the hybrid context.
          await session.dispose?.({ disposeSequence: true });
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
