import { describe, it, expect, vi } from 'vitest';
import { Spawner } from '../Spawner.js';
import { Overlay } from '../Overlay.js';

describe('orchestration lifecycle contracts', () => {
  it('Spawner stops scheduling after destroy and never spawns again', () => {
    const clock = { add: vi.fn(), remove: vi.fn() };
    const factory = vi.fn();
    const spawner = new Spawner({ clock, interval: 0, maxAlive: 2, waveSize: 2, factory });
    spawner.start();
    expect(clock.add).toHaveBeenCalledTimes(1);
    spawner.destroy();
    expect(clock.remove).toHaveBeenCalledTimes(1);
    expect(() => spawner.start()).not.toThrow();
    expect(clock.add).toHaveBeenCalledTimes(1);
    expect(factory).not.toHaveBeenCalled();
  });

  it('Overlay replacement invalidates stale completion', async () => {
    const source = { subscribe: vi.fn(() => () => {}), setObserved: vi.fn(), removeObserved: vi.fn() };
    const first = { progress: vi.fn(), subscribe: vi.fn((cb) => { first.done = cb; return () => {}; }), destroy: vi.fn() };
    const second = { progress: vi.fn(), subscribe: vi.fn((cb) => { second.done = cb; return () => {}; }), destroy: vi.fn() };
    const overlay = new Overlay();
    overlay.attach(source, first, () => ({}));
    overlay.attach(source, second, () => ({}));
    first.done?.();
    expect(second.destroy).not.toHaveBeenCalled();
    overlay.destroy();
  });
});
