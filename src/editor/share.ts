import type { Edge } from '@xyflow/react';
import { blocks } from '../blocks/registry';
import type { Params } from '../blocks/types';
import { defaultParams } from '../blocks/validate';
import type { BlockNode } from './store';

/**
 * Portable graph format, used for share links and JSON export.
 * Loaded audio files are not included (they stay on the user's machine); file blocks keep the file name
 * and ask for the file again.
 */
export interface SharedGraph {
  format: 'ez-signal-graph';
  version: 1;
  nodes: { id: string; type: string; x: number; y: number; params: Params; fileName?: string }[];
  edges: { source: string; sourceHandle: string; target: string; targetHandle: string }[];
}

export function serializeGraph(nodes: BlockNode[], edges: Edge[]): SharedGraph {
  return {
    format: 'ez-signal-graph',
    version: 1,
    nodes: nodes.map((n) => {
      const sourceId = n.data.params.source;
      const fileName = typeof sourceId === 'string' ? n.data.fileNames?.[sourceId] : undefined;
      // Source ids only mean something in this browser session.
      const params = { ...n.data.params };
      if (fileName !== undefined) params.source = '';
      return { id: n.id, type: n.data.blockType, x: Math.round(n.position.x), y: Math.round(n.position.y), params, fileName };
    }),
    edges: edges.map((e) => ({
      source: e.source,
      sourceHandle: e.sourceHandle ?? '',
      target: e.target,
      targetHandle: e.targetHandle ?? '',
    })),
  };
}

/** Validates untrusted input (a link or file) and rebuilds editor nodes; unknown blocks and dangling edges are dropped. */
export function deserializeGraph(input: unknown): { nodes: BlockNode[]; edges: Edge[]; skipped: number } {
  const graph = input as Partial<SharedGraph> | null;
  if (graph?.format !== 'ez-signal-graph' || graph.version !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error('Not an EZ Signal graph');
  }

  const known = new Map(blocks.map((b) => [b.type, b]));
  const nodes: BlockNode[] = [];
  for (const n of graph.nodes) {
    const def = known.get(n?.type);
    if (!def || typeof n.id !== 'string' || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const defaults = defaultParams(def);
    // Keep only params the block declares, with the declared value type.
    const params: Params = { ...defaults };
    for (const [key, value] of Object.entries(n.params ?? {})) {
      if (key in defaults && typeof value === typeof defaults[key]) params[key] = value;
    }
    nodes.push({ id: n.id, type: 'block', position: { x: n.x, y: n.y }, data: { blockType: def.type, params, sharedFileName: n.fileName } });
  }

  const ids = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = graph.edges
    .filter((e) => ids.has(e?.source) && ids.has(e?.target) && typeof e.sourceHandle === 'string' && typeof e.targetHandle === 'string')
    .map((e) => ({ id: `${e.source}:${e.sourceHandle}->${e.target}:${e.targetHandle}`, ...e }));

  return { nodes, edges, skipped: graph.nodes.length - nodes.length };
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Compressed, URL-safe encoding of a graph, for the `#g=` part of a share link. */
export async function encodeGraph(graph: SharedGraph): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(graph));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeGraph(encoded: string): Promise<unknown> {
  const json = await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(json));
}

export const SHARE_PARAM = 'g';

export async function shareUrl(graph: SharedGraph): Promise<string> {
  const url = new URL(location.href);
  url.hash = `${SHARE_PARAM}=${await encodeGraph(graph)}`;
  return url.toString();
}
