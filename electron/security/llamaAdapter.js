const { SEMANTIC_JSON_SCHEMA } = require('./semanticPolicy');
const { SEMANTIC_SYSTEM_PROMPT } = require('./semanticPrompt');
const { CONTEXT_SIZE, MAX_OUTPUT_TOKENS, resolveCapabilities } = require('./hostCapabilities');
const { createLimiter } = require('./asyncPool');

const createContextWithFallback = async (model, capabilities) => {
  const attempts = [capabilities.sequences];
  if (capabilities.sequences > 1) attempts.push(1);
  let lastError;
  for (const sequences of attempts) {
    try {
      const options = {
        contextSize: capabilities.contextSize || CONTEXT_SIZE,
        sequences,
        flashAttention: capabilities.flashAttention !== false,
        batchSize: Math.min(
          capabilities.contextSize || CONTEXT_SIZE,
          capabilities.batchSize || 512 * sequences,
        ),
      };
      if (capabilities.threads) options.threads = capabilities.threads;
      const context = await model.createContext(options);
      return { context, sequences };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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
  const { context, sequences: sequenceCount } = await createContextWithFallback(model, capabilities);
  const slots = [];
  for (let index = 0; index < sequenceCount; index += 1) {
    const sequence = context.getSequence();
    slots.push({
      sequence,
      session: new module.LlamaChatSession({
        contextSequence: sequence,
        autoDisposeSequence: false,
        systemPrompt: SEMANTIC_SYSTEM_PROMPT,
      }),
    });
  }
  const limiter = createLimiter(slots.length);
  const idleSlots = [...slots];
  let disposed = false;

  const diagnostics = {
    sequences: slots.length,
    contextSize: context.contextSize || capabilities.contextSize || CONTEXT_SIZE,
    gpuLayers: model.gpuLayers ?? capabilities.gpuLayers,
    flashAttention: capabilities.flashAttention !== false,
  };

  return {
    diagnostics,
    async generate({ prompt, signal }) {
      if (disposed) throw new Error('inference-adapter-disposed');
      await limiter.acquire();
      const slot = idleSlots.pop();
      try {
        if (!slot) throw new Error('inference-sequence-missing');
        slot.session.resetChatHistory?.();
        return await slot.session.prompt(prompt, {
          grammar,
          maxTokens: capabilities.maxOutputTokens || MAX_OUTPUT_TOKENS,
          temperature: 0,
          signal,
          budgets: { thoughtTokens: 0 },
        });
      } finally {
        if (slot) {
          slot.session.resetChatHistory?.();
          idleSlots.push(slot);
        }
        limiter.release();
      }
    },
    async dispose() {
      disposed = true;
      limiter.failWaiting(new Error('inference-adapter-disposed'));
      for (const slot of slots) {
        slot.session.dispose?.({ disposeSequence: true });
      }
      slots.length = 0;
      await context.dispose?.();
      await model.dispose?.();
      await llama.dispose?.();
    },
  };
};

module.exports = {
  createNodeLlamaAdapter,
};
