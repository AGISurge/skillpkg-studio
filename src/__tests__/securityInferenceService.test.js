const {
  createSecurityInferenceRuntime,
  hasExactlyOneDimensionKey,
  splitSemanticDocuments,
} = require('../../electron/security/securityInferenceRuntime');
const {
  emptySemanticAssessments,
} = require('../../electron/security/semanticPolicy');

const modelSnapshot = {
  kind: 'ready',
  modelPath: '/tmp/model.gguf',
  modelSha256: 'abc',
};

describe('security inference service', () => {
  test('rejects duplicate keyed dimensions before JSON parsing loses them', () => {
    const valid = JSON.stringify(emptySemanticAssessments());
    const duplicate = valid.replace(
      '"prompt_injection":',
      '"prompt_injection":{},"prompt_injection":',
    );
    expect(hasExactlyOneDimensionKey(valid)).toBe(true);
    expect(hasExactlyOneDimensionKey(duplicate)).toBe(false);
  });

  test('splits complete documents and refuses more than eight chunks', () => {
    expect(splitSemanticDocuments([{
      filePath: 'SKILL.md',
      content: 'safe text',
    }])).toEqual([[
      expect.objectContaining({
        filePath: 'SKILL.md',
        startLine: 1,
        endLine: 1,
      }),
    ]]);
    expect(splitSemanticDocuments([{
      filePath: 'large.md',
      content: Array.from({ length: 10 }, () => 'x'.repeat(12_000)).join('\n'),
    }])).toBeNull();
  });

  test('loads lazily and serializes generation for the hybrid model', async () => {
    let active = 0;
    let maxActive = 0;
    const prompts = [];
    const dispose = jest.fn(async () => undefined);
    const adapterFactory = jest.fn(async () => ({
      generate: async ({ prompt }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        prompts.push(prompt);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return JSON.stringify(emptySemanticAssessments());
      },
      dispose,
    }));
    const service = createSecurityInferenceRuntime({
      adapterFactory,
      capabilities: { sequences: 4 },
    });
    const input = {
      modelSnapshot,
      skillName: 'Sample',
      description: 'Formats text',
      documents: [{ filePath: 'SKILL.md', content: '# Sample' }],
    };

    const results = await Promise.all([
      service.analyze(input),
      service.analyze(input),
      service.analyze(input),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(adapterFactory).toHaveBeenCalledTimes(1);
    expect(maxActive).toBe(1);
    expect(prompts[0]).toContain('Frontmatter description: Formats text');
    expect(prompts[0]).toContain('# Sample');

    await service.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('falls back for invalid JSON and chunk timeout', async () => {
    const invalid = createSecurityInferenceRuntime({
      adapterFactory: async () => ({
        generate: async () => 'not json',
        dispose: async () => undefined,
      }),
    });
    await expect(invalid.analyze({
      modelSnapshot,
      skillName: 'Invalid',
      description: '',
      documents: [{ filePath: 'SKILL.md', content: '# Invalid' }],
    })).resolves.toEqual({ ok: false, reason: 'schema-invalid' });
    await invalid.dispose();

    const timedOut = createSecurityInferenceRuntime({
      chunkTimeoutMs: 5,
      adapterFactory: async () => ({
        generate: ({ signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
        dispose: async () => undefined,
      }),
    });
    await expect(timedOut.analyze({
      modelSnapshot,
      skillName: 'Slow',
      description: '',
      documents: [{ filePath: 'SKILL.md', content: '# Slow' }],
    })).resolves.toEqual({ ok: false, reason: 'timeout' });
    await timedOut.dispose();
  });
});
