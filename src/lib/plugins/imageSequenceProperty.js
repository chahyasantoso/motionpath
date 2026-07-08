const imageSequenceWarmCache = new Map();

/**
 * Preload helper: caches loading state by the stringified frame list.
 * Safe for server/test environments without window.Image.
 *
 * @param {string[]} frames
 * @returns {Promise<void>}
 */
export function warmFrames(frames) {
  if (typeof Image === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve();
  }
  const key = frames.join('\n');
  if (imageSequenceWarmCache.has(key)) {
    return imageSequenceWarmCache.get(key);
  }

  const promise = Promise.all(
    frames.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        })
    )
  ).then(() => undefined);

  imageSequenceWarmCache.set(key, promise);
  return promise;
}

// Reset cache helper for testing purposes
export function _resetPreloadCache() {
  imageSequenceWarmCache.clear();
}

/**
 * Image Sequence animation plugin.
 * Expects keyframes.imageSequence shape with frames and stops.
 */
export const imageSequencePlugin = {
  keys: ['imageSequence', 'imageSequenceIndex'],
  lazy: false,
  claimsKey(key) {
    return key === 'imageSequence' || key === 'imageSequenceIndex';
  },

  contribute(propKey, stops, elementCfg) {
    const config = elementCfg?.keyframes?.imageSequence;
    if (!config) {
      return { percentPatch: {}, tweenVars: {} };
    }

    if (Array.isArray(config.frames)) {
      warmFrames(config.frames);
    }

    const percentPatch = {};
    stops.forEach((stop) => {
      const pctKey = `${stop.p * 100}%`;
      percentPatch[pctKey] = { imageSequenceIndex: Number(stop.v) };
      if (stop.ease) {
        percentPatch[pctKey].ease = stop.ease;
      }
    });

    return { percentPatch, tweenVars: {} };
  },

  compose(rawData, elementCfg) {
    const config = elementCfg?.keyframes?.imageSequence;
    if (!config || !Array.isArray(config.frames) || config.frames.length === 0) {
      return {};
    }

    const rawIndex = rawData.imageSequenceIndex;
    if (rawIndex === undefined || rawIndex === null) {
      return {};
    }

    const frames = config.frames;
    const idx = Math.max(0, Math.min(frames.length - 1, Math.round(rawIndex)));

    return {
      backgroundImage: `url(${frames[idx]})`
    };
  }
};
