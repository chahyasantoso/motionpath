import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProductionEngine } from '../ProductionEngine.js';

describe('resolveMotion and mountTimeline API tests', () => {
  let mockDeps;

  beforeEach(() => {
    mockDeps = {
      resolveElement: vi.fn((id) => ({ id }))
    };
  });

  const validProject = {
    schemaVersion: 2,
    projectId: 'demo',
    templates: [
      {
        templateId: 'tpl.fade',
        duration: 2.0,
        transformOrigin: '50% 50%',
        keyframes: {
          opacity: {
            stops: [
              { p: 0, v: 0 },
              { p: 1, v: 1 }
            ]
          }
        }
      }
    ],
    motions: [
      {
        motionId: 'timelineMotion',
        driver: {
          type: 'timeline',
          sectionId: 'sec1',
          trigger: { type: 'time', duration: 1 }
        },
        tracks: [
          {
            id: 'tr1',
            keyframes: {
              x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] }
            }
          }
        ]
      },
      {
        motionId: 'delegateMotion',
        driver: {
          type: 'delegate'
        },
        tracks: [
          {
            id: 'tr2',
            use: 'tpl.fade'
          },
          {
            id: 'tr3',
            use: 'tpl.fade',
            keyframes: {
              opacity: {
                stops: [
                  { p: 0, v: 0.5 },
                  { p: 1, v: 0.8 }
                ]
              }
            }
          }
        ]
      }
    ]
  };



  it('resolveMotion works on delegate motion and throws on timeline motion', async () => {
    const engine = createProductionEngine(mockDeps);
    await engine.loadProject(validProject);

    expect(() => engine.resolveMotion('timelineMotion', 0.5)).toThrow(/is not a delegate motion/);
    expect(() => engine.resolveMotion('nonexistent', 0.5)).toThrow(/not found/);

    const result = engine.resolveMotion('delegateMotion', 0.5);
    expect(result).toHaveProperty('tr2');
    expect(result).toHaveProperty('tr3');

    // tr2 inherits tpl.fade (0 at p=0, 1 at p=1 -> 0.5 at p=0.5)
    expect(result.tr2.opacity).toBeCloseTo(0.5);

    // tr3 overrides opacity with locally defined keyframes (0.5 at p=0, 0.8 at p=1 -> 0.65 at p=0.5)
    expect(result.tr3.opacity).toBeCloseTo(0.65);
  });

  it('resolveMotion applies runtime overrides correctly', async () => {
    const engine = createProductionEngine(mockDeps);
    await engine.loadProject(validProject);

    const result = engine.resolveMotion('delegateMotion', 0.5, {
      tr2: {
        keyframes: {
          opacity: {
            stops: [
              { p: 0, v: 0.2 },
              { p: 1, v: 0.6 }
            ]
          }
        }
      }
    });

    // tr2 opacity overrides should yield 0.4 at p=0.5
    expect(result.tr2.opacity).toBeCloseTo(0.4);
  });

  it('resolveMotion reuses a cached tween across calls with no override (no rebuild per call)', async () => {
    const { gsap } = await import('gsap');
    const engine = createProductionEngine(mockDeps);
    await engine.loadProject(validProject);

    const toSpy = vi.spyOn(gsap, 'to');

    engine.resolveMotion('delegateMotion', 0.1);
    engine.resolveMotion('delegateMotion', 0.5);
    engine.resolveMotion('delegateMotion', 0.9);

    // Two tracks (tr2, tr3), each called 3x with no override -> exactly
    // one gsap.to() per track across all three calls, not three.
    expect(toSpy).toHaveBeenCalledTimes(2);

    toSpy.mockRestore();
  });

  it('resolveMotion does not cache a track resolved with an override (rebuilds every call)', async () => {
    const { gsap } = await import('gsap');
    const engine = createProductionEngine(mockDeps);
    await engine.loadProject(validProject);

    const toSpy = vi.spyOn(gsap, 'to');
    const override = {
      tr2: { keyframes: { opacity: { stops: [{ p: 0, v: 0.2 }, { p: 1, v: 0.6 }] } } }
    };

    engine.resolveMotion('delegateMotion', 0.1, override);
    engine.resolveMotion('delegateMotion', 0.5, override);

    // tr2 rebuilt on every call (2x, one per resolveMotion call) since it
    // carries an override; tr3 has no override so it's cached (1x total).
    expect(toSpy).toHaveBeenCalledTimes(3);

    toSpy.mockRestore();
  });

  it('resolveMotion throws with context when a plugin compose() call fails, instead of silently swallowing it', async () => {
    const engine = createProductionEngine(mockDeps);
    await engine.loadProject(validProject);

    const { resolvePluginForKey } = await import('../../domain/plugins.js');
    const opacityPlugin = resolvePluginForKey('opacity');
    const originalCompose = opacityPlugin.compose;
    opacityPlugin.compose = () => { throw new Error('boom'); };

    try {
      expect(() => engine.resolveMotion('delegateMotion', 0.5)).toThrow(/plugin compose failed.*delegateMotion.*tr2.*boom/s);
    } finally {
      opacityPlugin.compose = originalCompose;
    }
  });
});
