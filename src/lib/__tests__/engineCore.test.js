import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { createEngineCore } from '../engineCore.js';

vi.mock('gsap', () => {
  return {
    gsap: {
      ticker: {
        add: vi.fn(),
        remove: vi.fn()
      }
    }
  };
});

describe('EngineCore', () => {
  let mockInstance1;
  let mockInstance2;

  beforeEach(() => {
    vi.clearAllMocks();

    mockInstance1 = {
      broadcast: vi.fn()
    };

    mockInstance2 = {
      broadcast: vi.fn()
    };
  });

  it('adds and removes gsap.ticker callback based on active instance counts', () => {
    const addSpy = vi.spyOn(gsap.ticker, 'add');
    const removeSpy = vi.spyOn(gsap.ticker, 'remove');

    const core = createEngineCore();
    
    // 1st instance registered -> starts ticker
    core.registerActiveInstance(mockInstance1);
    expect(addSpy).toHaveBeenCalledTimes(1);
    const tickerFn = addSpy.mock.calls[0][0];

    // 2nd instance registered -> does not add ticker again
    core.registerActiveInstance(mockInstance2);
    expect(addSpy).toHaveBeenCalledTimes(1);

    // Simulate ticker tick -> both should broadcast
    tickerFn();
    expect(mockInstance1.broadcast).toHaveBeenCalled();
    expect(mockInstance2.broadcast).toHaveBeenCalled();

    // Unregister 1st instance -> ticker stays running
    core.unregisterActiveInstance(mockInstance1);
    expect(removeSpy).not.toHaveBeenCalled();

    // Unregister 2nd instance -> ticker stops
    core.unregisterActiveInstance(mockInstance2);
    expect(removeSpy).toHaveBeenCalledWith(tickerFn);
  });

  it('stops ticker and clears instances on destroy()', () => {
    const addSpy = vi.spyOn(gsap.ticker, 'add');
    const removeSpy = vi.spyOn(gsap.ticker, 'remove');

    const core = createEngineCore();
    core.registerActiveInstance(mockInstance1);

    expect(addSpy).toHaveBeenCalled();
    const tickerFn = addSpy.mock.calls[0][0];

    core.destroy();
    expect(removeSpy).toHaveBeenCalledWith(tickerFn);
  });
});
