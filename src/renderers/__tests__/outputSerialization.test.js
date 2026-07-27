import { describe, it, expect, vi, afterEach } from 'vitest';
import { gsap } from 'gsap';
import { domRenderer, clearRendererTarget } from '../domRenderer.js';
import { createAnimationPlugin } from '../../domain/createAnimationPlugin.js';
import { registerPlugin, unregisterPlugin } from '../../domain/plugins.js';

describe('plugin-declared output serialization', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serializes the built-in filter through its plugin metadata', () => {
    const set = vi.spyOn(gsap, 'set').mockImplementation(() => {});
    const target = {};
    domRenderer(target, { filter: { blur: 4, brightness: 0.8 } });
    expect(set).toHaveBeenCalledWith(target, { filter: 'blur(4px) brightness(0.8)' });
    clearRendererTarget(target);
  });

  it('serializes a third-party structured output without renderer changes', () => {
    const plugin = createAnimationPlugin({ keys: ['gradient'], outputs: { gradient: { serialize: (value) => `gradient(${value.angle}deg)` } } });
    registerPlugin(plugin);
    const set = vi.spyOn(gsap, 'set').mockImplementation(() => {});
    const target = {};
    domRenderer(target, { gradient: { angle: 45 } });
    expect(set).toHaveBeenCalledWith(target, { gradient: 'gradient(45deg)' });
    unregisterPlugin(plugin);
    clearRendererTarget(target);
  });
});
