import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEditorEngine } from '../EditorEngine.js';
import * as builderModule from '../builder.js';
import * as validatorModule from '../../validators/index.js';

vi.mock('../builder.js', () => ({
  buildProject: vi.fn()
}));

vi.mock('../../validators/index.js', () => ({
  validateProject: vi.fn()
}));

describe('EditorEngine', () => {
  let mockTimeline;
  let mockMasterTimeline;
  let buildResult;
  let mockDeps;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTimeline = {
      progress: vi.fn(),
      kill: vi.fn()
    };

    mockMasterTimeline = {
      progress: vi.fn(),
      kill: vi.fn()
    };

    buildResult = {
      scenarios: [
        {
          scenarioIndex: 0,
          sceneId: 'scenario-0',
          timeline: mockTimeline
        },
        {
          scenarioIndex: 1,
          timelineId: 'grouped-id',
          sceneId: 'scenario-1',
          timeline: { progress: vi.fn(), kill: vi.fn() }
        }
      ],
      timelineGroups: new Map([
        [
          'grouped-id',
          {
            masterTimeline: mockMasterTimeline
          }
        ]
      ]),
      elements: new Map(),
      elementPlugins: new Map()
    };

    mockDeps = {
      resolveElement: vi.fn(() => ({}))
    };
  });

  it('loadProject validates, builds and constructs EngineCore', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ scenarios: [] });

    expect(validatorModule.validateProject).toHaveBeenCalled();
    expect(builderModule.buildProject).toHaveBeenCalled();
  });

  it('setProgress calls masterTimeline.progress for grouped targets', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ scenarios: [] });

    engine.setProgress('grouped-id', 0.5);
    expect(mockMasterTimeline.progress).toHaveBeenCalledWith(0.5);
  });

  it('setProgress calls timeline.progress for ungrouped scenario index', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ scenarios: [] });

    engine.setProgress('0', 0.8);
    expect(mockTimeline.progress).toHaveBeenCalledWith(0.8);
  });

  it('setProgress clamps out-of-range progress values', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ scenarios: [] });

    engine.setProgress('0', 1.5);
    expect(mockTimeline.progress).toHaveBeenCalledWith(1.0);

    engine.setProgress('0', -0.5);
    expect(mockTimeline.progress).toHaveBeenCalledWith(0.0);
  });

  it('setProgress throws on unknown target', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ scenarios: [] });

    expect(() => engine.setProgress('unknown-id', 0.5)).toThrow(/no group or scenario found/);
  });

  it('allows subscribing before project is loaded, queueing and wiring them on load', async () => {
    const customResult = {
      scenarios: [
        {
          scenarioIndex: 0,
          sceneId: 'my-scene-id',
          triggerType: 'scroll-scrub',
          triggerConfig: {},
          timeline: mockTimeline
        }
      ],
      timelineGroups: new Map(),
      elements: new Map([
        ['rocket-track', { proxy: { x: 100 } }]
      ]),
      elementPlugins: new Map()
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(customResult);

    const engine = createEditorEngine(mockDeps);

    const callback = vi.fn();
    const unsubscribe = engine.subscribe('rocket-track', callback);

    expect(callback).not.toHaveBeenCalled();

    // Now load project
    await engine.loadProject({});

    // Upon load, it should wire and trigger callback synchronously with the proxy snapshot
    expect(callback).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ x: 100 });

    // Verify unsubscribe works
    unsubscribe();
  });

  it('EditorEngine.js does not contain ScrollTrigger', () => {
    const sourcePath = path.resolve(__dirname, '../EditorEngine.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('ScrollTrigger');
  });
});
