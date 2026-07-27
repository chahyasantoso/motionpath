import { describe, it, expect, vi, afterEach } from 'vitest';
import { gsap } from 'gsap';
import { domRenderer, clearRendererTarget } from '../domRenderer.js';
import { registerPlugin, unregisterPlugin } from '../../domain/plugins.js';
import { createAnimationPlugin } from '../../domain/createAnimationPlugin.js';

describe('domRenderer internal-key stripping (R-09)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('strips pathPlugin internals without the renderer naming them', () => {
    const set = vi.spyOn(gsap, 'set').mockImplementation(() => {});
    const el = {};
    domRenderer(el, { x: 10, pathProgress: 0.4, cubicPath: [], autoRotate: true });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][1]).toEqual({ x: 10 });
    clearRendererTarget(el);
  });

  it('strips a third-party plugin internal key with no renderer edit', () => {
    const plugin = createAnimationPlugin({ keys: ['wobble'], internalKeys: ['wobbleSeed'] });
    registerPlugin(plugin);
    const set = vi.spyOn(gsap, 'set').mockImplementation(() => {});
    const el = {};
    domRenderer(el, { opacity: 1, wobbleSeed: 7, _scratch: 'x' });
    expect(set.mock.calls[0][1]).toEqual({ opacity: 1 });
    unregisterPlugin(plugin);
    clearRendererTarget(el);
  });

  it('stops stripping the key once its plugin is unregistered', () => {
    const plugin = createAnimationPlugin({ keys: ['shimmer'], internalKeys: ['shimmerSeed'] });
    registerPlugin(plugin);
    unregisterPlugin(plugin);
    const set = vi.spyOn(gsap, 'set').mockImplementation(() => {});
    const el = {};
    domRenderer(el, { shimmerSeed: 2 });
    expect(set.mock.calls[0][1]).toEqual({ shimmerSeed: 2 });
    clearRendererTarget(el);
  });
});
