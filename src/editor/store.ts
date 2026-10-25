import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from '@xyflow/react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { getBlock } from '../blocks/registry';
import type { ParamValue, Params } from '../blocks/types';
import { defaultParams } from '../blocks/validate';
import type { Graph, NodeStatus } from '../engine/executor';
import { exampleGraph } from './example';

export interface BlockNodeData extends Record<string, unknown> {
  blockType: string;
  params: Params;
  /** Display names of loaded files, keyed by source id. */
  fileNames?: Record<string, string>;
}

export type BlockNode = Node<BlockNodeData, 'block'>;

interface EditorState {
  nodes: BlockNode[];
  edges: Edge[];
  statuses: Record<string, NodeStatus>;
  onNodesChange: OnNodesChange<BlockNode>;
  onEdgesChange: OnEdgesChange;
  connect(connection: Connection): void;
  addBlock(type: string, position: XYPosition, params?: Params, fileNames?: Record<string, string>): string;
  removeBlock(id: string): void;
  setParam(id: string, key: string, value: ParamValue): void;
  setFile(id: string, key: string, sourceId: string, name: string): void;
  setStatus(id: string, status: NodeStatus): void;
  reset(): void;
}

/** localStorage can throw (private mode, blocked storage); the editor still works without it. */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* not persisted */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* nothing to remove */
    }
  },
};

const updateParams = (nodes: BlockNode[], id: string, patch: Partial<BlockNodeData>, params: Params) =>
  nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch, params: { ...n.data.params, ...params } } } : n));

export const useEditor = create<EditorState>()(
  persist(
    (set, get) => ({
      ...exampleGraph(),
      statuses: {},

      onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
      onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

      connect(connection) {
        // An input accepts one connection: a new one replaces the old.
        const edges = get().edges.filter(
          (e) => !(e.target === connection.target && e.targetHandle === connection.targetHandle),
        );
        set({ edges: addEdge(connection, edges) });
      },

      addBlock(type, position, params, fileNames) {
        const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
        const node: BlockNode = {
          id,
          type: 'block',
          position,
          data: { blockType: type, params: { ...defaultParams(getBlock(type)), ...params }, fileNames },
        };
        set({ nodes: [...get().nodes, node] });
        return id;
      },

      removeBlock(id) {
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        });
      },

      setParam(id, key, value) {
        set({ nodes: updateParams(get().nodes, id, {}, { [key]: value }) });
      },

      setFile(id, key, sourceId, name) {
        const node = get().nodes.find((n) => n.id === id);
        const fileNames = { ...node?.data.fileNames, [sourceId]: name };
        set({ nodes: updateParams(get().nodes, id, { fileNames }, { [key]: sourceId }) });
      },

      setStatus(id, status) {
        const previous = get().statuses[id];
        // A cached result arrives without preview or timing; keep showing the last ones.
        const next =
          status.state === 'done' && status.elapsedMs === undefined
            ? { ...status, preview: previous?.preview, elapsedMs: previous?.elapsedMs }
            : { ...status, preview: status.preview ?? previous?.preview };
        set({ statuses: { ...get().statuses, [id]: next } });
      },

      reset() {
        set({ ...exampleGraph(), statuses: {} });
      },
    }),
    {
      name: 'ez-signal-graph',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ nodes, edges }) => ({
        nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges,
      }),
    },
  ),
);

/** The part of the editor state that affects processing (positions and selection don't). */
export function toGraph(nodes: BlockNode[], edges: Edge[]): Graph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.blockType, params: n.data.params })),
    edges: edges.map((e) => ({
      source: e.source,
      sourceHandle: e.sourceHandle ?? '',
      target: e.target,
      targetHandle: e.targetHandle ?? '',
    })),
  };
}
