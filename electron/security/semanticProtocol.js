const { SEMANTIC_DIMENSIONS, parseSemanticAssessments } = require('./semanticPolicy');

// Evidence is a reference to trusted source text, never text invented by the model.
const createEvidenceSources = (chunk) => chunk.flatMap((document) => (
  document.content.split('\n').map((quote, index) => ({
    filePath: document.filePath, startLine: document.startLine + index,
    endLine: document.startLine + index, quote,
  }))
)).map((source, index) => ({ id: index + 1, ...source })).filter((source) => source.quote.trim());

const createGenerationSchema = (sources) => ({
  type: 'object', additionalProperties: false, required: [...SEMANTIC_DIMENSIONS],
  properties: Object.fromEntries(SEMANTIC_DIMENSIONS.map((dimension) => [dimension, {
    oneOf: (sources.length ? [false, true] : [false]).map((detected) => ({
      type: 'object', additionalProperties: false,
      required: ['detected', 'confidence', 'evidence', 'reason'],
      properties: {
        detected: { const: detected },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidence: { type: 'array', minItems: detected ? 1 : 0, maxItems: detected ? 2 : 0,
          items: sources.length ? { enum: sources.map((source) => source.id) } : { type: 'integer' } },
        reason: detected ? { type: 'string', maxLength: 240 } : { const: '' },
      },
    })),
  }])),
});

const parseGeneration = (value, sources) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== SEMANTIC_DIMENSIONS.length) return { ok: false, reason: 'schema-invalid' };
  const byId = new Map(sources.map((source) => [source.id, source]));
  const assessments = {};
  for (const dimension of SEMANTIC_DIMENSIONS) {
    const entry = value[dimension];
    if (!entry || !Array.isArray(entry.evidence)) return { ok: false, reason: 'schema-invalid' };
    const evidence = [];
    for (const id of entry.evidence) {
      const source = Number.isInteger(id) ? byId.get(id) : null;
      if (!source) return { ok: false, reason: 'evidence-invalid' };
      const { id: _id, ...citation } = source;
      evidence.push(citation);
    }
    assessments[dimension] = { ...entry, evidence };
  }
  return parseSemanticAssessments(assessments);
};

module.exports = { createEvidenceSources, createGenerationSchema, parseGeneration };
