const { emptySemanticAssessments } = require('../../../electron/security/semanticPolicy');
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
  send({ type: 'chunk', chunk: { index: 1, count: 1, done: false } });
  send({ type: 'progress', progress: { stage: 'generating', chunkIndex: 1, chunkCount: 1,
    generatedTokens: 1, completedDimensions: 0, totalDimensions: 16 } });
  // Deliberately block this child, including its IPC cancellation handler.
  const until = Date.now() + (name === 'hang' ? 10000 : 250);
  while (Date.now() < until) {}
  send({ type: 'chunk', chunk: { index: 1, count: 1, done: true } });
  send({ type: 'result', result: { ok: true, assessments: emptySemanticAssessments() } });
});
