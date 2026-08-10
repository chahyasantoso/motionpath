import { describe, expect, it } from "vitest";
import { Track } from "../../lib/Track.js";
import { ObservationState } from "../ObservationState.js";
import { ObservationStateBridge } from "../ObservationStateBridge.js";
import {
  COMPOSING,
  patchesEqual,
  trackComposeLeaf,
} from "../composeContext.js";
import {
  buildRealGraph,
  chainMotion,
  diamondMotion,
} from "../../__fixtures__/graphTracks.js";

/**
 * P2-03 composition-ownership evidence.
 *
 * The gate says no Track observation state is removed without parity evidence.
 * Wiring parity was already covered; composition parity was not, and that is
 * where the divergence actually lived. Every case here composes the same graph
 * twice, once through the live Track walk and once through ObservationState,
 * and requires an identical patch.
 *
 * Tracks are real Track instances throughout. Substituting object literals is
 * the shortcut that let the publisher ship "complete" while broken, per
 * docs/V4.3-GRAPH-CORRECTNESS-PLAN.md.
 */

function realTrack(id, plugins, proxyState = { x: 1, y: 2 }) {
  return new Track({
    id,
    proxyState,
    plugins,
    resolvedTrack: { id, keyframes: {} },
  });
}

/** Leaf output with a nested object, which is the normal patch shape. */
function nestedPlugin() {
  return [
    {
      keys: ["x", "y"],
      compose: (raw) => ({
        style: { opacity: raw.x ?? 0, color: "red" },
        tag: "leaf",
      }),
    },
  ];
}

/** Leaf output that reports what the walker handed it as its source. */
function echoSourcePlugin() {
  return [
    {
      keys: ["x"],
      compose: (raw) => ({
        readX: raw?.x ?? null,
        sawSource: raw !== undefined,
      }),
    },
  ];
}

/** Mirror the live Track wiring into a shadow ObservationState. */
function shadowOf(tracks) {
  const state = new ObservationState({ tracks });
  for (const track of tracks.values()) {
    for (const edge of track.observedEdges) {
      state.addEdge({
        source: edge.source.id,
        target: track.id,
        role: edge.role,
        input: edge.input,
        mapFn: edge.mapFn,
      });
    }
  }
  return state;
}

function expectComposeParity(tracks, state) {
  for (const track of tracks.values()) {
    const live = track.compose();
    const shadow = state.compose(
      track.id,
      undefined,
      new Map(),
      trackComposeLeaf,
    );
    expect(shadow, `composition parity for '${track.id}'`).toEqual(live);
    expect(patchesEqual(live, shadow)).toBe(true);
  }
}

describe("P2-03 ObservationState composition equivalence", () => {
  it("matches the live Track walk for a straight chain", () => {
    const { tracks } = buildRealGraph(chainMotion(4));
    expectComposeParity(tracks, shadowOf(tracks));
  });

  it("matches the live Track walk for a diamond with a shared ancestor", () => {
    const { tracks } = buildRealGraph(diamondMotion());
    expectComposeParity(tracks, shadowOf(tracks));
  });

  it("matches the live Track walk after progress moves upstream", () => {
    const { tracks } = buildRealGraph(chainMotion(3));
    tracks.get("n0").progress(0.5);
    expectComposeParity(tracks, shadowOf(tracks));
  });

  it("merges nested output contributions one level deep, not by replacement", () => {
    const source = realTrack("src", nestedPlugin());
    const observer = realTrack("obs", nestedPlugin());
    observer.setObserved(source, () => ({ style: { color: "blue" } }));
    const tracks = new Map([
      ["src", source],
      ["obs", observer],
    ]);

    const live = observer.compose();
    // A shallow spread would drop `opacity` here. mergePatches keeps it.
    expect(live.style).toEqual({ opacity: 1, color: "blue" });
    expect(live.tag).toBe("leaf");
    expectComposeParity(tracks, shadowOf(tracks));
  });

  it("folds input-role contributions into the leaf source identically", () => {
    const source = realTrack("src", echoSourcePlugin());
    const observer = realTrack("obs", echoSourcePlugin());
    observer.setObserved(source, () => ({ x: 99 }), {
      role: "input",
      target: "obs",
    });
    const tracks = new Map([
      ["src", source],
      ["obs", observer],
    ]);

    expect(observer.compose().readX).toBe(99);
    expectComposeParity(tracks, shadowOf(tracks));
  });

  it("hands the leaf a resolved source even when the track has no input edges", () => {
    const track = realTrack("solo", echoSourcePlugin());
    const state = new ObservationState({ tracks: new Map([["solo", track]]) });
    const patch = state.compose("solo", undefined, new Map(), trackComposeLeaf);
    // Defaulting the source inside the input loop used to leave this undefined.
    expect(patch).toEqual({ readX: 1, sawSource: true });
    expect(patch).toEqual(track.compose());
  });

  it("holds an input and an output edge from one source with the same result", () => {
    const source = realTrack("src", nestedPlugin());
    const observer = realTrack("obs", nestedPlugin());
    observer.setObserved(source, () => ({ x: 7 }), {
      role: "input",
      target: "obs",
    });
    observer.setObserved(source, () => ({ tag: "out" }), { role: "output" });
    const tracks = new Map([
      ["src", source],
      ["obs", observer],
    ]);

    expect(observer.observedEdges).toHaveLength(2);
    expect(observer.compose()).toMatchObject({
      tag: "out",
      style: { opacity: 7 },
    });
    expectComposeParity(tracks, shadowOf(tracks));
  });

  it("ignores edges with no mapFn on both sides", () => {
    const source = realTrack("src", nestedPlugin());
    const observer = realTrack("obs", nestedPlugin());
    observer.setObserved(source, null);
    const tracks = new Map([
      ["src", source],
      ["obs", observer],
    ]);
    expectComposeParity(tracks, shadowOf(tracks));
  });
});

