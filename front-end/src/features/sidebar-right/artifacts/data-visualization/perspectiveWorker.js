import workerUrl from '@perspective-dev/client/dist/cdn/perspective-server.worker.js?url';

/** Own the native worker so initialization failure and cancellation can always terminate it. */
export async function createPerspectiveWorker(signal) {
  const [{ default: perspective }] = await Promise.all([
    import('@perspective-dev/client/inline'),
    import('@perspective-dev/viewer/inline'),
    import('@perspective-dev/viewer-datagrid'),
    import('@perspective-dev/viewer-charts'),
  ]);
  if (signal?.aborted) throw new Error('Analysis was cancelled.');
  const native = new Worker(workerUrl, { type: 'module', name: 'moonlit-perspective' });
  // 4.5.1's public worker API calls MessagePort.close even for a Worker.
  // Adapt this owned instance only; never modify the global Worker prototype.
  native.close = () => native.terminate();
  let client;
  const terminate = () => {
    signal?.removeEventListener('abort', terminate);
    try {
      client?.terminate().catch(() => {});
    } finally {
      native.terminate();
    }
  };
  signal?.addEventListener('abort', terminate, { once: true });
  try {
    client = await perspective.worker(Promise.resolve(native));
    if (signal?.aborted) {
      terminate();
      throw new Error('Analysis was cancelled.');
    }
    return { client, terminate };
  } catch (error) {
    terminate();
    throw error;
  }
}
