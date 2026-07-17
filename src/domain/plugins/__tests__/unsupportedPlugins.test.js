import { describe, expect, it } from 'vitest';
import { ensureLoaded } from '../../plugins.js';
import { splitTextPlugin, morphSvgPlugin, drawSvgPlugin, scrambleTextPlugin } from '../../plugins.js';

describe('Unsupported Lazy Plugins', () => {
  it('each unsupported plugin rejects on load() and throws on contribute()', async () => {
    const plugins = [splitTextPlugin, morphSvgPlugin, drawSvgPlugin, scrambleTextPlugin];

    for (const plugin of plugins) {
      await expect(ensureLoaded(plugin)).rejects.toThrow(/is not implemented/);
      expect(() => plugin.contribute()).toThrow(/is not implemented/);
    }
  });
});
