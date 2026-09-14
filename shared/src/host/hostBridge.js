/** Return a same-origin bridge stored on the embedding iframe element. */
export function getFrameHostBridge(propertyName) {
  if (!propertyName) return null;
  try {
    return globalThis.frameElement?.[propertyName] || null;
  } catch {
    return null;
  }
}

/** Read a standalone bootstrap object from the global namespace. */
export function getGlobalBootstrap(propertyName) {
  if (!propertyName) return {};
  const value = globalThis[propertyName];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
