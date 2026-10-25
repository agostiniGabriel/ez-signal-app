import type { BlockDefinition, ParamSpec, Params } from './types';

export const defaultParams = (def: BlockDefinition): Params =>
  Object.fromEntries(def.params.map((p) => [p.key, p.default]));

export function isVisible(spec: ParamSpec, params: Params): boolean {
  return !spec.visibleWhen || spec.visibleWhen.in.includes(params[spec.visibleWhen.param]);
}

/**
 * Validates params against the block's metadata, filling defaults for missing values.
 * Hidden params are not validated. The same check runs in the editor (inline errors) and in the worker.
 */
export function validateParams(def: BlockDefinition, raw: Params): { values: Params; errors: Record<string, string> } {
  const values: Params = { ...defaultParams(def), ...raw };
  const errors: Record<string, string> = {};

  for (const spec of def.params) {
    if (!isVisible(spec, values)) continue;
    const value = values[spec.key];
    switch (spec.type) {
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) errors[spec.key] = 'Enter a number';
        else if (spec.integer && !Number.isInteger(value)) errors[spec.key] = 'Must be a whole number';
        else if (spec.min !== undefined && value < spec.min) errors[spec.key] = `Minimum is ${spec.min}`;
        else if (spec.max !== undefined && value > spec.max) errors[spec.key] = `Maximum is ${spec.max}`;
        break;
      }
      case 'select':
        if (!spec.options.some((o) => o.value === value)) errors[spec.key] = 'Choose an option';
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors[spec.key] = 'Invalid value';
        break;
      case 'file':
        if (!value) errors[spec.key] = 'Choose a file';
        break;
    }
  }
  return { values, errors };
}
