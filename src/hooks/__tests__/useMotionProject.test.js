// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useMotionProject from '../useMotionProject';
import motionEngine from '../../lib/motionEngine';

// Mock motionEngine
vi.mock('../../lib/motionEngine', () => ({
  default: {
    initScene: vi.fn(),
    destroyScene: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
  }
}));

describe('useMotionProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize multiple scenarios when mounted and destroy them on unmount', () => {
    const project = {
      scenarios: [
        { sceneId: 'scene-1', trigger: { type: 'time' } },
        { sceneId: 'scene-2', trigger: { type: 'time' } }
      ]
    };
    
    const containerRefMap = {
      'scene-1': { current: document.createElement('div') },
      'scene-2': { current: document.createElement('div') }
    };

    const { unmount } = renderHook(() => useMotionProject(project, containerRefMap));

    expect(motionEngine.initScene).toHaveBeenCalledTimes(2);
    expect(motionEngine.initScene).toHaveBeenNthCalledWith(1, project.scenarios[0], containerRefMap['scene-1'].current);
    expect(motionEngine.initScene).toHaveBeenNthCalledWith(2, project.scenarios[1], containerRefMap['scene-2'].current);

    unmount();

    expect(motionEngine.destroyScene).toHaveBeenCalledTimes(2);
    expect(motionEngine.destroyScene).toHaveBeenCalledWith('scene-1');
    expect(motionEngine.destroyScene).toHaveBeenCalledWith('scene-2');
  });

  it('should handle play/pause correctly across all scenarios', () => {
    const project = {
      scenarios: [
        { sceneId: 'scene-1', trigger: { type: 'time' } },
        { sceneId: 'scene-2', trigger: { type: 'time' } }
      ]
    };

    const { rerender } = renderHook(
      ({ paused }) => useMotionProject(project, {}, { paused }),
      { initialProps: { paused: true } }
    );

    expect(motionEngine.pause).toHaveBeenCalledWith('scene-1');
    expect(motionEngine.pause).toHaveBeenCalledWith('scene-2');

    rerender({ paused: false });

    expect(motionEngine.play).toHaveBeenCalledWith('scene-1');
    expect(motionEngine.play).toHaveBeenCalledWith('scene-2');
  });
});
