// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useMotionInstance from '../useMotionInstance';
import { engine } from '../../engines/Engine.js';

vi.mock('../../engines/Engine.js', () => {
  const mockInstance = {
    id: 'mock-inst',
    motionId: 'my-motion',
    destroy: vi.fn()
  };
  return {
    engine: {
      mountInstance: vi.fn(() => mockInstance),
    }
  };
});

describe('useMotionInstance', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('mounts the instance with initial config and does not remount when config changes', () => {
    const initialConfig = { speed: 1 };
    const { rerender, unmount } = renderHook(
      ({ motionId, config }) => useMotionInstance(motionId, config),
      {
        initialProps: { motionId: 'my-motion', config: initialConfig }
      }
    );

    expect(engine.mountInstance).toHaveBeenCalledTimes(1);
    expect(engine.mountInstance).toHaveBeenCalledWith('my-motion', initialConfig);

    // Rerender with a new config
    const newConfig = { speed: 2 };
    rerender({ motionId: 'my-motion', config: newConfig });

    // Should not call mountInstance again
    expect(engine.mountInstance).toHaveBeenCalledTimes(1);

    // Unmount should destroy the instance
    unmount();
    const inst = engine.mountInstance.mock.results[0].value;
    expect(inst.destroy).toHaveBeenCalledTimes(1);
  });

  it('warns in development environment when config changes after mount', () => {
    const initialConfig = { speed: 1 };
    const { rerender } = renderHook(
      ({ motionId, config }) => useMotionInstance(motionId, config),
      {
        initialProps: { motionId: 'my-motion', config: initialConfig }
      }
    );

    expect(consoleWarnSpy).not.toHaveBeenCalled();

    // Rerender with a different config object
    rerender({ motionId: 'my-motion', config: { speed: 2 } });
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('config is mount-time-only');

    // Rerender again with another config object - should not warn again (warns once)
    rerender({ motionId: 'my-motion', config: { speed: 3 } });
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });
});
