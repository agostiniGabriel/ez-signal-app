/** Minimal complex arithmetic, used for filter design (poles/zeros). */
export interface Complex {
  re: number;
  im: number;
}

export const complex = (re: number, im = 0): Complex => ({ re, im });

export const add = (a: Complex, b: Complex): Complex => complex(a.re + b.re, a.im + b.im);
export const sub = (a: Complex, b: Complex): Complex => complex(a.re - b.re, a.im - b.im);
export const mul = (a: Complex, b: Complex): Complex =>
  complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const scale = (a: Complex, s: number): Complex => complex(a.re * s, a.im * s);
export const neg = (a: Complex): Complex => complex(-a.re, -a.im);
export const abs = (a: Complex): number => Math.hypot(a.re, a.im);

export function div(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  return complex((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}

/** Principal square root. */
export function sqrt(a: Complex): Complex {
  const r = abs(a);
  const re = Math.sqrt((r + a.re) / 2);
  const im = Math.sqrt((r - a.re) / 2);
  return complex(re, a.im < 0 ? -im : im);
}

/** e^(j·theta) */
export const expj = (theta: number): Complex => complex(Math.cos(theta), Math.sin(theta));

export const product = (values: Complex[]): Complex => values.reduce(mul, complex(1));
