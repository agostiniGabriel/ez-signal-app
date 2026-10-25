import { getBlock } from '../blocks/registry';
import type { Params, Preview, Signal, Source } from '../blocks/types';
import { validateParams } from '../blocks/validate';

export interface GraphNode {
  id: string;
  type: string;
  params: Params;
}

export interface GraphEdge {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type NodeState = 'running' | 'done' | 'error' | 'waiting';

export interface NodeStatus {
  state: NodeState;
  message?: string;
  /** Present when the block produced new display data; absent when the cached result is still current. */
  preview?: Preview;
  elapsedMs?: number;
}

interface CacheEntry {
  key: string;
  outputs: Record<string, Signal>;
}

/** Orders nodes so every node comes after its inputs (Kahn's algorithm). Nodes left over are part of a cycle. */
export function topologicalOrder(graph: Graph): { order: GraphNode[]; cyclic: GraphNode[] } {
  const indegree = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const queue = graph.nodes.filter((n) => indegree.get(n.id) === 0);
  const order: GraphNode[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const e of graph.edges) {
      if (e.source !== node.id) continue;
      const remaining = indegree.get(e.target)! - 1;
      indegree.set(e.target, remaining);
      if (remaining === 0 && byId.has(e.target)) queue.push(byId.get(e.target)!);
    }
  }
  const done = new Set(order.map((n) => n.id));
  return { order, cyclic: graph.nodes.filter((n) => !done.has(n.id)) };
}

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Runs a processing graph block by block. Each node's result is cached under a key derived from its
 * type, params and upstream keys, so editing one block only recomputes that block and what follows it.
 */
export class Executor {
  private cache = new Map<string, CacheEntry>();
  private sources = new Map<string, Source>();

  addSource(id: string, source: Source) {
    this.sources.set(id, source);
  }

  async run(graph: Graph, report: (nodeId: string, status: NodeStatus) => void, isCancelled: () => boolean) {
    const present = new Set(graph.nodes.map((n) => n.id));
    for (const id of this.cache.keys()) if (!present.has(id)) this.cache.delete(id);

    const { order, cyclic } = topologicalOrder(graph);
    for (const node of cyclic) report(node.id, { state: 'error', message: 'Part of a loop; remove a connection' });

    const keys = new Map<string, string>();
    for (const node of order) {
      if (isCancelled()) return;
      const key = this.runNode(node, graph, keys, report);
      if (key) keys.set(node.id, key);
      await yieldToEventLoop();
    }
  }

  /** Returns the node's cache key if it produced outputs. */
  private runNode(
    node: GraphNode,
    graph: Graph,
    keys: Map<string, string>,
    report: (nodeId: string, status: NodeStatus) => void,
  ): string | undefined {
    let def;
    try {
      def = getBlock(node.type);
    } catch (e) {
      report(node.id, { state: 'error', message: (e as Error).message });
      return;
    }

    const { values, errors } = validateParams(def, node.params);
    const firstError = Object.entries(errors)[0];
    if (firstError) {
      const label = def.params.find((p) => p.key === firstError[0])?.label ?? firstError[0];
      report(node.id, { state: 'error', message: `${label}: ${firstError[1]}` });
      return;
    }

    const inputs: Record<string, Signal> = {};
    const inputKeys: string[] = [];
    for (const port of def.inputs) {
      const edge = graph.edges.find((e) => e.target === node.id && e.targetHandle === port.id);
      if (!edge) {
        report(node.id, { state: 'waiting', message: `Connect the ${port.label} input` });
        return;
      }
      const upstream = this.cache.get(edge.source);
      const signal = upstream?.outputs[edge.sourceHandle];
      if (!keys.has(edge.source) || !signal) {
        report(node.id, { state: 'waiting', message: 'Waiting for the input block' });
        return;
      }
      inputs[port.id] = signal;
      inputKeys.push(`${port.id}<-${keys.get(edge.source)}:${edge.sourceHandle}`);
    }

    const key = JSON.stringify([node.type, values, inputKeys]);
    const cached = this.cache.get(node.id);
    if (cached?.key === key) {
      report(node.id, { state: 'done' });
      return key;
    }

    report(node.id, { state: 'running' });
    const started = performance.now();
    try {
      const result = def.run({ inputs, params: values, getSource: (id) => this.sources.get(id) });
      this.cache.set(node.id, { key, outputs: result.outputs ?? {} });
      report(node.id, { state: 'done', preview: result.preview, elapsedMs: performance.now() - started });
      return key;
    } catch (e) {
      this.cache.delete(node.id);
      report(node.id, { state: 'error', message: (e as Error).message });
    }
  }
}
