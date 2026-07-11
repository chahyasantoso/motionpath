// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useMotionTimelinePlayback from '../useMotionTimelinePlayback';
import { productionEngine } from '../../lib/ProductionEngine';

vi.mock('../../lib/ProductionEngine', () => ({
  productionEngine: {
    playTimer: vi.fn(),
    pauseTimer: vi.fn(),
  }
}));

describe('useMotionTimelinePlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls playTimer when playing is true', () => {
    renderHook(() => useMotionTimelinePlayback('my-tl', true));

    expect(productionEngine.playTimer).toHaveBeenCalledWith('my-tl');
    expect(productionEngine.pauseTimer).not.toHaveBeenCalled();
  });

  it('calls pauseTimer when playing is false', () => {
    renderHook(() => useMotionTimelinePlayback('my-tl', false));

    expect(productionEngine.pauseTimer).toHaveBeenCalledWith('my-tl');
    expect(productionEngine.playTimer).not.toHaveBeenCalled();
  });

  it('calls correct function when playing status updates', () => {
    const { rerender } = renderHook(
      ({ playing }) => useMotionTimelinePlayback('my-tl', playing),
      { initialProps: { playing: false } }
    );

    expect(productionEngine.pauseTimer).toHaveBeenCalledWith('my-tl');
    vi.clearAllMocks();

    rerender({ playing: true });
    expect(productionEngine.playTimer).toHaveBeenCalledWith('my-tl');
  });

  it('ignores calls if timelineId is falsy', () => {
    renderHook(() => useMotionTimelinePlayback('', true));

    expect(productionEngine.playTimer).not.toHaveBeenCalled();
    expect(productionEngine.pauseTimer).not.toHaveBeenCalled();
  });
});
