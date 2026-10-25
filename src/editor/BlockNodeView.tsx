import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { getBlock } from '../blocks/registry';
import { isVisible, validateParams } from '../blocks/validate';
import { ParamField } from './ParamField';
import { PreviewView } from './previews/PreviewView';
import { useEditor, type BlockNode } from './store';

const STATE_LABEL = { running: 'Running', done: 'Up to date', error: 'Error', waiting: 'Waiting' } as const;

export const BlockNodeView = memo(function BlockNodeView({ id, data, selected }: NodeProps<BlockNode>) {
  const def = getBlock(data.blockType);
  const status = useEditor((s) => s.statuses[id]);
  const removeBlock = useEditor((s) => s.removeBlock);
  const { values, errors } = validateParams(def, data.params);
  const ports = Math.max(def.inputs.length, def.outputs.length);
  const wide = def.wide;

  return (
    <div className={`block block--${def.category}${wide ? ' block--wide' : ''}${selected ? ' block--selected' : ''}`}>
      <header className="block__header" title={def.description}>
        <span className={`status status--${status?.state ?? 'waiting'}`} title={STATE_LABEL[status?.state ?? 'waiting']} />
        <span className="block__title">{def.title}</span>
        <button type="button" className="block__remove nodrag" aria-label={`Remove ${def.title}`} onClick={() => removeBlock(id)}>
          ×
        </button>
      </header>

      {ports > 0 && (
        <div className="block__ports">
          {Array.from({ length: ports }, (_, i) => {
            const input = def.inputs[i];
            const output = def.outputs[i];
            return (
              <div className="port-row" key={i}>
                {input && (
                  <span className="port port--in">
                    <Handle type="target" position={Position.Left} id={input.id} className={`handle handle--${input.kind}`} />
                    {input.label}
                  </span>
                )}
                {output && (
                  <span className="port port--out">
                    {output.label}
                    <Handle type="source" position={Position.Right} id={output.id} className={`handle handle--${output.kind}`} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {def.params.some((p) => isVisible(p, values)) && (
        <div className="block__params">
          {def.params
            .filter((p) => isVisible(p, values))
            .map((spec) => (
              <ParamField
                key={spec.key}
                nodeId={id}
                spec={spec}
                value={values[spec.key]}
                error={errors[spec.key]}
                fileNames={data.fileNames}
                sharedFileName={data.sharedFileName}
              />
            ))}
        </div>
      )}

      {status?.message && <p className={`block__message block__message--${status.state}`}>{status.message}</p>}

      {status?.preview && (
        <div className={`block__preview${status.state === 'done' ? '' : ' block__preview--stale'}`}>
          <PreviewView preview={status.preview} />
        </div>
      )}

      {status?.elapsedMs !== undefined && status.state === 'done' && (
        <footer className="block__footer">{status.elapsedMs < 1 ? '<1' : Math.round(status.elapsedMs)} ms</footer>
      )}
    </div>
  );
});
