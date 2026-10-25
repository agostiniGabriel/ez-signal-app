import {
  type Complex,
  abs,
  add,
  complex,
  div,
  expj,
  mul,
  neg,
  product,
  scale,
  sqrt,
  sub,
} from './complex';

/** One biquad section: [b0, b1, b2, a0, a1, a2] with a0 = 1 (same layout as scipy's `sos`). */
export type Sos = number[][];
export type FilterBand = 'lowpass' | 'highpass' | 'bandpass';

/** Zeros, poles and gain of a transfer function. */
export interface Zpk {
  z: Complex[];
  p: Complex[];
  k: number;
}

const zerosAt = (value: number, count: number) => Array.from({ length: count }, () => complex(value));

/** Analog Butterworth prototype with cutoff 1 rad/s (scipy.signal.buttap). */
function prototype(order: number): Zpk {
  const p: Complex[] = [];
  for (let m = -order + 1; m < order; m += 2) p.push(neg(expj((Math.PI * m) / (2 * order))));
  return { z: [], p, k: 1 };
}

function toLowpass({ z, p, k }: Zpk, wo: number): Zpk {
  const degree = p.length - z.length;
  return { z: z.map((x) => scale(x, wo)), p: p.map((x) => scale(x, wo)), k: k * wo ** degree };
}

function toHighpass({ z, p, k }: Zpk, wo: number): Zpk {
  const degree = p.length - z.length;
  const w = complex(wo);
  return {
    z: [...z.map((x) => div(w, x)), ...zerosAt(0, degree)],
    p: p.map((x) => div(w, x)),
    k: k * div(product(z.map(neg)), product(p.map(neg))).re,
  };
}

function toBandpass({ z, p, k }: Zpk, wo: number, bw: number): Zpk {
  const degree = p.length - z.length;
  const split = (values: Complex[]) => {
    const lp = values.map((x) => scale(x, bw / 2));
    const roots = lp.map((x) => sqrt(sub(mul(x, x), complex(wo * wo))));
    return [...lp.map((x, i) => add(x, roots[i])), ...lp.map((x, i) => sub(x, roots[i]))];
  };
  return { z: [...split(z), ...zerosAt(0, degree)], p: split(p), k: k * bw ** degree };
}

/** Bilinear transform from the s-plane to the z-plane. */
function bilinear({ z, p, k }: Zpk, fs: number): Zpk {
  const degree = p.length - z.length;
  const fs2 = complex(2 * fs);
  const map = (x: Complex) => div(add(fs2, x), sub(fs2, x));
  return {
    z: [...z.map(map), ...zerosAt(-1, degree)],
    p: p.map(map),
    k: k * div(product(z.map((x) => sub(fs2, x))), product(p.map((x) => sub(fs2, x)))).re,
  };
}

const EPS = 1e-9;

/** Groups roots into conjugate pairs (complex) or single reals; high-Q pairs (|r| near 1) go last. */
function groupRoots(roots: Complex[]): Complex[][] {
  const pairs = roots
    .filter((r) => r.im > EPS)
    .sort((a, b) => abs(a) - abs(b))
    .map((r) => [r, complex(r.re, -r.im)]);
  const reals = roots.filter((r) => Math.abs(r.im) <= EPS).map((r) => complex(r.re));
  const realGroups: Complex[][] = [];
  for (let i = 0; i < reals.length; i += 2) realGroups.push(reals.slice(i, i + 2));
  return [...realGroups, ...pairs];
}

const polynomial = (roots: Complex[]): number[] => {
  if (roots.length === 1) return [1, -roots[0].re, 0];
  const [r1, r2] = roots;
  return [1, -(r1.re + r2.re), mul(r1, r2).re];
};

