/**
 * @vitest-environment jsdom
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { buildProject, resolveDirection, ensureLoaded } from '../builder.js';

let mockResolvePlugin = () => null;

vi.mock('../plugins.js', () => {
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
  });

  describe('resolveDirection', () => {
    it('stops.length >= 2: returns stops unchanged', () => {
      const stops = [{ p: 0, v: 10 }, { p: 1, v: 20 }];
      const res = resolveDirection(stops, 'fromTo', 0);
      expect(res).toBe(stops);
    });

    it('stops.length === 1, p near 0: returns expanded stops', () => {
      const stops = [{ p: 0.0005, v: 10 }];
      const res = resolveDirection(stops, undefined, 5);
      expect(res).toEqual([{ p: 0.0005, v: 10 }, { p: 1, v: 5 }]);
    });

    it('stops.length === 1, p near 1: returns expanded stops', () => {
      const stops = [{ p: 0.9995, v: 10 }];
      const res = resolveDirection(stops, undefined, 5);
      expect(res).toEqual([{ p: 0, v: 5 }, { p: 0.9995, v: 10 }]);
    });

    // §4 mandatory test cases — must match exactly as stated in the spec
    it('spec §4: [{p:0,v:10}], undefined, 0 → [{p:0,v:10},{p:1,v:0}]', () => {
      expect(resolveDirection([{ p: 0, v: 10 }], undefined, 0))
        .toEqual([{ p: 0, v: 10 }, { p: 1, v: 0 }]);
    });

    it('spec §4: [{p:1,v:10}], undefined, 0 → [{p:0,v:0},{p:1,v:10}]', () => {
      expect(resolveDirection([{ p: 1, v: 10 }], undefined, 0))
        .toEqual([{ p: 0, v: 0 }, { p: 1, v: 10 }]);
    });

    it('spec §4: two stops returned unchanged regardless of direction arg', () => {
      const stops = [{ p: 0, v: 10 }, { p: 1, v: 20 }];
      expect(resolveDirection(stops, 'fromTo', 0)).toBe(stops);
    });

    it('spec §4: [{p:0.0007,v:5}] treated as p≈0 (within epsilon 0.001)', () => {
      expect(resolveDirection([{ p: 0.0007, v: 5 }], undefined, 0))
        .toEqual([{ p: 0.0007, v: 5 }, { p: 1, v: 0 }]);
    });
  });

  describe('merge pipeline', () => {
    it('two properties contributing to different percent keys', async () => {
      const pluginA = {
        keys: ['propA'],
        getNaturalValue: () => 0,
        contribute: (prop, stops) => ({
          percentPatch: { '0%': { propA: 10 } },
          tweenVars: {}
        })
      };
      const pluginB = {
        keys: ['propB'],
        getNaturalValue: () => 0,
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
        scenarios: [{
          sceneId: 'scene-1',
          elements: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [{ p: 0, v: 10 }, { p: 1, v: 20 }] },
              propB: { stops: [{ p: 0, v: 5 }, { p: 1, v: 15 }] }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);
      expect(result.elementPlugins.get('el-1')).toContain(pluginA);
      expect(result.elementPlugins.get('el-1')).toContain(pluginB);

      const timeline = result.scenarios[0].timeline;
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
        getNaturalValue: () => 0,
        contribute: () => ({
          percentPatch: { '50%': { propA: 10 } }
        })
      };
      const pluginB = {
        keys: ['propB'],
        getNaturalValue: () => 0,
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
        scenarios: [{
          sceneId: 'scene-1',
          elements: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [{ p: 0.5, v: 10 }] },
              propB: { stops: [{ p: 0.5, v: 20 }] }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);
      const tween = result.scenarios[0].timeline.getChildren()[0];
      expect(tween.vars.keyframes).toEqual({
        '50%': { propA: 10, propB: 20 }
      });
    });

    it('two properties contributing conflicting tweenVars values: throws', async () => {
      const pluginA = {
        keys: ['propA'],
        getNaturalValue: () => 0,
        contribute: () => ({
          percentPatch: {},
          tweenVars: { transformOrigin: 'top left' }
        })
      };
      const pluginB = {
        keys: ['propB'],
        getNaturalValue: () => 0,
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
        scenarios: [{
          sceneId: 'scene-1',
          elements: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [] },
              propB: { stops: [] }
            }
          }]
        }]
      };

      await expect(buildProject(project, deps)).rejects.toThrow(/tweenVars collision/);
    });

    it('two properties contributing the same tweenVars key with the same value: does not throw', async () => {
      const pluginA = {
        keys: ['propA'],
        getNaturalValue: () => 0,
        contribute: () => ({
          percentPatch: {},
          tweenVars: { transformOrigin: 'center center' }
        })
      };
      const pluginB = {
        keys: ['propB'],
        getNaturalValue: () => 0,
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
        scenarios: [{
          sceneId: 'scene-1',
          elements: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [] },
              propB: { stops: [] }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);
      const tween = result.scenarios[0].timeline.getChildren()[0];
      expect(tween.vars.transformOrigin).toBe('center center');
    });

    it('throws on ease collision at same percent key', async () => {
      const pluginA = {
        keys: ['propA'],
        getNaturalValue: () => 0,
        contribute: () => ({
          percentPatch: { '50%': { propA: 10, ease: 'power1.out' } }
        })
      };
      const pluginB = {
        keys: ['propB'],
        getNaturalValue: () => 0,
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
        scenarios: [{
          sceneId: 'scene-1',
          elements: [{
            id: 'el-1',
            keyframes: {
              propA: { stops: [{ p: 0.5, v: 10 }] },
              propB: { stops: [{ p: 0.5, v: 20 }] }
            }
          }]
        }]
      };

      await expect(buildProject(project, deps)).rejects.toThrow(/Ease collision/);
    });
  });

  describe('lazy plugin loading', () => {
    it('concurrent ensureLoaded calls for the same plugin fire load() exactly once', async () => {
      // This tests the actual race the spec warned about: two callers firing
      // ensureLoaded without awaiting between them. The module-level Map ensures
      // only one Promise is ever created. A boolean-flag implementation would
      // fail this test because both calls would pass the `if (!loaded)` check
      // before either resolves.
      const lazyPlugin = {
        lazy: true,
        load: vi.fn(() => new Promise(resolve => setTimeout(resolve, 20)))
      };
      // Both calls fire before either resolves — real concurrency
      await Promise.all([ensureLoaded(lazyPlugin), ensureLoaded(lazyPlugin)]);
      expect(lazyPlugin.load).toHaveBeenCalledTimes(1);
    });

    it('sequential buildProject calls do not re-invoke load() for the same plugin', async () => {
      // Module-level Map persists across buildProject calls.
      const lazyPlugin = {
        keys: ['splitText'],
        lazy: true,
        load: vi.fn(async () => {}),
        getNaturalValue: () => '',
        contribute: () => ({ percentPatch: {}, tweenVars: {} })
      };
      mockResolvePlugin = () => lazyPlugin;

      const project = {
        scenarios: [{
          sceneId: 'scene-1',
          elements: [{ id: 'el-1', keyframes: { splitText: { stops: [] } } }]
        }]
      };

      await buildProject(project, deps);
      await buildProject(project, deps);
      expect(lazyPlugin.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('scenario and group timeline construction', () => {
    it('applies stagger offsets correctly', async () => {
      const pluginA = {
        keys: ['propA'],
        getNaturalValue: () => 0,
        contribute: () => ({ percentPatch: {}, tweenVars: {} })
      };
      mockResolvePlugin = () => pluginA;

      const project = {
        scenarios: [{
          sceneId: 'scene-1',
          stagger: 0.5,
          elements: [
            { id: 'el-1', keyframes: { propA: { stops: [] } } },
            { id: 'el-2', keyframes: { propA: { stops: [] } } }
          ]
        }]
      };

      const result = await buildProject(project, deps);
      const timeline = result.scenarios[0].timeline;
      const children = timeline.getChildren();
      expect(children).toHaveLength(2);
      expect(children[0].startTime()).toBe(0);
      expect(children[1].startTime()).toBe(0.5);
    });

    it('grouped scenarios nest sequentially and record primaryScenarioIndex', async () => {
      const pluginA = {
        keys: ['propA'],
        getNaturalValue: () => 0,
        contribute: () => ({ percentPatch: {}, tweenVars: {} })
      };
      mockResolvePlugin = () => pluginA;

      const project = {
        scenarios: [
          {
            sceneId: 'scene-1',
            timelineId: 'group-1',
            elements: [{ id: 'el-1', keyframes: { propA: { stops: [] } } }]
          },
          {
            sceneId: 'scene-2',
            timelineId: 'group-1',
            primary: true,
            elements: [{ id: 'el-1', keyframes: { propA: { stops: [] } } }]
          }
        ]
      };

      const result = await buildProject(project, deps);
      const groupBuild = result.timelineGroups.get('group-1');
      expect(groupBuild).toBeDefined();
      expect(groupBuild.primaryScenarioIndex).toBe(1);

      const master = groupBuild.masterTimeline;
      const children = master.getChildren(false, false, true);
      expect(children).toHaveLength(2);
      expect(children[0]).toBe(result.scenarios[0].timeline);
      expect(children[1]).toBe(result.scenarios[1].timeline);
    });
  });

  describe('end-to-end compile with real plugins', () => {
    it('end-to-end compile with real plugins', async () => {
      const actualPlugins = await vi.importActual('../plugins.js');
      mockResolvePlugin = actualPlugins.resolvePluginForKey;

      const project = {
        scenarios: [
          {
            sceneId: 'scene-1',
            timelineId: 'group-1',
            trigger: { type: 'time', duration: 3 },
            elements: [{
              id: 'el-1',
              keyframes: {
                x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] },
                opacity: { stops: [{ p: 0.5, v: 0.5 }] }
              }
            }]
          },
          {
            sceneId: 'scene-2',
            timelineId: 'group-1',
            primary: true,
            trigger: { type: 'scroll', scrub: true },
            elements: [{
              id: 'el-1',
              keyframes: {
                y: { stops: [{ p: 0, v: 0 }, { p: 1, v: 200 }] }
              }
            }]
          }
        ]
      };

      const result = await buildProject(project, deps);
      expect(result.elementPlugins.get('el-1')).toBeDefined();
      expect(result.scenarios).toHaveLength(2);
      expect(result.scenarios[0].timeline.paused()).toBe(true);
      expect(result.scenarios[1].timeline.paused()).toBe(true);

      const group = result.timelineGroups.get('group-1');
      expect(group).toBeDefined();
      expect(group.masterTimeline.paused()).toBe(true);
      expect(group.primaryScenarioIndex).toBe(1);
    });
  });

  describe('proxy-not-DOM (critical §9)', () => {
    it('tweens proxy object, never touches domNode style or attributes', async () => {
      // Use real filterPlugin: it writes __blur to proxy, not blur to DOM.
      const actualPlugins = await vi.importActual('../plugins.js');
      mockResolvePlugin = actualPlugins.resolvePluginForKey;

      // Spy on any style writes to the DOM node
      const styleSetSpy = vi.fn();
      Object.defineProperty(mockDom, 'style', {
        get: () => new Proxy({}, { set: styleSetSpy }),
        configurable: true
      });
      const setAttributeSpy = vi.spyOn(mockDom, 'setAttribute');

      const project = {
        scenarios: [{
          sceneId: 'scene-1',
          trigger: { type: 'time', duration: 1 },
          elements: [{
            id: 'el-blur',
            keyframes: {
              blur: { stops: [{ p: 0, v: 0 }, { p: 1, v: 20 }] }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);

      // Verify elements map is populated (requires Change 1)
      const elementBuild = result.elements.get('el-blur');
      expect(elementBuild).toBeDefined();
      const { proxy, domNode } = elementBuild;

      // Advance the tween to mid-point
      const tween = result.scenarios[0].timeline.getChildren()[0];
      tween.progress(0.5);

      // (a) proxy must carry the synthetic key filterPlugin writes (__blur)
      expect('__blur' in proxy).toBe(true);
      expect(proxy.__blur).toBeGreaterThan(0);

      // (b) domNode must not have been touched by the builder at all
      expect(styleSetSpy).not.toHaveBeenCalled();
      expect(setAttributeSpy).not.toHaveBeenCalled();
      expect(domNode).toBe(mockDom);
    });

    it('seeds proxy with natural value at p=0 when stops start after p=0', async () => {
      const actualPlugins = await vi.importActual('../plugins.js');
      mockResolvePlugin = actualPlugins.resolvePluginForKey;

      const project = {
        scenarios: [{
          sceneId: 'scene-1',
          trigger: { type: 'time', duration: 1 },
          elements: [{
            id: 'el-opacity',
            keyframes: {
              opacity: { stops: [{ p: 0.5, v: 0.3 }] }
            }
          }]
        }]
      };

      const result = await buildProject(project, deps);
      const elementBuild = result.elements.get('el-opacity');
      expect(elementBuild).toBeDefined();
      const { proxy } = elementBuild;

      // Expect proxy.opacity to be seeded with natural value of 1 immediately
      expect(proxy.opacity).toBe(1);
    });
  });
});
