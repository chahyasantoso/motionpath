import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createProductionEngine } from '../ProductionEngine.js';
import * as builderModule from '../builder.js';
import * as validatorModule from '../../validators/index.js';

vi.mock('gsap/ScrollTrigger', () => {
  return {
    ScrollTrigger: {
      create: vi.fn(),
      getAll: vi.fn(() => [])
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
      trigger: '#el',
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
      trigger: '#primary',
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
});
