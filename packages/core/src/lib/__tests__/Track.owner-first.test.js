import { describe, expect, it } from "vitest";
import { createObservationScope } from "../../runtime/createObservationScope.js";
import { Track } from "../Track.js";

function track(id, owner) {
  return new Track({
    id,
    observationAdapter: owner.standaloneObservationAdapter,
    proxyState: { value: id },
    plugins: [{ keys: ["value"], compose: (raw) => ({ value: raw.value }) }],
    resolvedTrack: { id, keyframes: { value: {} } },
  });
}

describe("phase one owner-first observation migration", () => {
  it("uses the caller-owned scope for direct Tracks", () => {
    const scope = createObservationScope();
    const source = track("source", scope);
    const observer = track("observer", scope);

    scope.standaloneObservationAdapter.setObserved(
      observer,
      source,
      (patch) => ({ upstream: patch.value }),
    );

    expect(scope.standaloneObservationAdapter.getSources(observer)).toEqual([
      source,
    ]);
    expect(scope.standaloneObservationAdapter.getObserverIds(source)).toEqual([
      "observer",
    ]);
    expect(observer.compose()).toEqual({
      value: "observer",
      upstream: "source",
    });
    scope.dispose();
  });

  it("keeps the legacy Track facade out of owner-first callers", () => {
    const scope = createObservationScope();
    const source = track("source", scope);
    const observer = track("observer", scope);
    const owner = observer.getObservationOwner();

    owner.setObserved(observer, source, null);
    expect(owner.getEdges(observer)).toHaveLength(1);
    expect(owner.getSources(observer)).toEqual([source]);
    scope.dispose();
  });
});
