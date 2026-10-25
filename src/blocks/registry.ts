import { audioFile, filter, generator, mix, player, spectrogramPlot, spectrumPlot, timePlot } from './audio';
import type { BlockCategory, BlockDefinition } from './types';

/** Every available block. To add one, write a BlockDefinition and list it here. */
export const blocks: BlockDefinition[] = [
  audioFile,
  generator,
  filter,
  mix,
  timePlot,
  spectrumPlot,
  spectrogramPlot,
  player,
];

const byType = new Map(blocks.map((b) => [b.type, b]));

export function getBlock(type: string): BlockDefinition {
  const def = byType.get(type);
  if (!def) throw new Error(`Unknown block type "${type}"`);
  return def;
}

export const categories: { id: BlockCategory; label: string }[] = [
  { id: 'source', label: 'Sources' },
  { id: 'processing', label: 'Processing' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'output', label: 'Output' },
];
