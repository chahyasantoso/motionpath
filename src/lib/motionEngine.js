import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getPointOnCubicPath, convertToCubicPath } from './pathUtils.js';
import { validateScenario, validateEaseCollisions, ScenarioValidationError } from './validateScenario.js';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export class MotionEngineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MotionEngineError';
  }
}

// ==========================================
// CORE PLUGINS
// ==========================================

const positionPlugin = {
  keys: ['x', 'y', 'z'],
  contribute(stops, elementCfg, propKey) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pct = `${Math.round(stop.p * 100)}%`;
      percentPatch[pct] = percentPatch[pct] || {};
      percentPatch[pct][propKey] = stop.v;
      if (stop.ease) percentPatch[pct].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(proxyState) {
    const patch = {};
    if (proxyState.x !== undefined) patch.x = proxyState.x;
    if (proxyState.y !== undefined) patch.y = proxyState.y;
    if (proxyState.z !== undefined) patch.z = proxyState.z;
    return patch;
  },
  getNaturalValue(propKey) {
    return 0;
  }
};

const transformPlugin = {
  keys: ['rotation', 'rotationX', 'rotationY', 'scaleX', 'scaleY', 'skewX', 'skewY'],
  contribute(stops, elementCfg, propKey) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pct = `${Math.round(stop.p * 100)}%`;
      percentPatch[pct] = percentPatch[pct] || {};
      percentPatch[pct][propKey] = stop.v;
      if (stop.ease) percentPatch[pct].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(proxyState) {
    const patch = {};
    this.keys.forEach(k => {
      if (proxyState[k] !== undefined) patch[k] = proxyState[k];
    });
    return patch;
  },
  getNaturalValue(propKey) {
    if (propKey.startsWith('scale')) return 1;
    return 0;
  }
};

const opacityPlugin = {
  keys: ['opacity'],
  contribute(stops, elementCfg, propKey) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pct = `${Math.round(stop.p * 100)}%`;
      percentPatch[pct] = percentPatch[pct] || {};
      percentPatch[pct].opacity = stop.v;
      if (stop.ease) percentPatch[pct].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(proxyState) {
    return proxyState.opacity !== undefined ? { opacity: proxyState.opacity } : {};
  },
  getNaturalValue() {
    return 1;
  }
};

const filterPlugin = {
  keys: ['blur', 'brightness', 'contrast', 'saturate'],
  contribute(stops, elementCfg, propKey) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pct = `${Math.round(stop.p * 100)}%`;
      percentPatch[pct] = percentPatch[pct] || {};
      percentPatch[pct][`__${propKey}`] = stop.v;
      if (stop.ease) percentPatch[pct].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(proxyState) {
    const filters = [];
    if (proxyState.__blur !== undefined) filters.push(`blur(${proxyState.__blur}px)`);
    if (proxyState.__brightness !== undefined) filters.push(`brightness(${proxyState.__brightness})`);
    if (proxyState.__contrast !== undefined) filters.push(`contrast(${proxyState.__contrast})`);
    if (proxyState.__saturate !== undefined) filters.push(`saturate(${proxyState.__saturate})`);
    return filters.length ? { filter: filters.join(' ') } : {};
  },
  getNaturalValue(propKey) {
    if (propKey === 'blur') return 0;
    return 1; // brightness, contrast, saturate default to 1
  }
};

const colorPlugin = {
  keys: ['backgroundColor', 'color', 'borderColor'],
  contribute(stops, elementCfg, propKey) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pct = `${Math.round(stop.p * 100)}%`;
      percentPatch[pct] = percentPatch[pct] || {};
      percentPatch[pct][propKey] = stop.v;
      if (stop.ease) percentPatch[pct].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(proxyState) {
    const patch = {};
    this.keys.forEach(k => {
      if (proxyState[k] !== undefined) patch[k] = proxyState[k];
    });
    return patch;
  },
  getNaturalValue(propKey) {
    return 'transparent';
  }
};

const cssVarPlugin = {
  keys: [], // Custom matching logic for keys starting with '--'
  contribute(stops, elementCfg, propKey) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pct = `${Math.round(stop.p * 100)}%`;
      percentPatch[pct] = percentPatch[pct] || {};
      percentPatch[pct][propKey] = stop.v;
      if (stop.ease) percentPatch[pct].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(proxyState) {
    const patch = {};
    Object.keys(proxyState).forEach(k => {
      if (k.startsWith('--')) {
        patch[k] = proxyState[k];
      }
    });
    return patch;
  },
  getNaturalValue() {
    return 0;
  }
};

