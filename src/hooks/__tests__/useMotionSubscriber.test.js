// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useMotionSubscriber from '../useMotionSubscriber';
import motionEngine from '../../lib/motionEngine';
import { gsap } from 'gsap';

// Mock GSAP and motionEngine
vi.mock('gsap', () => ({
  gsap: {
    set: vi.fn(),
  }
}));

vi.mock('../../lib/motionEngine', () => ({
  default: {
    subscribe: vi.fn(),
  }
}));

describe('useMotionSubscriber', () => {
  let mockSubscribeCallback;
  const mockUnsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Simulate motionEngine.subscribe returning an unsubscribe cleanup function
    motionEngine.subscribe.mockImplementation((id, cb) => {
      mockSubscribeCallback = cb;
      return mockUnsubscribe;
    });
  });

  it('should subscribe to motionEngine with the correct elementId on mount and unsubscribe on unmount', () => {
    const mockRef = { current: document.createElement('div') };

    const { unmount } = renderHook(() => useMotionSubscriber('rocket-id', mockRef));

    // Assert subscribe was called
    expect(motionEngine.subscribe).toHaveBeenCalledWith('rocket-id', expect.any(Function));

    // Unmount and verify unsubscribe is triggered
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should apply spatial properties (x, y, rotation) via gsap.set when coordinate broadcasts occur', () => {
    const mockElement = document.createElement('div');
    const mockRef = { current: mockElement };

    renderHook(() => useMotionSubscriber('rocket-id', mockRef));

    // Broadcast new coordinates from the engine
    const data = { x: 120, y: 340, rotation: 90, progress: 0.5 };
    mockSubscribeCallback(data);

    // Verify gsap.set was called with default properties
    expect(gsap.set).toHaveBeenCalledWith(mockElement, {
      x: 120,
      y: 340,
      rotation: 90,
      xPercent: -50,
      yPercent: -50
    });
  });

  it('should apply custom styling and animation configurations via transformFn if provided', () => {
    const mockElement = document.createElement('div');
    const mockRef = { current: mockElement };
    const transformFn = vi.fn((data) => ({
      x: data.x,
      y: data.y,
      rotation: data.rotation,
      scale: 0.5 + data.progress * 0.5,
      opacity: data.progress
    }));

    renderHook(() => useMotionSubscriber('rocket-id', mockRef, transformFn));

    // Broadcast coordinates
    const data = { x: 200, y: 150, rotation: 30, progress: 0.8 };
    mockSubscribeCallback(data);

    // Verify custom transformFn was executed
    expect(transformFn).toHaveBeenCalledWith(data);

    // Verify gsap.set was called with custom transformed properties
    expect(gsap.set).toHaveBeenCalledWith(mockElement, {
      xPercent: -50,
      yPercent: -50,
      x: 200,
      y: 150,
      rotation: 30,
      scale: 0.9,
      opacity: 0.8
    });
  });

  it('should handle null or unmounted ref.current gracefully when coordinate updates are received', () => {
    const mockRef = { current: null };

    renderHook(() => useMotionSubscriber('rocket-id', mockRef));

    // Send update
    const data = { x: 100, y: 100, rotation: 0, progress: 0 };
    
    // Should not throw error
    expect(() => mockSubscribeCallback(data)).not.toThrow();
    expect(gsap.set).not.toHaveBeenCalled();
  });
});
