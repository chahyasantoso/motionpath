import { describe, expect, it } from "vitest";
import { Engine } from "../Engine.js";
import { ScopedObservationAdapter } from "../../usecases/ScopedObservationAdapter.js";
import { StandaloneObservationAdapter } from "../../usecases/StandaloneObservationAdapter.js";

/**
 * P2-03 runtime integration gate.
 *
 * The adapter parity suite compares the two owners in isolation, and the
 * ProjectRuntime suite compares disposal. Neither constructs a Track the way the
 * library actually does. This drives the production path end to end in both
 * ownership modes and compares the results, because the two bugs this slice has
 * already produced were both invisible until a real caller wired real Tracks.
 *
 * Rules for adding a scenario here: assert the SHAPE of composed patches, never
 * plugin-specific values. The gate is mode against mode; a locked literal that
 * encodes plugin output would break on unrelated composition work.
 */

const project = {
  schemaVersion: 4,
  motions: [
    {
      id: "m",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "t",
          keyframes: {
            opacity: {
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
          },
        },
      ],
    },
  ],
};

function throwsWith(action, pattern) {
  try {
    action();
    return { threw: false, matched: false };
  } catch (error) {
    return {
      threw: true,
      matched: pattern.test(String(error?.message ?? error)),
    };
  }
}

function ids(tracks) {
  return tracks.map(({ id }) => id).sort();
}

/**
 * One standalone chain, one back-edge, one destroy, one dispose.
 *
 * The back-edge makes source/observer/downstream a cycle on purpose: the
 * COMPOSING fallback is the oldest fragile part of this protocol and it has to
 * behave the same under both owners.
 */
async function ownershipSnapshot(options) {
  const engine = new Engine(options);
  await engine.loadProject(project);
  const adapter = engine.projectRuntime.standaloneObservationAdapter;

  const source = engine.createTrackInstance("t", { id: "src" });
  const observer = engine.createTrackInstance("t", { id: "obs" });
  const downstream = engine.createTrackInstance("t", { id: "down" });

  observer.setObserved(source, (patch) => ({ fromSource: patch.opacity }));
  downstream.setObserved(observer, (patch) => ({
    fromObserver: patch.opacity,
  }));
  // Repeated mutation on a live edge, which is what inflated the old refcount.
  observer.setObserved(source, (patch) => ({
    fromSource: patch.opacity,
    again: true,
  }));
  source.setObserved(downstream, (patch) => ({
    fromDownstream: patch.opacity,
  }));

  const wired = {
    // A non-empty edge list on the RUNTIME's adapter is the proof that every
    // standalone Track shares one owner instead of carrying its own (F-02).
    runtimeAdapterSeesChain: adapter
      .getEdges(observer)
      .map(({ source: from }) => from.id),
    observerSources: ids(observer.observedSources),
    downstreamSources: ids(downstream.observedSources),
    sourceObserverIds: [...adapter.getObserverIds(source)].sort(),
    observerEdgeCount: observer.observedEdges.length,
    cycleComposeThrows: throwsWith(() => observer.compose(), /./),
    observerPatchKeys: Object.keys(observer.compose()).sort(),
    downstreamPatchKeys: Object.keys(downstream.compose()).sort(),
  };

  source.destroy();
  const afterSourceDestroy = {
    observerSources: ids(observer.observedSources),
    downstreamSources: ids(downstream.observedSources),
    sourceObserverIds: [...adapter.getObserverIds(source)].sort(),
    observerStillComposes: !throwsWith(() => observer.compose(), /./).threw,
  };

  engine.destroy();
  return {
    wired,
    afterSourceDestroy,
    adapterDestroyedByEngineDestroy: adapter.isDestroyed,
    // destroy() rebuilds the runtime. It must come back in the SAME mode.
    ownershipSurvivesDestroy: engine.projectRuntime.observationOwnership,
    ownershipReported: engine.observationOwnership,
    composeAfterDestroyThrows: throwsWith(
      () => observer.compose(),
      /destroyed/i,
    ),
  };
}

