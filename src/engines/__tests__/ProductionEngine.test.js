import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as validatorModule from '../../validators/index.js';
import { createProductionEngine } from '../ProductionEngine.js';

vi.mock('gsap/ScrollTrigger', () => {
  return {
    ScrollTrigger: {
      create: vi.fn(),
      getAll: vi.fn(() => []),
      refresh: vi.fn()
    }
  };
});

vi.mock('../../validators/index.js', () => ({
  validateProject: vi.fn()
}));

describe('ProductionEngine (Lazy/Instance Architecture)', () => {
  let mockDeps;
  let validSchema;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeps = {
      resolveElement: vi.fn((id) => ({ id }))
    };

    validSchema = {
      templates: [],
      motions: [
        {
          motionId: 'time-motion',
          driver: { type: 'gsap-timeline', trigger: { autoplay: false } },
          tracks: [
            { id: 'track-1', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] } } }
          ]
        },
        {
          motionId: 'scroll-motion',
          driver: { type: 'gsap-scroll', trigger: { trigger: '#el', scrub: true } },
          tracks: [
            { id: 'track-2', keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }
          ]
        },
        {
          motionId: 'manual-motion',
          driver: { type: 'manual' },
          tracks: [
            { id: 'track-3', keyframes: { scale: { stops: [{ p: 0, v: 1 }, { p: 1, v: 2 }] } } }
          ]
        }
      ]
    };
  });

  it('throws on invalid schema in loadProject', async () => {
    validatorModule.validateProject.mockReturnValue([
      { severity: 'error', message: 'Err 1' },
      { severity: 'error', message: 'Err 2' }
    ]);

    const engine = createProductionEngine(mockDeps);
    await expect(engine.loadProject({})).rejects.toThrow(/Err 1[\s\S]*Err 2/);
  });

  it('mountInstance creates correct subclasses based on driver type', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    const engine = createProductionEngine(mockDeps);
    await engine.loadProject(validSchema);

    // 1. Timeline
    const inst1 = engine.mountInstance('time-motion');
    expect(inst1).toBeDefined();
    expect(inst1.timeline).toBeDefined();
    expect(typeof inst1.play).toBe('function');
    expect(typeof inst1.pause).toBe('function');

    // 2. Scroll
    const inst2 = engine.mountInstance('scroll-motion');
    expect(inst2).toBeDefined();
    expect(inst2.timeline).toBeDefined();

    // 3. Manual
    const inst3 = engine.mountInstance('manual-motion');
    expect(inst3).toBeDefined();
    expect(inst3.timeline).toBeDefined();
  });

  it('addChild auto-staggers child instances independently', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    
    // Add stagger to timeline motion config
    validSchema.motions[0].driver.stagger = 0.1;

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject(validSchema);

    const parent = engine.mountInstance('time-motion');
    const child1 = parent.addChild();
    const child2 = parent.addChild();

    expect(child1.config.delay).toBe(0.0);
    expect(child2.config.delay).toBe(0.1);

    expect(parent.children).toContain(child1);
    expect(parent.children).toContain(child2);

    // Verify seeking the parent timeline updates children progress staggered mathematically
    // Parent total duration = 1.1s (child2 ends at 0.1s delay + 1.0s duration)
    // Seeking to progress 0.5 sets time to 0.55s.
    // Child1 progress = (0.55 - 0) / 1.0 = 0.55
    // Child2 progress = (0.55 - 0.1) / 1.0 = 0.45
    parent.seek(0.5);
    expect(child1.timeline.progress()).toBeCloseTo(0.55);
    expect(child2.timeline.progress()).toBeCloseTo(0.45);
  });

  it('destroys all active instances on engine.destroy()', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    const engine = createProductionEngine(mockDeps);
    await engine.loadProject(validSchema);

    const inst = engine.mountInstance('manual-motion');
    const destroySpy = vi.spyOn(inst, 'destroy');

    engine.destroy();
    expect(destroySpy).toHaveBeenCalled();
  });

  it('resolveMotion works synchronously for manual queries', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    const engine = createProductionEngine(mockDeps);
    await engine.loadProject(validSchema);

    // Register a delegate/manual motion and test resolveMotion
    const result = engine.resolveMotion('manual-motion', 0.5);
    expect(result).toHaveProperty('track-3');
    expect(result['track-3']).toHaveProperty('scale');
  });

  it('isolates triggerRefs registry between independent engine instances', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    const engine1 = createProductionEngine();
    const engine2 = createProductionEngine();

    const scrollSchema = {
      motions: [
        {
          motionId: 'scroll-motion',
          driver: { type: 'gsap-scroll', trigger: { trigger: '#el', scrub: true } },
          tracks: [{ id: 'track-1', keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }]
        }
      ]
    };

    await engine1.loadProject(scrollSchema);
    await engine2.loadProject(scrollSchema);

    const ref = { current: {} };

    // Register on engine1 only
    engine1.registerTriggerRef('#el', ref);

    // engine1 should mount successfully
    expect(() => engine1.mountInstance('scroll-motion')).not.toThrow();

    // engine2 should fail because it has its own isolated registry
    expect(() => engine2.mountInstance('scroll-motion')).toThrow(
      /MotionPath: trigger ref '#el' is not registered/
    );
  });

  it('mitigates double registration and safely ignores unregistration of overwritten refs', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    const engine = createProductionEngine();
    const ref1 = { current: {} };
    const ref2 = { current: {} };

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    engine.registerTriggerRef('#el', ref1);
    engine.registerTriggerRef('#el', ref2);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Double-registration detected'));

    const scrollSchema = {
      motions: [
        {
          motionId: 'scroll-motion',
          driver: { type: 'gsap-scroll', trigger: { trigger: '#el', scrub: true } },
          tracks: []
        }
      ]
    };

    await engine.loadProject(scrollSchema);

    // Unregister first (should be ignored because current is ref2)
    engine.unregisterTriggerRef('#el', ref1);
    expect(() => engine.mountInstance('scroll-motion')).not.toThrow();

    // Unregister second (should delete)
    engine.unregisterTriggerRef('#el', ref2);
    expect(() => engine.mountInstance('scroll-motion')).toThrow(/is not registered/);

    consoleWarnSpy.mockRestore();
  });

  describe('Timeline Group Support', () => {
    let groupSchema;

    beforeEach(() => {
      groupSchema = {
        templates: [],
        motions: [
          {
            motionId: 'group-a',
            driver: {
              type: 'timeline',
              timelineId: 'hero-tl',
              trigger: { type: 'scroll', scrub: true }
            },
            tracks: [
              { id: 'track-ga', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] } } }
            ]
          },
          {
            motionId: 'group-b',
            driver: {
              type: 'timeline',
              timelineId: 'hero-tl',
              primary: true,
              trigger: { type: 'scroll', scrub: true, trigger: '#hero', start: 'top top', end: '+=2000' }
            },
            tracks: [
              { id: 'track-gb', keyframes: { y: { stops: [{ p: 0, v: 0 }, { p: 1, v: 50 }] } } }
            ]
          },
          {
            motionId: 'ungrouped',
            driver: { type: 'manual' },
            tracks: [
              { id: 'track-u', keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }
            ]
          }
        ]
      };
    });

    it('grouped instances do not create their own ScrollTrigger', async () => {
      validatorModule.validateProject.mockReturnValue([]);
      const engine = createProductionEngine(mockDeps);
      await engine.loadProject(groupSchema);

      ScrollTrigger.create.mockClear();

      engine.mountInstance('group-a');
      // Non-primary should not create its own ScrollTrigger
      // But primary mounting triggers one on the master
      expect(ScrollTrigger.create).not.toHaveBeenCalled();
    });

    it('primary mount creates ScrollTrigger on master timeline', async () => {
      validatorModule.validateProject.mockReturnValue([]);
      const engine = createProductionEngine(mockDeps);
      await engine.loadProject(groupSchema);

      ScrollTrigger.create.mockReturnValue({ kill: vi.fn(), disable: vi.fn(), enable: vi.fn() });
      ScrollTrigger.create.mockClear();

      engine.mountInstance('group-a');
      engine.mountInstance('group-b');

      // Exactly one ScrollTrigger for the group (from primary)
      expect(ScrollTrigger.create).toHaveBeenCalledTimes(1);
      expect(ScrollTrigger.create).toHaveBeenCalledWith(
        expect.objectContaining({ scrub: true })
      );
    });

    it('handles non-primary mounting before primary', async () => {
      validatorModule.validateProject.mockReturnValue([]);
      const engine = createProductionEngine(mockDeps);
      await engine.loadProject(groupSchema);

      ScrollTrigger.create.mockReturnValue({ kill: vi.fn(), disable: vi.fn(), enable: vi.fn() });
      ScrollTrigger.create.mockClear();

      // Mount non-primary first
      const instA = engine.mountInstance('group-a');
      expect(ScrollTrigger.create).not.toHaveBeenCalled();

      // Mount primary second — triggers ScrollTrigger
      const instB = engine.mountInstance('group-b');
      expect(ScrollTrigger.create).toHaveBeenCalledTimes(1);

      // Both instances have timelines
      expect(instA.timeline).toBeDefined();
      expect(instB.timeline).toBeDefined();
    });

    it('play/pause on grouped instance controls master', async () => {
      validatorModule.validateProject.mockReturnValue([]);
      const engine = createProductionEngine(mockDeps);

      const timeGroupSchema = {
        templates: [],
        motions: [
          {
            motionId: 'tg-a',
            driver: {
              type: 'timeline',
              timelineId: 'time-group',
              trigger: { type: 'time', duration: 1 }
            },
            tracks: [
              { id: 'tg-track-a', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] } } }
            ]
          },
          {
            motionId: 'tg-b',
            driver: {
              type: 'timeline',
              timelineId: 'time-group',
              primary: true,
              trigger: { type: 'time', duration: 1, repeat: 0 }
            },
            tracks: [
              { id: 'tg-track-b', keyframes: { y: { stops: [{ p: 0, v: 0 }, { p: 1, v: 20 }] } } }
            ]
          }
        ]
      };

      await engine.loadProject(timeGroupSchema);

      const instA = engine.mountInstance('tg-a');
      const instB = engine.mountInstance('tg-b');

      // play() on either should work (both patched to control master)
      expect(typeof instA.play).toBe('function');
      expect(typeof instB.play).toBe('function');
    });

    it('seek on grouped instance controls master, not the member\'s own timeline', async () => {
      validatorModule.validateProject.mockReturnValue([]);
      const engine = createProductionEngine(mockDeps);

      const timeGroupSchema = {
        templates: [],
        motions: [
          {
            motionId: 'tg-a',
            driver: {
              type: 'timeline',
              timelineId: 'time-group',
              trigger: { type: 'time', duration: 1 }
            },
            tracks: [
              { id: 'tg-track-a', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] } } }
            ]
          },
          {
            motionId: 'tg-b',
            driver: {
              type: 'timeline',
              timelineId: 'time-group',
              primary: true,
              trigger: { type: 'time', duration: 1, repeat: 0 }
            },
            tracks: [
              { id: 'tg-track-b', keyframes: { y: { stops: [{ p: 0, v: 0 }, { p: 1, v: 20 }] } } }
            ]
          }
        ]
      };

      await engine.loadProject(timeGroupSchema);

      const instA = engine.mountInstance('tg-a');
      const instB = engine.mountInstance('tg-b');

      expect(typeof instA.seek).toBe('function');
      expect(typeof instB.seek).toBe('function');

      const memberOwnProgressSpy = vi.spyOn(instA.timeline, 'progress');

      instA.seek(0.5);

      // The member's own nested timeline must NOT have been driven directly —
      // seek() on a grouped instance must go through the master, exactly like
      // play()/pause() already do.
      expect(memberOwnProgressSpy).not.toHaveBeenCalledWith(0.5);
    });

    it('ungrouped motions are unaffected', async () => {
      validatorModule.validateProject.mockReturnValue([]);
      const engine = createProductionEngine(mockDeps);
      await engine.loadProject(groupSchema);

      const inst = engine.mountInstance('ungrouped');
      expect(inst._timelineGroupId).toBeUndefined();
      expect(inst.timeline).toBeDefined();
    });

    it('instance destroy removes from group; last destroy cleans up controller', async () => {
      validatorModule.validateProject.mockReturnValue([]);
      const engine = createProductionEngine(mockDeps);

      ScrollTrigger.create.mockReturnValue({ kill: vi.fn(), disable: vi.fn(), enable: vi.fn() });

      await engine.loadProject(groupSchema);

      const instA = engine.mountInstance('group-a');
      const instB = engine.mountInstance('group-b');

      expect(engine._groups.has('hero-tl')).toBe(true);

      // Destroy non-primary
      instA.destroy();
      // Group still exists (primary remains)
      expect(engine._groups.has('hero-tl')).toBe(true);

      // Destroy primary (last member) — group fully cleaned up
      instB.destroy();
      expect(engine._groups.has('hero-tl')).toBe(false);
    });

    it('instance destroy removes from engine _instances map and handles multiple calls gracefully', async () => {
      validatorModule.validateProject.mockReturnValue([]);
      const engine = createProductionEngine(mockDeps);
      await engine.loadProject(groupSchema);

      const inst = engine.mountInstance('group-a');
      expect(engine._instances.has(inst.id)).toBe(true);

      inst.destroy();
      expect(engine._instances.has(inst.id)).toBe(false);

      // Call destroy again, should not throw
      expect(() => inst.destroy()).not.toThrow();
    });

    it('engine.destroy() cleans up all groups', async () => {
      validatorModule.validateProject.mockReturnValue([]);
      const engine = createProductionEngine(mockDeps);

      ScrollTrigger.create.mockReturnValue({ kill: vi.fn(), disable: vi.fn(), enable: vi.fn() });

      await engine.loadProject(groupSchema);
      engine.mountInstance('group-a');
      engine.mountInstance('group-b');

      // Should not throw
      expect(() => engine.destroy()).not.toThrow();
    });
  });
});
