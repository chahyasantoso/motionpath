/**
 * Canonical identity for one live observation edge.
 *
 * Role and input are part of identity because one source may legally provide
 * both an input and an output edge to the same observer. The NUL delimiter is
 * intentional: concatenating fields without a delimiter lets pairs such as
 * ["A", "BC"] and ["AB", "C"] collide.
 */
export const EDGE_KEY_DELIMITER = String.fromCharCode(0);

export function observationEdgeKey(sourceId, role = "output", input) {
  return [sourceId, role, input ?? ""].join(EDGE_KEY_DELIMITER);
}

export function observationGraphEdgeKey(edge) {
  return [
    observationEdgeKey(edge.source, edge.role, edge.input),
    edge.target,
  ].join(EDGE_KEY_DELIMITER);
}

export function observationEdgeEquals(a, b) {
  if (!a || !b) return false;
  return (
    a.target === b.target &&
    observationEdgeKey(a.source, a.role, a.input) ===
      observationEdgeKey(b.source, b.role, b.input)
  );
}
