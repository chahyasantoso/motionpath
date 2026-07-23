// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useMotionSubscribers from '../useMotionSubscribers';
import { gsap } from 'gsap';

// Mock GSAP
vi.mock('gsap', () => ({
  gsap: {
    set: vi.fn(),
  }
}));

describe('useMotionSubscribers', () => {
  let mockInstances;
  let mockCallbacks;
  let mockUnsubscribes;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCallbacks = {};
    mockUnsubscribes = [vi.fn(), vi.fn()];

    mockInstances = [
      {
        id: 'inst-0',
        subscribe: vi.fn((id, cb) => {
          mockCallbacks['inst-0::' + id] = cb;
          return mockUnsubscribes[0];
        }),
        compose: vi.fn((trackId, rawData) => ({
          x: rawData.x
        }))
      },
      {
        id: 'inst-1',
        subscribe: vi.fn((id, cb) => {
          mockCallbacks['inst-1::' + id] = cb;
          return mockUnsubscribes[1];
        }),
        compose: vi.fn((trackId, rawData) => ({
          opacity: rawData.opacity
        }))
      }
    ];
  });

  it('should merge disjoint keys correctly from multiple sources', () => {
    const mockRef = { current: document.createElement('div') };
    const sources = [
      { instance: mockInstances[0], trackId: 'track-0', transformFn: (data, compose) => compose(data) },
      { instance: mockInstances[1], trackId: 'track-1', transformFn: (data, compose) => compose(data) }
    ];

    renderHook(() => useMotionSubscribers(sources, mockRef));

    // Send update from source 0
    mockCallbacks['inst-0::track-0']({ x: 100 });

    // Since source 1 has not ticked yet, its slot in latestPatches is empty/default (or empty object)
    // and default mergeFn: Object.assign({}, ...patches) yields {x: 100}
    expect(gsap.set).toHaveBeenLastCalledWith(mockRef.current, { x: 100 });

    // Send update from source 1
    mockCallbacks['inst-1::track-1']({ opacity: 0.8 });

    // Now both have values: {x: 100, opacity: 0.8}
    expect(gsap.set).toHaveBeenLastCalledWith(mockRef.current, { x: 100, opacity: 0.8 });
  });

  it('should resolve overlapping keys using array order precedence (later wins)', () => {
    const mockRef = { current: document.createElement('div') };
    
    // Both return opacity, inst-0 returns 0.2, inst-1 returns 0.9
    mockInstances[0].compose.mockReturnValue({ opacity: 0.2 });
    mockInstances[1].compose.mockReturnValue({ opacity: 0.9 });

    // No transformFn — default compose is used, result goes into frame.patch
    const sources = [
      { instance: mockInstances[0], trackId: 'track-0' },
      { instance: mockInstances[1], trackId: 'track-1' }
    ];

    renderHook(() => useMotionSubscribers(sources, mockRef));

    // Tick source 1 first
    mockCallbacks['inst-1::track-1']({});
    expect(gsap.set).toHaveBeenLastCalledWith(mockRef.current, { opacity: 0.9 });

    // Tick source 0 second — output opacity should still be 0.9 because source 1 is later in array
    mockCallbacks['inst-0::track-0']({});
    expect(gsap.set).toHaveBeenLastCalledWith(mockRef.current, { opacity: 0.9 });
  });

  it('should use custom mergeFn when provided', () => {
    const mockRef = { current: document.createElement('div') };
    mockInstances[0].compose.mockReturnValue({ opacity: 0.2 });
    mockInstances[1].compose.mockReturnValue({ opacity: 0.9 });

    const sources = [
      { instance: mockInstances[0], trackId: 'track-0' },
      { instance: mockInstances[1], trackId: 'track-1' }
    ];

    // mergeFn receives patches: [patch0, patch1] — reverse to make first win
    const customMergeFn = vi.fn((patches) => {
      return Object.assign({}, ...[...patches].reverse());
    });

    renderHook(() => useMotionSubscribers(sources, mockRef, customMergeFn));

    mockCallbacks['inst-0::track-0']({});
    mockCallbacks['inst-1::track-1']({});

    expect(customMergeFn).toHaveBeenCalled();
    expect(gsap.set).toHaveBeenLastCalledWith(mockRef.current, { opacity: 0.2 });
  });

  it('should handle pathProgress boundary check in transformFn, not mergeFn', () => {
    const mockRef = { current: document.createElement('div') };

    mockInstances[0].compose.mockReturnValue({ x: 50 });

    // transformFn owns the boundary check — it has rawData, mergeFn does not
    const transformFn = (rawData, compose) => {
      const p = rawData?.pathProgress ?? 0;
      if (p <= 0 || p >= 1) return { display: 'none' };
      return { ...compose(rawData), display: 'flex' };
    };

    const sources = [{ instance: mockInstances[0], trackId: 'track-0', transformFn }];

    renderHook(() => useMotionSubscribers(sources, mockRef));

    // In-bounds: transformFn calls compose and adds display:flex
    mockCallbacks['inst-0::track-0']({ pathProgress: 0.5 });
    expect(gsap.set).toHaveBeenLastCalledWith(mockRef.current, { x: 50, display: 'flex' });

    // Out-of-bounds: transformFn short-circuits, compose is never called
    mockCallbacks['inst-0::track-0']({ pathProgress: 0 });
    expect(gsap.set).toHaveBeenLastCalledWith(mockRef.current, { display: 'none' });
  });

  it('should not resubscribe when hook is rerendered with new array literals of identical sources', () => {
    const mockRef = { current: document.createElement('div') };

    const { rerender } = renderHook(
      ({ s }) => useMotionSubscribers(s, mockRef),
      {
        initialProps: {
          s: [
            { instance: mockInstances[0], trackId: 'track-0' },
            { instance: mockInstances[1], trackId: 'track-1' }
          ]
        }
      }
    );

    expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(1);
    expect(mockInstances[1].subscribe).toHaveBeenCalledTimes(1);

    // Rerender with brand new array and object references, but identical content signature
    rerender({
      s: [
        { instance: mockInstances[0], trackId: 'track-0' },
        { instance: mockInstances[1], trackId: 'track-1' }
      ]
    });

    expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(1);
    expect(mockInstances[1].subscribe).toHaveBeenCalledTimes(1);
  });

  it('should resubscribe when a source trackId changes', () => {
    const mockRef = { current: document.createElement('div') };

    const { rerender } = renderHook(
      ({ s }) => useMotionSubscribers(s, mockRef),
      {
        initialProps: {
          s: [
            { instance: mockInstances[0], trackId: 'track-0' },
            { instance: mockInstances[1], trackId: 'track-1' }
          ]
        }
      }
    );

    expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribes[0]).not.toHaveBeenCalled();

    // Rerender with track-0 replaced with track-new
    rerender({
      s: [
        { instance: mockInstances[0], trackId: 'track-new' },
        { instance: mockInstances[1], trackId: 'track-1' }
      ]
    });

    expect(mockUnsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(2);
    expect(mockInstances[0].subscribe).toHaveBeenLastCalledWith('track-new', expect.any(Function));
  });

  it('should not resubscribe when transformFn identity changes but should use the latest closure on ticks', () => {
    const mockRef = { current: document.createElement('div') };
    const fn1 = vi.fn(() => ({ scale: 1 }));
    const fn2 = vi.fn(() => ({ scale: 2 }));

    const { rerender } = renderHook(
      ({ transform }) => useMotionSubscribers([
        { instance: mockInstances[0], trackId: 'track-0', transformFn: transform }
      ], mockRef),
      {
        initialProps: { transform: fn1 }
      }
    );

    expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(1);

    // Rerender with different transformFn reference
    rerender({ transform: fn2 });

    expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(1); // no resubscription

    // Tick the mock source
    mockCallbacks['inst-0::track-0']({});

    // Verify fn2 was called, not fn1
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
    expect(gsap.set).toHaveBeenLastCalledWith(mockRef.current, { scale: 2 });
  });
});
