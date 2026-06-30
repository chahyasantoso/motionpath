import { describe, it, expect, vi, beforeEach } from 'vitest';
import motionEngine, { MotionEngineError } from '../motionEngine.js';
import { convertToCubicPath } from '../pathUtils.js';
import { gsap } from 'gsap';

// Mock GSAP and its plugins
vi.mock('gsap', () => {
  const mockTimelineInstance = {
    to: vi.fn().mockReturnThis(),
    add: vi.fn().mockReturnThis(),
    kill: vi.fn(),
    progress: vi.fn(),
    scrollTrigger: {
      kill: vi.fn(),
      disable: vi.fn(),
      enable: vi.fn(),
    },
    pause: vi.fn(),
    play: vi.fn(),
  };
  
  const mockTweenInstance = {
    kill: vi.fn(),
    pause: vi.fn(),
    play: vi.fn().mockReturnThis(),
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
    ScrollTrigger: {
      getAll: vi.fn(() => []),
    },
  };
});

vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: {
    getAll: vi.fn(() => []),
  }
}));

describe('GsapPubSub - Pub/Sub and Caching', () => {
  beforeEach(() => {
    motionEngine.destroy();
  });

  it('should subscribe and broadcast events correctly', () => {
    const callback = vi.fn();
    const unsubscribe = motionEngine.subscribe('elem-1', callback);

    const mockData = { x: 10, y: 20, rotation: 5, progress: 0.5 };
    motionEngine._broadcastRaw('elem-1', mockData);

    expect(callback).toHaveBeenCalledWith(mockData);
    unsubscribe();
  });

  it('should handle multiple subscribers on the same element ID', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = motionEngine.subscribe('elem-1', cb1);
    const unsub2 = motionEngine.subscribe('elem-1', cb2);

    const mockData = { x: 50, y: 50, rotation: 0, progress: 0.1 };
    motionEngine._broadcastRaw('elem-1', mockData);

    expect(cb1).toHaveBeenCalledWith(mockData);
    expect(cb2).toHaveBeenCalledWith(mockData);

    unsub1();
    unsub2();
  });

  it('should unsubscribe successfully and stop receiving broadcasts', () => {
    const callback = vi.fn();
    const unsubscribe = motionEngine.subscribe('elem-1', callback);
    unsubscribe();

    motionEngine._broadcastRaw('elem-1', { x: 1, y: 2, rotation: 3, progress: 4 });
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
    motionEngine._broadcastRaw('elem-1', mockData); // Broadcast first to set cache

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

    motionEngine._broadcastRaw('elem-1', { x: 0, y: 0, rotation: 0, progress: 0 });

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
    const scenario = {
      sceneId: 'test-scene',
      trigger: { type: 'time' },
      elements: [
        {
          id: 'el-1',
          keyframes: {
            path: {
              points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
            }
          }
        }
      ]
    };
    motionEngine.initScene(scenario);
    expect(motionEngine._scenes.has('test-scene')).toBe(true);

    motionEngine.destroyScene('test-scene');
    expect(motionEngine._scenes.has('test-scene')).toBe(false);
  });

  it('should clear cache for scene elements when destroying a scene', () => {
    const scenario = {
      sceneId: 'cache-scene',
      trigger: { type: 'time' },
      elements: [
        {
          id: 'cached-el-1',
          keyframes: {
            path: {
              points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
            }
          }
        },
        {
          id: 'cached-el-2',
          keyframes: {
            x: { stops: [{ p: 0, v: 5 }, { p: 1, v: 20 }] }
          }
        }
      ]
    };
    motionEngine.initScene(scenario);

    expect(motionEngine._cache.has('cached-el-1')).toBe(true);
    expect(motionEngine._cache.has('cached-el-2')).toBe(true);

    motionEngine.destroyScene('cache-scene');

    expect(motionEngine._cache.has('cached-el-1')).toBe(false);
    expect(motionEngine._cache.has('cached-el-2')).toBe(false);
  });

  it('should clear all internal state when destroy() is called', () => {
    const scenario = {
      sceneId: 'full-destroy-scene',
      trigger: { type: 'time' },
      elements: [
        {
          id: 'fd-el',
          keyframes: {
            path: {
              points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
            }
          }
        }
      ]
    };
    motionEngine.initScene(scenario);
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
    const scenario = {
      sceneId: 'timer-scene',
      trigger: {
        type: 'time',
        repeat: -1,
        yoyo: true,
        repeatDelay: 1
      },
      elements: [
        {
          id: 'timer-el',
          keyframes: {
            x: {
              stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }]
            }
          }
        }
      ]
    };

    motionEngine.initScene(scenario);

    // Verify gsap.timeline was called with repeat properties
    expect(gsap.timeline).toHaveBeenCalledWith({
      repeat: -1,
      yoyo: true,
      repeatDelay: 1,
      paused: false
    });
    
    // Verify gsap.to was called to build the tween
    expect(gsap.to).toHaveBeenCalled();
    const callArgs = gsap.to.mock.calls[0][1];
    expect(callArgs.keyframes).toEqual({
      '0%': { x: 0 },
      '100%': { x: 100 }
    });
  });

  it('should initialize a scroll scene and setting proper scroll triggers', () => {
    const scenario = {
      sceneId: 'scroll-scene',
      trigger: {
        type: 'scroll',
        scrub: 2,
        pin: true,
        start: 'top top',
        end: 'bottom bottom'
      },
      elements: [
        {
          id: 'scroll-el',
          keyframes: {
            x: {
              stops: [{ p: 0, v: 0 }, { p: 1, v: 50 }]
            }
          }
        }
      ]
    };

    const mockContainer = {};
    motionEngine.initScene(scenario, mockContainer);

    expect(gsap.timeline).toHaveBeenCalledWith({
      scrollTrigger: {
        trigger: mockContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 2,
        pin: mockContainer,
        pinSpacing: true,
        snap: false,
        startTrigger: undefined,
        endTrigger: undefined,
        invalidateOnRefresh: true
      }
    });
  });

  it('should destroy existing scene before re-initializing it', () => {
    const scenario = {
      sceneId: 'same-scene',
      trigger: { type: 'time' },
      elements: [
        {
          id: 'el',
          keyframes: {
            x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] }
          }
        }
      ]
    };

    motionEngine.initScene(scenario);
    
    const mockTimeline = gsap.timeline.mock.results[0].value;
    
    // Initialize again
    motionEngine.initScene(scenario);

    // Verify previous timeline was killed
    expect(mockTimeline.kill).toHaveBeenCalled();
  });
});

