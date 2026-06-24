import { describe, it, expect, vi, beforeEach } from 'vitest';
import motionEngine, { buildMotionPath, MotionEngineError } from '../motionEngine.js';
import { gsap } from 'gsap';

// Mock GSAP and its plugins
vi.mock('gsap', () => {
  const mockTimelineInstance = {
    to: vi.fn().mockReturnThis(),
    kill: vi.fn(),
    progress: vi.fn(),
    scrollTrigger: {
      kill: vi.fn(),
      disable: vi.fn(),
      enable: vi.fn(),
    },
  };
  
  const mockTweenInstance = {
    kill: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
    progress: vi.fn(),
    scrollTrigger: {
      kill: vi.fn(),
      disable: vi.fn(),
      enable: vi.fn(),
    },
  };

  const gsapMock = {
    registerPlugin: vi.fn(),
    timeline: vi.fn(() => mockTimelineInstance),
    to: vi.fn(() => mockTweenInstance),
  };

  return {
    gsap: gsapMock,
    MotionPathPlugin: {},
    ScrollTrigger: {
      getAll: vi.fn(() => []),
    },
  };
});

vi.mock('gsap/MotionPathPlugin', () => ({
  MotionPathPlugin: {}
}));

vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: {
    getAll: vi.fn(() => []),
  }
}));

describe('buildMotionPath', () => {
  it('should return empty string for null or empty input', () => {
    expect(buildMotionPath(null)).toBe('');
    expect(buildMotionPath(undefined)).toBe('');
    expect(buildMotionPath([])).toBe('');
  });

  it('should build simple path with only M and L commands', () => {
    const pathNodes = [
      { x: 10, y: 20 },
      { x: 100, y: 200 }
    ];
    expect(buildMotionPath(pathNodes)).toBe('M 10 20 L 100 200');
  });

  it('should build bezier curves with Q command when ctrlX and ctrlY are provided', () => {
    const pathNodes = [
      { x: 0, y: 0 },
      { x: 300, y: 150, ctrlX: 150, ctrlY: -50 }
    ];
    expect(buildMotionPath(pathNodes)).toBe('M 0 0 Q 150 -50 300 150');
  });

  it('should build mixed straight and curved paths correctly', () => {
    const pathNodes = [
      { x: 0, y: 0 },
      { x: 300, y: 150, ctrlX: 150, ctrlY: -50 },
      { x: 800, y: 400 }
    ];
    expect(buildMotionPath(pathNodes)).toBe('M 0 0 Q 150 -50 300 150 L 800 400');
  });

  it('should produce only M command for a single node', () => {
    const pathNodes = [{ x: 42, y: 99 }];
    expect(buildMotionPath(pathNodes)).toBe('M 42 99');
  });

  it('should match expected output for scene.json "motor-utama" element', () => {
    const pathNodes = [
      { x: 0, y: 0 },
      { x: 300, y: 150, ctrlX: 150, ctrlY: -50 },
      { x: 800, y: 400, ctrlX: 600, ctrlY: 500 }
    ];
    expect(buildMotionPath(pathNodes)).toBe('M 0 0 Q 150 -50 300 150 Q 600 500 800 400');
  });
});

