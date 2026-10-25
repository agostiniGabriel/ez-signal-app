import { fft, isPowerOfTwo } from './fft';

export type WindowType = 'hann' | 'rectangular';

/** Periodic window (the DFT-friendly variant, like scipy.signal.get_window). */
export function makeWindow(type: WindowType, size: number): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = type === 'hann' ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size) : 1;
  }
  return w;
}

/** Start offsets of each analysis frame; a signal shorter than one frame yields a single zero-padded frame. */
function frameStarts(length: number, size: number, hop: number): number[] {
  const starts: number[] = [];
  for (let start = 0; start + size <= length; start += hop) starts.push(start);
  if (starts.length === 0) starts.push(0);
  return starts;
}

/** Power |X[k]|² of one windowed frame, for k = 0..size/2. */
function framePower(signal: Float32Array, start: number, window: Float64Array, re: Float64Array, im: Float64Array) {
  const size = window.length;
  for (let i = 0; i < size; i++) {
    const n = start + i;
    re[i] = n < signal.length ? signal[n] * window[i] : 0;
    im[i] = 0;
  }
  fft(re, im);
  const bins = size / 2 + 1;
  const power = new Float64Array(bins);
  for (let k = 0; k < bins; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  return power;
}

export interface AmplitudeSpectrum {
  /** Bin centre frequencies in Hz. */
  frequencies: Float64Array;
  /** Peak amplitude per bin: a sine of amplitude A shows up as ≈A. */
  amplitudes: Float64Array;
  frames: number;
}

/**
 * Amplitude spectrum averaged over 50%-overlapping frames (Welch's method).
 * Averaging keeps memory bounded for long recordings and reduces noise variance.
 */
export function averagedSpectrum(
  signal: Float32Array,
  sampleRate: number,
  size: number,
  windowType: WindowType,
): AmplitudeSpectrum {
  if (!isPowerOfTwo(size)) throw new Error('FFT size must be a power of two');
  const window = makeWindow(windowType, size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const bins = size / 2 + 1;
  const sum = new Float64Array(bins);
  const starts = frameStarts(signal.length, size, size / 2);
  for (const start of starts) {
    const power = framePower(signal, start, window, re, im);
    for (let k = 0; k < bins; k++) sum[k] += power[k];
  }

  // Undo the window's coherent gain; one-sided spectrum doubles every bin except DC and Nyquist.
  const coherentGain = window.reduce((a, b) => a + b, 0);
  const frequencies = new Float64Array(bins);
  const amplitudes = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    frequencies[k] = (k * sampleRate) / size;
    const oneSided = k === 0 || k === bins - 1 ? 1 : 2;
    amplitudes[k] = (oneSided * Math.sqrt(sum[k] / starts.length)) / coherentGain;
  }
  return { frequencies, amplitudes, frames: starts.length };
}

export interface Spectrogram {
  /** Row-major [frame][bin] magnitude in dB relative to the loudest cell, clamped at -dynamicRange. */
  db: Float32Array;
  frames: number;
  bins: number;
  /** Seconds between consecutive frames. */
  frameStep: number;
  /** Hz between consecutive bins. */
  binStep: number;
  duration: number;
}

/** Short-time Fourier transform magnitude in dB (like librosa.amplitude_to_db(|stft|, ref=np.max)). */
export function spectrogram(
  signal: Float32Array,
  sampleRate: number,
  size: number,
  hop: number,
  dynamicRange: number,
): Spectrogram {
  if (!isPowerOfTwo(size)) throw new Error('Window size must be a power of two');
  const window = makeWindow('hann', size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const bins = size / 2 + 1;
  const starts = frameStarts(signal.length, size, hop);
  const db = new Float32Array(starts.length * bins);

  let max = 0;
  starts.forEach((start, f) => {
    const power = framePower(signal, start, window, re, im);
    for (let k = 0; k < bins; k++) {
      db[f * bins + k] = power[k];
      if (power[k] > max) max = power[k];
    }
  });

  const ref = Math.max(max, 1e-20);
  for (let i = 0; i < db.length; i++) {
    db[i] = Math.max(10 * Math.log10(Math.max(db[i], 1e-20) / ref), -dynamicRange);
  }
  return {
    db,
    frames: starts.length,
    bins,
    frameStep: hop / sampleRate,
    binStep: sampleRate / size,
    duration: signal.length / sampleRate,
  };
}