const pathPlugin = {
  keys: ['path'],
  contribute(stops, elementCfg, propKey) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pct = `${Math.round(stop.p * 100)}%`;
      percentPatch[pct] = percentPatch[pct] || {};
      percentPatch[pct].__pathProgress = Math.max(0, Math.min(1, Number(stop.v)));
      if (stop.ease) percentPatch[pct].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(proxyState, elementConfig) {
    if (proxyState.__pathProgress === undefined || !elementConfig || !elementConfig.cubicPath) return {};
    const pt = getPointOnCubicPath(elementConfig.cubicPath, proxyState.__pathProgress);
    const patch = {
      x: pt.x,
      y: pt.y,
      z: pt.z
    };
    if (elementConfig.autoRotate === true) {
      patch.rotation = pt.rotation;
    }
    return patch;
  },
  getNaturalValue() {
    return 0;
  }
};

// ==========================================
// LAZY PLUGINS (Stubs)
// ==========================================

const splitTextPlugin = { keys: ['splitText'], lazy: true };
const morphSvgPlugin = { keys: ['morphSVG'], lazy: true };
const drawSvgPlugin = { keys: ['drawSVG'], lazy: true };
const scrambleTextPlugin = { keys: ['scrambleText'], lazy: true };

const ALL_PLUGINS = [
  positionPlugin,
  transformPlugin,
  opacityPlugin,
  filterPlugin,
  colorPlugin,
  cssVarPlugin,
  pathPlugin,
  splitTextPlugin,
  morphSvgPlugin,
  drawSvgPlugin,
  scrambleTextPlugin
];

const _keyToPlugin = new Map();
ALL_PLUGINS.forEach(plugin => {
  plugin.keys.forEach(key => _keyToPlugin.set(key, plugin));
});

function parseTransformOrigin(origin = '50% 50%') {
  const parts = origin.toLowerCase().trim().split(/\s+/);
  if (parts.length === 1) {
    parts.push('50%');
  }

  const mapKeyword = (word) => {
    if (word === 'left') return 0;
    if (word === 'right') return 100;
    if (word === 'top') return 0;
    if (word === 'bottom') return 100;
    if (word === 'center') return 50;
    if (word.endsWith('%')) {
      return parseFloat(word);
    }
    return 50;
  };

  let xPart = parts[0];
  let yPart = parts[1];

  const verticalKeywords = ['top', 'bottom'];
  const horizontalKeywords = ['left', 'right'];

  if (verticalKeywords.includes(xPart) || horizontalKeywords.includes(yPart)) {
    const temp = xPart;
    xPart = yPart;
    yPart = temp;
  }

  return {
    x: mapKeyword(xPart),
    y: mapKeyword(yPart)
  };
}

function _resolvePluginForKey(key) {
  if (key.startsWith('--')) return cssVarPlugin;
  const plugin = _keyToPlugin.get(key);
  if (!plugin) {
    throw new MotionEngineError(`[GsapPubSub] No plugin registered for property key '${key}'.`);
  }
  return plugin;
}

/**
 * Expands a single-stop property into a full 2-stop [0%→100%] representation
 * based on the element's direction field or positional inference.
 *
 * Called per property BEFORE contribute() runs.
 * Returns a new stops array — always 2 stops for single-stop inputs.
 * Multi-stop inputs are returned unchanged.
 *
 * @param {Stop[]} stops - Raw stops from keyframes[propKey].stops
 * @param {string} propKey - e.g. 'x', 'opacity', 'path'
 * @param {SceneElement} element - full element config (for element.direction)
 * @param {Plugin} plugin - resolved plugin (for getNaturalValue)
 * @returns {Stop[]} expanded stops
 */
