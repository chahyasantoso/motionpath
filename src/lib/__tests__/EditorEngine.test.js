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
      motions: [
        {
          motionIndex: 0,
          sectionId: 'scenario-0',
          timeline: mockTimeline
        },
        {
          motionIndex: 1,
          timelineId: 'grouped-id',
          sectionId: 'scenario-1',
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
      tracks: new Map(),
      trackPlugins: new Map()
    };

    mockDeps = {
      resolveElement: vi.fn(() => ({}))
    };
  });

  it('loadProject validates, builds and constructs EngineCore', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ motions: [] });

    expect(validatorModule.validateProject).toHaveBeenCalled();
    expect(builderModule.buildProject).toHaveBeenCalled();
  });

  it('setProgress calls masterTimeline.progress for grouped targets', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ motions: [] });

    engine.setProgress('grouped-id', 0.5);
    expect(mockMasterTimeline.progress).toHaveBeenCalledWith(0.5);
  });

  it('setProgress calls timeline.progress for ungrouped motion index', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ motions: [] });

    engine.setProgress('0', 0.8);
    expect(mockTimeline.progress).toHaveBeenCalledWith(0.8);
  });

  it('setProgress clamps out-of-range progress values', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ motions: [] });

    engine.setProgress('0', 1.5);
    expect(mockTimeline.progress).toHaveBeenCalledWith(1.0);

    engine.setProgress('0', -0.5);
    expect(mockTimeline.progress).toHaveBeenCalledWith(0.0);
  });

  it('setProgress throws on unknown target', async () => {
    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject({ motions: [] });

    expect(() => engine.setProgress('unknown-id', 0.5)).toThrow(/no group or motion found/);
  });

  it('allows subscribing before project is loaded, queueing and wiring them on load', async () => {
    const customResult = {
      motions: [
        {
          motionIndex: 0,
          sectionId: 'my-scene-id',
          triggerType: 'scroll-scrub',
          triggerConfig: {},
          timeline: mockTimeline
        }
      ],
      timelineGroups: new Map(),
      tracks: new Map([
        ['rocket-track', { proxy: { x: 100 } }]
      ]),
      trackPlugins: new Map()
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

  it('stale load is discarded when a second loadProject() supersedes it', async () => {
    // Simulate two overlapping loads — first resolves after second has already started.
    let resolveFirst;
    const firstBuild = new Promise(res => { resolveFirst = res; });
    const secondBuildResult = {
      motions: [{ motionIndex: 0, sectionId: 'second', timeline: { kill: vi.fn(), progress: vi.fn() } }],
      timelineGroups: new Map(),
      tracks: new Map(),
      trackPlugins: new Map(),
    };
    const firstBuildResult = {
      motions: [{ motionIndex: 0, sectionId: 'first', timeline: { kill: vi.fn(), progress: vi.fn() } }],
      timelineGroups: new Map(),
      tracks: new Map(),
      trackPlugins: new Map(),
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject
      .mockReturnValueOnce(firstBuild)
      .mockResolvedValueOnce(secondBuildResult);

    const engine = createEditorEngine(mockDeps);
    const first = engine.loadProject({});
    const second = engine.loadProject({});

    // Let the second load settle first
    await second;

    // Now resolve the first (stale) build — it should be killed and not wired
    resolveFirst(firstBuildResult);
    await first;

    expect(firstBuildResult.motions[0].timeline.kill).toHaveBeenCalled();
  });

  it('load is discarded when destroy() fires before buildProject resolves', async () => {
    let resolveBuild;
    const pendingBuild = new Promise(res => { resolveBuild = res; });
    const staleBuildResult = {
      motions: [{ motionIndex: 0, sectionId: 'stale', timeline: { kill: vi.fn(), progress: vi.fn() } }],
      timelineGroups: new Map(),
      tracks: new Map(),
      trackPlugins: new Map(),
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockReturnValue(pendingBuild);

    const engine = createEditorEngine(mockDeps);
    const load = engine.loadProject({});

    // Destroy the engine before the build resolves
    engine.destroy();

    // Now let the stale build resolve — it must be discarded
    resolveBuild(staleBuildResult);
    await load;

    expect(staleBuildResult.motions[0].timeline.kill).toHaveBeenCalled();
  });

  it('StrictMode regression: subscribe → destroy → subscribe → both loads resolve → only second subscriber is wired', async () => {
    // Simulates the exact React StrictMode double-invoke:
    //   1. Mount 1 — child subscribes (pending), parent starts loadProject #1
    //   2. Cleanup  — child unsubscribes, parent destroy()s
    //   3. Mount 2  — child subscribes again (pending), parent starts loadProject #2
    //   4. Both builds resolve (first build resolves last, as in a real race)
    // Expected: only the mount-2 subscriber is wired; the mount-1 subscriber is never called.

    const trackId = 'el-strict';
    const proxy = { x: 42 };
    const makeResult = () => ({
      motions: [{ motionIndex: 0, sectionId: 'scene', timeline: { kill: vi.fn(), progress: vi.fn() } }],
      timelineGroups: new Map(),
      tracks: new Map([[trackId, { proxy }]]),
      trackPlugins: new Map(),
    });

    let resolveFirst;
    const firstBuild = new Promise(res => { resolveFirst = res; });
    const secondBuildResult = makeResult();

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject
      .mockReturnValueOnce(firstBuild)
      .mockResolvedValueOnce(secondBuildResult);

    const engine = createEditorEngine(mockDeps);

    // --- Mount 1 ---
    const cb1 = vi.fn();
    const unsub1 = engine.subscribe(trackId, cb1); // goes to pending

    const load1 = engine.loadProject({});

    // --- StrictMode cleanup ---
    unsub1();           // cancel mount-1 subscription
    engine.destroy();   // clears pending, increments generation

    // --- Mount 2 ---
    const cb2 = vi.fn();
    engine.subscribe(trackId, cb2); // goes to fresh pending

    const load2 = engine.loadProject({});

    // Second build resolves first (normal async order)
    await load2;

    // First (stale) build resolves later — must be discarded
    resolveFirst(makeResult());
    await load1;

    // Only mount-2 subscriber wired
    expect(cb2).toHaveBeenCalledWith({ x: 42 });
    // Mount-1 subscriber must never have been called
    expect(cb1).not.toHaveBeenCalled();
  });

  it('commit-path scoping regression: pending subscriptions survive a successful commit', async () => {
    // Regression for the bug where _cleanup() called clearCore() during the
    // successful commit step, wiping pending subscriptions before setCore() could
    // flush them. Simulates child-before-parent mount order:
    //   1. Child subscribes → goes to pending (no core yet)
    //   2. Parent loadProject() starts → async build
    //   3. Build resolves → commit → setCore() must flush the pending entry
    // Expected: the subscriber's callback is invoked with the initial proxy state.

    const trackId = 'el-commit';
    const proxy = { opacity: 0.5 };
    const buildResult = {
      motions: [{ motionIndex: 0, sectionId: 'scene', timeline: { kill: vi.fn(), progress: vi.fn() } }],
      timelineGroups: new Map(),
      tracks: new Map([[trackId, { proxy }]]),
      trackPlugins: new Map(),
    };

    validatorModule.validateProject.mockReturnValue([]);
    builderModule.buildProject.mockResolvedValue(buildResult);

    const engine = createEditorEngine(mockDeps);

    // Subscribe BEFORE loadProject — simulates child effect running before parent effect
    const callback = vi.fn();
    engine.subscribe(trackId, callback);

    // Callback must not fire yet (no core)
    expect(callback).not.toHaveBeenCalled();

    // Normal successful load
    await engine.loadProject({});

    // After commit, the pending subscription must have been flushed by setCore()
    // and the initial proxy state replayed synchronously
    expect(callback).toHaveBeenCalledWith({ opacity: 0.5 });
  });
});
