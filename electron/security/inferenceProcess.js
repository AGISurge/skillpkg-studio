// The native model and all inference work live in this process, never in Electron main.
const { createSecurityInferenceRuntime } = require('./securityInferenceRuntime');

const port = process.parentPort;
const send = (message) => port ? port.postMessage(message) : process.send?.(message);
let runtime;
let active;

const receive = async (message) => {
  if (message.type === 'cancel') {
    if (active?.id === message.id) active.controller.abort(new Error(message.reason));
    return;
  }
  if (message.type !== 'analyze' || active) return;
  runtime ||= createSecurityInferenceRuntime(message.options);
  const controller = new AbortController();
  active = { id: message.id, controller };
  try {
    const result = await runtime.analyze({
      ...message.input,
      signal: controller.signal,
      onChunk: (chunk) => send({ type: 'chunk', id: message.id, chunk }),
      onProgress: (progress) => send({ type: 'progress', id: message.id, progress }),
    });
    send({ type: 'result', id: message.id, result });
  } catch (_error) {
    send({ type: 'result', id: message.id, result: { ok: false, reason: 'inference-failed' } });
  } finally {
    active = null;
  }
};

if (port) port.on('message', ({ data }) => { void receive(data); });
else process.on('message', (message) => { void receive(message); });
