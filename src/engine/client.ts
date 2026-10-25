import type { AudioSignal } from '../blocks/types';
import { UnsupportedWavEncoding, parseWav } from '../dsp/wav';
import type { Graph, NodeStatus } from './executor';
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

  run(graph: Graph) {
    this.post({ type: 'run', runId: ++this.runId, graph });
  }

  /** Decodes an audio file and hands it to the worker; returns the source id to store in the block's params. */
  async addAudioFile(file: File): Promise<string> {
    const signal = await decodeAudio(file);
    const id = crypto.randomUUID();
    this.post(
      { type: 'addSource', id, source: { name: file.name, signal } },
      signal.channels.map((c) => c.buffer as ArrayBuffer),
    );
    return id;
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