describe('GsapPubSub - Specialized Playback Controls', () => {
  beforeEach(() => {
    motionEngine.destroy();
    vi.clearAllMocks();
  });

  it('should play and pause scenes using play and pause methods', () => {
    const scenario = {
      sceneId: 'timer-playback-test',
      trigger: { type: 'time' },
      elements: [
        {
          id: 'timer-el',
          keyframes: {
            x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] }
          }
        }
      ]
    };
    motionEngine.initScene(scenario);

    const mockTimeline = gsap.timeline.mock.results[0].value;

    motionEngine.pause('timer-playback-test');
    expect(mockTimeline.pause).toHaveBeenCalled();

    motionEngine.play('timer-playback-test');
    expect(mockTimeline.play).toHaveBeenCalled();
  });

  it('should enable and disable scroll scenes using enableScroll and disableScroll', () => {
    const scenario = {
      sceneId: 'scroll-playback-test',
      trigger: {
        type: 'scroll',
        scrub: true
      },
      elements: [
        {
          id: 'scroll-el',
          keyframes: {
            x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] }
          }
        }
      ]
    };
    motionEngine.initScene(scenario, {});

    const mockTimeline = gsap.timeline.mock.results[0].value;

    motionEngine.disableScroll('scroll-playback-test');
    expect(mockTimeline.scrollTrigger.disable).toHaveBeenCalled();

    motionEngine.enableScroll('scroll-playback-test');
    expect(mockTimeline.scrollTrigger.enable).toHaveBeenCalled();
  });
});

