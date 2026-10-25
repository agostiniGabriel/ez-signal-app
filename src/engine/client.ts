import type { AudioSignal } from '../blocks/types';
import { UnsupportedWavEncoding, parseWav } from '../dsp/wav';
import type { Graph, NodeStatus } from './executor';
import { loadFile, pruneFiles, saveFile } from './fileStore';
import type { FromWorker, ToWorker } from './protocol';

type StatusListener = (nodeId: string, status: NodeStatus) => void;

/** Main-thread handle to the processing worker. */
class EngineClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private runId = 0;
  private listeners = new Set<StatusListener>();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      // Statuses from a superseded run would overwrite newer ones.
      if (message.type === 'status' && message.runId === this.runId) {
        this.listeners.forEach((l) => l(message.nodeId, message.status));
      }
    };
  }

  onStatus(listener: StatusListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves once files saved from a previous visit have been handed to the worker. */
  private restored: Promise<unknown> = Promise.resolve();

  run(graph: Graph) {
    const runId = ++this.runId;
    // Wait for restored files, so blocks using them don't briefly report a missing file.
    this.restored.then(() => runId === this.runId && this.post({ type: 'run', runId, graph }));
  }

  /** Decodes an audio file and hands it to the worker; returns the source id to store in the block's params. */
  async addAudioFile(file: File): Promise<string> {
    const id = crypto.randomUUID();
    await this.loadSource(id, file);
    await saveFile(id, file);
    return id;
  }

  /**
   * Reloads files the editor still references from browser storage, and deletes stored files nothing
   * references any more. Files that can't be restored leave their blocks asking for the file again.
   */
  restore(sourceIds: string[]) {
    const keep = new Set(sourceIds);
    this.restored = Promise.all(
      [...keep].map(async (id) => {
        const file = await loadFile(id);
        if (file) await this.loadSource(id, file).catch(() => undefined);
      }),
    ).then(() => pruneFiles(keep));
  }

  private async loadSource(id: string, file: File) {
    const signal = await decodeAudio(file);
    this.post(
      { type: 'addSource', id, source: { name: file.name, signal } },
      signal.channels.map((c) => c.buffer as ArrayBuffer),
    );
  }

  private post(message: ToWorker, transfer: Transferable[] = []) {
    this.worker.postMessage(message, transfer);
  }
}

/**
 * WAV is parsed directly to keep the original sample rate; other formats go through the browser's
 * decoder, which resamples to the decoding context's rate (44.1 kHz here).
 */
async function decodeAudio(file: File): Promise<AudioSignal> {
  const bytes = await file.arrayBuffer();
  const isWav = new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF';
  try {
    if (isWav) {
      try {
        const { sampleRate, channels } = parseWav(bytes);
        return { kind: 'audio', sampleRate, channels };
      } catch (wavError) {
        // Compressed WAVs (ADPCM, MP3-in-WAV, ...) may still be readable by the browser.
        if (!(wavError instanceof UnsupportedWavEncoding)) throw wavError;
        return await decodeWithBrowser(bytes).catch(() => Promise.reject(wavError));
      }
    }
    return await decodeWithBrowser(bytes);
  } catch (e) {
    const reason = e instanceof DOMException ? 'unsupported format' : (e as Error).message;
    throw new Error(`Could not decode "${file.name}": ${reason}`);
  }
}

async function decodeWithBrowser(bytes: ArrayBuffer): Promise<AudioSignal> {
  // decodeAudioData detaches its input, so give it a copy.
  const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.slice(0));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
  return { kind: 'audio', sampleRate: buffer.sampleRate, channels };
}

export const engine = new EngineClient();
