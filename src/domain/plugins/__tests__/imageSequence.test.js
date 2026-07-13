import { describe, it, expect, vi, beforeEach } from 'vitest';
import { imageSequencePlugin, warmFrames, _resetPreloadCache } from '../imageSequenceProperty.js';

describe('imageSequence plugin', () => {
  beforeEach(() => {
    _resetPreloadCache();
    vi.restoreAllMocks();
  });

  describe('claimsKey', () => {
    it('claims imageSequence and imageSequenceIndex', () => {
      expect(imageSequencePlugin.claimsKey('imageSequence')).toBe(true);
      expect(imageSequencePlugin.claimsKey('imageSequenceIndex')).toBe(true);
      expect(imageSequencePlugin.claimsKey('someOtherKey')).toBe(false);
    });
  });

  describe('contribute()', () => {
    it('returns empty patches when config is missing', () => {
      const result = imageSequencePlugin.contribute('imageSequence', [], {});
      expect(result).toEqual({ percentPatch: {}, tweenVars: {} });
    });

    it('creates percentPatch mapping stops to imageSequenceIndex', () => {
      const elementCfg = {
        keyframes: {
          imageSequence: {
            frames: ['a.jpg', 'b.jpg'],
            stops: [
              { p: 0, v: 0 },
              { p: 1, v: 1, ease: 'power2.inOut' }
            ]
          }
        }
      };

      const result = imageSequencePlugin.contribute(
        'imageSequence',
        elementCfg.keyframes.imageSequence.stops,
        elementCfg
      );

      expect(result.percentPatch).toEqual({
        '0%': { imageSequenceIndex: 0 },
        '100%': { imageSequenceIndex: 1, ease: 'power2.inOut' }
      });
      expect(result.tweenVars).toEqual({});
    });
  });

  describe('compose()', () => {
    const elementCfg = {
      keyframes: {
        imageSequence: {
          frames: ['a.jpg', 'b.jpg', 'c.jpg'],
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 2 }
          ]
        }
      }
    };

    it('returns empty patch when rawData.imageSequenceIndex is missing', () => {
      expect(imageSequencePlugin.compose({}, elementCfg)).toEqual({});
    });

    it('returns empty patch when config is missing', () => {
      expect(imageSequencePlugin.compose({ imageSequenceIndex: 1 }, {})).toEqual({});
    });

    it('rounds imageSequenceIndex to nearest frame', () => {
      expect(imageSequencePlugin.compose({ imageSequenceIndex: 0 }, elementCfg)).toEqual({
        backgroundImage: 'url(a.jpg)'
      });
      expect(imageSequencePlugin.compose({ imageSequenceIndex: 0.4 }, elementCfg)).toEqual({
        backgroundImage: 'url(a.jpg)'
      });
      expect(imageSequencePlugin.compose({ imageSequenceIndex: 0.5 }, elementCfg)).toEqual({
        backgroundImage: 'url(b.jpg)'
      });
      expect(imageSequencePlugin.compose({ imageSequenceIndex: 1.2 }, elementCfg)).toEqual({
        backgroundImage: 'url(b.jpg)'
      });
      expect(imageSequencePlugin.compose({ imageSequenceIndex: 1.6 }, elementCfg)).toEqual({
        backgroundImage: 'url(c.jpg)'
      });
    });

    it('clamps index to valid frame range', () => {
      expect(imageSequencePlugin.compose({ imageSequenceIndex: -10 }, elementCfg)).toEqual({
        backgroundImage: 'url(a.jpg)'
      });
      expect(imageSequencePlugin.compose({ imageSequenceIndex: 100 }, elementCfg)).toEqual({
        backgroundImage: 'url(c.jpg)'
      });
    });
  });

  describe('preload cache', () => {
    it('caches loading state by frame list and avoids double load', async () => {
      if (typeof Image === 'undefined') return;

      const mockImageInstances = [];
      const originalImage = window.Image;

      // Mock Image constructor
      window.Image = class {
        constructor() {
          mockImageInstances.push(this);
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      };

      const frames = ['a.jpg', 'b.jpg'];
      const p1 = warmFrames(frames);
      const p2 = warmFrames(frames); // call again with same keys

      expect(p1).toBe(p2); // Should be the identical Promise instance

      await p1;

      expect(mockImageInstances).toHaveLength(2); // Only instantiated once per image in list

      // Cleanup
      window.Image = originalImage;
    });

    it('creates different cache entries for different frame lists', async () => {
      if (typeof Image === 'undefined') return;

      const mockImageInstances = [];
      const originalImage = window.Image;

      window.Image = class {
        constructor() {
          mockImageInstances.push(this);
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      };

      const listA = ['a.jpg'];
      const listB = ['b.jpg'];

      const pA = warmFrames(listA);
      const pB = warmFrames(listB);

      expect(pA).not.toBe(pB);

      await Promise.all([pA, pB]);

      expect(mockImageInstances).toHaveLength(2);

      window.Image = originalImage;
    });

    it('resolves preload promise even if some images fail to load', async () => {
      if (typeof Image === 'undefined') return;

      const originalImage = window.Image;

      window.Image = class {
        constructor() {
          setTimeout(() => {
            // simulate error
            if (this.onerror) this.onerror();
          }, 0);
        }
      };

      const frames = ['broken.jpg'];
      // Should resolve, not reject
      await expect(warmFrames(frames)).resolves.toBeUndefined();

      window.Image = originalImage;
    });
  });
});
