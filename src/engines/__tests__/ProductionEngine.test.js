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
            { id: 'track-1', keyframes: { x: { stops: [0, 10] } } }
          ]
        },
        {
          motionId: 'scroll-motion',
          driver: { type: 'gsap-scroll', trigger: { trigger: '#el', scrub: true } },
          tracks: [
            { id: 'track-2', keyframes: { opacity: { stops: [0, 1] } } }
          ]
        },
        {
          motionId: 'manual-motion',
          driver: { type: 'manual' },
          tracks: [
            { id: 'track-3', keyframes: { scale: { stops: [1, 2] } } }
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
          tracks: [{ id: 'track-1', keyframes: { opacity: { stops: [0, 1] } } }]
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
});