describe('GsapPubSub - Z coordinate in broadcasts', () => {
  beforeEach(() => {
    motionEngine.destroy();
    vi.clearAllMocks();
  });

  it('should NOT include z in initial cache when keyframes don\'t specify z', () => {
    const scenario = {
      sceneId: 'z-test-scene',
      trigger: { type: 'time' },
      elements: [
        {
          id: 'z-el',
          keyframes: {
            x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] }
          }
        }
      ]
    };
    motionEngine.initScene(scenario);

    const cached = motionEngine._cache.get('z-el');
    expect(cached.z).toBeUndefined();
  });

  it('should include explicit z in initial cache', () => {
    const scenario = {
      sceneId: 'z-test-scene-2',
      trigger: { type: 'time' },
      elements: [
        {
          id: 'z-el-2',
          keyframes: {
            z: { stops: [{ p: 0, v: 42 }, { p: 1, v: 100 }] }
          }
        }
      ]
    };
    motionEngine.initScene(scenario);

    const cached = motionEngine._cache.get('z-el-2');
    expect(cached).toHaveProperty('z', 42);
  });
});

describe('GsapPubSub - Direction pre-pass and duration', () => {
  beforeEach(() => {
    motionEngine.destroy();
    vi.clearAllMocks();
  });

  it('should expand single stop at p=1 (inferred "to") into two stops in percentKeyframes', () => {
    const scenario = {
      sceneId: 'dir-to-scene',
      trigger: { type: 'time', duration: 1 },
      elements: [{
        id: 'dir-el',
        keyframes: {
          opacity: { stops: [{ p: 1, v: 0 }] } // single stop at p=1 → inferred 'to'
        }
      }]
    };
    motionEngine.initScene(scenario);

    expect(gsap.to).toHaveBeenCalled();
    const callArgs = gsap.to.mock.calls[0][1];
    // Must have both 0% (natural=1) and 100% (v=0) entries
    expect(callArgs.keyframes['0%']).toMatchObject({ opacity: 1 });
    expect(callArgs.keyframes['100%']).toMatchObject({ opacity: 0 });
  });

  it('should expand single stop at p=0 (inferred "from") into two stops', () => {
    const scenario = {
      sceneId: 'dir-from-scene',
      trigger: { type: 'time', duration: 1 },
      elements: [{
        id: 'dir-from-el',
        keyframes: {
          x: { stops: [{ p: 0, v: 100 }] } // single stop at p=0 → inferred 'from'
        }
      }]
    };
    motionEngine.initScene(scenario);

    expect(gsap.to).toHaveBeenCalled();
    const callArgs = gsap.to.mock.calls[0][1];
    expect(callArgs.keyframes['0%']).toMatchObject({ x: 100 });
    expect(callArgs.keyframes['100%']).toMatchObject({ x: 0 });
  });

  it('should pass duration from scenario trigger to gsap.to', () => {
    const scenario = {
      sceneId: 'dur-scene',
      trigger: { type: 'time', duration: 3 },
      elements: [{
        id: 'dur-el',
        keyframes: {
          x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] }
        }
      }]
    };
    motionEngine.initScene(scenario);

    const callArgs = gsap.to.mock.calls[0][1];
    expect(callArgs.duration).toBe(3);
  });

  it('should use element.duration to override scenario trigger.duration', () => {
    const scenario = {
      sceneId: 'el-dur-scene',
      trigger: { type: 'time', duration: 3 },
      elements: [{
        id: 'el-dur-el',
        duration: 1.5,
        keyframes: {
          x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] }
        }
      }]
    };
    motionEngine.initScene(scenario);

    const callArgs = gsap.to.mock.calls[0][1];
    expect(callArgs.duration).toBe(1.5);
  });
});

