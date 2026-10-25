export type Waveform = 'sine' | 'square' | 'sawtooth' | 'chirp' | 'noise';

export interface GeneratorOptions {
  waveform: Waveform;
  frequency: number;
  /** End frequency of a linear chirp. */
  endFrequency: number;
  amplitude: number;
  duration: number;
  sampleRate: number;
}

/** Deterministic PRNG so generated noise is reproducible across runs. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generate(o: GeneratorOptions): Float32Array {
  const length = Math.round(o.duration * o.sampleRate);
  const out = new Float32Array(length);
  const random = mulberry32(1);
  const sweepRate = (o.endFrequency - o.frequency) / o.duration;

  for (let n = 0; n < length; n++) {
    const t = n / o.sampleRate;
    const cycles = o.frequency * t; // number of periods elapsed
    let v: number;
    switch (o.waveform) {
      case 'sine':
        v = Math.sin(2 * Math.PI * cycles);
        break;
      case 'square':
        v = cycles % 1 < 0.5 ? 1 : -1;
        break;
      case 'sawtooth':
        v = 2 * (cycles % 1) - 1;
        break;
      case 'chirp':
        // Instantaneous frequency f0 + sweepRate·t, so phase = 2π(f0·t + sweepRate·t²/2)
        v = Math.sin(2 * Math.PI * (cycles + (sweepRate * t * t) / 2));
        break;
      case 'noise':
        v = 2 * random() - 1;
        break;
    }
    out[n] = o.amplitude * v;
  }
  return out;
}
