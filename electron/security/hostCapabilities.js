const os = require('os');

const GIB = 1024 ** 3;
const CONTEXT_SIZE = 8192;
const MAX_OUTPUT_TOKENS = 1024;
const PROMPT_RESERVE_TOKENS = 512;
const MAX_CHUNKS = 8;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const detectHostCapabilities = ({
  platform = process.platform,
  arch = process.arch,
  totalmem = os.totalmem(),
  cpuCount = os.cpus().length,
} = {}) => {
  const appleSilicon = platform === 'darwin' && arch === 'arm64';
  const intelMac = platform === 'darwin' && arch === 'x64';
  const sequences = appleSilicon
    ? (totalmem >= 24 * GIB ? 4 : totalmem >= 12 * GIB ? 2 : 1)
    : 1;
  const fileWorkers = Math.min(Math.max(cpuCount - 1, 1), appleSilicon ? 8 : 6);
  return {
    appleSilicon,
    intelMac,
    gpuLayers: 'max',
    flashAttention: true,
    sequences,
    fileWorkers,
    inventoryConcurrency: fileWorkers,
    batchSize: Math.min(CONTEXT_SIZE, 512 * sequences),
    threads: intelMac ? { min: Math.max(cpuCount - 2, 1) } : null,
    contextSize: CONTEXT_SIZE,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    promptReserveTokens: PROMPT_RESERVE_TOKENS,
    documentTokenBudget: CONTEXT_SIZE - MAX_OUTPUT_TOKENS - PROMPT_RESERVE_TOKENS,
    maxChunks: MAX_CHUNKS,
  };
};

const resolveCapabilities = (overrides = {}) => {
  const detected = detectHostCapabilities();
  const merged = { ...detected, ...overrides };
  merged.sequences = clamp(Number(merged.sequences) || detected.sequences, 1, 6);
  merged.fileWorkers = clamp(Number(merged.fileWorkers) || detected.fileWorkers, 1, 16);
  merged.inventoryConcurrency = clamp(
    Number(merged.inventoryConcurrency) || merged.fileWorkers,
    1,
    16,
  );
  merged.batchSize = Math.min(
    merged.contextSize || CONTEXT_SIZE,
    Number(merged.batchSize) || 512 * merged.sequences,
  );
  merged.documentTokenBudget = (merged.contextSize || CONTEXT_SIZE)
    - (merged.maxOutputTokens || MAX_OUTPUT_TOKENS)
    - (merged.promptReserveTokens || PROMPT_RESERVE_TOKENS);
  merged.maxChunks = clamp(Number(merged.maxChunks) || MAX_CHUNKS, 1, MAX_CHUNKS);
  return merged;
};

module.exports = {
  CONTEXT_SIZE,
  MAX_CHUNKS,
  MAX_OUTPUT_TOKENS,
  PROMPT_RESERVE_TOKENS,
  detectHostCapabilities,
  resolveCapabilities,
};