function _expandDirectionStops(stops, propKey, element, plugin) {
  if (stops.length !== 1) return stops; // Multi-stop: pass through unchanged

  const stop = stops[0];
  const EPSILON = 1e-6;
  const nearStart = Math.abs(stop.p - 0) < EPSILON;
  const nearEnd = Math.abs(stop.p - 1) < EPSILON;

  // Determine effective direction
  let direction = element.direction;
  if (nearStart) direction = 'from';
  else if (nearEnd) direction = 'to';
  // middle + no direction: validateScenario already threw — safe to assume direction is set

  const naturalValue = plugin.getNaturalValue(propKey);

  if (direction === 'from') {
    // Stop at p=0 is the FROM value; animate TO natural value at p=1
    return [
      { p: 0, v: stop.v, ease: stop.ease },
      { p: 1, v: naturalValue },
    ];
  }

  if (direction === 'to') {
    // Animate FROM natural value at p=0; stop at p=1 is the TO value
    return [
      { p: 0, v: naturalValue },
      { p: 1, v: stop.v, ease: stop.ease },
    ];
  }

  if (direction === 'fromTo') {
    // Single stop in the middle: natural→v→natural (in and out)
    return [
      { p: 0, v: naturalValue },
      { p: stop.p, v: stop.v, ease: stop.ease },
      { p: 1, v: naturalValue },
    ];
  }

  return stops; // fallback, should not reach here
}

// ==========================================
// GSAP PUB SUB CLASS
// ==========================================

class GsapPubSub {
  constructor() {
    this._listeners = new Map();   // elementId -> Set<callback>
    this._cache = new Map();       // elementId -> last raw proxy data
    this._elementConfigs = new Map(); // elementId -> static configs
    this._scenes = new Map();      // sceneId -> { timeline, elementIds, containerEl }
    this.isEditorMode = false;
  }

  initScene(scenario, containerEl = null) {
    if (!scenario || typeof scenario !== 'object') {
      throw new MotionEngineError('[GsapPubSub] scenario must be an object.');
    }
    if (!scenario.sceneId) {
      throw new MotionEngineError('[GsapPubSub] scenario.sceneId is required.');
    }

    let resolvedContainer = containerEl;
    if (!resolvedContainer) {
      const existing = this._scenes.get(scenario.sceneId);
      if (existing) {
        resolvedContainer = existing.containerEl;
      }
    }

    this.destroyScene(scenario.sceneId);

    const pattern = validateScenario(scenario);
    const elements = scenario.elements || [];
    const elementIds = elements.map(el => el.id);

    const builtTweens = elements.map(element => this._buildElementTween(element, scenario));

    if (pattern === 'scroll-scrub') {
      this._createScrollScrubScene(scenario, resolvedContainer, builtTweens, elementIds);
    } else if (pattern === 'scroll-observer') {
      this._createScrollObserverScene(scenario, builtTweens, elementIds);
    } else if (pattern === 'time') {
      this._createTimeScene(scenario, builtTweens, elementIds);
    }
  }

  _buildElementTween(element, scenario) {
    const keyframes = element.keyframes || {};
    const propKeys = Object.keys(keyframes);

    const percentPatchesByProperty = {};
    const mergedTweenVars = {};
    const mergedPercentKeyframes = {};

    propKeys.forEach(propKey => {
      const plugin = _resolvePluginForKey(propKey);
      if (plugin.lazy && !plugin._loaded) {
        throw new MotionEngineError(
          `[GsapPubSub] Plugin for '${propKey}' is lazy and not loaded. Call await motionEngine.loadPlugins() first.`
        );
      }

      const rawStops = keyframes[propKey]?.stops || [];
      const stops = _expandDirectionStops(rawStops, propKey, element, plugin);
      const { percentPatch, tweenVars } = plugin.contribute(stops, element, propKey);

      percentPatchesByProperty[propKey] = percentPatch;
      Object.assign(mergedTweenVars, tweenVars);

      for (const [pct, patch] of Object.entries(percentPatch)) {
        mergedPercentKeyframes[pct] = mergedPercentKeyframes[pct] || {};
        Object.assign(mergedPercentKeyframes[pct], patch);
      }
    });

    validateEaseCollisions(element.id, percentPatchesByProperty);

    // Initialize proxy object with only animated properties.
    // We read the p=0 stop from the EXPANDED stops (already direction-normalized).
    const proxy = {};
    const elementConfig = {};

    if (element.transformOrigin) {
      elementConfig.transformOrigin = element.transformOrigin;
    }

    propKeys.forEach(propKey => {
      const plugin = _resolvePluginForKey(propKey);
      const rawStops = keyframes[propKey]?.stops || [];
      const expandedStops = _expandDirectionStops(rawStops, propKey, element, plugin);

      // Starting value = value at p=0 of expanded stops
      const startStop = expandedStops.find(s => Math.abs(s.p - 0) < 1e-6);
      const startValue = startStop !== undefined ? startStop.v : plugin.getNaturalValue(propKey);

      if (propKey === 'path') {
        proxy.__pathProgress = typeof startValue === 'number' ? startValue : 0;
        const points = keyframes.path.points || [];
        elementConfig.cubicPath = convertToCubicPath(points);
        elementConfig.autoRotate = keyframes.path.autoRotate === true;
      } else if (plugin === filterPlugin) {
        proxy[`__${propKey}`] = startValue;
      } else {
        proxy[propKey] = startValue;
      }
    });

    this._elementConfigs.set(element.id, elementConfig);

    // Set initial cache and broadcast state
    this._cache.set(element.id, { ...proxy });
    this._broadcastRaw(element.id, proxy);

    // Duration: element-level overrides scenario trigger.duration, fallback to 1.
    // For scroll-scrub, duration controls timeline proportion (1 = full scroll).
    // For time/observer, duration controls real seconds.
    const tweenDuration = element.duration ?? scenario?.trigger?.duration ?? 1;

    const tween = gsap.to(proxy, {
      keyframes: mergedPercentKeyframes,
      ...mergedTweenVars,
      duration: tweenDuration,
      paused: true,
      onUpdate: () => {
        this._broadcastRaw(element.id, proxy);
      }
    });

    
    return { elementId: element.id, proxy, tween };
  }

