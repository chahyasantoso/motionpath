import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createColorPropertyPlugin } from '../colorProperty.js';

describe('colorProperty plugin factory', () => {
  let plugin;
  let mockDom;

  beforeEach(() => {
    plugin = createColorPropertyPlugin('backgroundColor');

    mockDom = {
      style: {}
    };

    // Mock getComputedStyle globally
    global.getComputedStyle = vi.fn().mockReturnValue({
      backgroundColor: 'rgb(255, 0, 0)'
    });
  });

  it('declares correct keys list', () => {
    expect(plugin.keys).toEqual(['backgroundColor']);
    expect(plugin.lazy).toBe(false);
  });



  it('contribute passes color string values through unchanged', () => {
    const stops = [
      { p: 0, v: '#ff0000' },
      { p: 1, v: 'blue', ease: 'power2.out' }
    ];

    const result = plugin.contribute('backgroundColor', stops);

    expect(result.percentPatch).toEqual({
      '0%': { backgroundColor: '#ff0000' },
      '100%': { backgroundColor: 'blue', ease: 'power2.out' }
    });
    expect(result.tweenVars).toEqual({});
  });
});
