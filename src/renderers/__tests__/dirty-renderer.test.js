import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
import { domRenderer, clearRendererTarget } from '../domRenderer.js';

vi.mock('gsap', () => ({ gsap: { set: vi.fn() } }));

describe('domRenderer dirty checking', () => {
  it('skips identical patches and writes only changed keys', () => {
    const target = {};
    domRenderer(target, { x: 10, opacity: 1 });
    domRenderer(target, { x: 10, opacity: 1 });
    domRenderer(target, { x: 20, opacity: 1 });
    expect(gsap.set).toHaveBeenCalledTimes(2);
    expect(gsap.set).toHaveBeenLastCalledWith(target, { x: 20 });
    clearRendererTarget(target);
  });
});
