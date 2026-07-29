// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import { useRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../engines/Engine.js", () => ({
  engine: {
    mountWithDelegate: vi.fn((id, delegate) => ({ id, delegate })),
    unmount: vi.fn(),
  },
}));

import { engine } from "../../engines/Engine.js";
import useScrollMotion from "../useScrollMotion.js";

const scrubScene = {
  id: "scrub-scene",
  trigger: { type: "scroll", scrub: 0.5, pin: "pin", start: "top top" },
  tracks: [],
};

const observerScene = {
  id: "observer-scene",
  trigger: {
    type: "scroll",
    scrub: false,
    start: "50% top",
    toggleActions: "play pause resume pause",
  },
  tracks: [],
};

function SharedTriggerHarness() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  useScrollMotion(scrubScene, { trigger: sectionRef, pin: stageRef });
  useScrollMotion(observerScene, { trigger: sectionRef });
  return (
    <section ref={sectionRef} data-testid="section">
      <div ref={stageRef} data-testid="stage" />
    </section>
  );
}

function OwnRefsHarness() {
  const { refs } = useScrollMotion(scrubScene);
  return (
    <section ref={refs.trigger} data-testid="section">
      <div ref={refs.pin} data-testid="stage" />
    </section>
  );
}

function NullSchemaHarness() {
  const { refs } = useScrollMotion(null);
  return <section ref={refs.trigger} />;
}

describe("useScrollMotion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("lets two motions share one trigger element via caller-owned refs", () => {
    const { getByTestId } = render(<SharedTriggerHarness />);
    const section = getByTestId("section");
    const stage = getByTestId("stage");

    expect(engine.mountWithDelegate).toHaveBeenCalledTimes(2);

    const [scrubCall, observerCall] = engine.mountWithDelegate.mock.calls;
    expect(scrubCall[0]).toBe("scrub-scene");
    expect(observerCall[0]).toBe("observer-scene");

    const scrubVars = scrubCall[1].buildTimelineVars();
    const observerVars = observerCall[1].buildTimelineVars();

    expect(scrubVars.scrollTrigger.trigger).toBe(section);
    expect(observerVars.scrollTrigger.trigger).toBe(section);
    // Only the scrubbed scene declared the "pin" role.
    expect(scrubVars.scrollTrigger.pin).toBe(stage);
    expect(observerVars.scrollTrigger.pin).toBeUndefined();
  });

  it("still allocates its own refs when none are supplied", () => {
    const { getByTestId } = render(<OwnRefsHarness />);

    expect(engine.mountWithDelegate).toHaveBeenCalledTimes(1);
    const vars = engine.mountWithDelegate.mock.calls[0][1].buildTimelineVars();
    expect(vars.scrollTrigger.trigger).toBe(getByTestId("section"));
    expect(vars.scrollTrigger.pin).toBe(getByTestId("stage"));
  });

  it("defers mounting while the schema gate is null", () => {
    render(<NullSchemaHarness />);
    expect(engine.mountWithDelegate).not.toHaveBeenCalled();
  });

  it("unmounts through the engine on teardown", () => {
    const { unmount } = render(<OwnRefsHarness />);
    unmount();
    expect(engine.unmount).toHaveBeenCalledTimes(1);
  });
});
