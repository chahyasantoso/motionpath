/** Builds the lifecycle payload emitted when a Track source is destroyed. */
export function createDestroyEvent(id, observerIds = []) {
  return { id, observerIds };
}
