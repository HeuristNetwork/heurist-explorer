import {
  HEURIST_MODULE_BOOTSTRAP_FORMAT,
  HEURIST_MODULE_BOOTSTRAP_VERSION
} from '../contracts/moduleContracts.js';

/** Return a safe, serializable module bootstrap envelope. */
export function normalizeModuleBootstrap(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value : {};
  return {
    format: input.format || HEURIST_MODULE_BOOTSTRAP_FORMAT,
    version: Number.isInteger(Number(input.version))
      ? Number(input.version) : HEURIST_MODULE_BOOTSTRAP_VERSION,
    runtime: cloneObject(input.runtime),
    settings: cloneObject(input.settings),
    state: cloneValue(input.state),
    source: cloneObject(input.source)
  };
}

/** Read bootstrap from an iframe bridge first, then from a standalone global. */
export function resolveModuleBootstrap({ bridge, standalone } = {}) {
  const value = bridge && typeof bridge.getConfiguration === 'function'
    ? bridge.getConfiguration() : standalone;
  return normalizeModuleBootstrap(value);
}

function cloneObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return cloneValue(value);
}

function cloneValue(value) {
  if (value == null) return value ?? null;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
