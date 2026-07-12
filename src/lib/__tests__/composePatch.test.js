import { describe, it, expect } from 'vitest';
import { composePatch } from '../composePatch.js';

describe('composePatch', () => {
  it('spread-merges filter sub-properties across multiple plugins instead of overwriting', () => {
    const plugin1 = {
      keys: ['filter'],
      compose: () => ({
        filter: { blur: 4 }
      })
    };

    const plugin2 = {
      keys: ['filter'],
      compose: () => ({
        filter: { brightness: 1.1 }
      })
    };

    const patch = composePatch([plugin1, plugin2], {}, {});
    expect(patch).toEqual({
      filter: {
        blur: 4,
        brightness: 1.1
      }
    });
  });

  it('throws on plugin compose failure with context detailing the motion, track and property keys', () => {
    const plugin = {
      keys: ['opacity', 'scale'],
      compose: () => {
        throw new Error('Something went wrong');
      }
    };

    expect(() =>
      composePatch([plugin], {}, {}, 'motion "main-scroller", track "hero-card"')
    ).toThrow(/composePatch: plugin compose failed for motion "main-scroller", track "hero-card", property key\(s\) \[opacity, scale\]: Something went wrong/);
  });
});
