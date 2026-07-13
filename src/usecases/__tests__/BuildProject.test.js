/**
 * @vitest-environment jsdom
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { buildProject, ensureLoaded, _resetLoadPromises } from '../BuildProject.js';

let mockResolvePlugin = () => null;

vi.mock('../../domain/plugins.js', () => {
  return {
    resolvePluginForKey: (key) => mockResolvePlugin(key)
  };
});

describe('builder unit and integration tests', () => {
  let mockDom;
  let deps;

  beforeEach(() => {
    mockDom = document.createElement('div');
    deps = {
      resolveElement: vi.fn(() => mockDom)
    };
    _resetLoadPromises();
  });

  describe('merge pipeline', () => {
    it('two properties contributing to different percent keys', async () => {
      const pluginA = {
        keys: ['propA'],
        contribute: (prop, stops) => ({
          percentPatch: { '0%': { propA: 10 } },
          tweenVars: {}
        })
      };
      const pluginB = {
        keys: ['propB'],
        contribute: (prop, stops) => ({
          percentPatch: { '100%': { propB: 20 } },
          tweenVars: {}
        })
      };
      mockResolvePlugin = (key) => {
        if (key === 'propA') return pluginA;
        if (key === 'propB') return pluginB;
        return null;
      };

      const project = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1'
          },
          tracks: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [{ p: 0, v: 10 }, { p: 1, v: 20 }] },
              propB: { stops: [{ p: 0, v: 5 }, { p: 1, v: 15 }] }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);
      expect(result.trackPlugins.get('el-1')).toContain(pluginA);
      expect(result.trackPlugins.get('el-1')).toContain(pluginB);

      const timeline = result.motions[0].timeline;
      const tweens = timeline.getChildren();
      expect(tweens).toHaveLength(1);
      const tween = tweens[0];
      expect(tween.vars.keyframes).toEqual({
        '0%': { propA: 10 },
        '100%': { propB: 20 }
      });
    });

    it('two properties contributing to the same percent key, different props', async () => {
      const pluginA = {
        keys: ['propA'],
        contribute: () => ({
          percentPatch: { '50%': { propA: 10 } }
        })
      };
      const pluginB = {
        keys: ['propB'],
        contribute: () => ({
          percentPatch: { '50%': { propB: 20 } }
        })
      };
      mockResolvePlugin = (key) => {
        if (key === 'propA') return pluginA;
        if (key === 'propB') return pluginB;
        return null;
      };

      const project = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1'
          },
          tracks: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [{ p: 0, v: 0 }, { p: 0.5, v: 10 }] },
              propB: { stops: [{ p: 0, v: 0 }, { p: 0.5, v: 20 }] }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);
      const tween = result.motions[0].timeline.getChildren()[0];
      expect(tween.vars.keyframes).toEqual({
        '50%': { propA: 10, propB: 20 }
      });
    });

    it('two properties contributing conflicting tweenVars values: throws', async () => {
      const pluginA = {
        keys: ['propA'],
        contribute: () => ({
          percentPatch: {},
          tweenVars: { transformOrigin: 'top left' }
        })
      };
      const pluginB = {
        keys: ['propB'],
        contribute: () => ({
          percentPatch: {},
          tweenVars: { transformOrigin: 'bottom right' }
        })
      };
      mockResolvePlugin = (key) => {
        if (key === 'propA') return pluginA;
        if (key === 'propB') return pluginB;
        return null;
      };

      const project = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1'
          },
          tracks: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
              propB: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] }
            }
          }]
        }]
      };

      await expect(buildProject(project, deps)).rejects.toThrow(/tweenVars collision/);
    });

    it('two properties contributing the same tweenVars key with the same value: does not throw', async () => {
      const pluginA = {
        keys: ['propA'],
        contribute: () => ({
          percentPatch: {},
          tweenVars: { transformOrigin: 'center center' }
        })
      };
      const pluginB = {
        keys: ['propB'],
        contribute: () => ({
          percentPatch: {},
          tweenVars: { transformOrigin: 'center center' }
        })
      };
      mockResolvePlugin = (key) => {
        if (key === 'propA') return pluginA;
        if (key === 'propB') return pluginB;
        return null;
      };

      const project = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1'
          },
          tracks: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
              propB: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);
      const tween = result.motions[0].timeline.getChildren()[0];
      expect(tween.vars.transformOrigin).toBe('center center');
    });

    it('throws on ease collision at same percent key', async () => {
      const pluginA = {
        keys: ['propA'],
        contribute: () => ({
          percentPatch: { '50%': { propA: 10, ease: 'power1.out' } }
        })
      };
      const pluginB = {
        keys: ['propB'],
        contribute: () => ({
          percentPatch: { '50%': { propB: 20, ease: 'power2.in' } }
        })
      };
      mockResolvePlugin = (key) => {
        if (key === 'propA') return pluginA;
        if (key === 'propB') return pluginB;
        return null;
      };

      const project = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1'
          },
          tracks: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [{ p: 0, v: 0 }, { p: 0.5, v: 10 }] },
              propB: { stops: [{ p: 0, v: 0 }, { p: 0.5, v: 20 }] }
            }
          }]
        }]
      };

      await expect(buildProject(project, deps)).rejects.toThrow(/Ease collision/);
    });
  });

  describe('lazy plugin loading', () => {
    it('concurrent ensureLoaded calls for the same plugin fire load() exactly once', async () => {
      const lazyPlugin = {
        lazy: true,
        load: vi.fn(() => new Promise(resolve => setTimeout(resolve, 20)))
      };
      await Promise.all([ensureLoaded(lazyPlugin), ensureLoaded(lazyPlugin)]);
      expect(lazyPlugin.load).toHaveBeenCalledTimes(1);
    });

    it('sequential buildProject calls do not re-invoke load() for the same plugin', async () => {
      const lazyPlugin = {
        keys: ['splitText'],
        lazy: true,
        load: vi.fn(async () => {}),
        contribute: () => ({ percentPatch: {}, tweenVars: {} })
      };
      mockResolvePlugin = () => lazyPlugin;

      const project = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1'
          },
          tracks: [{ id: 'el-1', keyframes: { splitText: { stops: [{ p: 0, v: '' }, { p: 1, v: '' }] } } }]
        }]
      };

      await buildProject(project, deps);
      await buildProject(project, deps);
      expect(lazyPlugin.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('motion and group timeline construction', () => {
    it('applies stagger offsets correctly', async () => {
      const pluginA = {
        keys: ['propA'],
        contribute: () => ({ percentPatch: {}, tweenVars: {} })
      };
      mockResolvePlugin = () => pluginA;

      const project = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1'
          },
          stagger: 0.5,
          tracks: [
            { id: 'el-1', keyframes: { propA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } },
            { id: 'el-2', keyframes: { propA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }
          ]
        }]
      };

      const result = await buildProject(project, deps);
      const timeline = result.motions[0].timeline;
      const children = timeline.getChildren();
      expect(children).toHaveLength(2);
      expect(children[0].startTime()).toBe(0);
      expect(children[1].startTime()).toBe(0.5);
    });

    it('grouped motions nest sequentially and record primaryMotionIndex', async () => {
      const pluginA = {
        keys: ['propA'],
        contribute: () => ({ percentPatch: {}, tweenVars: {} })
      };
      mockResolvePlugin = () => pluginA;

      const project = {
        schemaVersion: 2,
        motions: [
          {
            driver: {
              type: 'timeline',
              sectionId: 'scene-1',
              timelineId: 'group-1'
            },
            tracks: [{ id: 'el-1', keyframes: { propA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }]
          },
          {
            driver: {
              type: 'timeline',
              sectionId: 'scene-2',
              timelineId: 'group-1',
              primary: true
            },
            tracks: [{ id: 'el-1', keyframes: { propA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }]
          }
        ]
      };

      const result = await buildProject(project, deps);
      const groupBuild = result.timelineGroups.get('group-1');
      expect(groupBuild).toBeDefined();
      expect(groupBuild.primaryMotionIndex).toBe(1);

      const master = groupBuild.masterTimeline;
      const children = master.getChildren(false, false, true);
      expect(children).toHaveLength(2);
      expect(children[0]).toBe(result.motions[0].timeline);
      expect(children[1]).toBe(result.motions[1].timeline);
    });

    it('applies trigger.delay to motion timeline total duration for time triggers', async () => {
      const pluginA = {
        keys: ['propA'],
        contribute: () => ({ percentPatch: {}, tweenVars: {} })
      };
      mockResolvePlugin = () => pluginA;

      const projectWithDelay = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1',
            trigger: { type: 'time', delay: 0.5, duration: 1 }
          },
          tracks: [{ id: 'el-1', keyframes: { propA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }]
        }]
      };

      const projectWithoutDelay = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1',
            trigger: { type: 'time', duration: 1 }
          },
          tracks: [{ id: 'el-1', keyframes: { propA: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }]
        }]
      };

      const resWithDelay = await buildProject(projectWithDelay, deps);
      const resWithoutDelay = await buildProject(projectWithoutDelay, deps);

      expect(resWithDelay.motions[0].timeline.delay()).toBe(0.5);
      expect(resWithoutDelay.motions[0].timeline.delay()).toBe(0);
    });
  });

  describe('end-to-end compile with real plugins', () => {
    it('end-to-end compile with real plugins', async () => {
      const actualPlugins = await vi.importActual('../../domain/plugins.js');
      mockResolvePlugin = actualPlugins.resolvePluginForKey;

      const project = {
        schemaVersion: 2,
        motions: [
          {
            driver: {
              type: 'timeline',
              sectionId: 'scene-1',
              timelineId: 'group-1',
              trigger: { type: 'time', duration: 3 }
            },
            tracks: [{
              id: 'el-1',
              keyframes: {
                x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] },
                opacity: { stops: [{ p: 0, v: 1 }, { p: 0.5, v: 0.5 }] }
              }
            }]
          },
          {
            driver: {
              type: 'timeline',
              sectionId: 'scene-2',
              timelineId: 'group-1',
              primary: true,
              trigger: { type: 'scroll', scrub: true }
            },
            tracks: [{
              id: 'el-1',
              keyframes: {
                y: { stops: [{ p: 0, v: 0 }, { p: 1, v: 200 }] }
              }
            }]
          }
        ]
      };

      const result = await buildProject(project, deps);
      expect(result.trackPlugins.get('el-1')).toBeDefined();
      expect(result.motions).toHaveLength(2);
      expect(result.motions[0].timeline.paused()).toBe(true);
      expect(result.motions[1].timeline.paused()).toBe(true);

      const group = result.timelineGroups.get('group-1');
      expect(group).toBeDefined();
      expect(group.masterTimeline.paused()).toBe(true);
      expect(group.primaryMotionIndex).toBe(1);
    });
  });

  describe('proxy-not-DOM (critical §9)', () => {
    it('tweens proxy object, never touches domNode style or attributes', async () => {
      const actualPlugins = await vi.importActual('../../domain/plugins.js');
      mockResolvePlugin = actualPlugins.resolvePluginForKey;

      const styleSetSpy = vi.fn();
      Object.defineProperty(mockDom, 'style', {
        get: () => new Proxy({}, { set: styleSetSpy }),
        configurable: true
      });
      const setAttributeSpy = vi.spyOn(mockDom, 'setAttribute');

      const project = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1',
            trigger: { type: 'time', duration: 1 }
          },
          tracks: [{
            id: 'el-blur',
            keyframes: {
              blur: { stops: [{ p: 0, v: 0 }, { p: 1, v: 20 }] }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);

      const trackBuild = result.tracks.get('el-blur');
      expect(trackBuild).toBeDefined();
      const { proxy, domNode } = trackBuild;

      const tween = result.motions[0].timeline.getChildren()[0];
      tween.progress(0.5);

      expect('blur' in proxy).toBe(true);
      expect(proxy.blur).toBeGreaterThan(0);

      expect(deps.resolveElement).not.toHaveBeenCalled();
      expect(styleSetSpy).not.toHaveBeenCalled();
      expect(setAttributeSpy).not.toHaveBeenCalled();
      expect(domNode).toBeUndefined();
    });
  });

  describe('imageSequence plugin integration', () => {
    it('compiles imageSequence keyframes and drives imageSequenceIndex in tweening', async () => {
      const actualPlugins = await vi.importActual('../../domain/plugins.js');
      mockResolvePlugin = actualPlugins.resolvePluginForKey;

      const project = {
        schemaVersion: 2,
        motions: [{
          driver: {
            type: 'timeline',
            sectionId: 'scene-1',
            trigger: { type: 'time', duration: 1 }
          },
          tracks: [{
            id: 'el-seq',
            keyframes: {
              imageSequence: {
                frames: ['001.jpg', '002.jpg', '003.jpg'],
                stops: [
                  { p: 0, v: 0 },
                  { p: 1, v: 2 }
                ]
              }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);
      const trackBuild = result.tracks.get('el-seq');
      expect(trackBuild).toBeDefined();

      const { proxy } = trackBuild;
      expect(proxy.imageSequenceIndex).toBe(0);

      const tween = result.motions[0].timeline.getChildren()[0];

      tween.progress(0.5);
      expect(proxy.imageSequenceIndex).toBeCloseTo(1);

      const composedMid = result.trackPlugins.get('el-seq')[0].compose(proxy, trackBuild.trackConfig);
      expect(composedMid).toEqual({ backgroundImage: 'url(002.jpg)' });

      tween.progress(1);
      expect(proxy.imageSequenceIndex).toBeCloseTo(2);
      const composedEnd = result.trackPlugins.get('el-seq')[0].compose(proxy, trackBuild.trackConfig);
      expect(composedEnd).toEqual({ backgroundImage: 'url(003.jpg)' });
    });
  });
});
