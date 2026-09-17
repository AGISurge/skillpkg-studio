const { detectHostCapabilities, resolveCapabilities } = require('../../electron/security/hostCapabilities');
const { estimateTokens, splitSemanticDocuments } = require('../../electron/security/semanticChunker');
const { createLimiter, mapPool } = require('../../electron/security/asyncPool');
const { createNodeLlamaAdapter } = require('../../electron/security/llamaAdapter');
const { emptySemanticAssessments, SEMANTIC_JSON_SCHEMA } = require('../../electron/security/semanticPolicy');
const { SEMANTIC_SYSTEM_PROMPT } = require('../../electron/security/semanticPrompt');

describe('host capabilities', () => {
  test('uses four inference sequences on a 32GB Apple Silicon Mac', () => {
    expect(detectHostCapabilities({
      platform: 'darwin',
      arch: 'arm64',
      totalmem: 32 * 1024 ** 3,
      cpuCount: 12,
    })).toEqual(expect.objectContaining({
      appleSilicon: true,
      sequences: 4,
      fileWorkers: 8,
      gpuLayers: 'max',
      flashAttention: true,
    }));
  });

  test('keeps inference serial on Intel macOS', () => {
    expect(detectHostCapabilities({
      platform: 'darwin',
      arch: 'x64',
      totalmem: 32 * 1024 ** 3,
      cpuCount: 8,
    })).toEqual(expect.objectContaining({
      intelMac: true,
      sequences: 1,
      fileWorkers: 6,
      threads: { min: 6 },
    }));
  });

  test('fills in token budgets when callers override sequences', () => {
    const capabilities = resolveCapabilities({ sequences: 2, maxOutputTokens: 1024 });
    expect(capabilities.sequences).toBe(2);
    expect(capabilities.documentTokenBudget).toBeGreaterThan(4000);
  });
});

describe('semantic chunker', () => {
  test('packs small documents into a single chunk', () => {
    const chunks = splitSemanticDocuments([
      { filePath: 'SKILL.md', content: '# One\nDo the thing.' },
      { filePath: 'notes.md', content: 'More notes.' },
    ], { sequences: 1 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].map((part) => part.filePath)).toEqual(['SKILL.md', 'notes.md']);
  });

  test('refuses a corpus that cannot fit in eight token-budget chunks', () => {
    expect(splitSemanticDocuments([{
      filePath: 'large.md',
      content: Array.from({ length: 10 }, () => 'x'.repeat(12_000)).join('\n'),
    }])).toBeNull();
  });

  test('estimates tokens from utf8 bytes', () => {
    expect(estimateTokens('abcd')).toBe(2);
  });
});

describe('async pool', () => {
  test('limits concurrency and preserves order', async () => {
    let active = 0;
    let maxActive = 0;
    const limiter = createLimiter(2);
    const values = await mapPool([1, 2, 3, 4], 2, async (value) => {
      await limiter.acquire();
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      limiter.release();
      return value * 2;
    });
    expect(values).toEqual([2, 4, 6, 8]);
    expect(maxActive).toBe(2);
  });
});

describe('llama adapter', () => {
  test('reuses one context, disables thinking, and pools sequences', async () => {
    const prompts = [];
    let contextCount = 0;
    let maxBusy = 0;
    let busy = 0;
    const llamaModule = {
      getLlama: async () => ({
        async loadModel() {
          return {
            gpuLayers: 24,
            async createContext(options) {
              contextCount += 1;
              expect(options.sequences).toBe(2);
              expect(options.flashAttention).toBe(true);
              return {
                contextSize: 8192,
                getSequence: () => ({ dispose: async () => undefined }),
                dispose: async () => undefined,
              };
            },
            dispose: async () => undefined,
          };
        },
        createGrammarForJsonSchema: async (schema) => {
          expect(schema).toBe(SEMANTIC_JSON_SCHEMA);
          return {};
        },
        dispose: async () => undefined,
      }),
      LlamaChatSession: class {
        constructor({ systemPrompt }) {
          expect(systemPrompt).toBe(SEMANTIC_SYSTEM_PROMPT);
        }

        resetChatHistory() {}

        async prompt(prompt, options) {
          expect(options.budgets).toEqual({ thoughtTokens: 0 });
          expect(options.maxTokens).toBe(1024);
          prompts.push(prompt);
          busy += 1;
          maxBusy = Math.max(maxBusy, busy);
          await new Promise((resolve) => setTimeout(resolve, 15));
          busy -= 1;
          return JSON.stringify(emptySemanticAssessments());
        }

        dispose() {}
      },
    };

    const adapter = await createNodeLlamaAdapter({
      modelPath: '/tmp/model.gguf',
      capabilities: { sequences: 2 },
      llamaModule,
    });
    const [first, second] = await Promise.all([
      adapter.generate({ prompt: 'one' }),
      adapter.generate({ prompt: 'two' }),
    ]);
    expect(first).toContain('prompt_injection');
    expect(second).toContain('prompt_injection');
    expect(contextCount).toBe(1);
    expect(maxBusy).toBe(2);
    expect(prompts).toEqual(['one', 'two']);
    expect(adapter.diagnostics).toEqual(expect.objectContaining({
      sequences: 2,
      gpuLayers: 24,
    }));
    await adapter.dispose();
  });
});