describe('GsapPubSub - Pub/Sub and Caching', () => {
  beforeEach(() => {
    motionEngine.destroy();
  });

  it('should subscribe and broadcast events correctly', () => {
    const callback = vi.fn();
    const unsubscribe = motionEngine.subscribe('elem-1', callback);

    const mockData = { x: 10, y: 20, rotation: 5, progress: 0.5 };
    motionEngine._broadcast('elem-1', mockData);

    expect(callback).toHaveBeenCalledWith(mockData);
    unsubscribe();
  });

  it('should handle multiple subscribers on the same element ID', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = motionEngine.subscribe('elem-1', cb1);
    const unsub2 = motionEngine.subscribe('elem-1', cb2);

    const mockData = { x: 50, y: 50, rotation: 0, progress: 0.1 };
    motionEngine._broadcast('elem-1', mockData);

    expect(cb1).toHaveBeenCalledWith(mockData);
    expect(cb2).toHaveBeenCalledWith(mockData);

    unsub1();
    unsub2();
  });

  it('should unsubscribe successfully and stop receiving broadcasts', () => {
    const callback = vi.fn();
    const unsubscribe = motionEngine.subscribe('elem-1', callback);
    unsubscribe();

    motionEngine._broadcast('elem-1', { x: 1, y: 2, rotation: 3, progress: 4 });
    expect(callback).not.toHaveBeenCalled();
  });

  it('should return a function from subscribe', () => {
    const unsubscribe = motionEngine.subscribe('elem-1', vi.fn());
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('should clean up empty Set from Map after last unsubscribe', () => {
    const cb = vi.fn();
    const unsubscribe = motionEngine.subscribe('elem-1', cb);

    expect(motionEngine._listeners.has('elem-1')).toBe(true);
    unsubscribe();
    expect(motionEngine._listeners.has('elem-1')).toBe(false);
  });

  it('should throw MotionEngineError when subscribe is called with non-function', () => {
    expect(() => motionEngine.subscribe('elem-1', 'not-a-function')).toThrow(MotionEngineError);
    expect(() => motionEngine.subscribe('elem-1', 'not-a-function')).toThrow('Subscriber callback must be a function');
  });

  it('should serve cached data to late subscribers immediately', () => {
    const mockData = { x: 100, y: 200, rotation: 90, progress: 0.8 };
    motionEngine._broadcast('elem-1', mockData); // Broadcast first to set cache

    const callback = vi.fn();
    const unsubscribe = motionEngine.subscribe('elem-1', callback);

    expect(callback).toHaveBeenCalledWith(mockData); // Called immediately on subscribe
    unsubscribe();
  });

  it('should handle listener errors gracefully without stopping propagation to other listeners', () => {
    const errorCb = vi.fn(() => { throw new Error('Simulated listener error'); });
    const successCb = vi.fn();

    const unsub1 = motionEngine.subscribe('elem-1', errorCb);
    const unsub2 = motionEngine.subscribe('elem-1', successCb);

    motionEngine._broadcast('elem-1', { x: 0, y: 0, rotation: 0, progress: 0 });

    expect(errorCb).toHaveBeenCalled();
    expect(successCb).toHaveBeenCalled(); // Should still be called!

    unsub1();
    unsub2();
  });
});

describe('GsapPubSub - Scene Cleanup', () => {
  beforeEach(() => {
    motionEngine.destroy();
    vi.clearAllMocks();
  });

  it('should remove scene from _scenes Map when destroying', () => {
    const sceneData = {
      sceneId: 'test-scene',
      triggerType: 'timer',
      elements: [
        { id: 'el-1', pathNodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
      ]
    };
    motionEngine.initScene(sceneData);
    expect(motionEngine._scenes.has('test-scene')).toBe(true);

    motionEngine.destroyScene('test-scene');
    expect(motionEngine._scenes.has('test-scene')).toBe(false);
  });

  it('should clear cache for scene elements when destroying a scene', () => {
    const sceneData = {
      sceneId: 'cache-scene',
      triggerType: 'timer',
      elements: [
        { id: 'cached-el-1', pathNodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
        { id: 'cached-el-2', pathNodes: [{ x: 5, y: 5 }, { x: 20, y: 20 }] }
      ]
    };
    motionEngine.initScene(sceneData);

    expect(motionEngine._cache.has('cached-el-1')).toBe(true);
    expect(motionEngine._cache.has('cached-el-2')).toBe(true);

    motionEngine.destroyScene('cache-scene');

    expect(motionEngine._cache.has('cached-el-1')).toBe(false);
    expect(motionEngine._cache.has('cached-el-2')).toBe(false);
  });

  it('should clear all internal state when destroy() is called', () => {
    // Set up a scene and a subscriber
    const sceneData = {
      sceneId: 'full-destroy-scene',
      triggerType: 'timer',
      elements: [
        { id: 'fd-el', pathNodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
      ]
    };
    motionEngine.initScene(sceneData);
    motionEngine.subscribe('fd-el', vi.fn());

    expect(motionEngine._scenes.size).toBeGreaterThan(0);
    expect(motionEngine._cache.size).toBeGreaterThan(0);
    expect(motionEngine._listeners.size).toBeGreaterThan(0);

    motionEngine.destroy();

    expect(motionEngine._scenes.size).toBe(0);
    expect(motionEngine._cache.size).toBe(0);
    expect(motionEngine._listeners.size).toBe(0);
  });
});

describe('GsapPubSub - initScene with GSAP mocking', () => {
  beforeEach(() => {
    motionEngine.destroy();
    vi.clearAllMocks();
  });

  it('should initialize a timer scene with proper gsap parameters', () => {
    const sceneData = {
      sceneId: 'timer-scene',
      triggerType: 'timer',
      elements: [
        {
          id: 'timer-el',
          pathNodes: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
          duration: 5,
          delay: 1,
          ease: 'power2.out',
          repeat: -1
        }
      ]
    };

    motionEngine.initScene(sceneData);

    // Verify gsap.to was called
    expect(gsap.to).toHaveBeenCalled();
    
    // Verify parameters passed to gsap.to
    const callArgs = gsap.to.mock.calls[0][1];
    expect(callArgs.duration).toBe(5);
    expect(callArgs.delay).toBe(1);
    expect(callArgs.ease).toBe('power2.out');
    expect(callArgs.repeat).toBe(-1);
    expect(callArgs.motionPath).toEqual({
      path: 'M 0 0 L 100 100',
      autoRotate: true
    });
  });

  it('should initialize a scroll scene forcing ease: "none" and setting proper scroll triggers', () => {
    const sceneData = {
      sceneId: 'scroll-scene',
      triggerType: 'scroll',
      scrollConfig: {
        scrub: 2,
        pin: true
      },
      elements: [
        {
          id: 'scroll-el',
          pathNodes: [{ x: 0, y: 0 }, { x: 50, y: 50 }]
        }
      ]
    };

    const mockContainer = {};
    motionEngine.initScene(sceneData, mockContainer);

    // Verify gsap.timeline was called with proper ScrollTrigger configs
    expect(gsap.timeline).toHaveBeenCalledWith({
      scrollTrigger: {
        trigger: mockContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 2,
        pin: mockContainer,
        invalidateOnRefresh: true
      }
    });

    // Get the mock timeline instance that was returned
    const mockTimeline = gsap.timeline.mock.results[0].value;
    
    // Verify that .to was called on the timeline
    expect(mockTimeline.to).toHaveBeenCalled();
    
    // Verify timeline tween config forces ease: "none"
    const callArgs = mockTimeline.to.mock.calls[0][1];
    expect(callArgs.ease).toBe('none');
    expect(callArgs.duration).toBe(1);
    expect(callArgs.motionPath).toEqual({
      path: 'M 0 0 L 50 50',
      autoRotate: true
    });
  });

  it('should destroy existing scene before re-initializing it', () => {
    const sceneData = {
      sceneId: 'same-scene',
      triggerType: 'timer',
      elements: [
        { id: 'el', pathNodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
      ]
    };

    motionEngine.initScene(sceneData);
    
    // Get the mock tween instance
    const mockTween = gsap.to.mock.results[0].value;
    
    // Initialize again
    motionEngine.initScene(sceneData);

    // Verify previous tween was killed
    expect(mockTween.kill).toHaveBeenCalled();
  });

  it('should throw MotionEngineError for invalid triggerType', () => {
    const sceneData = {
      sceneId: 'bad-scene',
      triggerType: 'invalid-type',
      elements: [
        { id: 'bad-el', pathNodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
      ]
    };

    expect(() => motionEngine.initScene(sceneData)).toThrow(MotionEngineError);
    expect(() => motionEngine.initScene(sceneData)).toThrow('Unsupported triggerType');
    // Scene should NOT be registered
    expect(motionEngine._scenes.has('bad-scene')).toBe(false);
  });

  it('should throw MotionEngineError when sceneData or sceneId is missing', () => {
    expect(() => motionEngine.initScene(null)).toThrow(MotionEngineError);
    expect(() => motionEngine.initScene({ triggerType: 'timer' })).toThrow('Scene initialization failed');
  });
});

describe('GsapPubSub - Specialized Playback Controls', () => {
  beforeEach(() => {
    motionEngine.destroy();
    vi.clearAllMocks();
  });

  it('should play and pause timer scenes using playTimer and pauseTimer', () => {
    const sceneData = {
      sceneId: 'timer-playback-test',
      triggerType: 'timer',
      elements: [
        { id: 'timer-el', pathNodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
      ]
    };
    motionEngine.initScene(sceneData);

    const mockTween = gsap.to.mock.results[0].value;

    motionEngine.pauseTimer('timer-playback-test');
    expect(mockTween.pause).toHaveBeenCalled();

    motionEngine.playTimer('timer-playback-test');
    expect(mockTween.play).toHaveBeenCalled();
  });

  it('should enable and disable scroll scenes using enableScroll and disableScroll', () => {
    const sceneData = {
      sceneId: 'scroll-playback-test',
      triggerType: 'scroll',
      elements: [
        { id: 'scroll-el', pathNodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
      ]
    };
    motionEngine.initScene(sceneData, {});

    const mockTimeline = gsap.timeline.mock.results[0].value;

    motionEngine.disableScroll('scroll-playback-test');
    expect(mockTimeline.scrollTrigger.disable).toHaveBeenCalled();

    motionEngine.enableScroll('scroll-playback-test');
    expect(mockTimeline.scrollTrigger.enable).toHaveBeenCalled();
  });

  it('should throw MotionEngineError when container element is missing for scroll-triggered scene', () => {
    const sceneData = {
      sceneId: 'scroll-missing-container',
      triggerType: 'scroll',
      elements: [
        { id: 'scroll-el', pathNodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
      ]
    };

    expect(() => motionEngine.initScene(sceneData, null)).toThrow(MotionEngineError);
    expect(() => motionEngine.initScene(sceneData, null)).toThrow('Container element missing');
  });

  it('should resolve selector string relative to container element using querySelector', () => {
    const sceneData = {
      sceneId: 'scroll-selector-pin',
      triggerType: 'scroll',
      scrollConfig: {
        scrub: 1,
        pin: '.my-stage'
      },
      elements: [
        { id: 'scroll-el', pathNodes: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
      ]
    };

    const mockStageElement = { id: 'resolved-stage' };
    const mockContainer = {
      querySelector: vi.fn((selector) => {
        if (selector === '.my-stage') return mockStageElement;
        return null;
      })
    };

    motionEngine.initScene(sceneData, mockContainer);

    expect(mockContainer.querySelector).toHaveBeenCalledWith('.my-stage');
    expect(gsap.timeline).toHaveBeenCalledWith({
      scrollTrigger: {
        trigger: mockContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
        pin: mockStageElement,
        invalidateOnRefresh: true
      }
    });
  });
});

