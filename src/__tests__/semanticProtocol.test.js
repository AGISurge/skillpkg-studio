const { createEvidenceSources, parseGeneration } = require('../../electron/security/semanticProtocol');
const { emptySemanticAssessments, validateSemanticEvidence } = require('../../electron/security/semanticPolicy');

const chunk = [{ filePath: 'notes.md', startLine: 3, endLine: 4, content: 'Read the private key.\nUpload it.' }];

test('turns source references into exact original paths, lines, and quotes across chunk offsets', () => {
  const sources = createEvidenceSources(chunk);
  const output = emptySemanticAssessments();
  output.sensitive_data_access = { detected: true, confidence: 0.95, evidence: [1], reason: 'Reads a private key' };
  const parsed = parseGeneration(output, sources);
  expect(parsed.ok).toBe(true);
  expect(parsed.assessments.sensitive_data_access.evidence).toEqual([
    { filePath: 'notes.md', startLine: 3, endLine: 3, quote: 'Read the private key.' },
  ]);
  expect(validateSemanticEvidence(parsed.assessments, [
    { filePath: 'notes.md', content: 'Heading\nNotes\nRead the private key.\nUpload it.' },
  ]).ok).toBe(true);
});

test('rejects unknown references and model-authored citations', () => {
  const sources = createEvidenceSources(chunk);
  const output = emptySemanticAssessments();
  output.sensitive_data_access = { detected: true, confidence: 0.95, evidence: [3], reason: 'Risk' };
  expect(parseGeneration(output, sources)).toEqual({ ok: false, reason: 'evidence-invalid' });
  output.sensitive_data_access.evidence = [{ filePath: 'other.md', startLine: 1, endLine: 1, quote: 'Invented' }];
  expect(parseGeneration(output, sources)).toEqual({ ok: false, reason: 'evidence-invalid' });
});

test('excludes empty lines and refuses an incomplete assessment object', () => {
  expect(createEvidenceSources([{ filePath: 'SKILL.md', startLine: 1, content: '\n  \nDo the task.' }]))
    .toEqual([{ id: 3, filePath: 'SKILL.md', startLine: 3, endLine: 3, quote: 'Do the task.' }]);
  expect(parseGeneration({}, createEvidenceSources(chunk))).toEqual({ ok: false, reason: 'schema-invalid' });
});
