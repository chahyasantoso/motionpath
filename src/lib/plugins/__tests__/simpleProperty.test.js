import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { createSimplePropertyPlugin } from '../simpleProperty.js';

vi.mock('gsap', () => {
  return {
    gsap: {
      getProperty: vi.fn()
    }
  };
});

describe('simpleProperty plugin factory', () => {
  let plugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = createSimplePropertyPlugin('opacity');
  });

  it('declares correct keys list', () => {
    expect(plugin.keys).toEqual(['opacity']);
    expect(plugin.lazy).toBe(false);
  });

  it('getNaturalValue queries GSAP property value', () => {
    gsap.getProperty.mockReturnValue(0.7);

    const mockDom = {};
    const val = plugin.getNaturalValue('opacity', mockDom);

    expect(gsap.getProperty).toHaveBeenCalledWith(mockDom, 'opacity');
    expect(val).toBe(0.7);
  });

  it('getNaturalValue returns default fallback (1 for opacity, 0 for others) when query is empty', () => {
    gsap.getProperty.mockReturnValue(null);

    const mockDom = {};
    expect(plugin.getNaturalValue('opacity', mockDom)).toBe(1);

    const xPlugin = createSimplePropertyPlugin('x');
    expect(xPlugin.getNaturalValue('x', mockDom)).toBe(0);
  });

  it('contribute maps stops to correct percent keys and passes ease through', () => {
    const stops = [
      { p: 0, v: 0.2 },
      { p: 0.5, v: 0.5, ease: 'power1.in' },
      { p: 1, v: 1 }
    ];

    const result = plugin.contribute('opacity', stops);

    expect(result.percentPatch).toEqual({
      '0%': { opacity: 0.2 },
      '50%': { opacity: 0.5, ease: 'power1.in' },
      '100%': { opacity: 1 }
    });
    expect(result.tweenVars).toEqual({});
  });
});
