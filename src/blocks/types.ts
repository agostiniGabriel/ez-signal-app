/**
 * Signals are typed buffers plus the metadata needed to interpret them.
 * Ports are typed by `kind`, so the editor only allows compatible connections.
 */
export interface AudioSignal {
  kind: 'audio';
  sampleRate: number;
  channels: Float32Array[];
}

/** Reserved for image-processing blocks: row-major, interleaved channels, values in [0, 1]. */
export interface ImageSignal {
  kind: 'image';
  width: number;
  height: number;
  channels: 1 | 3 | 4;
  data: Float32Array;
}

export type Signal = AudioSignal | ImageSignal;
export type SignalKind = Signal['kind'];

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

/** Shows a parameter only while another parameter has one of the given values. */
export interface Condition {
  param: string;
  in: ParamValue[];
}

interface BaseParam {
  key: string;
  label: string;
  help?: string;
  visibleWhen?: Condition;
}

export interface NumberParam extends BaseParam {
  type: 'number';
  default: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  unit?: string;
}

export interface SelectParam extends BaseParam {
  type: 'select';
  default: string | number;
  options: { value: string | number; label: string }[];
}

export interface BooleanParam extends BaseParam {
  type: 'boolean';
  default: boolean;
}

/** A user-provided file; the value is the id of a source registered with the engine ('' when empty). */
export interface FileParam extends BaseParam {
  type: 'file';
  default: '';
  accept: string;
}

export type ParamSpec = NumberParam | SelectParam | BooleanParam | FileParam;

export interface PortSpec {
  id: string;
  label: string;
  kind: SignalKind;
}

/** Display data a block sends back to the UI. Kept small: plots are downsampled in the worker. */
export type Preview =
  | { kind: 'info'; rows: [string, string][] }
  | { kind: 'waveform'; start: number; step: number; min: Float32Array; max: Float32Array }
  | {
      kind: 'spectrum';
      frequencies: Float32Array;
      values: Float32Array;
      scale: 'linear' | 'db';
      logFrequency: boolean;
    }
  | {
      kind: 'spectrogram';
      db: Float32Array;
      columns: number;
      rows: number;
      duration: number;
      maxFrequency: number;
      dynamicRange: number;
    }
  | { kind: 'audio'; sampleRate: number; channels: Float32Array[] }
  | {
      kind: 'filter';
      sampleRate: number;
      cutoffs: number[];
      /** Log-spaced frequency grid (Hz) with the response at each point. */
      frequencies: Float32Array;
      magnitudeDb: Float32Array;
      /** Unwrapped phase in degrees. */
      phaseDeg: Float32Array;
      /** Interleaved [re, im, re, im, ...] in the z-plane. */
      zeros: Float32Array;
      poles: Float32Array;
      impulse: Float32Array;
    };

export interface Source {
  name: string;
  signal: Signal;
}

export interface BlockContext {
  inputs: Record<string, Signal>;
  params: Params;
  getSource(id: string): Source | undefined;
}

export interface BlockResult {
  outputs?: Record<string, Signal>;
  preview?: Preview;
}

export type BlockCategory = 'source' | 'processing' | 'analysis' | 'output';

export interface BlockDefinition {
  type: string;
  title: string;
  category: BlockCategory;
  description: string;
  /** Wider block in the editor, for blocks with plots. */
  wide?: boolean;
  inputs: PortSpec[];
  outputs: PortSpec[];
  params: ParamSpec[];
  /** Pure function of inputs and params; runs inside the processing worker. Throw to report an error. */
  run(ctx: BlockContext): BlockResult;
}
