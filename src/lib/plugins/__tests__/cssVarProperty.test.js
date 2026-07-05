import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cssVarPlugin, resolvePluginForKey } from '../../plugins.js';

describe('cssVarPlugin & resolvePluginForKey', () => {
  let mockDom;

  beforeEach(() => {
    mockDom = {
      style: {}
    };

    global.getComputedStyle = vi.fn().mockReturnValue({
      getPropertyValue: vi.fn().mockReturnValue('15px')
    });
  });

  it('cssVarPlugin getNaturalValue reads CSS variable value from DOM', () => {
    const val = cssVarPlugin.getNaturalValue('--custom-offset', mockDom);
    const mockStyles = global.getComputedStyle(mockDom);
    expect(mockStyles.getPropertyValue).toHaveBeenCalledWith('--custom-offset');
    expect(val).toBe('15px');
  });

  it('cssVarPlugin contribute passes CSS variable string values through unchanged', () => {
    const stops = [
      { p: 0, v: '10px' },
      { p: 1, v: '50px', ease: 'sine.in' }
    ];

    const result = cssVarPlugin.contribute('--custom-offset', stops);

    expect(result.percentPatch).toEqual({
      '0%': { '--custom-offset': '10px' },
      '100%': { '--custom-offset': '50px', ease: 'sine.in' }
    });
    expect(result.tweenVars).toEqual({});
  });

  it('resolvePluginForKey routes variables starting with -- to cssVarPlugin and exact matches to correct plugins', () => {
    // Falls back to cssVarPlugin for keys starting with --
    expect(resolvePluginForKey('--some-variable')).toBe(cssVarPlugin);
    expect(resolvePluginForKey('--another-var')).toBe(cssVarPlugin);

    // Exact matches still resolve correctly to simple / color / filter plugins
    const xPlugin = resolvePluginForKey('x');
    expect(xPlugin).toBeDefined();
    expect(xPlugin.keys).toContain('x');
    expect(xPlugin).not.toBe(cssVarPlugin);

    const colorPlugin = resolvePluginForKey('backgroundColor');
    expect(colorPlugin).toBeDefined();
    expect(colorPlugin.keys).toContain('backgroundColor');

    const blurPlugin = resolvePluginForKey('blur');
    expect(blurPlugin).toBeDefined();
    expect(blurPlugin.keys).toContain('blur');

    // Unknown returns undefined
    expect(resolvePluginForKey('unknownPropertyKey')).toBeUndefined();
  });
});
