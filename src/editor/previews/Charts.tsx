import { useCallback, useMemo } from 'react';
import type uPlot from 'uplot';
import type { Preview } from '../../blocks/types';
import { UPlotChart, axis, type ChartTheme } from './UPlotChart';

type Of<K extends Preview['kind']> = Extract<Preview, { kind: K }>;

// Log axes pass null for unlabelled minor ticks.
const hz = (f: number | null) => (f === null ? '' : f >= 1000 ? `${+(f / 1000).toFixed(2)}k` : `${+f.toFixed(1)}`);

export function WaveformChart({ preview }: { preview: Of<'waveform'> }) {
  const data = useMemo<uPlot.AlignedData>(
    () => [Float64Array.from(preview.min, (_, i) => preview.start + i * preview.step), preview.min, preview.max],
    [preview],
  );
  const build = useCallback(
    (t: ChartTheme): Omit<uPlot.Options, 'width' | 'height'> => ({
      legend: { show: false },
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: false } },
      axes: [axis(t, 'Time (s)'), axis(t)],
      series: [
        {},
        { stroke: t.accent, width: 1 },
        { stroke: t.accent, width: 1 },
      ],
      // Fill between the min and max envelopes.
      bands: [{ series: [2, 1], fill: t.accentFill }],
    }),
    [],
  );
  return <UPlotChart data={data} build={build} />;
}

export function SpectrumChart({ preview }: { preview: Of<'spectrum'> }) {
  const data = useMemo<uPlot.AlignedData>(() => [preview.frequencies, preview.values], [preview]);
  const { logFrequency, scale } = preview;
  const build = useCallback(
    (t: ChartTheme): Omit<uPlot.Options, 'width' | 'height'> => ({
      legend: { show: false },
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: false, distr: logFrequency ? 3 : 1, log: 10 } },
      axes: [
        { ...axis(t, 'Frequency (Hz)'), values: (_, ticks) => ticks.map(hz) },
        axis(t, scale === 'db' ? 'dBFS' : 'Amplitude'),
      ],
      series: [{}, { stroke: t.accent, width: 1, fill: t.accentFill }],
    }),
    [logFrequency, scale],
  );
  return <UPlotChart data={data} build={build} />;
}
