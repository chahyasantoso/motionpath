import { ProjectRuntime } from "./ProjectRuntime.js";

/**
 * Creates a caller-owned standalone observation scope for direct Track users.
 * The returned runtime owns the adapter and must be disposed by its caller.
 */
export function createObservationScope(options = {}) {
  return new ProjectRuntime({
    ...options,
    observationOwnership: options.observationOwnership ?? "scoped",
  });
}
