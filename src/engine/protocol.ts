import type { Source } from '../blocks/types';
import type { Graph, NodeStatus } from './executor';

export type ToWorker =
  | { type: 'addSource'; id: string; source: Source }
  | { type: 'run'; runId: number; graph: Graph };

export type FromWorker =
  | { type: 'status'; runId: number; nodeId: string; status: NodeStatus }
  | { type: 'finished'; runId: number };
