import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { SHARE_PARAM, decodeGraph, deserializeGraph, serializeGraph, shareUrl } from './share';
import { useEditor, type BlockNode } from './store';
import type { Edge } from '@xyflow/react';

interface Notice {
  text: string;
  tone: 'info' | 'error';
  /** Shown in a selectable field when copying to the clipboard isn't possible. */
  link?: string;
}

const NO_FILES = 'Audio files are not included; whoever opens it chooses their own.';

export function Toolbar() {
  const { nodes, edges, loadGraph, reset } = useEditor();
  const { fitView } = useReactFlow();
  const importInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>();

  const load = (graph: { nodes: BlockNode[]; edges: Edge[]; skipped: number }, what: string) => {
    loadGraph(graph.nodes, graph.edges);
    setTimeout(() => fitView({ padding: 0.1 }), 50);
    const hasFiles = graph.nodes.some((n) => n.data.sharedFileName);
    const parts = [
      `${what}.`,
      graph.skipped > 0 && `${graph.skipped} unknown block(s) skipped.`,
      hasFiles && 'Choose the audio files again in the file blocks.',
    ];
    setNotice({ text: parts.filter(Boolean).join(' '), tone: 'info' });
  };

  // Open a graph from a share link (#g=...), then drop the hash so a reload keeps later edits.
  useEffect(() => {
    const hash = new URLSearchParams(location.hash.slice(1)).get(SHARE_PARAM);
    if (!hash) return;
    history.replaceState(null, '', location.pathname + location.search);
    decodeGraph(hash)
      .then((data) => load(deserializeGraph(data), 'Opened shared graph'))
      .catch(() => setNotice({ text: 'This share link is damaged or incomplete.', tone: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    const link = await shareUrl(serializeGraph(nodes, edges));
    try {
      await navigator.clipboard.writeText(link);
      setNotice({ text: `Link copied. ${NO_FILES}`, tone: 'info' });
    } catch {
      setNotice({ text: `Copy this link. ${NO_FILES}`, tone: 'info', link });
    }
  };

  const exportJson = () => {
    const json = JSON.stringify(serializeGraph(nodes, edges), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ez-signal-graph.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      load(deserializeGraph(JSON.parse(await file.text())), `Imported ${file.name}`);
    } catch (e) {
      setNotice({ text: `Could not import ${file.name}: ${(e as Error).message}`, tone: 'error' });
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  };

  return (
    <div className="toolbar">
      <button type="button" className="button button--primary" onClick={share}>
        Share link
      </button>
      <button type="button" className="button" onClick={exportJson}>
        Export
      </button>
      <button type="button" className="button" onClick={() => importInput.current?.click()}>
        Import
      </button>
      <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
      <button
        type="button"
        className="button"
        onClick={() => confirm('Replace the canvas with the example chain?') && reset()}
      >
        Load example
      </button>

      {notice && (
        <div className={`notice notice--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          {notice.link && <input type="text" readOnly value={notice.link} onFocus={(e) => e.target.select()} autoFocus />}
          <button type="button" className="notice__close" aria-label="Dismiss" onClick={() => setNotice(undefined)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