describe("P2-03 Engine observation ownership integration", () => {
  it("keeps compatibility ownership as the default", () => {
    const engine = new Engine();
    expect(engine.observationOwnership).toBe("compatibility");
    expect(engine.projectRuntime.standaloneObservationAdapter).toBeInstanceOf(
      StandaloneObservationAdapter,
    );
    engine.destroy();
  });

  it("builds standalone Tracks against the scoped owner only when asked", () => {
    const engine = new Engine({ observationOwnership: "scoped" });
    expect(engine.observationOwnership).toBe("scoped");
    expect(engine.projectRuntime.standaloneObservationAdapter).toBeInstanceOf(
      ScopedObservationAdapter,
    );
    engine.destroy();
  });

  it("keeps the ownership mode across destroy()", () => {
    const engine = new Engine({ observationOwnership: "scoped" });
    engine.destroy();
    // The replacement runtime used to be built with constructor defaults, so a
    // scoped engine silently became a compatibility engine after any destroy().
    expect(engine.projectRuntime.observationOwnership).toBe("scoped");
    expect(engine.observationOwnership).toBe("scoped");
    engine.destroy();
  });

  it("rejects an unknown ownership mode before building anything", () => {
    expect(() => new Engine({ observationOwnership: "global" })).toThrow(
      /compatibility.*scoped/i,
    );
  });

  it("lets an injected ProjectRuntime own the mode and refuses to contradict it", async () => {
    const { ProjectRuntime } = await import("../../runtime/ProjectRuntime.js");
    const scopedRuntime = new ProjectRuntime({
      observationOwnership: "scoped",
    });
    const engine = new Engine({ projectRuntime: scopedRuntime });
    expect(engine.observationOwnership).toBe("scoped");
    engine.destroy();

    const conflicting = new ProjectRuntime({ observationOwnership: "scoped" });
    expect(
      () =>
        new Engine({
          projectRuntime: conflicting,
          observationOwnership: "compatibility",
        }),
    ).toThrow(/conflicts/i);
    conflicting.dispose();
  });

  it("produces identical results in both ownership modes", async () => {
    const compatibility = await ownershipSnapshot({});
    const scoped = await ownershipSnapshot({ observationOwnership: "scoped" });
    expect(scoped).toEqual({
      ...compatibility,
      ownershipSurvivesDestroy: "scoped",
      ownershipReported: "scoped",
    });
  });

  it("holds the locked runtime contract in both ownership modes", async () => {
    for (const mode of ["compatibility", "scoped"]) {
      const snapshot = await ownershipSnapshot({ observationOwnership: mode });
      expect(snapshot.wired.runtimeAdapterSeesChain).toEqual(["src"]);
      expect(snapshot.wired.observerSources).toEqual(["src"]);
      expect(snapshot.wired.downstreamSources).toEqual(["obs"]);
      expect(snapshot.wired.sourceObserverIds).toEqual(["obs"]);
      // Repeating an edge replaces its mapper, it does not add a second edge.
      expect(snapshot.wired.observerEdgeCount).toBe(1);
      // A standalone cycle terminates through the COMPOSING fallback.
      expect(snapshot.wired.cycleComposeThrows.threw).toBe(false);
      expect(snapshot.wired.observerPatchKeys).toContain("fromSource");
      expect(snapshot.wired.downstreamPatchKeys).toContain("fromObserver");
      // Destroying a source removes the edges that depended on it, and stops it
      // reporting observers. This is the end-to-end refcount regression.
      expect(snapshot.afterSourceDestroy.observerSources).toEqual([]);
      expect(snapshot.afterSourceDestroy.sourceObserverIds).toEqual([]);
      expect(snapshot.afterSourceDestroy.downstreamSources).toEqual(["obs"]);
      expect(snapshot.afterSourceDestroy.observerStillComposes).toBe(true);
      expect(snapshot.adapterDestroyedByEngineDestroy).toBe(true);
      expect(snapshot.composeAfterDestroyThrows).toEqual({
        threw: true,
        matched: true,
      });
    }
  });

  it("resolves a public track id inside its own scope under scoped ownership", async () => {
    // Compatibility ownership resolves a bare id through the process-global
    // registry, so the first engine to register an id wins for everyone. That is
    // the leak scoped ownership deletes, asserted here from the scoped side only.
    const first = new Engine({ observationOwnership: "scoped" });
    const second = new Engine({ observationOwnership: "scoped" });
    await first.loadProject(project);
    await second.loadProject(project);

    const firstSource = first.createTrackInstance("t", {
      id: "shared-probe-src",
    });
    const firstObserver = first.createTrackInstance("t", {
      id: "shared-probe",
    });
    firstObserver.setObserved(firstSource, (patch) => ({
      fromFirst: patch.opacity,
    }));

    const secondSource = second.createTrackInstance("t", {
      id: "other-probe-src",
    });
    const secondObserver = second.createTrackInstance("t", {
      id: "shared-probe",
    });
    secondObserver.setObserved(secondSource, (patch) => ({
      fromSecond: patch.opacity,
    }));

    const secondAdapter = second.projectRuntime.standaloneObservationAdapter;
    expect(
      secondAdapter.getEdges("shared-probe").map(({ source }) => source.id),
    ).toEqual(["other-probe-src"]);

    first.destroy();
    second.destroy();
  });
});
