import { butterZpk, butter, impulseResponse, sosfilt, sosResponse, type FilterBand, type Sos, type Zpk } from '../dsp/butterworth';
import { generate, type Waveform } from '../dsp/generate';
import { averagedSpectrum, spectrogram, type WindowType } from '../dsp/spectrum';
import { NeedsInput, type AudioSignal, type BlockDefinition, type Preview, type Signal } from './types';

const audioPort = (id = 'audio', label = 'Audio') => ({ id, label, kind: 'audio' as const });

function expectAudio(signal: Signal | undefined, port = 'audio'): AudioSignal {
  if (signal?.kind !== 'audio') throw new Error(`Input "${port}" must be audio`);
  return signal;
}

/** Averages all channels into one; plots and analysis work on this mix. */
function mixdown({ channels }: AudioSignal): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const channel of channels) for (let i = 0; i < out.length; i++) out[i] += channel[i] / channels.length;
  return out;
}

const formatDuration = (seconds: number) =>
  seconds < 1 ? `${(seconds * 1000).toFixed(0)} ms` : `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;

function describe(signal: AudioSignal): [string, string][] {
  const length = signal.channels[0]?.length ?? 0;
  const peak = signal.channels.reduce((m, c) => c.reduce((a, v) => Math.max(a, Math.abs(v)), m), 0);
  return [
    ['Sample rate', `${signal.sampleRate.toLocaleString()} Hz`],
    ['Duration', formatDuration(length / signal.sampleRate)],
    ['Channels', signal.channels.length === 1 ? 'Mono' : `${signal.channels.length}`],
    ['Peak', peak > 0 ? `${(20 * Math.log10(peak)).toFixed(1)} dBFS` : '-∞ dBFS'],
  ];
}

/** Min/max envelope per bucket, so long signals plot with a bounded number of points. */
function envelope(samples: Float32Array, sampleRate: number, start: number, maxBuckets = 1500): Preview {
  const perBucket = Math.max(1, Math.ceil(samples.length / maxBuckets));
  const buckets = Math.ceil(samples.length / perBucket);
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  for (let b = 0; b < buckets; b++) {
    let lo = Infinity;
    let hi = -Infinity;
    const end = Math.min(samples.length, (b + 1) * perBucket);
    for (let i = b * perBucket; i < end; i++) {
      if (samples[i] < lo) lo = samples[i];
      if (samples[i] > hi) hi = samples[i];
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { kind: 'waveform', start, step: perBucket / sampleRate, min, max };
}

const powersOfTwo = (from: number, to: number) => {
  const options = [];
  for (let n = from; n <= to; n *= 2) options.push({ value: n, label: n.toLocaleString() });
  return options;
};

export const audioFile: BlockDefinition = {
  type: 'audio-file',
  title: 'Audio file',
  category: 'source',
  description: 'Loads a WAV file at its original sample rate (other formats are decoded by the browser).',
  inputs: [],
  outputs: [audioPort()],
  params: [{ key: 'source', label: 'File', type: 'file', default: '', accept: 'audio/*,.wav' }],
  run({ params, getSource }) {
    const source = getSource(String(params.source));
    // Files are restored from browser storage on load; this only happens if that storage was cleared.
    if (!source) throw new NeedsInput('This file is no longer saved in this browser. Choose it again.');
    const signal = expectAudio(source.signal);
    return { outputs: { audio: signal }, preview: { kind: 'info', rows: describe(signal) } };
  },
};

export const generator: BlockDefinition = {
  type: 'generator',
  title: 'Signal generator',
  category: 'source',
  description: 'Synthesises a test signal: a tone, a frequency sweep or white noise.',
  inputs: [],
  outputs: [audioPort()],
  params: [
    {
      key: 'waveform',
      label: 'Waveform',
      type: 'select',
      default: 'sine',
      options: [
        { value: 'sine', label: 'Sine' },
        { value: 'square', label: 'Square' },
        { value: 'sawtooth', label: 'Sawtooth' },
        { value: 'chirp', label: 'Chirp (linear sweep)' },
        { value: 'noise', label: 'White noise' },
      ],
    },
    {
      key: 'frequency',
      label: 'Frequency',
      type: 'number',
      default: 440,
      min: 0,
      unit: 'Hz',
      visibleWhen: { param: 'waveform', in: ['sine', 'square', 'sawtooth', 'chirp'] },
    },
    {
      key: 'endFrequency',
      label: 'End frequency',
      type: 'number',
      default: 4000,
      min: 0,
      unit: 'Hz',
      visibleWhen: { param: 'waveform', in: ['chirp'] },
    },
    { key: 'amplitude', label: 'Amplitude', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'duration', label: 'Duration', type: 'number', default: 2, min: 0.01, max: 60, step: 0.1, unit: 's' },
    {
      key: 'sampleRate',
      label: 'Sample rate',
      type: 'select',
      default: 44100,
      options: [8000, 16000, 22050, 44100, 48000].map((v) => ({ value: v, label: `${v.toLocaleString()} Hz` })),
    },
  ],
  run({ params }) {
    const sampleRate = Number(params.sampleRate);
    const nyquist = sampleRate / 2;
    for (const key of ['frequency', 'endFrequency'] as const) {
      if (Number(params[key]) > nyquist) {
        throw new Error(`${key === 'frequency' ? 'Frequency' : 'End frequency'} is above Nyquist (${nyquist} Hz) and would alias`);
      }
    }
    const samples = generate({
      waveform: params.waveform as Waveform,
      frequency: Number(params.frequency),
      endFrequency: Number(params.endFrequency),
      amplitude: Number(params.amplitude),
      duration: Number(params.duration),
      sampleRate,
    });
    const signal: AudioSignal = { kind: 'audio', sampleRate, channels: [samples] };
    return { outputs: { audio: signal } };
  },
};

export const mix: BlockDefinition = {
  type: 'mix',
  title: 'Mix',
  category: 'processing',
  description: 'Adds two signals sample by sample, each scaled by its gain. Both must share a sample rate.',
  inputs: [audioPort('a', 'A'), audioPort('b', 'B')],
  outputs: [audioPort()],
  params: [
    { key: 'gainA', label: 'Gain A', type: 'number', default: 1, min: 0, max: 4, step: 0.1 },
    { key: 'gainB', label: 'Gain B', type: 'number', default: 1, min: 0, max: 4, step: 0.1 },
  ],
  run({ inputs, params }) {
    const a = expectAudio(inputs.a, 'A');
    const b = expectAudio(inputs.b, 'B');
    if (a.sampleRate !== b.sampleRate) {
      throw new Error(`Sample rates differ (${a.sampleRate} Hz vs ${b.sampleRate} Hz)`);
    }
    const sameLayout = a.channels.length === b.channels.length;
    const channelsA = sameLayout ? a.channels : [mixdown(a)];
    const channelsB = sameLayout ? b.channels : [mixdown(b)];
    const length = Math.max(channelsA[0].length, channelsB[0].length);
    const gainA = Number(params.gainA);
    const gainB = Number(params.gainB);
    const channels = channelsA.map((ca, c) => {
      const cb = channelsB[c];
      const out = new Float32Array(length);
      for (let i = 0; i < length; i++) out[i] = gainA * (ca[i] ?? 0) + gainB * (cb[i] ?? 0);
      return out;
    });
    return { outputs: { audio: { kind: 'audio', sampleRate: a.sampleRate, channels } } };
  },
};

export const filter: BlockDefinition = {
  type: 'butterworth',
  title: 'Butterworth filter',
  category: 'processing',
  wide: true,
  description: 'Maximally flat IIR filter, applied as cascaded second-order sections (like scipy.signal.butter + sosfilt).',
  inputs: [audioPort()],
  outputs: [audioPort()],
  params: [
    {
      key: 'band',
      label: 'Type',
      type: 'select',
      default: 'lowpass',
      options: [
        { value: 'lowpass', label: 'Low-pass' },
        { value: 'highpass', label: 'High-pass' },
        { value: 'bandpass', label: 'Band-pass' },
      ],
    },
    {
      key: 'cutoff',
      label: 'Cutoff',
      type: 'number',
      default: 1000,
      min: 1,
      unit: 'Hz',
      visibleWhen: { param: 'band', in: ['lowpass', 'highpass'] },
    },
    {
      key: 'lowCutoff',
      label: 'Low cutoff',
      type: 'number',
      default: 300,
      min: 1,
      unit: 'Hz',
      visibleWhen: { param: 'band', in: ['bandpass'] },
    },
    {
      key: 'highCutoff',
      label: 'High cutoff',
      type: 'number',
      default: 3000,
      min: 1,
      unit: 'Hz',
      visibleWhen: { param: 'band', in: ['bandpass'] },
    },
    { key: 'order', label: 'Order', type: 'number', default: 5, min: 1, max: 12, integer: true },
  ],
  run({ inputs, params }) {
    const input = expectAudio(inputs.audio);
    const band = params.band as FilterBand;
    const cutoff: number | [number, number] =
      band === 'bandpass' ? [Number(params.lowCutoff), Number(params.highCutoff)] : Number(params.cutoff);
    const order = Number(params.order);
    const sos = butter(order, cutoff, band, input.sampleRate);
    const channels = input.channels.map((c) => sosfilt(sos, c));
    return {
      outputs: { audio: { kind: 'audio', sampleRate: input.sampleRate, channels } },
      preview: inspectFilter(sos, butterZpk(order, cutoff, band, input.sampleRate), cutoff, input.sampleRate),
    };
  },
};

/** Everything the filter inspector shows: frequency/phase response, pole-zero map and impulse response. */
function inspectFilter(sos: Sos, zpk: Zpk, cutoff: number | [number, number], sampleRate: number): Preview {
  const points = 600;
  const nyquist = sampleRate / 2;
  const lowest = Math.max(1, nyquist / 10000);
  const frequencies = new Float32Array(points);
  const magnitudeDb = new Float32Array(points);
  const phaseDeg = new Float32Array(points);
  let previous = 0;
  let unwrap = 0;
  for (let i = 0; i < points; i++) {
    const f = lowest * (nyquist / lowest) ** (i / (points - 1));
    const h = sosResponse(sos, Math.min(f, nyquist * 0.9999), sampleRate);
    const phase = (Math.atan2(h.im, h.re) * 180) / Math.PI;
    // Remove 360° jumps so the phase reads as a continuous curve.
    if (i > 0) unwrap -= 360 * Math.round((phase + unwrap - previous) / 360);
    previous = phase + unwrap;
    frequencies[i] = f;
    magnitudeDb[i] = Math.max(20 * Math.log10(Math.hypot(h.re, h.im)), -200);
    phaseDeg[i] = previous;
  }

  // Keep the impulse response until it has decayed to 0.01% of its peak.
  const full = impulseResponse(sos, 4096);
  const peak = full.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  let last = 0;
  for (let n = 0; n < full.length; n++) if (Math.abs(full[n]) > peak * 1e-4) last = n;

  const interleave = (roots: Zpk['z']) => Float32Array.from(roots.flatMap((r) => [r.re, r.im]));
  return {
    kind: 'filter',
    sampleRate,
    cutoffs: Array.isArray(cutoff) ? cutoff : [cutoff],
    frequencies,
    magnitudeDb,
    phaseDeg,
    zeros: interleave(zpk.z),
    poles: interleave(zpk.p),
    impulse: full.slice(0, Math.max(32, last + 1)),
  };
}

export const timePlot: BlockDefinition = {
  type: 'time-plot',
  title: 'Time domain plot',
  category: 'analysis',
  wide: true,
  description: 'Amplitude over time, for the whole signal or a chosen interval.',
  inputs: [audioPort()],
  outputs: [],
  params: [
    {
      key: 'mode',
      label: 'Range',
      type: 'select',
      default: 'full',
      options: [
        { value: 'full', label: 'Whole signal' },
        { value: 'interval', label: 'Interval' },
      ],
    },
    { key: 'from', label: 'From', type: 'number', default: 0, min: 0, step: 0.01, unit: 's', visibleWhen: { param: 'mode', in: ['interval'] } },
    { key: 'to', label: 'To', type: 'number', default: 0.05, min: 0, step: 0.01, unit: 's', visibleWhen: { param: 'mode', in: ['interval'] } },
  ],
  run({ inputs, params }) {
    const input = expectAudio(inputs.audio);
    const samples = mixdown(input);
    const duration = samples.length / input.sampleRate;
    let from = 0;
    let to = duration;
    if (params.mode === 'interval') {
      from = Number(params.from);
      to = Math.min(Number(params.to), duration);
      if (from >= duration) throw new Error(`"From" is past the end of the signal (${formatDuration(duration)})`);
      if (from >= to) throw new Error('"From" must be before "To"');
    }
    const startIndex = Math.round(from * input.sampleRate);
    const endIndex = Math.max(startIndex + 1, Math.round(to * input.sampleRate));
    return { preview: envelope(samples.subarray(startIndex, endIndex), input.sampleRate, startIndex / input.sampleRate) };
  },
};

export const spectrumPlot: BlockDefinition = {
  type: 'spectrum',
  title: 'Frequency spectrum',
  category: 'analysis',
  wide: true,
  description: "Amplitude per frequency via the FFT, averaged over overlapping frames (Welch's method).",
  inputs: [audioPort()],
  outputs: [],
  params: [
    { key: 'fftSize', label: 'FFT size', type: 'select', default: 8192, options: powersOfTwo(256, 65536) },
    {
      key: 'window',
      label: 'Window',
      type: 'select',
      default: 'hann',
      options: [
        { value: 'hann', label: 'Hann' },
        { value: 'rectangular', label: 'Rectangular' },
      ],
    },
    {
      key: 'scale',
      label: 'Amplitude',
      type: 'select',
      default: 'db',
      options: [
        { value: 'db', label: 'Decibels (dBFS)' },
        { value: 'linear', label: 'Linear' },
      ],
    },
    { key: 'logFrequency', label: 'Logarithmic frequency axis', type: 'boolean', default: false },
  ],
  run({ inputs, params }) {
    const input = expectAudio(inputs.audio);
    const { frequencies, amplitudes } = averagedSpectrum(
      mixdown(input),
      input.sampleRate,
      Number(params.fftSize),
      params.window as WindowType,
    );
    const scale = params.scale === 'linear' ? 'linear' : 'db';
    const logFrequency = Boolean(params.logFrequency);
    // A log axis cannot show the DC bin.
    const first = logFrequency ? 1 : 0;
    const values = Float32Array.from(amplitudes.subarray(first), (a) =>
      scale === 'db' ? Math.max(20 * Math.log10(Math.max(a, 1e-12)), -160) : a,
    );
    return {
      preview: { kind: 'spectrum', frequencies: Float32Array.from(frequencies.subarray(first)), values, scale, logFrequency },
    };
  },
};

/** Max-pools a [frames][bins] grid down to at most maxColumns × maxRows. */
function poolGrid(db: Float32Array, frames: number, bins: number, maxColumns: number, maxRows: number) {
  const fx = Math.ceil(frames / maxColumns);
  const fy = Math.ceil(bins / maxRows);
  const columns = Math.ceil(frames / fx);
  const rows = Math.ceil(bins / fy);
  const out = new Float32Array(columns * rows).fill(-Infinity);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < bins; b++) {
      const i = Math.floor(f / fx) * rows + Math.floor(b / fy);
      const v = db[f * bins + b];
      if (v > out[i]) out[i] = v;
    }
  }
  return { db: out, columns, rows };
}

export const spectrogramPlot: BlockDefinition = {
  type: 'spectrogram',
  title: 'Spectrogram',
  category: 'analysis',
  wide: true,
  description: 'How the spectrum changes over time (short-time Fourier transform with a Hann window).',
  inputs: [audioPort()],
  outputs: [],
  params: [
    { key: 'windowSize', label: 'Window size', type: 'select', default: 1024, options: powersOfTwo(128, 8192) },
    {
      key: 'overlap',
      label: 'Overlap',
      type: 'select',
      default: 0.75,
      options: [
        { value: 0.5, label: '50%' },
        { value: 0.75, label: '75%' },
        { value: 0.875, label: '87.5%' },
      ],
    },
    { key: 'dynamicRange', label: 'Dynamic range', type: 'number', default: 80, min: 20, max: 160, step: 10, unit: 'dB' },
  ],
  run({ inputs, params }) {
    const input = expectAudio(inputs.audio);
    const size = Number(params.windowSize);
    const hop = Math.max(1, Math.round(size * (1 - Number(params.overlap))));
    const dynamicRange = Number(params.dynamicRange);
    const s = spectrogram(mixdown(input), input.sampleRate, size, hop, dynamicRange);
    const pooled = poolGrid(s.db, s.frames, s.bins, 800, 400);
    return {
      preview: { kind: 'spectrogram', ...pooled, duration: s.duration, maxFrequency: input.sampleRate / 2, dynamicRange },
    };
  },
};

export const player: BlockDefinition = {
  type: 'player',
  title: 'Audio player',
  category: 'output',
  description: 'Listen to a signal or download it as a 16-bit WAV file.',
  inputs: [audioPort()],
  outputs: [],
  params: [],
  run({ inputs }) {
    const input = expectAudio(inputs.audio);
    return { preview: { kind: 'audio', sampleRate: input.sampleRate, channels: input.channels.map((c) => c.slice()) } };
  },
};
