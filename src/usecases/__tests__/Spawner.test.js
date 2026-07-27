import { describe, it, expect } from "vitest";
import { Spawner } from "../Spawner.js";

function clock() {
  const listeners = new Set();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    tick(ms) {
      for (const fn of [...listeners]) fn(ms);
    },
  };
}

describe("Spawner", () => {
  it("spawns on interval, respects maxAlive, and drains deterministically", () => {
    const c = clock();
    const spawned = [];
    let completed = 0;
    const spawner = new Spawner({
      clock: c,
      interval: 100,
      maxAlive: 2,
      waveSize: 3,
      factory: ({ index }) => ({ index }),
      onSpawn: (entity) => spawned.push(entity),
      onComplete: () => {
        completed += 1;
      },
    });
    spawner.start();
    c.tick(99);
    expect(spawned).toHaveLength(0);
    c.tick(1);
    expect(spawned).toHaveLength(1);
    c.tick(100);
    expect(spawned).toHaveLength(2);
    c.tick(100);
    expect(spawned).toHaveLength(2);
    spawner.notifyRemoved(2);
    c.tick(100);
    expect(spawned).toHaveLength(3);
    spawner.notifyRemoved(1);
    expect(spawner.state).toBe("complete");
    expect(completed).toBe(1);
  });

  it("supports a progress gate without creating a second scheduler", () => {
    const c = clock();
    let ready = false;
    let count = 0;
    const s = new Spawner({
      clock: c,
      interval: 0,
      waveSize: 2,
      canSpawn: () => ready,
      factory: () => ++count,
    });
    s.start();
    c.tick(16);
    expect(count).toBe(0);
    ready = true;
    c.tick(16);
    expect(count).toBe(1);
    s.notifyRemoved(1);
    c.tick(16);
    expect(count).toBe(2);
  });

  it("pause and destroy stop future scheduling", () => {
    const c = clock();
    let count = 0;
    const s = new Spawner({
      clock: c,
      interval: 1,
      waveSize: 10,
      factory: () => ++count,
    });
    s.start();
    c.tick(1);
    expect(count).toBe(1);
    s.pause();
    c.tick(10);
    expect(count).toBe(1);
    s.resume();
    c.tick(1);
    expect(count).toBe(2);
    s.destroy();
    c.tick(100);
    expect(count).toBe(2);
    expect(s.state).toBe("destroyed");
  });
});
