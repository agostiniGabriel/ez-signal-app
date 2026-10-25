import { useEffect, useRef } from 'react';
import type { Preview } from '../../blocks/types';

// Magma colormap stops (matplotlib/librosa default), dark to bright.
const MAGMA: [number, number, number][] = [
  [0, 0, 4],
  [28, 16, 68],
  [79, 18, 123],
  [129, 37, 129],
  [181, 54, 122],
  [229, 80, 100],
  [251, 135, 97],
  [254, 194, 135],
  [252, 253, 191],
];

function color(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (MAGMA.length - 1);
  const i = Math.min(MAGMA.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [MAGMA[i], MAGMA[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const kHz = (f: number) => (f >= 1000 ? `${+(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`);

export function SpectrogramView({ preview }: { preview: Extract<Preview, { kind: 'spectrogram' }> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { db, columns, rows, duration, maxFrequency, dynamicRange } = preview;

  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    const image = ctx.createImageData(columns, rows);
    for (let x = 0; x < columns; x++) {
      for (let y = 0; y < rows; y++) {
        const [r, g, b] = color(1 + db[x * rows + y] / dynamicRange);
        const i = ((rows - 1 - y) * columns + x) * 4; // low frequencies at the bottom
        image.data[i] = r;
        image.data[i + 1] = g;
        image.data[i + 2] = b;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [db, columns, rows, dynamicRange]);

  return (
    <div className="spectrogram">
      <div className="spectrogram__y">
        {[1, 0.75, 0.5, 0.25, 0].map((f) => (
          <span key={f}>{kHz(f * maxFrequency)}</span>
        ))}
      </div>
      <canvas ref={canvas} width={columns} height={rows} />
      <div className="spectrogram__x">
        <span>0 s</span>
        <span>{(duration / 2).toFixed(2)} s</span>
        <span>{duration.toFixed(2)} s</span>
      </div>
      <div className="spectrogram__legend">
        <span>-{dynamicRange} dB</span>
        <i />
        <span>0 dB</span>
      </div>
    </div>
  );
}
