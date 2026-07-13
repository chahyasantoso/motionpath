import fs from 'fs';
import path from 'path';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as validatorModule from '../../validators/index.js';
import { createEditorEngine } from '../EditorEngine.js';

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

describe('EditorEngine', () => {
  let mockDeps;
  let basicSchema;

  beforeEach(() => {
    vi.clearAllMocks();
    validatorModule.validateProject.mockReturnValue([]);

    mockDeps = {
      resolveElement: vi.fn((id) => ({ id }))
    };

    basicSchema = {
      templates: [],
      motions: [
        {
          motionId: 'motion-a',
          driver: { type: 'gsap-timeline', trigger: { autoplay: false } },
          tracks: [
            { id: 'track-a', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] } } }
          ]
        },
        {
          motionId: 'motion-b',
          driver: { type: 'gsap-timeline', trigger: { autoplay: false } },
          tracks: [
            { id: 'track-b', keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }
          ]
        }
      ]
    };
  });

  it('loadProject validates schema and eagerly mounts instances', async () => {
    const engine = createEditorEngine(mockDeps);
    await engine.loadProject(basicSchema);

    expect(validatorModule.validateProject).toHaveBeenCalledWith(basicSchema);
  });

  it('throws on invalid schema', async () => {
    validatorModule.validateProject.mockReturnValue([
      { severity: 'error', message: 'Bad field' }
    ]);

    const engine = createEditorEngine(mockDeps);
    await expect(engine.loadProject({})).rejects.toThrow(/Bad field/);
  });

  it('all instances suppress their own driver (no ScrollTrigger, no autoplay)', async () => {
    const scrollSchema = {
      templates: [],
      motions: [
        {
          motionId: 'scroll-motion',
          driver: { type: 'gsap-scroll', trigger: { trigger: '#el', scrub: true } },
          tracks: [
            { id: 'track-s', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 50 }] } } }
          ]
        }
      ]
    };

    ScrollTrigger.create.mockClear();
    const engine = createEditorEngine(mockDeps);
    await engine.loadProject(scrollSchema);

    expect(ScrollTrigger.create).not.toHaveBeenCalled();
  });

  describe('setProgress', () => {
    it('seeks ungrouped motion by motionId', async () => {
      const engine = createEditorEngine(mockDeps);
      await engine.loadProject(basicSchema);

      engine.setProgress('motion-a', 0.5);

      const result = engine.compose('track-a');
      expect(result).toHaveProperty('x');
    });

    it('seeks grouped motion by timelineId', async () => {
      const groupSchema = {
        templates: [],
        motions: [
          {
            motionId: 'group-a',
            driver: { type: 'timeline', timelineId: 'hero-tl', trigger: { type: 'time' } },
            tracks: [
              { id: 'track-ga', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] } } }
            ]
          },
          {
            motionId: 'group-b',
            driver: { type: 'timeline', timelineId: 'hero-tl', primary: true, trigger: { type: 'time', duration: 1 } },
            tracks: [
              { id: 'track-gb', keyframes: { y: { stops: [{ p: 0, v: 0 }, { p: 1, v: 50 }] } } }
            ]
          }
        ]
      };

      const engine = createEditorEngine(mockDeps);
      await engine.loadProject(groupSchema);

      engine.setProgress('hero-tl', 0.5);
    });

    it('clamps progress to [0, 1]', async () => {
      const engine = createEditorEngine(mockDeps);
      await engine.loadProject(basicSchema);

      expect(() => engine.setProgress('motion-a', 1.5)).not.toThrow();
      expect(() => engine.setProgress('motion-a', -0.5)).not.toThrow();
    });

    it('throws on unknown target', async () => {
      const engine = createEditorEngine(mockDeps);
      await engine.loadProject(basicSchema);

      expect(() => engine.setProgress('unknown-id', 0.5)).toThrow(/no group or motion found/);
    });

    it('throws when no project loaded', () => {
      const engine = createEditorEngine(mockDeps);
      expect(() => engine.setProgress('motion-a', 0.5)).toThrow(/no project loaded/);
    });

    it('delegate motions are not mounted, so setProgress throws for them', async () => {
      const delegateSchema = {
        templates: [],
        motions: [
          {
            motionId: 'my-delegate',
            driver: { type: 'delegate' },
            tracks: [{ id: 'tr1', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] } } }]
          }
        ]
      };

      const engine = createEditorEngine(mockDeps);
      await engine.loadProject(delegateSchema);

      expect(() => engine.setProgress('my-delegate', 0.5)).toThrow(/no group or motion found for target "my-delegate"/);
    });
  });

  describe('subscribe', () => {
    it('subscribes after load and receives initial snapshot', async () => {
      const engine = createEditorEngine(mockDeps);
      await engine.loadProject(basicSchema);

      const callback = vi.fn();
      engine.subscribe('track-a', callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const snapshot = callback.mock.calls[0][0];
      expect(snapshot).toHaveProperty('x');
      expect(snapshot).toHaveProperty('progress');
    });

    it('subscribes before load (deferred) and flushes on load', async () => {
      const engine = createEditorEngine(mockDeps);

      const callback = vi.fn();
      engine.subscribe('track-a', callback);

      expect(callback).not.toHaveBeenCalled();

      await engine.loadProject(basicSchema);

      expect(callback).toHaveBeenCalledTimes(1);
      const snapshot = callback.mock.calls[0][0];
      expect(snapshot).toHaveProperty('x');
    });

    it('unsubscribe cancels deferred subscription', async () => {
      const engine = createEditorEngine(mockDeps);

      const callback = vi.fn();
      const unsub = engine.subscribe('track-a', callback);

      unsub();
      await engine.loadProject(basicSchema);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('compose', () => {
    it('returns composed CSS patch for a track', async () => {
      const engine = createEditorEngine(mockDeps);
      await engine.loadProject(basicSchema);

      const result = engine.compose('track-a');
      expect(result).toHaveProperty('x');
    });

    it('returns empty object for unknown track', async () => {
      const engine = createEditorEngine(mockDeps);
      await engine.loadProject(basicSchema);

      const result = engine.compose('nonexistent');
      expect(result).toEqual({});
    });

    it('returns empty object before project is loaded', () => {
      const engine = createEditorEngine(mockDeps);
      const result = engine.compose('track-a');
      expect(result).toEqual({});
    });
  });

  describe('destroySection', () => {
    it('destroys instances belonging to a section', async () => {
      const sectionSchema = {
        templates: [],
        motions: [
          {
            motionId: 'sec-motion',
            driver: { type: 'gsap-timeline', sectionId: 'scene-1', trigger: { autoplay: false } },
            tracks: [
              { id: 'track-sec', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] } } }
            ]
          },
          {
            motionId: 'other-motion',
            driver: { type: 'gsap-timeline', sectionId: 'scene-2', trigger: { autoplay: false } },
            tracks: [
              { id: 'track-other', keyframes: { y: { stops: [{ p: 0, v: 0 }, { p: 1, v: 20 }] } } }
            ]
          }
        ]
      };

      const engine = createEditorEngine(mockDeps);
      await engine.loadProject(sectionSchema);

      engine.destroySection('scene-1');

      expect(() => engine.setProgress('sec-motion', 0.5)).toThrow(/no group or motion found/);
      expect(() => engine.setProgress('other-motion', 0.5)).not.toThrow();
    });
  });

  it('resolveMotion works for delegate motions', async () => {
    const delegateSchema = {
      templates: [],
      motions: [
        {
          motionId: 'resolver-motion',
          driver: { type: 'delegate' },
          tracks: [
            { id: 'track-r', keyframes: { scale: { stops: [{ p: 0, v: 1 }, { p: 1, v: 2 }] } } }
          ]
        }
      ]
    };

    const engine = createEditorEngine(mockDeps);
    await engine.loadProject(delegateSchema);

    const result = engine.resolveMotion('resolver-motion', 0.5);
    expect(result).toHaveProperty('track-r');
    expect(result['track-r']).toHaveProperty('scale');
  });

  it('destroy cleans up all state', async () => {
    const engine = createEditorEngine(mockDeps);
    await engine.loadProject(basicSchema);

    expect(() => engine.destroy()).not.toThrow();
    expect(() => engine.setProgress('motion-a', 0.5)).toThrow();
  });

  it('EditorEngine.js source does not contain ScrollTrigger', () => {
    const sourcePath = path.resolve(__dirname, '../EditorEngine.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('ScrollTrigger');
  });

  describe('stale load guard', () => {
    it('second loadProject supersedes the first', async () => {
      const schema2 = {
        templates: [],
        motions: [
          {
            motionId: 'motion-second',
            driver: { type: 'gsap-timeline', trigger: { autoplay: false } },
            tracks: [
              { id: 'track-second', keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 50 }] } } }
            ]
          }
        ]
      };

      const engine = createEditorEngine(mockDeps);

      await engine.loadProject(basicSchema);
      await engine.loadProject(schema2);

      expect(() => engine.setProgress('motion-second', 0.5)).not.toThrow();
      expect(() => engine.setProgress('motion-a', 0.5)).toThrow(/no group or motion found/);
    });
  });

  describe('StrictMode regression', () => {
    it('subscribe → destroy → subscribe → load: only second subscriber wired', async () => {
      const engine = createEditorEngine(mockDeps);

      // Mount 1
      const cb1 = vi.fn();
      const unsub1 = engine.subscribe('track-a', cb1);

      // StrictMode cleanup
      unsub1();
      engine.destroy();

      // Mount 2
      const cb2 = vi.fn();
      engine.subscribe('track-a', cb2);

      await engine.loadProject(basicSchema);

      expect(cb2).toHaveBeenCalled();
      expect(cb1).not.toHaveBeenCalled();
    });
  });
});
