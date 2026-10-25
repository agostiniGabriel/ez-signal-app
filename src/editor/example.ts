import type { Edge } from '@xyflow/react';
import { getBlock } from '../blocks/registry';
import type { Params } from '../blocks/types';
import { defaultParams } from '../blocks/validate';
import type { BlockNode } from './store';

const node = (id: string, type: string, x: number, y: number, params: Params = {}): BlockNode => ({
  id,
  type: 'block',
  position: { x, y },
  data: { blockType: type, params: { ...defaultParams(getBlock(type)), ...params } },
});

const edge = (source: string, target: string, targetHandle = 'audio'): Edge => ({
  id: `${source}->${target}:${targetHandle}`,
  source,
  sourceHandle: 'audio',
  target,
  targetHandle,
});

/** Starter graph: a tone buried in noise, before and after a low-pass filter. */
export function exampleGraph(): { nodes: BlockNode[]; edges: Edge[] } {
  return {
    nodes: [
      node('tone', 'generator', 0, 0, { waveform: 'sine', frequency: 440, amplitude: 0.5 }),
      node('noise', 'generator', 0, 420, { waveform: 'noise', amplitude: 0.3 }),
      node('mix', 'mix', 340, 230),
      node('filter', 'butterworth', 680, 230, { band: 'lowpass', cutoff: 1000, order: 6 }),
      node('before', 'spectrum', 680, 560),
      node('after', 'spectrum', 1040, 0),
      node('wave', 'time-plot', 1040, 460, { mode: 'interval', from: 0, to: 0.02 }),
      node('play', 'player', 1500, 230),
    ],
    edges: [
      edge('tone', 'mix', 'a'),
      edge('noise', 'mix', 'b'),
      edge('mix', 'filter'),
      edge('mix', 'before'),
      edge('filter', 'after'),
      edge('filter', 'wave'),
      edge('filter', 'play'),
    ],
  };
}
