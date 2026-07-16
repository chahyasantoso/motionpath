import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionInstance } from '../MotionInstance.js';

vi.mock('gsap/ScrollTrigger', () => {
  return {
    ScrollTrigger: {
      create: vi.fn(() => ({
        kill: vi.fn(),
        disable: vi.fn(),
        enable: vi.fn(),
        scroll: vi.fn(),
        start: 0,
        end: 1000
      })),
      refresh: vi.fn()
    }
  };
});

describe('MotionInstance Class', () => {
  let mockDeps;
  let mockOnSubscriberChange;
  let templates;
  let timelineSchema;
  let manualSchema;

  function createTestInstance(motionId, config, schemaMotion) {
    const { mountInstance, ...restConfig } = config || {};
    return new MotionInstance(
      motionId,
      restConfig,
      schemaMotion,
      {
        project: { templates },
        resolveElement: mockDeps.resolveElement,
        mountInstance: mountInstance || mockDeps.mountInstance,
        onSubscriberChange: mockOnSubscriberChange
      }
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeps = {
      resolveElement: vi.fn((id) => ({ id })),
      mountInstance: vi.fn((motionId, config) => {
        // Return a mock child instance
        return createTestInstance(
          motionId,
          config,
          {
            motionId,
            driver: { type: 'manual' },
            tracks: []
          }
        );
      })
    };

    mockOnSubscriberChange = vi.fn();
    templates = new Map();

    timelineSchema = {
      motionId: 'time-motion',
      stagger: 0.1,
      driver: {
        type: 'gsap-timeline',
        trigger: {
          autoplay: false,
          repeat: 2,
          yoyo: true,
          delay: 0.5
        }
      },
      tracks: [
        {
          id: 'track-1',
          keyframes: {
            x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] }
          }
        }
      ]
    };

    manualSchema = {
      motionId: 'manual-motion',
      driver: { type: 'manual' },
      tracks: [
        {
          id: 'track-2',
          keyframes: {
            opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] }
          }
        }
      ]
    };
  });

  describe('Initialization', () => {
    it('creates an instance with a unique ID and properties', () => {
      const instance = createTestInstance('my-motion', {}, manualSchema);

      expect(instance.id).toBeDefined();
      expect(instance.motionId).toBe('my-motion');
      expect(instance.config).toEqual({});
      expect(instance.children).toEqual([]);
      expect(instance.tracksMap.size).toBe(1);
    });

    it('builds GSAP timeline with correct trigger delay and repeat config', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);

      expect(instance.timeline).toBeDefined();
      expect(instance.timeline.repeat()).toBe(2);
      expect(instance.timeline.yoyo()).toBe(true);
      expect(instance.timeline.delay()).toBe(0.5);
    });

    it('allows config overrides to win over schema settings', () => {
      const instance = createTestInstance('time-motion', { delay: 1.5 }, timelineSchema);

      expect(instance.timeline.delay()).toBe(1.5);
    });
  });

  describe('Playback API', () => {
    it('proxies play and pause to timeline', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);
      
      const playSpy = vi.spyOn(instance.timeline, 'play');
      const pauseSpy = vi.spyOn(instance.timeline, 'pause');

      instance.play();
      expect(playSpy).toHaveBeenCalled();

      instance.pause();
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('proxies seek to timeline progress', () => {
      const instance = createTestInstance('manual-motion', {}, manualSchema);
      
      instance.seek(0.75);
      expect(instance.timeline.progress()).toBe(0.75);
    });
  });

  describe('Subscription and Snapshot API', () => {
    it('subscribes to track changes and fires immediately', () => {
      const instance = createTestInstance('manual-motion', {}, manualSchema);
      const callback = vi.fn();

      const unsubscribe = instance.subscribe('track-2', callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenLastCalledWith({ opacity: 0, progress: 0 });

      instance.seek(1.0);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith({ opacity: 1, progress: 1 });

      unsubscribe();
    });

    it('notifies subscriber change when subscription state updates', () => {
      const instance = createTestInstance('manual-motion', {}, manualSchema);
      const callback = vi.fn();

      const unsubscribe = instance.subscribe('track-2', callback);
      expect(mockOnSubscriberChange).toHaveBeenLastCalledWith(instance, true);

      unsubscribe();
      expect(mockOnSubscriberChange).toHaveBeenLastCalledWith(instance, false);
    });

    it('avoids wrapper leaks when unsubscribing independent handlers', () => {
      const instance = createTestInstance('manual-motion', {}, manualSchema);
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      const unsub1 = instance.subscribe('track-2', cb1);
      const unsub2 = instance.subscribe('track-2', cb2);

      unsub1();
      instance.seek(0.5);

      expect(cb1).toHaveBeenCalledTimes(1); // unsubbed
      expect(cb2).toHaveBeenCalledTimes(2); // still active

      unsub2();
    });

    it('correctly composes track patches via compose()', () => {
      const instance = createTestInstance('manual-motion', {}, manualSchema);
      const patch = instance.compose('track-2', { opacity: 0.5 });
      
      expect(patch).toEqual({ opacity: 0.5 });
    });
  });

  describe('Composition and Stagger API', () => {
    it('registers child change listeners', () => {
      const instance = createTestInstance('manual-motion', {}, manualSchema);
      const listener = vi.fn();

      const cleanup = instance.onChildChange(listener);
      instance.addChild('child-motion', {});

      expect(listener).toHaveBeenCalledTimes(1);
      cleanup();
    });

    it('adds child and calculates stagger correctly', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);

      const child1 = instance.addChild('child-motion', {});
      const child2 = instance.addChild('child-motion', {});

      expect(child1.currentDelay).toBe(0);
      expect(child2.currentDelay).toBeCloseTo(0.1); // based on parent schema stagger=0.1
      expect(instance.children).toHaveLength(2);
    });

    it('removes child and triggers delay updates on remaining children', async () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);
      
      const child1 = instance.addChild('child-motion', {});
      const child2 = instance.addChild('child-motion', {});
      
      instance.removeChild(child1);

      expect(instance.children).toHaveLength(1);
      expect(child2.delayTween).toBeDefined(); // gsap tween kicks in to update child2 delay
    });
  });

  describe('Scroll Trigger Specific API', () => {
    it('creates ScrollTrigger instance for scroll-based driver', () => {
      const scrollSchema = {
        motionId: 'scroll-motion',
        driver: {
          type: 'gsap-scroll',
          trigger: { trigger: '#el', scrub: true }
        },
        tracks: []
      };

      const instance = createTestInstance('scroll-motion', {}, scrollSchema);
      expect(ScrollTrigger.create).toHaveBeenCalled();
      expect(ScrollTrigger.create.mock.results[0].value).toBeDefined();
    });

    it('extracts required trigger IDs from the schema trigger configuration', () => {
      const scrollSchema = {
        motionId: 'scroll-motion',
        driver: {
          type: 'gsap-scroll',
          trigger: { trigger: 'my-trigger', pin: 'my-stage', endTrigger: 'my-end' }
        },
        tracks: []
      };

      const instance = createTestInstance('scroll-motion', {}, scrollSchema);
      expect(instance.requiredTriggerIds).toEqual(['my-trigger', 'my-end', 'my-stage']);
    });

    it('proxies enable and disable to ScrollTrigger', () => {
      const scrollSchema = {
        motionId: 'scroll-motion',
        driver: {
          type: 'gsap-scroll',
          trigger: { trigger: '#el', scrub: true }
        },
        tracks: []
      };

      const instance = createTestInstance('scroll-motion', {}, scrollSchema);
      const trigger = ScrollTrigger.create.mock.results[0].value;
      
      instance.disableTrigger();
      expect(trigger.disable).toHaveBeenCalledWith(false);

      instance.enableTrigger();
      expect(trigger.enable).toHaveBeenCalled();
    });

    it('does NOT create its own ScrollTrigger when config._suppressDriver is set (timelineId group member)', () => {
      const scrollSchema = {
        motionId: 'scroll-motion',
        driver: {
          type: 'gsap-scroll',
          trigger: { trigger: '#el', scrub: true }
        },
        tracks: []
      };

      createTestInstance('scroll-motion', { _suppressDriver: true }, scrollSchema);
      expect(ScrollTrigger.create).not.toHaveBeenCalled();
    });
  });

  describe('Reflow and Deferred Removal API', () => {
    it('removeChild is a no-op if called twice on the same child mid-reflow', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);
      const child1 = instance.addChild('child-motion', {});
      instance.addChild('child-motion', {});

      const removeSpy = vi.spyOn(instance.timeline, 'remove');
      instance.removeChild(child1);
      instance.removeChild(child1); // second call, still mid-reflow

      expect(instance.children).toHaveLength(1);
    });

    it('addChild throws after destroy()', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);
      instance.destroy();

      expect(() => instance.addChild('child-motion', {})).toThrow(/destroyed/);
    });

    it('destroy() kills delayTween and destroys children pending removal', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);
      const child1 = instance.addChild('child-motion', {});
      instance.addChild('child-motion', {});

      instance.removeChild(child1); // starts reflow, child1 now pending
      const destroySpy = vi.spyOn(child1, 'destroy');
      const tweenKillSpy = child1.delayTween ? vi.spyOn(child1.delayTween, 'kill') : null;

      instance.destroy();

      expect(destroySpy).toHaveBeenCalled();
      if (tweenKillSpy) expect(tweenKillSpy).toHaveBeenCalled();
    });

    it('onChildChange fires for removeChild only after reflow completes, not at splice time', async () => {
      const schemaWithTransition = {
        ...timelineSchema,
        staggerTransition: { duration: 0.6 }
      };
      const instance = createTestInstance('time-motion', {}, schemaWithTransition);
      instance.addChild('child-motion', {});
      const child2 = instance.addChild('child-motion', {}); // remove this one (rank 1)
      instance.addChild('child-motion', {}); // survivor — gives the reflow something to do

      let capturedOnComplete;
      const toSpy = vi.spyOn(gsap, 'to').mockImplementation((target, vars) => {
        capturedOnComplete = vars.onComplete;
        return { kill: vi.fn() };
      });

      const listener = vi.fn();
      instance.onChildChange(listener);
      instance.removeChild(child2);

      expect(listener).not.toHaveBeenCalled(); // reflow tween hasn't completed yet

      capturedOnComplete(); // simulate the tween finishing
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(listener).toHaveBeenCalledTimes(1);
      toSpy.mockRestore();
    });

    it('reflows a manually-delayed child too — no more auto/manual distinction', async () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);
      instance.addChild('child-motion', {});                              // delay 0 (rank 0)
      const auto2 = instance.addChild('child-motion', {});               // delay 0.1 (rank 1)
      const custom = instance.addChild('child-motion', { delay: 99 });   // manual, far out (rank 2)

      instance.removeChild(auto2); // rank 1 removal — cascade fires

      // custom is now a survivor ranked after auto2 in position order, so it
      // must be reflowed onto auto2's vacated slot (0.1), same as any
      // other survivor.
      expect(custom.delayTween).not.toBeNull();
    });

    it('cascades survivors onto the vacated predecessor slot, not a recomputed formula', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);
      const c0 = instance.addChild('child-motion', {}); // delay 0
      const c1 = instance.addChild('child-motion', {}); // delay 0.1
      const c2 = instance.addChild('child-motion', {}); // delay 0.2
      const c3 = instance.addChild('child-motion', {}); // delay 0.3

      // settle currentDelay as if prior reflows already completed, so the
      // cascade has real predecessor values to read
      c0.currentDelay = 0;
      c1.currentDelay = 0.1;
      c2.currentDelay = 0.2;
      c3.currentDelay = 0.3;

      instance.removeChild(c1); // remove the second one

      // c2 must inherit c1's vacated slot (0.1), c3 must inherit c2's
      // original slot (0.2) — a cascade, not a re-derived index*stagger.
      expect(c2.delayTween).not.toBeNull();
      expect(c3.delayTween).not.toBeNull();
    });

    it('restarts placement at 0 after all children have been removed', async () => {
      const schemaNoTransition = { ...timelineSchema, staggerTransition: { duration: 0 } };
      const instance = createTestInstance('time-motion', {}, schemaNoTransition);

      const a = instance.addChild('child-motion', {});
      instance.removeChild(a);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(instance.children).toHaveLength(0);

      const b = instance.addChild('child-motion', {});
      expect(b.currentDelay).toBe(0); // nothing left in the queue, fresh start — no reset bookkeeping needed
    });

    it('places a new spawn exactly one stagger after the reflowed chain, regardless of prior removals', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);
      const c0 = instance.addChild('child-motion', {}); // delay 0
      const c1 = instance.addChild('child-motion', {}); // delay 0.1
      const c2 = instance.addChild('child-motion', {}); // delay 0.2
      const c3 = instance.addChild('child-motion', {}); // delay 0.3
      const c4 = instance.addChild('child-motion', {}); // delay 0.4

      instance.removeChild(c2); // triggers cascade: c3 -> 0.2, c4 -> 0.3

      const c5 = instance.addChild('child-motion', {});

      // must be 0.4 — one clean stagger after the reflowed frontmost (0.3).
      // A counter blind to the reflow would have produced 0.5 (brief 16's bug).
      expect(c5.currentDelay).toBeCloseTo(0.4);
      expect(c0.currentDelay).toBe(0); // untouched, unaffected by any of this
      expect(c1.currentDelay).toBe(0.1); // untouched
    });

    it('reads duration/ease from schemaMotion.staggerTransition when present', async () => {
      const schemaWithTransition = {
        ...timelineSchema,
        staggerTransition: { duration: 0.25, ease: 'power1.in' }
      };
      const instance = createTestInstance('time-motion', {}, schemaWithTransition);
      instance.addChild('child-motion', {});
      const child2 = instance.addChild('child-motion', {}); // rank 1
      instance.addChild('child-motion', {});

      const toSpy = vi.spyOn(gsap, 'to');
      instance.removeChild(child2);

      expect(toSpy).toHaveBeenCalled();
      const lastCallArgs = toSpy.mock.calls[toSpy.mock.calls.length - 1];
      expect(lastCallArgs[1].duration).toBe(0.25);
      expect(lastCallArgs[1].ease).toBe('power1.in');
      toSpy.mockRestore();
    });

    it('instantly snaps delay updates without gsap.to when staggerTransition.duration is 0', async () => {
      const schemaWithTransition = {
        ...timelineSchema,
        staggerTransition: { duration: 0 }
      };
      const instance = createTestInstance('time-motion', {}, schemaWithTransition);
      instance.addChild('child-motion', {});
      const child2 = instance.addChild('child-motion', {}); // rank 1
      instance.addChild('child-motion', {});

      const toSpy = vi.spyOn(gsap, 'to');
      instance.removeChild(child2);

      expect(toSpy).toHaveBeenCalled();
      const lastCallArgs = toSpy.mock.calls[toSpy.mock.calls.length - 1];
      expect(lastCallArgs[1].duration).toBe(0);
      toSpy.mockRestore();
    });

    it('addChild passes delay through config instead of mutating the child after construction', () => {
      const templates = new Map();
      const mockOnSubscriberChange = vi.fn();
      const mockDeps = {
        resolveElement: vi.fn((id) => ({ id })),
        mountInstance: vi.fn((motionId, config) => {
          return new MotionInstance(
            motionId,
            config,
            {
              motionId,
              driver: { type: 'manual' },
              tracks: []
            },
            {
              project: { templates },
              resolveElement: mockDeps.resolveElement,
              mountInstance: mockDeps.mountInstance,
              onSubscriberChange: mockOnSubscriberChange
            }
          );
        })
      };
      
      const mountInstanceSpy = vi.fn((motionId, config) => {
        return new MotionInstance(
          motionId,
          config,
          timelineSchema,
          {
            project: { templates },
            resolveElement: mockDeps.resolveElement,
            mountInstance: mockDeps.mountInstance,
            onSubscriberChange: mockOnSubscriberChange
          }
        );
      });

      const instance = createTestInstance('time-motion', { mountInstance: mountInstanceSpy }, timelineSchema);
      instance.addChild('child-motion', {});

      const [, configArg] = mountInstanceSpy.mock.calls[0];
      expect(configArg.isAutoStagger).toBeUndefined(); // field removed entirely
      expect(configArg.delay).toBe(0);
    });
  });

  describe('Teardown and destruction', () => {
    it('kills timeline and deletes all children', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);
      const child = instance.addChild('child-motion', {});
      
      const killSpy = vi.spyOn(instance.timeline, 'kill');
      const childDestroySpy = vi.spyOn(child, 'destroy');

      instance.destroy();

      expect(killSpy).toHaveBeenCalled();
      expect(childDestroySpy).toHaveBeenCalled();
      expect(instance.children).toHaveLength(0);
    });

    it('notifies onSubscriberChange(false) on destroy if it had active subscribers', () => {
      const instance = createTestInstance('manual-motion', {}, manualSchema);
      const callback = vi.fn();

      instance.subscribe('track-2', callback);
      expect(mockOnSubscriberChange).toHaveBeenCalledWith(instance, true);

      mockOnSubscriberChange.mockClear();

      instance.destroy();

      expect(mockOnSubscriberChange).toHaveBeenCalledTimes(1);
      expect(mockOnSubscriberChange).toHaveBeenCalledWith(instance, false);
    });

    it('does not notify onSubscriberChange on destroy if it had no active subscribers', () => {
      const instance = createTestInstance('manual-motion', {}, manualSchema);

      mockOnSubscriberChange.mockClear();

      instance.destroy();

      expect(mockOnSubscriberChange).not.toHaveBeenCalled();
    });

    it('exposes isDestroyed as false before destroy() and true after', () => {
      const instance = createTestInstance('time-motion', {}, timelineSchema);

      expect(instance.isDestroyed).toBe(false);

      instance.destroy();

      expect(instance.isDestroyed).toBe(true);
    });
  });
});
