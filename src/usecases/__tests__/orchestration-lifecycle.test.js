import { describe, it, expect, vi } from 'vitest';
import { Spawner } from '../Spawner.js';
import { Overlay } from '../Overlay.js';

describe('orchestration lifecycle contracts', () => {
  it('Spawner stops scheduling after destroy and never spawns again', () => {
    const unsubscribe = vi.fn();
    const clock = { subscribe: vi.fn(() => unsubscribe) };
    const factory = vi.fn();
    const spawner = new Spawner({ clock, interval: 0, maxAlive: 2, waveSize: 2, factory });
    spawner.start();
    expect(clock.subscribe).toHaveBeenCalledTimes(1);
    spawner.destroy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(() => spawner.start()).toThrow('Spawner is destroyed.');
    expect(clock.subscribe).toHaveBeenCalledTimes(1);
    expect(factory).not.toHaveBeenCalled();
  });

  it('Overlay replacement invalidates stale completion', () => {
    const source = { setObserved: vi.fn(), removeObserved: vi.fn() };
    const first = { destroy: vi.fn() };
    const second = { destroy: vi.fn() };
    const overlay = new Overlay();
    overlay.attach(source, first, () => ({}));
    overlay.attach(source, second, () => ({}));
    expect(source.removeObserved).toHaveBeenCalledWith(first);
    expect(first.destroy).not.toHaveBeenCalled();
    expect(second.destroy).not.toHaveBeenCalled();
    overlay.destroy();
    expect(second.destroy).toHaveBeenCalledTimes(1);
  });
});