describe('GsapPubSub - Proxy Initialization and Static Config Separation', () => {
  beforeEach(() => {
    motionEngine.destroy();
    vi.clearAllMocks();
  });

  it('should store static configs in _elementConfigs and only tween props on proxy', () => {
    const scenario = {
      sceneId: 'proxy-scene',
      trigger: { type: 'time', duration: 1 },
      elements: [{
        id: 'proxy-el',
        transformOrigin: 'top left',
        keyframes: {
          opacity: { stops: [{ p: 0, v: 0.5 }, { p: 1, v: 1 }] },
          path: { points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] }
        }
      }]
    };

    motionEngine.initScene(scenario);
    
    const config = motionEngine._elementConfigs.get('proxy-el');
    const cache = motionEngine._cache.get('proxy-el');

    // Static items should be in config, not in proxy/cache
    expect(config.transformOrigin).toBe('top left');
    expect(config.cubicPath).toBeDefined();
    
    expect(cache.__transformOrigin).toBeUndefined();
    expect(cache.__cubicPath).toBeUndefined();

    // Tween props should be in proxy/cache, spatial props not in keyframes should be absent
    expect(cache.opacity).toBe(0.5);
    expect(cache.__pathProgress).toBe(0);
    expect(cache.x).toBeUndefined(); // Path plugin doesn't put x, y on proxy
    expect(cache.y).toBeUndefined();
  });

  it('should auto-align xPercent and yPercent with transformOrigin in compose()', () => {
    const scenario = {
      sceneId: 'align-scene',
      trigger: { type: 'time', duration: 1 },
      elements: [
        {
          id: 'align-el-1',
          transformOrigin: 'bottom center', // X=50% Y=100%
          keyframes: {
            x: { stops: [{ p: 0, v: 10 }, { p: 1, v: 20 }] }
          }
        },
        {
          id: 'align-el-2', // no explicit origin (defaults to 50% 50%)
          keyframes: {
            path: { points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] }
          }
        },
        {
          id: 'align-el-3', // non-spatial element
          keyframes: {
            opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] }
          }
        }
      ]
    };

    motionEngine.initScene(scenario);

    // Case 1: Custom transformOrigin
    const patch1 = motionEngine.compose('align-el-1', { x: 15 });
    expect(patch1.xPercent).toBe(-50);
    expect(patch1.yPercent).toBe(-100);
    expect(patch1.transformOrigin).toBe('bottom center');

    // Case 2: Default spatial transformOrigin (50% 50%)
    const patch2 = motionEngine.compose('align-el-2', { __pathProgress: 0.5 });
    expect(patch2.xPercent).toBe(-50);
    expect(patch2.yPercent).toBe(-50);
    expect(patch2.transformOrigin).toBe('50% 50%');

    // Case 3: Non-spatial (no positional fields, no path)
    const patch3 = motionEngine.compose('align-el-3', { opacity: 0.5 });
    expect(patch3.xPercent).toBeUndefined();
    expect(patch3.yPercent).toBeUndefined();
    expect(patch3.transformOrigin).toBeUndefined();
  });

  it('should handle autoRotate default (false) and autoRotate true in compose()', () => {
    const scenario = {
      sceneId: 'autorotate-scene',
      trigger: { type: 'time', duration: 1 },
      elements: [
        {
          id: 'path-el-default', // defaults to autoRotate: false
          keyframes: {
            path: {
              points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
            }
          }
        },
        {
          id: 'path-el-enabled', // explicitly autoRotate: true
          keyframes: {
            path: {
              points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
              autoRotate: true
            }
          }
        }
      ]
    };

    motionEngine.initScene(scenario);

    // Case 1: Default autoRotate: false
    const patchDefault = motionEngine.compose('path-el-default', { __pathProgress: 0.5 });
    expect(patchDefault.x).toBeDefined();
    expect(patchDefault.y).toBeDefined();
    expect(patchDefault.rotation).toBeUndefined(); // Should not have rotation!

    // Case 2: Explicit autoRotate: true
    const patchEnabled = motionEngine.compose('path-el-enabled', { __pathProgress: 0.5 });
    expect(patchEnabled.x).toBeDefined();
    expect(patchEnabled.y).toBeDefined();
    expect(patchEnabled.rotation).toBeDefined(); // Should have calculated tangent rotation!
  });
});
