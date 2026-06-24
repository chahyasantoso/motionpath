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
    playTimer: vi.fn(),
    pauseTimer: vi.fn(),
    enableScroll: vi.fn(),
    disableScroll: vi.fn(),
  }
}));

describe('useMotionPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize the scene on motionEngine when mounted and destroy it on unmount', () => {
    const sceneData = { sceneId: 'test-scene', triggerType: 'timer' };
    const containerRef = { current: document.createElement('div') };

    const { unmount } = renderHook(() => useMotionPlayer(sceneData, containerRef));

    // Assert initScene was called with correct parameters
    expect(motionEngine.initScene).toHaveBeenCalledWith(sceneData, containerRef.current);

    // Unmount hook and check cleanup
    unmount();
    expect(motionEngine.destroyScene).toHaveBeenCalledWith('test-scene');
  });

  it('should handle initial paused state for a timer scene on mount', () => {
    const sceneData = { sceneId: 'test-scene', triggerType: 'timer' };
    const containerRef = { current: document.createElement('div') };

    renderHook(() => useMotionPlayer(sceneData, containerRef, { paused: true }));

    // Assert that pauseTimer was called on mount
    expect(motionEngine.pauseTimer).toHaveBeenCalledWith('test-scene');
    expect(motionEngine.playTimer).not.toHaveBeenCalled();
  });

  it('should handle initial paused state for a scroll scene on mount', () => {
    const sceneData = { sceneId: 'test-scene', triggerType: 'scroll' };
    const containerRef = { current: document.createElement('div') };

    renderHook(() => useMotionPlayer(sceneData, containerRef, { paused: true }));

    // Assert that disableScroll was called on mount
    expect(motionEngine.disableScroll).toHaveBeenCalledWith('test-scene');
    expect(motionEngine.enableScroll).not.toHaveBeenCalled();
  });

  it('should toggle playback dynamically for a timer scene when paused option changes', () => {
    const sceneData = { sceneId: 'test-scene', triggerType: 'timer' };
    const containerRef = { current: document.createElement('div') };

    // Initially paused = true
    const { rerender } = renderHook(
      ({ paused }) => useMotionPlayer(sceneData, containerRef, { paused }),
      { initialProps: { paused: true } }
    );

    expect(motionEngine.pauseTimer).toHaveBeenCalledWith('test-scene');

    // Toggle paused = false
    rerender({ paused: false });
    expect(motionEngine.playTimer).toHaveBeenCalledWith('test-scene');

    // Toggle paused = true again
    rerender({ paused: true });
    expect(motionEngine.pauseTimer).toHaveBeenCalledTimes(2);
  });

  it('should toggle playback dynamically for a scroll scene when paused option changes', () => {
    const sceneData = { sceneId: 'test-scene', triggerType: 'scroll' };
    const containerRef = { current: document.createElement('div') };

    // Initially paused = true
    const { rerender } = renderHook(
      ({ paused }) => useMotionPlayer(sceneData, containerRef, { paused }),
      { initialProps: { paused: true } }
    );

    expect(motionEngine.disableScroll).toHaveBeenCalledWith('test-scene');

    // Toggle paused = false
    rerender({ paused: false });
    expect(motionEngine.enableScroll).toHaveBeenCalledWith('test-scene');

    // Toggle paused = true again
    rerender({ paused: true });
    expect(motionEngine.disableScroll).toHaveBeenCalledTimes(2);
  });
});
