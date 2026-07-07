import { describe, it, expect, beforeEach } from 'vitest';
import { createFilterPropertyPlugin } from '../filterProperty.js';

describe('filterProperty plugin factory', () => {
  let plugin;

  beforeEach(() => {
    plugin = createFilterPropertyPlugin('blur');
  });

  it('declares correct keys list', () => {
    expect(plugin.keys).toEqual(['blur']);
    expect(plugin.lazy).toBe(false);
  });

  it('contribute maps stops to correct synthetic proxy keys, never to standard filter directly', () => {
    const stops = [
      { p: 0, v: 0 },
      { p: 1, v: 15, ease: 'linear' }
    ];

    const result = plugin.contribute('blur', stops);

    expect(result.percentPatch).toEqual({
      '0%': { blur: 0 },
      '100%': { blur: 15, ease: 'linear' }
    });
    expect(result.tweenVars).toEqual({});

    // Verify 'filter' key is completely absent from all frames
    for (const frame of Object.values(result.percentPatch)) {
      expect('filter' in frame).toBe(false);
    }
  });
});
