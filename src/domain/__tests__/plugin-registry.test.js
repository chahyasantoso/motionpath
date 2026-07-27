import { describe, it, expect } from 'vitest';
import { createAnimationPlugin } from '../createAnimationPlugin.js';
import { registerPlugin, unregisterPlugin, resolvePluginForKey } from '../plugins.js';

describe('plugin registry', () => {
  it('registers and resolves third-party exact-key plugins', () => {
    const plugin = createAnimationPlugin({ keys: ['testProperty'] });
    registerPlugin(plugin);
    expect(resolvePluginForKey('testProperty')).toBe(plugin);
    expect(unregisterPlugin(plugin)).toBe(true);
    expect(resolvePluginForKey('testProperty')).toBeUndefined();
  });

  it('rejects duplicate exact claims instead of silently shadowing a plugin', () => {
    const first = createAnimationPlugin({ keys: ['collisionProperty'] });
    const second = createAnimationPlugin({ keys: ['collisionProperty'] });
    registerPlugin(first);
    expect(() => registerPlugin(second)).toThrow(/Plugin key collision/);
    unregisterPlugin(first);
  });

  it('supports explicitly declared wildcard claims', () => {
    const plugin = createAnimationPlugin({ keys: [], claimsWildcard: true, claimsKey: (key) => key.startsWith('@@') });
    registerPlugin(plugin);
    expect(resolvePluginForKey('@@custom')).toBe(plugin);
    unregisterPlugin(plugin);
  });
});
