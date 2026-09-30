const path = require('path');
const { fork } = require('child_process');
const { resolveCapabilities } = require('./hostCapabilities');

const defaultProcessFactory = (processPath) => {
  const child = fork(processPath, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  child.postMessage = (message) => child.send(message);
  return child;
};

// One shared FIFO owns the model for both library scans and single-Skill checks.
// Electron supplies utilityProcess.fork; Node uses fork for integration tests.
const createSecurityInferenceService = ({
  processPath = path.join(__dirname, 'inferenceProcess.js'),
  processFactory = defaultProcessFactory,
  capabilities: overrides,
  chunkTimeoutMs = 60_000,
  skillTimeoutMs = 8 * 60_000,
  loadTimeoutMs = 120_000,
  cancelGraceMs = 2_000,
} = {}) => {
  const capabilities = resolveCapabilities(overrides);
  const queue = [];
  let child = null;
  let active = null;
  let sequence = 0;
  let disposed = false;

  const stopChild = () => {
    const previous = child;
    child = null;
    previous?.kill();
  };
  const finish = (job, result) => {
    clearTimeout(job.timer);
    clearTimeout(job.stageTimer);
    clearTimeout(job.cancelTimer);
    job.input.signal?.removeEventListener('abort', job.abort);
    if (active === job) active = null;
    job.resolve(result);
    dispatch();
  };
  const failProcess = (current) => {
    if (child !== current) return;
    child = null;
    current.kill();
    if (active) finish(active, { ok: false, reason: 'inference-failed' });
  };
  const ensureChild = () => {
    if (child) return child;
    const current = processFactory(processPath);
    child = current;
    current.on('message', (message) => {
      if (child !== current || !active || message.id !== active.id) return;
      const job = active;
      if (message.type === 'chunk') job.input.onChunk?.(message.chunk);
      if (message.type === 'progress') {
        const progress = message.progress;
        if (progress.stage === 'generating' && job.chunkIndex !== progress.chunkIndex) {
          job.chunkIndex = progress.chunkIndex;
          clearTimeout(job.stageTimer);
          job.stageTimer = setTimeout(() => {
            stopChild();
            finish(job, { ok: false, reason: 'timeout' });
          }, chunkTimeoutMs + cancelGraceMs);
        }
        if (progress.stage === 'validating') clearTimeout(job.stageTimer);
        job.input.onProgress?.(progress);
      }
      if (message.type === 'result') finish(job, message.result);
    });
    current.on('error', () => failProcess(current));
    current.on('exit', () => failProcess(current));
    return current;
  };
  const dispatch = () => {
    if (disposed || active || !queue.length) return;
    const job = queue.shift();
    active = job;
    // This watchdog runs outside native inference, including synchronous native calls.
    job.timer = setTimeout(() => {
      stopChild();
      finish(job, { ok: false, reason: 'timeout' });
    }, loadTimeoutMs + skillTimeoutMs);
    job.stageTimer = setTimeout(() => {
      stopChild();
      finish(job, { ok: false, reason: 'timeout' });
    }, loadTimeoutMs);
    try {
      const current = ensureChild();
      const { signal, onChunk, onProgress, ...input } = job.input;
      current.postMessage({
        type: 'analyze', id: job.id, input,
        options: { capabilities, chunkTimeoutMs, skillTimeoutMs, loadTimeoutMs },
      });
    } catch (_error) {
      stopChild();
      finish(job, { ok: false, reason: 'load-failed' });
    }
  };
  const analyze = (input) => {
    if (disposed || input.signal?.aborted) return Promise.resolve({ ok: false, reason: 'inference-failed' });
    return new Promise((resolve) => {
      const job = { id: ++sequence, input, resolve, timer: null, cancelTimer: null, abort: null };
      job.abort = () => {
        if (active !== job) {
          const index = queue.indexOf(job);
          if (index >= 0) queue.splice(index, 1);
          finish(job, { ok: false, reason: 'inference-failed' });
          return;
        }
        try {
          child?.postMessage({ type: 'cancel', id: job.id, reason: String(input.signal.reason?.message || 'scan-canceled') });
        } catch (_error) {
          stopChild();
          finish(job, { ok: false, reason: 'inference-failed' });
          return;
        }
        job.cancelTimer = setTimeout(() => {
          stopChild();
          finish(job, { ok: false, reason: 'inference-failed' });
        }, cancelGraceMs);
      };
      input.signal?.addEventListener('abort', job.abort, { once: true });
      queue.push(job);
      input.onProgress?.({ stage: 'queued' });
      dispatch();
    });
  };
  const releaseIdle = async () => {
    if (active || queue.length || !child) return false;
    stopChild();
    return true;
  };
  const dispose = async () => {
    disposed = true;
    stopChild();
    for (const job of queue.splice(0)) finish(job, { ok: false, reason: 'inference-failed' });
    if (active) finish(active, { ok: false, reason: 'inference-failed' });
  };
  return { analyze, releaseIdle, dispose, isBusy: () => Boolean(active || queue.length), getCapabilities: () => capabilities };
};

module.exports = { createSecurityInferenceService };
