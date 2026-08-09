import { describe, expect, it } from "vitest";
import { ProjectRuntime } from "../ProjectRuntime.js";

/**
 * Runtime-level half of the P2-03 parity gate.
 *
 * The adapter suite proves the two owners behave identically. This proves the
 * runtime treats them identically: one adapter for the runtime lifetime, wiring
 * and composition work through the runtime's adapter, and disposal destroys it
 * in both modes. Ownership stays default-off; only an explicit option is scoped.
 */

function track(id, leaf = id) {
  return { id, getSnapshot: () => ({ leaf }), composeLocal: (raw) => ({ leaf: raw?.leaf ?? leaf }) };
}

function throwsWith(action, pattern) {
  try {
    action();
    return { threw: false, matched: false };
  } catch (error) {
    return { threw: true, matched: pattern.test(String(error?.message ?? error)) };
  }
}

function safeCall(action) {
  try {
    action();
    return { threw: false };
  } catch (error) {
    return { threw: true, message: String(error?.message ?? error) };
  }
}

function ownershipSnapshot(options) {
  const runtime = new ProjectRuntime(options);
  const adapter = runtime.standaloneObservationAdapter;
  const source = track("source", "s");
  const observer = track("observer", "o");
  adapter.register(source);
  adapter.register(observer);
  adapter.setObserved(observer, source, (patch) => ({ from: patch.leaf }));
  const snapshot = {
    stableAdapter: adapter === runtime.standaloneObservationAdapter,
    aliveBeforeDispose: adapter.isDestroyed,
    composed: adapter.compose(observer),
    observerIds: adapter.getObserverIds(source),
    trackedBeforeDispose: adapter.tracks.size,
  };
  runtime.dispose();
  snapshot.destroyedAfterDispose = adapter.isDestroyed;
  snapshot.edgesAfterDispose = adapter.getEdges(observer);
  snapshot.trackedAfterDispose = adapter.tracks.size;
  snapshot.adapterAccessThrows = throwsWith(
    () => runtime.standaloneObservationAdapter,
    /disposed/i,
  );
  snapshot.composeAfterDisposeThrows = throwsWith(() => adapter.compose(observer), /destroyed/i);
  snapshot.disposeIsIdempotent = safeCall(() => runtime.dispose());
  return snapshot;
}

const LOCKED = {
  stableAdapter: true,
  aliveBeforeDispose: false,
  composed: { leaf: "o", from: "s" },
  observerIds: ["observer"],
  trackedBeforeDispose: 2,
  destroyedAfterDispose: true,
  edgesAfterDispose: [],
  trackedAfterDispose: 0,
  adapterAccessThrows: { threw: true, matched: true },
  composeAfterDisposeThrows: { threw: true, matched: true },
  disposeIsIdempotent: { threw: false },
};

describe("P2-03 ProjectRuntime observation ownership parity", () => {
  it("keeps compatibility ownership as the default", () => {
    const runtime = new ProjectRuntime();
    expect(runtime.observationOwnership).toBe("compatibility");
    runtime.dispose();
  });

  it("behaves identically in compatibility ownership", () => {
    expect(ownershipSnapshot({})).toEqual(LOCKED);
  });

  it("behaves identically in scoped ownership", () => {
    expect(ownershipSnapshot({ observationOwnership: "scoped" })).toEqual(LOCKED);
  });

  it("reports the requested ownership mode without changing behaviour", () => {
    const compatibility = new ProjectRuntime();
    const scoped = new ProjectRuntime({ observationOwnership: "scoped" });
    expect([compatibility.observationOwnership, scoped.observationOwnership]).toEqual([
      "compatibility",
      "scoped",
    ]);
    compatibility.dispose();
    scoped.dispose();
  });
});
