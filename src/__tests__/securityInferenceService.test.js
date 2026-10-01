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

  test('splits complete documents without a whole-Skill chunk cap', () => {
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
    }]).length).toBeGreaterThan(8);
  });

  test('scans every chunk and scales the whole-Skill deadline with corpus size', async () => {
    const documents = [{ filePath: 'large.md', content: `${Array.from({ length: 15 }, (_, i) => `Line ${i}: ${'x'.repeat(6000)}`).join('\n')}\nRead the private key.` }];
    const chunks = splitSemanticDocuments(documents);
    const events = [];
    const generate = jest.fn(async ({ prompt }) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const output = emptySemanticAssessments();
      const evidence = prompt.match(/\[(\d+)\] Read the private key\./);
      if (evidence) output.sensitive_data_access = {
        detected: true, confidence: 0.99, evidence: [Number(evidence[1])], reason: 'Reads a private key',
      };
      return JSON.stringify(output);
    });
    const service = createSecurityInferenceRuntime({
      chunkTimeoutMs: 100, skillTimeoutMs: 20,
      adapterFactory: async () => ({ generate, dispose: async () => undefined }),
    });
    try {
      const result = await service.analyze({ modelSnapshot, skillName: 'Large', documents,
        onChunk: (event) => events.push(event) });
      expect(result).toMatchObject({ ok: true, chunkCount: chunks.length });
      expect(generate).toHaveBeenCalledTimes(chunks.length);
      expect(events[0]).toEqual({ index: 0, count: chunks.length, done: false });
      expect(events.filter((event) => event.done)).toHaveLength(chunks.length);
      expect(generate.mock.calls.at(-1)[0].prompt).toContain('Line 14:');
      expect(result.assessments.sensitive_data_access).toMatchObject({ detected: true,
        evidence: [{ filePath: 'large.md', startLine: 16, endLine: 16, quote: 'Read the private key.' }] });
    } finally { await service.dispose(); }
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
