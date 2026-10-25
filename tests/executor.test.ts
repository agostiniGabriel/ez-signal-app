import { describe, expect, it } from 'vitest';
import { Executor, type Graph, type NodeStatus } from '../src/engine/executor';

function graph(cutoff: number, edges = true): Graph {
  return {
    nodes: [
      { id: 'gen', type: 'generator', params: { waveform: 'noise', duration: 0.1, sampleRate: 8000 } },
      { id: 'filter', type: 'butterworth', params: { band: 'lowpass', cutoff } },
      { id: 'plot', type: 'spectrum', params: { fftSize: 256 } },
    ],
    edges: edges
      ? [
          { source: 'gen', sourceHandle: 'audio', target: 'filter', targetHandle: 'audio' },
          { source: 'filter', sourceHandle: 'audio', target: 'plot', targetHandle: 'audio' },
        ]
      : [],
  };
}

async function run(executor: Executor, g: Graph) {
  const statuses: Record<string, NodeStatus> = {};
  const ran: string[] = [];
  await executor.run(
    g,
    (id, s) => {
      statuses[id] = s;
      if (s.state === 'running') ran.push(id);
    },
    () => false,
  );
  return { statuses, ran };
}

describe('executor', () => {
  it('runs a chain in dependency order and produces a preview', async () => {
    const { statuses, ran } = await run(new Executor(), graph(1000));
    expect(ran).toEqual(['gen', 'filter', 'plot']);
    expect(statuses.plot.state).toBe('done');
    expect(statuses.plot.preview?.kind).toBe('spectrum');
  });

  it('only recomputes blocks downstream of a change', async () => {
    const executor = new Executor();
    await run(executor, graph(1000));
    expect((await run(executor, graph(1000))).ran).toEqual([]);
    expect((await run(executor, graph(2000))).ran).toEqual(['filter', 'plot']);
  });

  it('reports invalid params and missing inputs', async () => {
    const { statuses } = await run(new Executor(), graph(5000));
    expect(statuses.filter).toMatchObject({ state: 'error', message: expect.stringMatching(/Nyquist/) });
    expect(statuses.plot.state).toBe('waiting');

    const unconnected = await run(new Executor(), graph(1000, false));
    expect(unconnected.statuses.filter).toMatchObject({ state: 'waiting', message: 'Connect the Audio input' });
  });

  it('treats a missing or unloaded file as waiting for the user, not an error', async () => {
    const files: Graph = {
      nodes: [
        { id: 'empty', type: 'audio-file', params: { source: '' } },
        { id: 'gone', type: 'audio-file', params: { source: 'not-loaded' } },
      ],
      edges: [],
    };
    const { statuses } = await run(new Executor(), files);
    expect(statuses.empty).toMatchObject({ state: 'waiting', message: 'File: Choose a file' });
    expect(statuses.gone).toMatchObject({ state: 'waiting', message: expect.stringMatching(/Choose it again/) });
  });

  it('flags cycles', async () => {
    const g = graph(1000);
    g.edges.push({ source: 'filter', sourceHandle: 'audio', target: 'gen', targetHandle: 'audio' });
    const { statuses } = await run(new Executor(), g);
    expect(statuses.filter.state).toBe('error');
  });
});
