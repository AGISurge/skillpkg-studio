const { emptySemanticAssessments } = require('../../../electron/security/semanticPolicy');
const { splitSemanticDocuments } = require('../../../electron/security/semanticChunker');
process.on('message', (message) => {
  if (message.type !== 'analyze') return;
  const send = (value) => process.send({ id: message.id, ...value });
  const name = message.input.skillName;
  if (name === 'crash') process.exit(1);
  send({ type: 'progress', progress: { stage: 'loading', percent: 100 } });
  if (name === 'load-hang') {
    const until = Date.now() + 10000;
    while (Date.now() < until) {}
    return;
  }
  const count = splitSemanticDocuments(message.input.documents).length;
  send({ type: 'chunk', chunk: { index: 0, count, done: false } });
  for (let index = 1; index <= count; index += 1) {
    send({ type: 'chunk', chunk: { index, count, done: false } });
    send({ type: 'progress', progress: { stage: 'generating', chunkIndex: index, chunkCount: count,
      generatedTokens: 1, completedDimensions: 0, totalDimensions: 16 } });
    // Deliberately block this child, including its IPC cancellation handler.
    const until = Date.now() + (name === 'hang' ? 10000 : count > 1 ? 15 : 250);
    while (Date.now() < until) {}
    send({ type: 'progress', progress: { stage: 'validating', chunkIndex: index, chunkCount: count } });
    send({ type: 'chunk', chunk: { index, count, done: true } });
  }
  send({ type: 'result', result: { ok: true, assessments: emptySemanticAssessments(), chunkCount: count } });
});
