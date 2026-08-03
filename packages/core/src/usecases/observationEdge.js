/**
 * Canonical identity for one live observation edge.
 *
 * The NUL delimiter prevents collisions such as ["A", "BC"] and ["AB", "C"],
 * which the old concatenated key silently deduped into one edge.
 *
 * Role and input are part of identity because one source may legally provide
 * both an input and an output edge to the same observer.
 */
export const EDGE_KEY_DELIMITER = "";

export function observationEdgeKey(sourceId, role = "output", input) {
  return [sourceId, role, input ?? ""].join(EDGE_KEY_DELIMITER);
}

export function observationGraphEdgeKey(edge) {
  return [observationEdgeKey(edge.source, edge.role, edge.input), edge.target].join(EDGE_KEY_DELIMITER);
}

export function observationEdgeEquals(a, b) {
  if (!a || !b) return false;
  return a.target === b.target && observationEdgeKey(a.source, a.role, a.input) === observationEdgeKey(b.source, b.role, b.input);
}
