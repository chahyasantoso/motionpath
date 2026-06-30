// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useMotionPlayer from '../useMotionPlayer';
import motionEngine from '../../lib/motionEngine';

// Mock motionEngine to track initialization and dynamic state updates
vi.mock('../../lib/motionEngine', () => ({
  default: {
    initScene: vi.fn(),
    destroyScene: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
  }
}));

describe('useMotionPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize the scenario on motionEngine when mounted and destroy it on unmount', () => {
    const scenario = { sceneId: 'test-scene', trigger: { type: 'time' } };
    const containerRef = { current: document.createElement('div') };

    const { unmount } = renderHook(() => useMotionPlayer(scenario, containerRef));

    // Assert initScene was called with correct parameters
    expect(motionEngine.initScene).toHaveBeenCalledWith(scenario, containerRef.current);

    // Unmount hook and check cleanup
    unmount();
    expect(motionEngine.destroyScene).toHaveBeenCalledWith('test-scene');
  });

  it('should handle initial paused state on mount', () => {
    const scenario = { sceneId: 'test-scene', trigger: { type: 'time' } };
    const containerRef = { current: document.createElement('div') };

    renderHook(() => useMotionPlayer(scenario, containerRef, { paused: true }));

    // Assert that pause was called on mount
    expect(motionEngine.pause).toHaveBeenCalledWith('test-scene');
    expect(motionEngine.play).not.toHaveBeenCalled();
  });

  it('should toggle playback dynamically when paused option changes', () => {
    const scenario = { sceneId: 'test-scene', trigger: { type: 'time' } };
    const containerRef = { current: document.createElement('div') };

    // Initially paused = true
    const { rerender } = renderHook(
      ({ paused }) => useMotionPlayer(scenario, containerRef, { paused }),
      { initialProps: { paused: true } }
    );

    expect(motionEngine.pause).toHaveBeenCalledWith('test-scene');

    // Toggle paused = false
    rerender({ paused: false });
    expect(motionEngine.play).toHaveBeenCalledWith('test-scene');

    // Toggle paused = true again
    rerender({ paused: true });
    expect(motionEngine.pause).toHaveBeenCalledTimes(2);
  });
});
