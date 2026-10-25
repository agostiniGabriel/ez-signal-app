import { useEffect, useId, useRef, useState } from 'react';
import type { NumberParam, ParamSpec, ParamValue } from '../blocks/types';
import { engine } from '../engine/client';
import { useEditor } from './store';

interface FieldProps<S extends ParamSpec> {
  nodeId: string;
  spec: S;
  value: ParamValue;
  error?: string;
  fileNames?: Record<string, string>;
  sharedFileName?: string;
}

export function ParamField(props: FieldProps<ParamSpec>) {
  const id = useId();
  const { spec, error } = props;
  const [localError, setLocalError] = useState<string>();
  const shownError = localError ?? error;

  let control;
  switch (spec.type) {
    case 'number':
      control = <NumberInput {...props} spec={spec} id={id} onLocalError={setLocalError} />;
      break;
    case 'select':
      control = <SelectInput {...props} spec={spec} id={id} />;
      break;
    case 'boolean':
      control = <BooleanInput {...props} id={id} />;
      break;
    case 'file':
      control = <FileInput {...props} id={id} onLocalError={setLocalError} />;
      break;
  }

  return (
    <div className={`field field--${spec.type}${shownError ? ' field--invalid' : ''}`} title={spec.help}>
      {spec.type !== 'boolean' && <label htmlFor={id}>{spec.label}</label>}
      {control}
      {shownError && <span className="field__error">{shownError}</span>}
    </div>
  );
}

function NumberInput({
  nodeId,
  spec,
  value,
  id,
  onLocalError,
}: FieldProps<NumberParam> & { id: string; onLocalError(e?: string): void }) {
  const setParam = useEditor((s) => s.setParam);
  const [text, setText] = useState(String(value));

  // Follow external changes (e.g. reset) without clobbering text the user is typing.
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="input-with-unit">
      <input
        id={id}
        className="nodrag"
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() === '' || !Number.isFinite(parsed)) {
            onLocalError('Enter a number');
          } else {
            onLocalError(undefined);
            setParam(nodeId, spec.key, parsed);
          }
        }}
      />
      {spec.unit && <span className="unit">{spec.unit}</span>}
    </div>
  );
}

function SelectInput({ nodeId, spec, value, id }: FieldProps<Extract<ParamSpec, { type: 'select' }>> & { id: string }) {
  const setParam = useEditor((s) => s.setParam);
  // Option values may be numbers, so the DOM value is the option's index.
  const index = spec.options.findIndex((o) => o.value === value);
  return (
    <select
      id={id}
      className="nodrag"
      value={index}
      onChange={(e) => setParam(nodeId, spec.key, spec.options[Number(e.target.value)].value)}
    >
      {index === -1 && <option value={-1}>—</option>}
      {spec.options.map((o, i) => (
        <option key={String(o.value)} value={i}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function BooleanInput({ nodeId, spec, value, id }: FieldProps<ParamSpec> & { id: string }) {
  const setParam = useEditor((s) => s.setParam);
  return (
    <label className="checkbox nodrag" htmlFor={id}>
      <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => setParam(nodeId, spec.key, e.target.checked)} />
      {spec.label}
    </label>
  );
}

function FileInput({
  nodeId,
  spec,
  value,
  fileNames,
  sharedFileName,
  id,
  onLocalError,
}: FieldProps<ParamSpec> & { id: string; onLocalError(e?: string): void }) {
  const setFile = useEditor((s) => s.setFile);
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const name = value
    ? (fileNames?.[String(value)] ?? 'Unknown file')
    : sharedFileName
      ? `Choose ${sharedFileName}`
      : 'No file chosen';

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    onLocalError(undefined);
    try {
      setFile(nodeId, spec.key, await engine.addAudioFile(file), file.name);
    } catch (e) {
      onLocalError((e as Error).message);
    } finally {
      setLoading(false);
      // Cleared only after reading, so choosing the same file again still fires onChange.
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="file nodrag">
      <input
        ref={input}
        id={id}
        type="file"
        hidden
        accept={spec.type === 'file' ? spec.accept : undefined}
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <button type="button" className="button" onClick={() => input.current?.click()} disabled={loading}>
        {loading ? 'Decoding…' : value ? 'Replace…' : 'Choose file…'}
      </button>
      <span className="file__name" title={name}>
        {name}
      </span>
    </div>
  );
}