  _computeStaggerOffset(stagger, index) {
    if (!stagger) return 0;
    if (typeof stagger === 'number') return stagger * index;
    if (typeof stagger === 'object' && typeof stagger.each === 'number') {
      return stagger.each * index;
    }
    return 0;
  }

  _createScrollScrubScene(scenario, containerEl, builtTweens, elementIds) {
    if (!this.isEditorMode && !containerEl) {
      console.warn(`[GsapPubSub] Container element missing for scroll scene "${scenario.sceneId}". Skipping initialization.`);
      return;
    }

    const trigger = scenario.trigger || {};
    
    // Resolve pin element
    let pinElement = trigger.pin ?? false;
    if (pinElement === true) {
      pinElement = containerEl;
    } else if (typeof pinElement === 'string' && containerEl) {
      pinElement = containerEl.querySelector(pinElement) || pinElement;
    }

    const tl = this.isEditorMode
      ? gsap.timeline({ paused: true })
      : gsap.timeline({
          scrollTrigger: {
            trigger: containerEl,
            start: trigger.start ?? 'top top',
            end: trigger.end ?? 'bottom bottom',
            scrub: trigger.scrub,
            pin: pinElement,
            pinSpacing: trigger.pinSpacing ?? true,
            snap: trigger.snap ?? false,
            startTrigger: trigger.startTrigger ?? undefined,
            endTrigger: trigger.endTrigger ?? undefined,
            invalidateOnRefresh: true,
          }
        });

    builtTweens.forEach(({ tween }, i) => {
      const offset = this._computeStaggerOffset(scenario.stagger, i);
      tl.add(tween.play(), offset);
    });

    this._scenes.set(scenario.sceneId, { timeline: tl, elementIds, containerEl, triggerType: 'scroll-scrub' });
  }

