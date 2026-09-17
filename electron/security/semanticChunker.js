const { MAX_CHUNKS, resolveCapabilities } = require('./hostCapabilities');

const estimateTokens = (text) => Math.ceil(Buffer.byteLength(String(text), 'utf8') / 2);

const documentWrapperTokens = (filePath) => estimateTokens(
  `<document path=${JSON.stringify(filePath)} startLine="9999" endLine="9999">\n</document>\n`,
);

const windowTokens = (filePath, content) => (
  documentWrapperTokens(filePath) + estimateTokens(content)
);

const splitSemanticDocuments = (documents, options = {}) => {
  const capabilities = resolveCapabilities(options);
  const budget = capabilities.documentTokenBudget;
  const maxChunks = capabilities.maxChunks || MAX_CHUNKS;
  const windows = [];
  for (const document of documents) {
    const lines = String(document.content).split(/\r?\n/);
    let start = 0;
    while (start < lines.length) {
      let end = start;
      let content = '';
      while (end < lines.length) {
        const candidate = end === start ? lines[end] : `${content}\n${lines[end]}`;
        if (windowTokens(document.filePath, candidate) > budget) {
          if (end === start) return null;
          break;
        }
        content = candidate;
        end += 1;
      }
      windows.push({
        filePath: document.filePath,
        startLine: start + 1,
        endLine: end,
        content,
        tokens: windowTokens(document.filePath, content),
      });
      start = end;
    }
  }

  const chunks = [];
  let current = [];
  let currentTokens = 0;
  const flush = () => {
    if (!current.length) return;
    chunks.push(current);
    current = [];
    currentTokens = 0;
  };
  for (const window of windows) {
    if (currentTokens + window.tokens > budget) flush();
    current.push({
      filePath: window.filePath,
      startLine: window.startLine,
      endLine: window.endLine,
      content: window.content,
    });
    currentTokens += window.tokens;
  }
  flush();
  return chunks.length <= maxChunks ? chunks : null;
};

module.exports = {
  estimateTokens,
  splitSemanticDocuments,
};
