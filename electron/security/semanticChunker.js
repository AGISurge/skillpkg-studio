const { resolveCapabilities } = require('./hostCapabilities');

const estimateTokens = (text) => Math.ceil(Buffer.byteLength(String(text), 'utf8') / 2);
const LINE_LABEL_TOKENS = estimateTokens('[99999] ') + 1;

const documentWrapperTokens = (filePath) => estimateTokens(
  `<document path=${JSON.stringify(filePath)} startLine="999999999" endLine="999999999">\n</document>\n`,
);

// Split only at UTF-8 character boundaries. Overlap keeps instructions spanning
// a long-line boundary visible together; citations still refer to the original line.
function* splitLine(text, maxBytes) {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    yield text;
    return;
  }
  const bytes = Buffer.from(text, 'utf8');
  const overlap = Math.min(512, Math.floor(maxBytes / 4));
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + maxBytes, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    yield bytes.subarray(start, end).toString('utf8');
    if (end === bytes.length) break;
    start = end - overlap;
    while ((bytes[start] & 0xc0) === 0x80) start += 1;
  }
}

// Context size limits each request, not the number of requests for a Skill.
// Planning happens exclusively in the inference process, with linear work in
// corpus size and no repeated concatenation/token estimation of growing windows.
const splitSemanticDocuments = (documents, options = {}) => {
  const { documentTokenBudget: budget } = resolveCapabilities(options);
  const chunks = [];
  let current = [];
  let currentTokens = 0;
  const flush = () => {
    if (!current.length) return;
    chunks.push(current.map((part) => ({
      ...part, content: part.lines.map((line) => line.text).join('\n'),
    })));
    current = [];
    currentTokens = 0;
  };
  for (const document of documents) {
    const wrapperTokens = documentWrapperTokens(document.filePath);
    const maxLineBytes = Math.floor((budget - wrapperTokens - LINE_LABEL_TOKENS) * 2);
    if (maxLineBytes < 4) throw new RangeError('Semantic context cannot fit a document wrapper');
    const lines = String(document.content).split(/\r?\n/);
    let part = null;
    for (let index = 0; index < lines.length; index += 1) {
      for (const text of splitLine(lines[index], maxLineBytes)) {
        const tokens = estimateTokens(text) + LINE_LABEL_TOKENS;
        if (currentTokens + tokens + (part ? 0 : wrapperTokens) > budget) {
          flush();
          part = null;
        }
        if (!part) {
          part = { filePath: document.filePath, startLine: index + 1, endLine: index + 1, lines: [] };
          current.push(part);
          currentTokens += wrapperTokens;
        }
        part.lines.push({ lineNumber: index + 1, text, quote: lines[index] });
        part.endLine = index + 1;
        currentTokens += tokens;
      }
    }
  }
  flush();
  return chunks;
};

module.exports = {
  estimateTokens,
  splitSemanticDocuments,
};
