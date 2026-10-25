import { describe, expect, it } from 'vitest';
import { exampleGraph } from '../src/editor/example';
import { decodeGraph, deserializeGraph, encodeGraph, serializeGraph } from '../src/editor/share';
import type { BlockNode } from '../src/editor/store';

describe('share format', () => {
  it('round-trips the example graph through a compressed link', async () => {
    const { nodes, edges } = exampleGraph();
    const encoded = await encodeGraph(serializeGraph(nodes, edges));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe
    expect(encoded.length).toBeLessThan(1500);

    const restored = deserializeGraph(await decodeGraph(encoded));
    expect(restored.skipped).toBe(0);
    expect(restored.nodes.map((n) => [n.id, n.data.blockType, n.data.params])).toEqual(
      nodes.map((n) => [n.id, n.data.blockType, n.data.params]),
    );
    expect(restored.edges.map((e) => [e.source, e.target, e.targetHandle])).toEqual(
      edges.map((e) => [e.source, e.target, e.targetHandle]),
    );
  });

  it('replaces local file ids with the file name', () => {
    const fileNode: BlockNode = {
      id: 'f',
      type: 'block',
      position: { x: 0, y: 0 },
      data: { blockType: 'audio-file', params: { source: 'uuid-1' }, fileNames: { 'uuid-1': 'voice.wav' } },
    };
    const shared = serializeGraph([fileNode], []);
    expect(shared.nodes[0]).toMatchObject({ params: { source: '' }, fileName: 'voice.wav' });
    expect(deserializeGraph(shared).nodes[0].data.sharedFileName).toBe('voice.wav');
  });

  it('rejects input that is not a graph', () => {
    expect(() => deserializeGraph({ nodes: [] })).toThrow(/Not an EZ Signal graph/);
    expect(() => deserializeGraph(null)).toThrow();
  });

  it('drops unknown blocks, dangling edges and mistyped or undeclared params', () => {
    const { nodes, edges, skipped } = deserializeGraph({
      format: 'ez-signal-graph',
      version: 1,
      nodes: [
        { id: 'a', type: 'generator', x: 0, y: 0, params: { frequency: '1000', amplitude: 0.2, evil: '<script>' } },
        { id: 'b', type: 'no-such-block', x: 0, y: 0, params: {} },
      ],
      edges: [{ source: 'a', sourceHandle: 'audio', target: 'b', targetHandle: 'audio' }],
    });
    expect(skipped).toBe(1);
    expect(edges).toEqual([]);
    expect(nodes[0].data.params).toMatchObject({ frequency: 440, amplitude: 0.2 });
    expect(nodes[0].data.params).not.toHaveProperty('evil');
  });
});
