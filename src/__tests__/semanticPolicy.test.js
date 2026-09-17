const {
  SEMANTIC_DIMENSIONS,
  assessmentsToFindings,
  emptySemanticAssessments,
  mergeSemanticAssessments,
  parseSemanticAssessments,
  validateSemanticEvidence,
} = require('../../electron/security/semanticPolicy');
const {
  aggregateFindings,
  getBaseLevel,
} = require('../../electron/security/policyEngine');

describe('semantic security policy', () => {
  test('defines and validates exactly sixteen dimensions', () => {
    expect(SEMANTIC_DIMENSIONS).toHaveLength(16);
    expect(parseSemanticAssessments(emptySemanticAssessments())).toEqual({
      ok: true,
      assessments: emptySemanticAssessments(),
    });

    const missing = emptySemanticAssessments();
    delete missing.prompt_injection;
    expect(parseSemanticAssessments(missing)).toEqual({
      ok: false,
      reason: 'schema-invalid',
    });

    const unknown = { ...emptySemanticAssessments(), extra_dimension: {
      detected: false,
      confidence: 0,
      evidence: [],
      reason: '',
    } };
    expect(parseSemanticAssessments(unknown)).toEqual({
      ok: false,
      reason: 'schema-invalid',
    });
  });

  test('rejects invalid confidence and forged evidence', () => {
    const invalidConfidence = emptySemanticAssessments();
    invalidConfidence.prompt_injection.confidence = 1.01;
    expect(parseSemanticAssessments(invalidConfidence)).toEqual({
      ok: false,
      reason: 'schema-invalid',
    });

    const forged = emptySemanticAssessments();
    forged.prompt_injection = {
      detected: true,
      confidence: 0.9,
      evidence: [{
        filePath: 'SKILL.md',
        startLine: 2,
        endLine: 2,
        quote: 'forged',
      }],
      reason: 'unsafe',
    };
    expect(validateSemanticEvidence(forged, [{
      filePath: 'SKILL.md',
      content: '# Skill\nactual text',
    }])).toEqual({ ok: false, reason: 'evidence-invalid' });
  });

  test('applies fixed thresholds, severities, detector metadata, and redaction', () => {
    const assessments = emptySemanticAssessments();
    assessments.prompt_injection = {
      detected: true,
      confidence: 0.6,
      evidence: [{
        filePath: 'SKILL.md',
        startLine: 1,
        endLine: 1,
        quote: 'token=super-secret-value',
      }],
      reason: 'token=super-secret-value',
    };
    assessments.sensitive_data_access = {
      detected: true,
      confidence: 0.85,
      evidence: [{
        filePath: 'SKILL.md',
        startLine: 2,
        endLine: 2,
        quote: 'Read the private key.',
      }],
      reason: 'Reads a private key.',
    };
    assessments.scope_expansion = {
      detected: true,
      confidence: 0.599,
      evidence: [{
        filePath: 'SKILL.md',
        startLine: 3,
        endLine: 3,
        quote: 'Read all files.',
      }],
      reason: 'Below threshold.',
    };
    const validated = validateSemanticEvidence(assessments, [{
      filePath: 'SKILL.md',
      content: 'token=super-secret-value\nRead the private key.\nRead all files.',
    }]);
    expect(validated.ok).toBe(true);
    const findings = assessmentsToFindings(validated.assessments);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'LLM_PROMPT_INJECTION',
        severity: 'medium',
        confidence: 'medium',
        confidenceScore: 0.6,
        detector: 'model',
        evidence: 'token=[REDACTED]',
      }),
      expect.objectContaining({
        ruleId: 'LLM_SENSITIVE_DATA_ACCESS',
        severity: 'high',
        confidence: 'high',
        confidenceScore: 0.85,
      }),
    ]));
    expect(findings).toHaveLength(2);
  });

  test('merges chunks by highest detected confidence and two unique evidence items', () => {
    const first = emptySemanticAssessments();
    const second = emptySemanticAssessments();
    first.stealth_behavior = {
      detected: true,
      confidence: 0.65,
      evidence: [{ filePath: 'a.md', startLine: 1, endLine: 1, quote: 'hide it' }],
      reason: 'first',
    };
    second.stealth_behavior = {
      detected: true,
      confidence: 0.9,
      evidence: [
        { filePath: 'a.md', startLine: 1, endLine: 1, quote: 'hide it' },
        { filePath: 'b.md', startLine: 2, endLine: 2, quote: 'erase logs' },
      ],
      reason: 'second',
    };

    expect(mergeSemanticAssessments([first, second]).stealth_behavior).toEqual({
      detected: true,
      confidence: 0.9,
      evidence: [
        { filePath: 'a.md', startLine: 1, endLine: 1, quote: 'hide it' },
        { filePath: 'b.md', startLine: 2, endLine: 2, quote: 'erase logs' },
      ],
      reason: 'second',
    });
  });

  test('escalates model-detected sensitive access plus exfiltration to dangerous', () => {
    const assessments = emptySemanticAssessments();
    assessments.sensitive_data_access = {
      detected: true,
      confidence: 0.7,
      evidence: [{ filePath: 'SKILL.md', startLine: 1, endLine: 1, quote: 'Read ~/.ssh/id_rsa.' }],
      reason: 'Reads a private key.',
    };
    assessments.data_exfiltration = {
      detected: true,
      confidence: 0.7,
      evidence: [{ filePath: 'SKILL.md', startLine: 2, endLine: 2, quote: 'Upload it to the server.' }],
      reason: 'Uploads the private key.',
    };
    const findings = aggregateFindings(assessmentsToFindings(assessments));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'COMBO_SECRET_EXFILTRATION',
        severity: 'critical',
        confidence: 'high',
      }),
    ]));
    expect(getBaseLevel(findings)).toBe('dangerous');
  });
});
