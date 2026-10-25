/// <reference lib="webworker" />
import type { Preview } from '../blocks/types';
import { Executor } from './executor';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const executor = new Executor();
let latestRunId = 0;

/** Preview arrays are freshly allocated per run, so their buffers can be moved instead of copied. */
function transferables(preview: Preview | undefined): ArrayBuffer[] {
  switch (preview?.kind) {
    case 'waveform':
      return [preview.min.buffer, preview.max.buffer] as ArrayBuffer[];
    case 'spectrum':
      return [preview.frequencies.buffer, preview.values.buffer] as ArrayBuffer[];
    case 'spectrogram':
      return [preview.db.buffer as ArrayBuffer];
    case 'audio':
      return preview.channels.map((c) => c.buffer as ArrayBuffer);
    default:
      return [];
  }
}

const post = (message: FromWorker, transfer: Transferable[] = []) => self.postMessage(message, transfer);

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.type === 'addSource') {
    executor.addSource(message.id, message.source);
    return;
  }

  const { runId, graph } = message;
  latestRunId = runId;
  await executor.run(
    graph,
    (nodeId, status) => post({ type: 'status', runId, nodeId, status }, transferables(status.preview)),
    () => latestRunId !== runId,
  );
  if (latestRunId === runId) post({ type: 'finished', runId });
};
