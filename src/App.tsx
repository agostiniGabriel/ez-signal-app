import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  getOutgoers,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useState, type DragEvent } from 'react';
import { getBlock } from './blocks/registry';
import { engine } from './engine/client';
import { BlockNodeView } from './editor/BlockNodeView';
import { BLOCK_MIME, Palette } from './editor/Palette';
import { toGraph, useEditor, type BlockNode } from './editor/store';

const nodeTypes = { block: BlockNodeView };

/** Re-runs the graph whenever something that affects processing changes (not on drag or selection). */
function useAutoRun() {
  useEffect(() => {
    const unsubscribe = engine.onStatus((id, status) => useEditor.getState().setStatus(id, status));
    let last = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = ({ nodes, edges }: { nodes: BlockNode[]; edges: Edge[] }) => {
      const graph = toGraph(nodes, edges);
      const signature = JSON.stringify(graph);
      if (signature === last) return;
      last = signature;
      clearTimeout(timer);
      timer = setTimeout(() => engine.run(graph), 120);
    };
    schedule(useEditor.getState());
    const unsubscribeStore = useEditor.subscribe(schedule);
    return () => {
      unsubscribe();
      unsubscribeStore();
      clearTimeout(timer);
    };
  }, []);
}

function portKind(nodes: BlockNode[], nodeId: string | null, handle: string | null | undefined, side: 'inputs' | 'outputs') {
  const node = nodes.find((n) => n.id === nodeId);
  return node && getBlock(node.data.blockType)[side].find((p) => p.id === handle)?.kind;
}

function Editor() {
  const { nodes, edges, onNodesChange, onEdgesChange, connect, addBlock, setFile } = useEditor();
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow<BlockNode>();
  const [dropError, setDropError] = useState<string>();

  // Allow only matching signal kinds and no loops.
  const isValidConnection: IsValidConnection = (c) => {
    const all = getNodes();
    const source = portKind(all, c.source, c.sourceHandle, 'outputs');
    if (!source || source !== portKind(all, c.target, c.targetHandle, 'inputs')) return false;
    const target = all.find((n) => n.id === c.target);
    const reachesSource = (node: BlockNode, seen = new Set<string>()): boolean => {
      if (node.id === c.source) return true;
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return getOutgoers(node, all, getEdges()).some((n) => reachesSource(n, seen));
    };
    return !!target && !reachesSource(target);
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const type = event.dataTransfer.getData(BLOCK_MIME);
    if (type) {
      addBlock(type, position);
      return;
    }
    setDropError(undefined);
    const files = [...event.dataTransfer.files];
    for (const [i, file] of files.entries()) {
      const id = addBlock('audio-file', { x: position.x, y: position.y + i * 220 });
      try {
        setFile(id, 'source', await engine.addAudioFile(file), file.name);
      } catch (e) {
        setDropError((e as Error).message);
      }
    }
  };

  return (
    <div className="canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c: Connection) => connect(c)}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{ className: 'edge' }}
        colorMode="system"
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {dropError && (
        <div className="toast" role="alert" onClick={() => setDropError(undefined)}>
          {dropError}
        </div>
      )}
    </div>
  );
}

export function App() {
  useAutoRun();
  const reset = useEditor((s) => s.reset);

  return (
    <ReactFlowProvider>
      <div className="app">
        <header className="topbar">
          <h1>
            EZ Signal <span>signal processing chains in the browser</span>
          </h1>
          <button type="button" className="button" onClick={() => confirm('Replace the canvas with the example chain?') && reset()}>
            Load example
          </button>
        </header>
        <Palette />
        <Editor />
      </div>
    </ReactFlowProvider>
  );
}
