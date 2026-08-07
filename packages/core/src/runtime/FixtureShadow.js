function isObject(value) { return value !== null && typeof value === "object"; }
function close(a, b, tolerance) { return typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tolerance; }
function compareValue(actual, expected, path, tolerance, mismatches) {
  if (close(actual, expected, tolerance) || Object.is(actual, expected)) return;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) mismatches.push(`${path}: array length ${actual.length} !== ${expected.length}`);
    for (let i = 0; i < Math.min(actual.length, expected.length); i += 1) compareValue(actual[i], expected[i], `${path}[${i}]`, tolerance, mismatches);
    return;
  }
  if (isObject(actual) && isObject(expected) && !Array.isArray(actual) && !Array.isArray(expected)) {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    for (const key of keys) compareValue(actual[key], expected[key], `${path}.${key}`, tolerance, mismatches);
    return;
  }
  mismatches.push(`${path}: ${String(actual)} !== ${String(expected)}`);
}

export function composeLegacyPatches(graph, tracks) {
  const composed = new Map();
  for (const id of graph.order) {
    const track = tracks.get(id);
    if (track && !track.isDestroyed) composed.set(id, track.compose(undefined, composed));
  }
  return composed;
}

export function compareShadowPatches(legacy, published, { tolerance = 1e-8 } = {}) {
  const mismatches = [];
  const ids = new Set([...legacy.keys(), ...published.keys()]);
  for (const id of ids) {
    if (!legacy.has(id)) { mismatches.push(`${id}: missing from legacy patches`); continue; }
    if (!published.has(id)) { mismatches.push(`${id}: missing from publisher patches`); continue; }
    compareValue(published.get(id), legacy.get(id), id, tolerance, mismatches);
  }
  return { equal: mismatches.length === 0, mismatches };
}

export function shadowFixture({ graph, tracks, runtime, marks = [] }) {
  const legacy = composeLegacyPatches(graph, tracks);
  for (const id of marks) runtime.publisher.markDirty(id);
  runtime.flush();
  const published = new Map([...runtime.patches.snapshot()].map(([id, patch]) => [id, patch.values]));
  return { legacy, published, comparison: compareShadowPatches(legacy, published) };
}
