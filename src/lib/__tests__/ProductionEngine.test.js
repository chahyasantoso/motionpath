import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as validatorModule from '../../validators/index.js';
import { createProductionEngine } from '../ProductionEngine.js';
import * as builderModule from '../builder.js';

vi.mock('gsap/ScrollTrigger', () => {
  return {
    ScrollTrigger: {
      create: vi.fn(),
      getAll: vi.fn(() => []),
      refresh: vi.fn()
    }
  };
});

vi.mock('../builder.js', () => ({
  buildProject: vi.fn()
}));

vi.mock('../../validators/index.js', () => ({
  validateProject: vi.fn()
}));

describe('ProductionEngine', () => {
  let mockTimeline;
  let mockMasterTimeline;
  let buildResult;
  let mockDeps;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTimeline = {
      play: vi.fn().mockReturnThis(),
      pause: vi.fn().mockReturnThis(),
      repeat: vi.fn().mockReturnThis(),
      yoyo: vi.fn().mockReturnThis(),
      repeatDelay: vi.fn().mockReturnThis(),
      kill: vi.fn()
    };

    mockMasterTimeline = {
      play: vi.fn().mockReturnThis(),
      pause: vi.fn().mockReturnThis(),
      repeat: vi.fn().mockReturnThis(),
      yoyo: vi.fn().mockReturnThis(),
      repeatDelay: vi.fn().mockReturnThis(),
      kill: vi.fn()
    };

    buildResult = {
      scenarios: [
        {
          scenarioIndex: 0,
          sceneId: 'scenario-0',
          triggerType: 'scroll-scrub',
          triggerConfig: { trigger: '#el', scrub: true },
          timeline: mockTimeline
        }
      ],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map()
    };

    mockDeps = {
      resolveElement: vi.fn((id) => ({ id }))
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

  it('wires scroll-scrub trigger on loadProject', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({});

    expect(ScrollTrigger.create).toHaveBeenCalledWith({
      trigger: { id: '#el' },
      scrub: true,
      animation: mockTimeline
    });
  });

  it('wires grouped scroll-scrub trigger using primary config', async () => {
    const groupedResult = {
      scenarios: [
        {
          scenarioIndex: 0,
          timelineId: 'group-1',
          sceneId: 'scene-0',
          triggerType: 'scroll-scrub',
          triggerConfig: { trigger: '#primary', scrub: true },
          timeline: mockTimeline,
          isPrimary: true
        },
        {
          scenarioIndex: 1,
          timelineId: 'group-1',
          sceneId: 'scene-1',
          triggerType: 'scroll-scrub',
          triggerConfig: { trigger: '#secondary', scrub: true },
          timeline: { progress: vi.fn(), kill: vi.fn() },
          isPrimary: false
        }
      ],
      timelineGroups: new Map([
        [
          'group-1',
          {
            triggerType: 'scroll-scrub',
            masterTimeline: mockMasterTimeline,
            primaryScenarioIndex: 0
          }
        ]
      ]),
      elements: new Map(),
      elementPlugins: new Map()
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(groupedResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({});

    expect(ScrollTrigger.create).toHaveBeenCalledTimes(1);
    expect(ScrollTrigger.create).toHaveBeenCalledWith({
      trigger: { id: '#primary' },
      scrub: true,
      animation: mockMasterTimeline
    });
  });

  it('wires ungrouped scroll-observer and cascades startTrigger to sceneId when missing', async () => {
    const observerResult = {
      scenarios: [
        {
          scenarioIndex: 0,
          sceneId: 'scene-0',
          triggerType: 'scroll-observer',
          triggerConfig: { start: 'top top', toggleActions: 'play none none none' },
          timeline: mockTimeline
        }
      ],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map()
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(observerResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({});

    expect(mockDeps.resolveElement).toHaveBeenCalledWith('scene-0');
    expect(ScrollTrigger.create).toHaveBeenCalledWith({
      trigger: { id: 'scene-0' },
      start: 'top top',
      toggleActions: 'play none none none',
      animation: mockTimeline
    });
  });

  it('pauseTimer and playTimer controls ungrouped scenarios by scenarioIndex string', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({});

    engine.pauseTimer('0');
    expect(mockTimeline.pause).toHaveBeenCalled();

    engine.playTimer('0');
    expect(mockTimeline.play).toHaveBeenCalled();
  });

  it('pauseTimer throws on unknown id', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({});

    expect(() => engine.pauseTimer('unknown')).toThrow(/no group or scenario found/);
  });

  it('kills all timelines built so far if trigger-wiring throws partway through', async () => {
    const scenarioA = { scenarioIndex: 0, sceneId: 'a', triggerType: 'scroll-scrub',
      triggerConfig: { trigger: '#a', scrub: true }, timeline: { kill: vi.fn(), progress: vi.fn() } };
    const scenarioB = { scenarioIndex: 1, sceneId: 'b', triggerType: 'scroll-scrub',
      triggerConfig: { trigger: '#b', scrub: true }, timeline: { kill: vi.fn(), progress: vi.fn() } };

    const buildResult = {
      scenarios: [scenarioA, scenarioB],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map(),
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    // First ScrollTrigger.create succeeds, second throws
    ScrollTrigger.create
      .mockImplementationOnce(() => ({ kill: vi.fn() }))
      .mockImplementationOnce(() => { throw new Error('boom'); });

    const engine = createProductionEngine(mockDeps);

    await expect(engine.loadProject({})).rejects.toThrow('boom');

    // Both timelines — including scenario A's, which was already wired before B failed — must be killed.
    expect(scenarioA.timeline.kill).toHaveBeenCalled();
    expect(scenarioB.timeline.kill).toHaveBeenCalled();
  });

  it('correctly resolves trigger-element references using resolveTriggerRef logic', async () => {
    const customResult = {
      scenarios: [
        {
          scenarioIndex: 0,
          sceneId: 'my-scene-id',
          triggerType: 'scroll-scrub',
          triggerConfig: {
            trigger: 'my-trigger-id',
            pin: true,
            endTrigger: 'my-end-trigger-id',
            start: 'top top',
            end: 'bottom bottom'
          },
          timeline: mockTimeline
        }
      ],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map()
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(customResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({});

    // resolveElement should have been called for trigger and endTrigger, but NOT for pin (boolean true)
    expect(mockDeps.resolveElement).toHaveBeenCalledWith('my-trigger-id');
    expect(mockDeps.resolveElement).toHaveBeenCalledWith('my-end-trigger-id');
    expect(mockDeps.resolveElement).not.toHaveBeenCalledWith(true);

    // resolveElement should never be called with start/end values
    expect(mockDeps.resolveElement).not.toHaveBeenCalledWith('top top');
    expect(mockDeps.resolveElement).not.toHaveBeenCalledWith('bottom bottom');

    expect(ScrollTrigger.create).toHaveBeenCalledWith(expect.objectContaining({
      trigger: { id: 'my-trigger-id' },
      pin: true,
      endTrigger: { id: 'my-end-trigger-id' },
      start: 'top top',
      end: 'bottom bottom'
    }));
  });

  it('falls back to sceneId when trigger and startTrigger are missing', async () => {
    const customResult = {
      scenarios: [
        {
          scenarioIndex: 0,
          sceneId: 'fallback-scene-id',
          triggerType: 'scroll-scrub',
          triggerConfig: {
            pin: 'pin-id'
          },
          timeline: mockTimeline
        }
      ],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map()
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(customResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({});

    expect(mockDeps.resolveElement).toHaveBeenCalledWith('fallback-scene-id');
    expect(mockDeps.resolveElement).toHaveBeenCalledWith('pin-id');

    expect(ScrollTrigger.create).toHaveBeenCalledWith(expect.objectContaining({
      trigger: { id: 'fallback-scene-id' },
      pin: { id: 'pin-id' }
    }));
  });

  it('stale load is discarded when a second loadProject() supersedes it', async () => {
    let resolveFirst;
    const firstBuild = new Promise(res => { resolveFirst = res; });
    const firstBuildResult = {
      scenarios: [{ scenarioIndex: 0, sceneId: 'first', triggerType: 'time', triggerConfig: {}, timeline: { kill: vi.fn(), play: vi.fn(), repeat: vi.fn().mockReturnThis(), yoyo: vi.fn().mockReturnThis(), repeatDelay: vi.fn().mockReturnThis() } }],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map(),
    };
    const secondBuildResult = {
      scenarios: [{ scenarioIndex: 0, sceneId: 'second', triggerType: 'time', triggerConfig: {}, timeline: { kill: vi.fn(), play: vi.fn(), repeat: vi.fn().mockReturnThis(), yoyo: vi.fn().mockReturnThis(), repeatDelay: vi.fn().mockReturnThis() } }],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map(),
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject
      .mockReturnValueOnce(firstBuild)
      .mockResolvedValueOnce(secondBuildResult);

    const engine = createProductionEngine(mockDeps);
    const first = engine.loadProject({});
    const second = engine.loadProject({});

    // Let the second load settle first
    await second;

    // Resolve the stale first build — it should be killed, never wired
    resolveFirst(firstBuildResult);
    await first;

    expect(firstBuildResult.scenarios[0].timeline.kill).toHaveBeenCalled();
  });

  it('load is discarded when destroy() fires before buildProject resolves', async () => {
    let resolveBuild;
    const pendingBuild = new Promise(res => { resolveBuild = res; });
    const staleBuildResult = {
      scenarios: [{ scenarioIndex: 0, sceneId: 'stale', triggerType: 'time', triggerConfig: {}, timeline: { kill: vi.fn(), play: vi.fn(), repeat: vi.fn().mockReturnThis(), yoyo: vi.fn().mockReturnThis(), repeatDelay: vi.fn().mockReturnThis() } }],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map(),
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockReturnValue(pendingBuild);

    const engine = createProductionEngine(mockDeps);
    const load = engine.loadProject({});

    // Destroy before the build resolves
    engine.destroy();

    // Stale build resolves after destroy — must be killed, never wired
    resolveBuild(staleBuildResult);
    await load;

    expect(staleBuildResult.scenarios[0].timeline.kill).toHaveBeenCalled();
  });

  it('time scenario auto-plays on load by default', async () => {
    const timeBuildResult = {
      scenarios: [{
        scenarioIndex: 0,
        sceneId: 'timed',
        triggerType: 'time',
        triggerConfig: { repeat: -1, yoyo: true },
        timeline: mockTimeline
      }],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map()
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(timeBuildResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({});

    expect(mockTimeline.play).toHaveBeenCalled();
  });

  it('time scenario starts paused when playStates maps its timelineId to false', async () => {
    const timeBuildResult = {
      scenarios: [{
        scenarioIndex: 0,
        sceneId: 'timed',
        timelineId: 'my-tl',
        triggerType: 'time',
        triggerConfig: { repeat: -1, yoyo: true },
        timeline: mockTimeline
      }],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map()
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(timeBuildResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({}, { playStates: { 'my-tl': false } });

    expect(mockTimeline.play).not.toHaveBeenCalled();
  });

  it('scroll-observer scenario timeline configures repeat, yoyo, and repeatDelay parameters', async () => {
    const observerBuildResult = {
      scenarios: [{
        scenarioIndex: 0,
        sceneId: 'observed',
        triggerType: 'scroll-observer',
        triggerConfig: { trigger: 'my-trigger', start: 'top top', toggleActions: 'play none none none', repeat: -1, yoyo: true, repeatDelay: 1.5 },
        timeline: mockTimeline
      }],
      timelineGroups: new Map(),
      elements: new Map(),
      elementPlugins: new Map()
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(observerBuildResult);

    const engine = createProductionEngine(mockDeps);
    await engine.loadProject({});

    expect(mockTimeline.repeat).toHaveBeenCalledWith(-1);
    expect(mockTimeline.yoyo).toHaveBeenCalledWith(true);
    expect(mockTimeline.repeatDelay).toHaveBeenCalledWith(1.5);
  });
});
