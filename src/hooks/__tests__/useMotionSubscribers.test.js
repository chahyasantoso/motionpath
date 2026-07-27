// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useMotionSubscribers from '../useMotionSubscribers';
import { gsap } from 'gsap';

vi.mock('gsap', () => ({ gsap: { set: vi.fn() } }));

describe('useMotionSubscribers', () => {
  let mockInstances; let mockCallbacks; let mockUnsubscribes;
  beforeEach(() => { vi.clearAllMocks(); mockCallbacks = {}; mockUnsubscribes = [vi.fn(), vi.fn()]; mockInstances = [{ id: 'inst-0', subscribe: vi.fn((id, cb) => { mockCallbacks[`inst-0::${id}`] = cb; return mockUnsubscribes[0]; }), compose: vi.fn((id, raw) => ({ x: raw.x })) }, { id: 'inst-1', subscribe: vi.fn((id, cb) => { mockCallbacks[`inst-1::${id}`] = cb; return mockUnsubscribes[1]; }), compose: vi.fn((id, raw) => ({ opacity: raw.opacity })) }]; });
  it('keeps the legacy immediate fallback when a test clock has no ticker', () => { const ref = { current: document.createElement('div') }; renderHook(() => useMotionSubscribers([{ instance: mockInstances[0], trackId: 'track-0' }], ref)); mockCallbacks['inst-0::track-0']({ x: 100 }); expect(gsap.set).toHaveBeenLastCalledWith(ref.current, { x: 100 }); });
  it('does not resubscribe identical sources', () => { const ref = { current: document.createElement('div') }; const { rerender } = renderHook(({ sources }) => useMotionSubscribers(sources, ref), { initialProps: { sources: [{ instance: mockInstances[0], trackId: 'track-0' }] } }); rerender({ sources: [{ instance: mockInstances[0], trackId: 'track-0' }] }); expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(1); });
});
