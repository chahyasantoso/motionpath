/**
 * Compatibility name for the scoped observation adapter.
 *
 * The old implementation kept a process-wide registry so independently
 * constructed adapters could see one another. That made public-id lookup cross
 * Engine boundaries, made shared-track teardown partial, and kept dropped
 * Tracks alive for the process lifetime. ProjectRuntime now owns the adapter
 * lifetime, so compatibility and scoped ownership are the same implementation
 * behind the legacy name.
 */
export { ScopedObservationAdapter as StandaloneObservationAdapter } from "./ScopedObservationAdapter.js";
