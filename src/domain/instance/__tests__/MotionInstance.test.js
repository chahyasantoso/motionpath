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
    return new MotionInstance(
      motionId,
      config,
      schemaMotion,
      {
        project: { templates },
        resolveElement: mockDeps.resolveElement,
        mountInstance: mockDeps.mountInstance,
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
  });

  describe('Scroll-Driver Stagger Freeze/Unfreeze', () => {
    let scrollStaggerSchema;

    beforeEach(() => {
      scrollStaggerSchema = {
        motionId: 'scroll-stagger',
        stagger: 0.2,
        driver: {
          type: 'gsap-scroll',
          trigger: { trigger: '#el', scrub: true }
        },
        tracks: [
          {
            id: 'track-s',
            keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] } }
          }
        ]
      };
    });

    it('disables ScrollTrigger before addChild mutation', () => {
      const instance = createTestInstance('scroll-stagger', {}, scrollStaggerSchema);
      const trigger = ScrollTrigger.create.mock.results[0].value;

      instance.addChild('child-motion', {});

      expect(trigger.disable).toHaveBeenCalledWith(false);
    });

    it('does NOT freeze ScrollTrigger on removeChild (deferred removal)', () => {
      const instance = createTestInstance('scroll-stagger', {}, scrollStaggerSchema);
      const trigger = ScrollTrigger.create.mock.results[0].value;

      const child = instance.addChild('child-motion', {});
      trigger.disable.mockClear();

      instance.removeChild(child);

      // removeChild no longer freezes — the dead child stays in the timeline
      // until the stagger slide finishes, so no duration change occurs yet
      expect(trigger.disable).not.toHaveBeenCalled();
    });

    it('calls scroll() to sync position after unfreeze on addChild with no stagger change', () => {
      const instance = createTestInstance('scroll-stagger', {}, scrollStaggerSchema);
      const trigger = ScrollTrigger.create.mock.results[0].value;

      instance.addChild('child-motion', {});

      expect(trigger.enable).toHaveBeenCalled();
      expect(ScrollTrigger.refresh).toHaveBeenCalled();
      expect(trigger.scroll).toHaveBeenCalled();
    });

    it('defers actual timeline removal until stagger slide completes on removeChild', () => {
      const instance = createTestInstance('scroll-stagger', {}, scrollStaggerSchema);

      const child1 = instance.addChild('child-motion', {});
      const child2 = instance.addChild('child-motion', {});
      ScrollTrigger.refresh.mockClear();

      const removeSpy = vi.spyOn(instance.timeline, 'remove');

      instance.removeChild(child1);

      // With only 1 surviving child and no stagger change needed,
      // the deferred removal fires immediately (pendingTweens === 0)
      expect(removeSpy).toHaveBeenCalledWith(child1.timeline);
      expect(ScrollTrigger.refresh).toHaveBeenCalled();
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
  });
});
