import { createAnimationPlugin } from '../createAnimationPlugin.js';
import { toPercentKey } from '../../usecases/toPercentKey.js';

const imageSequenceWarmCache = new Map();

export function warmFrames(frames) {
  if (typeof Image === 'undefined' || typeof window === 'undefined') return Promise.resolve();
  const key = frames.join('\n');
  if (imageSequenceWarmCache.has(key)) return imageSequenceWarmCache.get(key);
  const promise = Promise.all(frames.map((src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  }))).then(() => undefined);
  imageSequenceWarmCache.set(key, promise);
  return promise;
}

export function _resetPreloadCache() { imageSequenceWarmCache.clear(); }

export function createImageSequencePlugin() {
  return createAnimationPlugin({
    keys: ['imageSequence', 'imageSequenceIndex'],
    stage: 'media',
    priority: 30,
    outputs: { backgroundImage: { merge: 'replace' } },
    contribute(propKey, stops, elementCfg) {
      const config = elementCfg?.keyframes?.imageSequence;
      if (!config) return { percentPatch: {}, tweenVars: {} };
      if (Array.isArray(config.frames)) warmFrames(config.frames);
      const percentPatch = {};
      stops.forEach((stop) => {
        const pctKey = toPercentKey(stop.p);
        percentPatch[pctKey] = { imageSequenceIndex: Number(stop.v) };
        if (stop.ease) percentPatch[pctKey].ease = stop.ease;
      });
      return { percentPatch, tweenVars: {} };
    },
    compose(rawData, elementCfg) {
      const frames = elementCfg?.keyframes?.imageSequence?.frames;
      const rawIndex = rawData.imageSequenceIndex;
      if (!Array.isArray(frames) || !frames.length || rawIndex == null) return {};
      const idx = Math.max(0, Math.min(frames.length - 1, Math.round(rawIndex)));
      return { backgroundImage: `url(${frames[idx]})` };
    },
  });
}

export const imageSequencePlugin = createImageSequencePlugin();
