/**
 * Canonical identity for one live observation edge.
 *
 * The delimiter prevents collisions such as ["A", "BC"] and ["AB", "C"].
 * Role and input are part of identity because one source may legally provide
 * both an input and an output edge to the same observer.
 */
export function observationEdgeKey(sourceId, role = "output", input) {
  return [sourceId, role, input ?? ""].join("");
}

export function observationEdgeEquals(a, b) {
  return Boolean(a && b) && observationEdgeKey(a.source, a.role, a.input) === observationEdgeKey(b.source, b.role, b.input);
}
