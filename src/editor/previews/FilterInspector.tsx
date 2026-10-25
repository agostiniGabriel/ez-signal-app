import { useCallback, useMemo, useState } from 'react';
import type uPlot from 'uplot';
import type { Preview } from '../../blocks/types';
import { UPlotChart, axis, type ChartTheme } from './UPlotChart';

type FilterPreview = Extract<Preview, { kind: 'filter' }>;
type Tab = 'magnitude' | 'phase' | 'polezero' | 'impulse';

const TABS: { id: Tab; label: string }[] = [
  { id: 'magnitude', label: 'Magnitude' },
  { id: 'phase', label: 'Phase' },
  { id: 'polezero', label: 'Poles & zeros' },
  { id: 'impulse', label: 'Impulse' },
];

// Log axes pass null for unlabelled minor ticks.
const hz = (f: number | null) => (f === null ? '' : f >= 1000 ? `${+(f / 1000).toFixed(1)}k` : `${+f.toFixed(0)}`);

/** Draws dashed vertical lines at the cutoff frequencies. */
const cutoffMarkers =
  (cutoffs: number[], color: string) =>
  (u: uPlot): void => {
    const { ctx, bbox } = u;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = devicePixelRatio;
    for (const f of cutoffs) {
      const x = u.valToPos(f, 'x', true);
      ctx.beginPath();
      ctx.moveTo(x, bbox.top);
      ctx.lineTo(x, bbox.top + bbox.height);
      ctx.stroke();
    }
    ctx.restore();
  };

function ResponseChart({ preview, tab }: { preview: FilterPreview; tab: 'magnitude' | 'phase' }) {
  const { frequencies, magnitudeDb, phaseDeg, cutoffs } = preview;
  const data = useMemo<uPlot.AlignedData>(
    () => (tab === 'magnitude' ? [frequencies, magnitudeDb, magnitudeDb.map(() => -3)] : [frequencies, phaseDeg]),
    [tab, frequencies, magnitudeDb, phaseDeg],
  );
  const lowest = useMemo(() => Math.min(...magnitudeDb), [magnitudeDb]);
  const build = useCallback(
    (t: ChartTheme): Omit<uPlot.Options, 'width' | 'height'> => ({
      legend: { show: false },
      cursor: { drag: { x: true, y: false } },
      scales: {
        // Exact data range: a log scale would otherwise round out to whole decades past Nyquist.
        x: { time: false, distr: 3, log: 10, range: (_, min, max) => [min, max] },
        // Floor the magnitude axis so deep stopbands don't squash the passband.
        y: tab === 'magnitude' ? { range: () => [Math.max(lowest, -120) - 5, 5] } : {},
      },
      axes: [
        { ...axis(t, 'Frequency (Hz)'), values: (_, ticks) => ticks.map(hz) },
        axis(t, tab === 'magnitude' ? 'Gain (dB)' : 'Phase (°)'),
      ],
      series:
        tab === 'magnitude'
          ? [{}, { stroke: t.accent, width: 1.5 }, { stroke: t.text, width: 1, dash: [2, 4] }]
          : [{}, { stroke: t.accent, width: 1.5 }],
      hooks: { draw: [cutoffMarkers(cutoffs, t.text)] },
    }),
    [tab, cutoffs, lowest],
  );
  return <UPlotChart data={data} build={build} />;
}

function ImpulseChart({ preview }: { preview: FilterPreview }) {
  const data = useMemo<uPlot.AlignedData>(
    () => [Float64Array.from(preview.impulse, (_, n) => n), preview.impulse],
    [preview],
  );
  const build = useCallback(
    (t: ChartTheme): Omit<uPlot.Options, 'width' | 'height'> => ({
      legend: { show: false },
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: false } },
      axes: [axis(t, 'Sample n'), axis(t, 'h[n]')],
      series: [{}, { stroke: t.accent, width: 1.5, points: { show: preview.impulse.length <= 80, size: 4 } }],
    }),
    [preview.impulse.length],
  );
  return <UPlotChart data={data} build={build} />;
}

/** Groups roots that coincide (e.g. repeated zeros at z = ±1) so they can be drawn once with a count. */
function groupRoots(interleaved: Float32Array) {
  const groups: { re: number; im: number; count: number }[] = [];
  for (let i = 0; i < interleaved.length; i += 2) {
    const [re, im] = [interleaved[i], interleaved[i + 1]];
    const same = groups.find((g) => Math.hypot(g.re - re, g.im - im) < 1e-3);
    if (same) same.count++;
    else groups.push({ re, im, count: 1 });
  }
  return groups;
}

function PoleZeroPlot({ preview }: { preview: FilterPreview }) {
  const zeros = useMemo(() => groupRoots(preview.zeros), [preview.zeros]);
  const poles = useMemo(() => groupRoots(preview.poles), [preview.poles]);
  const maxRadius = poles.reduce((m, p) => Math.max(m, Math.hypot(p.re, p.im)), 0);
  const r = 1.35; // view extent around the unit circle
  const count = (g: { re: number; im: number; count: number }) =>
    g.count > 1 && (
      <text x={g.re + 0.07} y={-g.im - 0.07} className="pz__count">
        {g.count}
      </text>
    );

  return (
    <div className="pz">
      <svg viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`} role="img" aria-label="Pole-zero plot in the z-plane">
        <line x1={-r} y1={0} x2={r} y2={0} className="pz__axis" />
        <line x1={0} y1={-r} x2={0} y2={r} className="pz__axis" />
        <circle r={1} className="pz__unit" />
        {zeros.map((z, i) => (
          <g key={`z${i}`}>
            <circle cx={z.re} cy={-z.im} r={0.05} className="pz__zero" />
            {count(z)}
          </g>
        ))}
        {poles.map((p, i) => (
          <g key={`p${i}`} transform={`translate(${p.re} ${-p.im})`} className="pz__pole">
            <line x1={-0.045} y1={-0.045} x2={0.045} y2={0.045} />
            <line x1={-0.045} y1={0.045} x2={0.045} y2={-0.045} />
            {count({ ...p, re: 0, im: 0 })}
          </g>
        ))}
      </svg>
      <div className="pz__legend">
        <span>
          <i className="pz__key pz__key--pole">×</i> {preview.poles.length / 2} poles
        </span>
        <span>
          <i className="pz__key pz__key--zero">○</i> {preview.zeros.length / 2} zeros
        </span>
        <span className={maxRadius < 1 ? 'pz__stable' : 'pz__unstable'}>
          {maxRadius < 1 ? 'Stable' : 'Unstable'}: largest |pole| = {maxRadius.toFixed(4)}
        </span>
        <span className="muted">A filter is stable when every pole lies inside the unit circle.</span>
      </div>
    </div>
  );
}

export function FilterInspector({ preview }: { preview: FilterPreview }) {
  const [tab, setTab] = useState<Tab>('magnitude');
  return (
    <div className="inspector">
      <div className="tabs nodrag" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tabs__tab${tab === t.id ? ' tabs__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {(tab === 'magnitude' || tab === 'phase') && <ResponseChart preview={preview} tab={tab} />}
      {tab === 'polezero' && <PoleZeroPlot preview={preview} />}
      {tab === 'impulse' && <ImpulseChart preview={preview} />}
      {tab === 'magnitude' && <p className="inspector__note">Dashed: −3 dB level and cutoff frequencies.</p>}
    </div>
  );
}
