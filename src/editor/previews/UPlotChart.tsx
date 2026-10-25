import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export const CHART_WIDTH = 360;
export const CHART_HEIGHT = 180;

export interface ChartTheme {
  accent: string;
  accentFill: string;
  text: string;
  grid: string;
}

function readTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return { accent: v('--chart-line'), accentFill: v('--chart-fill'), text: v('--text-muted'), grid: v('--border') };
}

export const axis = (theme: ChartTheme, label?: string): uPlot.Axis => ({
  stroke: theme.text,
  grid: { stroke: theme.grid, width: 1 },
  ticks: { stroke: theme.grid, width: 1 },
  font: '11px system-ui, sans-serif',
  labelFont: '11px system-ui, sans-serif',
  label,
  labelSize: label ? 16 : 0,
  size: 44,
});

/**
 * Thin wrapper around uPlot. Drag horizontally to zoom, double-click to reset.
 * `build` must be stable (memoised) or the chart is recreated on every render.
 */
export function UPlotChart({
  data,
  build,
}: {
  data: uPlot.AlignedData;
  build: (theme: ChartTheme) => Omit<uPlot.Options, 'width' | 'height'>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const plot = new uPlot({ ...build(readTheme()), width: CHART_WIDTH, height: CHART_HEIGHT }, data, ref.current!);
    return () => plot.destroy();
  }, [data, build]);

  return <div ref={ref} className="chart nodrag nowheel" />;
}
