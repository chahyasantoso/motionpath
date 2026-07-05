// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useMotionSubscriber from '../useMotionSubscriber';
import { productionEngine } from '../../lib/ProductionEngine';
import { gsap } from 'gsap';

// Mock GSAP and productionEngine
vi.mock('gsap', () => ({
  gsap: {
    set: vi.fn(),
  }
}));

vi.mock('../../lib/ProductionEngine', () => ({
  productionEngine: {
    subscribe: vi.fn(),
    compose: vi.fn((elementId, rawData) => ({
      x: rawData.x,
      y: rawData.y,
      rotation: rawData.rotation
    }))
  }
}));

describe('useMotionSubscriber', () => {
  let mockSubscribeCallback;
  const mockUnsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Simulate productionEngine.subscribe returning an unsubscribe cleanup function
    productionEngine.subscribe.mockImplementation((id, cb) => {
      mockSubscribeCallback = cb;
      return mockUnsubscribe;
    });
  });

  it('should subscribe to productionEngine with the correct elementId on mount and unsubscribe on unmount', () => {
    const mockRef = { current: document.createElement('div') };

    const { unmount } = renderHook(() => useMotionSubscriber('rocket-id', mockRef));

    // Assert subscribe was called
    expect(productionEngine.subscribe).toHaveBeenCalledWith('rocket-id', expect.any(Function));

    // Unmount and verify unsubscribe is triggered
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should apply spatial properties via compose when no custom transformFn is provided', () => {
    const mockElement = document.createElement('div');
    const mockRef = { current: mockElement };

    renderHook(() => useMotionSubscriber('rocket-id', mockRef));

    // Broadcast new coordinates from the engine
    const data = { x: 120, y: 340, rotation: 90, progress: 0.5 };
    mockSubscribeCallback(data);

    // Verify compose was called
    expect(productionEngine.compose).toHaveBeenCalledWith('rocket-id', data);

    // Verify gsap.set was called with composed properties
    expect(gsap.set).toHaveBeenCalledWith(mockElement, {
      x: 120,
      y: 340,
      rotation: 90
    });
  });

  it('should apply custom styling and animation configurations via transformFn if provided, passing compose as the second arg', () => {
    const mockElement = document.createElement('div');
    const mockRef = { current: mockElement };
    const transformFn = vi.fn((data, compose) => {
      const composed = compose(data);
      return {
        ...composed,
        scale: 0.5 + data.progress * 0.5,
        opacity: data.progress
      };
    });

    renderHook(() => useMotionSubscriber('rocket-id', mockRef, transformFn));

    // Broadcast coordinates
    const data = { x: 200, y: 150, rotation: 30, progress: 0.8 };
    mockSubscribeCallback(data);

    // Verify custom transformFn was executed with data and compose function
    expect(transformFn).toHaveBeenCalledWith(data, expect.any(Function));

    // Verify gsap.set was called with custom transformed properties
    expect(gsap.set).toHaveBeenCalledWith(mockElement, {
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

  it('should not write to productionEngine._domRefs (legacy code removed)', () => {
    const mockRef = { current: document.createElement('div') };
    const engineBefore = { ...productionEngine };

    renderHook(() => useMotionSubscriber('rocket-id', mockRef));

    // _domRefs should not be added to productionEngine by the hook
    expect(productionEngine._domRefs).toBeUndefined();
  });
});