/** Converts zeros/poles/gain to cascaded second-order sections, pairing each pole group with its nearest zeros. */
function toSos({ z, p, k }: Zpk): Sos {
  const remaining = [...z];
  const takeNearest = (target: Complex) => {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (abs(sub(remaining[i], target)) < abs(sub(remaining[best], target))) best = i;
    }
    return remaining.splice(best, 1)[0];
  };

  const sos = groupRoots(p).map((poles) => {
    const zeros: Complex[] = [];
    while (zeros.length < poles.length && remaining.length > 0) {
      const zero = takeNearest(poles[0]);
      zeros.push(zero);
      if (Math.abs(zero.im) > EPS) {
        zeros.push(takeNearest(complex(zero.re, -zero.im)));
      }
    }
    const b = zeros.length === 0 ? [1, 0, 0] : polynomial(zeros);
    return [...b, ...polynomial(poles)];
  });

  for (let i = 0; i < 3; i++) sos[0][i] *= k;
  return sos;
}

/**
 * Digital Butterworth filter design as second-order sections, equivalent to
 * `scipy.signal.butter(order, cutoff, btype, fs=fs, output='sos')`. Cutoffs are in Hz.
 */
export function butter(order: number, cutoff: number | [number, number], band: FilterBand, fs: number): Sos {
  return toSos(butterZpk(order, cutoff, band, fs));
}

/** Digital Butterworth zeros/poles/gain, equivalent to `scipy.signal.butter(..., output='zpk')`. */
export function butterZpk(order: number, cutoff: number | [number, number], band: FilterBand, fs: number): Zpk {
  if (!Number.isInteger(order) || order < 1) throw new Error('Filter order must be a positive integer');
  const nyquist = fs / 2;
  const cutoffs = Array.isArray(cutoff) ? cutoff : [cutoff];
  for (const f of cutoffs) {
    if (!(f > 0 && f < nyquist)) {
      throw new Error(`Cutoff ${f} Hz must be between 0 and the Nyquist frequency (${nyquist} Hz)`);
    }
  }

  // Pre-warp so the digital cutoff lands exactly where requested after the bilinear transform.
  const warp = (f: number) => 2 * fs * Math.tan((Math.PI * f) / fs);
  let analog: Zpk;
  if (band === 'bandpass') {
    if (cutoffs.length !== 2 || cutoffs[0] >= cutoffs[1]) {
      throw new Error('Band-pass needs a low cutoff smaller than the high cutoff');
    }
    const [w1, w2] = cutoffs.map(warp);
    analog = toBandpass(prototype(order), Math.sqrt(w1 * w2), w2 - w1);
  } else {
    const wo = warp(cutoffs[0]);
    analog = band === 'lowpass' ? toLowpass(prototype(order), wo) : toHighpass(prototype(order), wo);
  }
  return bilinear(analog, fs);
}

/**
 * Filters a signal through cascaded biquads (Direct Form II transposed, zero initial state),
 * equivalent to `scipy.signal.sosfilt(sos, x)`.
 */
export function sosfilt(sos: Sos, x: Float32Array): Float32Array {
  const y = new Float64Array(x);
  for (const [b0, b1, b2, , a1, a2] of sos) {
    let s1 = 0;
    let s2 = 0;
    for (let n = 0; n < y.length; n++) {
      const input = y[n];
      const output = b0 * input + s1;
      s1 = b1 * input - a1 * output + s2;
      s2 = b2 * input - a2 * output;
      y[n] = output;
    }
  }
  return Float32Array.from(y);
}

/** Complex frequency response H(e^jω) of an SOS filter at the given frequency (Hz). */
export function sosResponse(sos: Sos, frequency: number, fs: number): Complex {
  const zInv = expj((-2 * Math.PI * frequency) / fs);
  const zInv2 = mul(zInv, zInv);
  return sos.reduce((h, [b0, b1, b2, a0, a1, a2]) => {
    const num = add(add(complex(b0), scale(zInv, b1)), scale(zInv2, b2));
    const den = add(add(complex(a0), scale(zInv, a1)), scale(zInv2, a2));
    return mul(h, div(num, den));
  }, complex(1));
}

/** Magnitude response |H(e^jω)| of an SOS filter at the given frequency (Hz). */
export const sosGain = (sos: Sos, frequency: number, fs: number): number => abs(sosResponse(sos, frequency, fs));

/** First `length` samples of the filter's response to a unit impulse. */
export function impulseResponse(sos: Sos, length: number): Float32Array {
  const impulse = new Float32Array(length);
  impulse[0] = 1;
  return sosfilt(sos, impulse);
}
