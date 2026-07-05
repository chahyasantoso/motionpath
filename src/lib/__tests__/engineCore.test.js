import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { createEngineCore } from '../engineCore.js';

describe('EngineCore', () => {
  let mockPlugin1;
  let mockPlugin2;
  let buildResult;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPlugin1 = {
      keys: ['x'],
      compose: vi.fn((rawData) => {
        if (rawData.x === undefined) return {};
        return { x: rawData.x };
      })
    };

    mockPlugin2 = {
      keys: ['blur'],
      compose: vi.fn((rawData) => {
        if (rawData.__blur === undefined) return {};
        return { __blur_filter: `blur(${rawData.__blur}px)` };
      })
    };

    buildResult = {
      scenarios: [
        {
          sceneId: 'scene-1',
          timeline: {
            kill: vi.fn(),
            getChildren: vi.fn(() => [])
          }
        }
      ],
      timelineGroups: new Map(),
      elements: new Map([
        ['el-1', { proxy: { x: 10, __blur: 5 }, domNode: {} }]
      ]),
      elementPlugins: new Map([
        ['el-1', [mockPlugin1, mockPlugin2]]
      ])
    };
  });

  describe('subscribe()', () => {
    it('throws when subscribing to non-existent element', () => {
      const core = createEngineCore(buildResult);
      expect(() => core.subscribe('non-existent', () => {})).toThrow();
    });

    it('adds and removes gsap.ticker callback and calls back with proxy copy', () => {
      const addSpy = vi.spyOn(gsap.ticker, 'add');
      const removeSpy = vi.spyOn(gsap.ticker, 'remove');

      const core = createEngineCore(buildResult);
      const cb = vi.fn();

      const unsubscribe = core.subscribe('el-1', cb);

      expect(addSpy).toHaveBeenCalledTimes(1);
      const tickerFn = addSpy.mock.calls[0][0];

      // Simulate ticker tick
      tickerFn();
      expect(cb).toHaveBeenCalledWith({ x: 10, __blur: 5 });

      unsubscribe();
      expect(removeSpy).toHaveBeenCalledWith(tickerFn);

      // Re-subscribe should trigger startTicker() again
      const unsubscribe2 = core.subscribe('el-1', cb);
      expect(addSpy).toHaveBeenCalledTimes(2);
      unsubscribe2();
    });

    it('clears ticker callback on destroy()', () => {
      const addSpy = vi.spyOn(gsap.ticker, 'add');
      const removeSpy = vi.spyOn(gsap.ticker, 'remove');

      const core = createEngineCore(buildResult);
      core.subscribe('el-1', () => {});

      expect(addSpy).toHaveBeenCalled();
      const tickerFn = addSpy.mock.calls[0][0];

      core.destroy();
      expect(removeSpy).toHaveBeenCalledWith(tickerFn);
    });
  });

  describe('compose()', () => {
    it('composes and aggregates patches, including filter properties', () => {
      const core = createEngineCore(buildResult);
      const patch = core.compose('el-1');

      expect(mockPlugin1.compose).toHaveBeenCalled();
      expect(mockPlugin2.compose).toHaveBeenCalled();
      expect(patch).toEqual({
        x: 10,
        filter: 'blur(5px)'
      });
    });

    it('defensively handles plugin compose errors', () => {
      mockPlugin1.compose.mockImplementationOnce(() => {
        throw new Error('Plugin crash');
      });

      const core = createEngineCore(buildResult);
      const patch = core.compose('el-1');

      // mockPlugin2's compose should still succeed and be in the patch
      expect(patch).toEqual({
        filter: 'blur(5px)'
      });
    });
  });

  describe('destroyScene()', () => {
    it('kills timeline of scene', () => {
      const core = createEngineCore(buildResult);
      core.destroyScene('scene-1');
      expect(buildResult.scenarios[0].timeline.kill).toHaveBeenCalled();
    });
  });
});