describe("P2-03 compose-context protocol", () => {
  it("falls back to the leaf patch when a node re-enters its own composition", () => {
    const track = realTrack("solo", echoSourcePlugin());
    const state = new ObservationState({ tracks: new Map([["solo", track]]) });

    // A legal standalone back-edge re-enters with COMPOSING already in the ctx.
    // Checking the cache first returned this marker Symbol to the caller.
    const patch = state.compose(
      "solo",
      undefined,
      new Map([["solo", COMPOSING]]),
      trackComposeLeaf,
    );
    expect(typeof patch).toBe("object");
    expect(patch).toEqual(track.composeLocal());
  });

  it("keeps the Track back-edge fallback working on the shared marker", () => {
    const a = realTrack("cycle-a", nestedPlugin());
    const b = realTrack("cycle-b", nestedPlugin());
    a.setObserved(b, (patch) => ({ fromB: patch.tag }));
    b.setObserved(a, (patch) => ({ fromA: patch.tag }));

    // Standalone mutual observation stays legal and must still terminate.
    expect(() => a.compose()).not.toThrow();
    expect(a.compose().fromB).toBe("leaf");
  });

  it("keeps cycle rejection a graph-side concern", () => {
    const a = realTrack("cycle-a", nestedPlugin());
    const b = realTrack("cycle-b", nestedPlugin());
    const state = new ObservationState({
      tracks: new Map([
        ["cycle-a", a],
        ["cycle-b", b],
      ]),
    });
    state.addEdge({
      source: "cycle-a",
      target: "cycle-b",
      mapFn: (patch) => ({ fromA: patch.tag }),
    });
    // Graph-registered tracks may not close a loop, so a standalone mutual pair
    // cannot be mirrored into graph state. That boundary is deliberate.
    expect(() =>
      state.addEdge({ source: "cycle-b", target: "cycle-a" }),
    ).toThrow(/cycle/i);
  });
});

describe("P2-03 bridge composition parity", () => {
  it("passes for a mirrored graph", () => {
    const { tracks } = buildRealGraph(diamondMotion());
    const bridge = new ObservationStateBridge({ tracks });
    expect(bridge.assertParity()).toBe(true);
    expect(bridge.assertCompositionParity()).toBe(true);
  });

  it("fails when a mapFn diverges even though the edge set still matches", () => {
    const { tracks } = buildRealGraph(chainMotion(2));
    const bridge = new ObservationStateBridge({ tracks });

    // Same source, role and input, so edge identity is unchanged and wiring
    // parity still passes. Only the composed value moves.
    tracks
      .get("n1")
      .setObserved(tracks.get("n0"), () => ({ from_n0: "diverged" }));

    expect(bridge.assertParity()).toBe(true);
    expect(() => bridge.assertCompositionParity()).toThrow(
      /composition differs/i,
    );
  });
});
