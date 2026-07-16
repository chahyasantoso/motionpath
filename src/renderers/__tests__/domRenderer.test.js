import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { domRenderer } from '../domRenderer.js';

describe('domRenderer', () => {
  let target;

  beforeEach(() => {
    target = {};
    vi.spyOn(gsap, 'set').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  it('serializes a numeric filter object into a CSS filter string', () => {
    const patch = {
      x: 100,
      filter: {
        blur: 5,
        brightness: 1.2,
        contrast: 0.8,
        saturate: 1.5
      }
    };

    domRenderer(target, patch);

    expect(gsap.set).toHaveBeenCalledWith(target, {
      x: 100,
      filter: 'blur(5px) brightness(1.2) contrast(0.8) saturate(1.5)'
    });
  });

  it('handles partial filter sub-properties correctly', () => {
    const patch = {
      filter: {
        blur: 10
      }
    };

    domRenderer(target, patch);

    expect(gsap.set).toHaveBeenCalledWith(target, {
      filter: 'blur(10px)'
    });
  });

  it('passes other properties through unchanged without adding a filter key', () => {
    const patch = {
      x: 50,
      opacity: 0.5
    };

    domRenderer(target, patch);

    expect(gsap.set).toHaveBeenCalledWith(target, {
      x: 50,
      opacity: 0.5
    });
    expect(gsap.set).not.toHaveBeenCalledWith(target, expect.objectContaining({ filter: expect.anything() }));
  });

  it('passes non-object filter value through unchanged', () => {
    const patch = {
      filter: 'blur(20px) contrast(1.1)'
    };

    domRenderer(target, patch);

    expect(gsap.set).toHaveBeenCalledWith(target, {
      filter: 'blur(20px) contrast(1.1)'
    });
  });
});