  _createScrollObserverScene(scenario, builtTweens, elementIds) {
    const trigger = scenario.trigger || {};
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: trigger.startTrigger ?? `#${scenario.sceneId}`,
        start: trigger.start ?? 'top 80%',
        end: trigger.end ?? undefined,
        toggleActions: trigger.toggleActions ?? 'play none none none',
      },
      repeat: trigger.repeat ?? 0,
      yoyo: trigger.yoyo ?? false,
      repeatDelay: trigger.repeatDelay ?? 0,
    });

    builtTweens.forEach(({ tween }, i) => {
      const offset = this._computeStaggerOffset(scenario.stagger, i);
      tl.add(tween.play(), offset);
    });

    this._scenes.set(scenario.sceneId, { timeline: tl, elementIds, containerEl: null, triggerType: 'scroll-observer' });
  }

  _createTimeScene(scenario, builtTweens, elementIds) {
    const trigger = scenario.trigger || {};
    const tl = gsap.timeline({
      repeat: trigger.repeat ?? 0,
      yoyo: trigger.yoyo ?? false,
      repeatDelay: trigger.repeatDelay ?? 0,
      paused: false,
    });

    builtTweens.forEach(({ tween }, i) => {
      const offset = this._computeStaggerOffset(scenario.stagger, i);
      tl.add(tween.play(), offset);
    });

    this._scenes.set(scenario.sceneId, { timeline: tl, elementIds, containerEl: null, triggerType: 'time' });
  }

  compose(elementId, rawData) {
    // Find active plugins for keys present in rawData
    const patch = {};
    const elementConfig = this._elementConfigs.get(elementId);
    ALL_PLUGINS.forEach(plugin => {
      if (typeof plugin.compose === 'function') {
        Object.assign(patch, plugin.compose(rawData, elementConfig));
      }
    });

    // Auto-align xPercent/yPercent with transformOrigin for spatial elements
    const hasSpatial = (
      patch.x !== undefined ||
      patch.y !== undefined ||
      patch.z !== undefined ||
      (elementConfig && (elementConfig.cubicPath || elementConfig.transformOrigin))
    );

    if (hasSpatial) {
      const origin = (elementConfig && elementConfig.transformOrigin) || '50% 50%';
      const parsed = parseTransformOrigin(origin);
      patch.xPercent = -parsed.x;
      patch.yPercent = -parsed.y;
      patch.transformOrigin = origin;
    }

    return patch;
  }

  subscribe(elementId, callback) {
    if (typeof callback !== 'function') {
      throw new MotionEngineError('[GsapPubSub] Subscriber callback must be a function.');
    }

    if (!this._listeners.has(elementId)) {
      this._listeners.set(elementId, new Set());
    }

    const listenersSet = this._listeners.get(elementId);
    listenersSet.add(callback);

    if (this._cache.has(elementId)) {
      callback(this._cache.get(elementId));
    }

    return () => {
      const activeListeners = this._listeners.get(elementId);
      if (activeListeners) {
        activeListeners.delete(callback);
        if (activeListeners.size === 0) {
          this._listeners.delete(elementId);
        }
      }
    };
  }

  _broadcastRaw(elementId, proxy) {
    const snapshot = { ...proxy };
    this._cache.set(elementId, snapshot);

    const listenersSet = this._listeners.get(elementId);
    if (listenersSet) {
      listenersSet.forEach(callback => {
        try {
          callback(snapshot);
        } catch (error) {
          console.error(`[GsapPubSub] Error in listener callback for element "${elementId}":`, error);
        }
      });
    }
  }

  pause(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene || !scene.timeline) return;
    if (scene.triggerType === 'scroll-scrub') {
      if (scene.timeline.scrollTrigger) scene.timeline.scrollTrigger.disable();
    } else if (scene.triggerType === 'scroll-observer') {
      if (scene.timeline.scrollTrigger) scene.timeline.scrollTrigger.disable();
      scene.timeline.pause();
    } else {
      scene.timeline.pause();
    }
  }

  play(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene || !scene.timeline) return;
    if (scene.triggerType === 'scroll-scrub') {
      if (scene.timeline.scrollTrigger) scene.timeline.scrollTrigger.enable();
    } else if (scene.triggerType === 'scroll-observer') {
      if (scene.timeline.scrollTrigger) scene.timeline.scrollTrigger.enable();
      if (scene.timeline.progress() > 0 && scene.timeline.progress() < 1) {
        scene.timeline.play();
      }
    } else {
      scene.timeline.play();
    }
  }

  disableScroll(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene || !scene.timeline || !scene.timeline.scrollTrigger) return;
    scene.timeline.scrollTrigger.disable();
  }

  enableScroll(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene || !scene.timeline || !scene.timeline.scrollTrigger) return;
    scene.timeline.scrollTrigger.enable();
  }

  destroyScene(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene) return;

    if (scene.timeline) {
      if (scene.timeline.scrollTrigger) {
        scene.timeline.scrollTrigger.kill(true);
      }
      scene.timeline.kill();
    }

    if (scene.elementIds) {
      scene.elementIds.forEach(id => {
        this._cache.delete(id);
        this._elementConfigs.delete(id);
      });
    }

    this._scenes.delete(sceneId);
  }

  setProgress(sceneId, progress) {
    const scene = this._scenes.get(sceneId);
    if (!scene || !scene.timeline) return;
    scene.timeline.progress(progress);
  }

  async loadPlugins(pluginNames = []) {
    // Lazy plugins loader stub
    for (const name of pluginNames) {
      const plugin = ALL_PLUGINS.find(p => p.keys.includes(name) && p.lazy);
      if (plugin) {
        plugin._loaded = true;
      }
    }
  }

  destroy() {
    Array.from(this._scenes.keys()).forEach(sceneId => {
      this.destroyScene(sceneId);
    });
    this._listeners.clear();
    this._cache.clear();
    this._elementConfigs.clear();
    this._scenes.clear();
  }
}

const motionEngine = new GsapPubSub();
export default motionEngine;
