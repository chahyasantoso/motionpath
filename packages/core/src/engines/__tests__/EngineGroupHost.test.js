import { describe, it, expect, afterEach } from "vitest";
import { Engine } from "../Engine.js";

function project() {
  return {
    schemaVersion: 4,
    projectId: "group-host-test",
    motions: [
      {
        id: "ball-template-motion",
        trigger: { type: "time", autoplay: false },
        tracks: [
          {
            id: "ball-track",
            duration: 1,
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
    tracks: [
      {
        id: "exit-track",
        duration: 0.2,
        keyframes: {
          scale: {
            stops: [
              { p: 0, v: 1 },
              { p: 1, v: 0 },
            ],
          },
        },
      },
    ],
  };
}

describe("Engine.createGroupHost", () => {
  let engine;

  afterEach(() => {
    engine?.destroy();
  });

  it("creates an owned, auto-ticking TrackGroup without schema host entries", async () => {
    engine = new Engine();
    await engine.loadProject(project());

    const host = engine.createGroupHost({
      id: "spiral-parent",
      staggerTransition: { duration: 0.1, ease: "power2.out" },
    });
    const child = engine.createTrackInstance("ball-track", {
      id: "ball-1",
    });

    expect(host.id).toBe("spiral-parent");
    expect(host.childCount).toBe(0);
    expect(engine.isOwned(host)).toBe(true);

    host.addChild(child, { stagger: 0.5 });
    expect(host.childCount).toBe(1);
    expect(child.isMounted).toBe(true);

    host.pause();
    host.seek(0);
    host.play();
    host.removeChild("ball-1");
    expect(host.childCount).toBe(0);

    engine.unmount(host);
    expect(engine.isOwned(host)).toBe(false);
    expect(engine.isOwned(child)).toBe(true);
    engine.unmount(child);
  });

  it("rejects an empty host id", async () => {
    engine = new Engine();
    await engine.loadProject(project());
    expect(() => engine.createGroupHost({ id: "" })).toThrow(
      "id must be a non-empty string",
    );
  });
});
