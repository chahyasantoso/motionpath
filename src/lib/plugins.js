// Shared contribute() implementation for plugins that write their property key
// directly into the percentPatch without any key transformation. Used by the
// five plugins below; filterPlugin and pathPlugin have custom implementations.
function contributeDirectAssign(propertyKey, stops) {
  const percentPatch = {};
  stops.forEach(stop => {
    const pct = `${Math.round(stop.p * 100)}%`;
    if (!percentPatch[pct]) percentPatch[pct] = {};
    percentPatch[pct][propertyKey] = stop.v;
    if (stop.ease) percentPatch[pct].ease = stop.ease;
  });
  return { percentPatch, tweenVars: {} };
}

export const positionPlugin = {
  keys: ['x', 'y', 'z'],
  getNaturalValue(propertyKey, domNode) {
    return 0;
  },
  contribute: contributeDirectAssign
};

export const transformPlugin = {
  keys: ['rotation', 'rotationX', 'rotationY', 'scaleX', 'scaleY', 'skewX', 'skewY'],
  getNaturalValue(propertyKey, domNode) {
    if (propertyKey.startsWith('scale')) return 1;
    return 0;
  },
  contribute: contributeDirectAssign
};

export const opacityPlugin = {
  keys: ['opacity'],
  getNaturalValue(propertyKey, domNode) {
    return 1;
  },
  contribute: contributeDirectAssign
};

export const filterPlugin = {
  keys: ['blur', 'brightness', 'contrast', 'saturate'],
  getNaturalValue(propertyKey, domNode) {
    if (propertyKey === 'blur') return 0;
    return 1;
  },
  contribute(propertyKey, stops, elementCfg) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pct = `${Math.round(stop.p * 100)}%`;
      percentPatch[pct] = percentPatch[pct] || {};
      percentPatch[pct][`__${propertyKey}`] = stop.v;
      if (stop.ease) percentPatch[pct].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  }
};

export const colorPlugin = {
  keys: ['backgroundColor', 'color', 'borderColor'],
  getNaturalValue(propertyKey, domNode) {
    return 'transparent';
  },
  contribute: contributeDirectAssign
};

export const cssVarPlugin = {
  keys: [], // Matched via prefix '--'
  getNaturalValue(propertyKey, domNode) {
    return 0;
  },
  contribute: contributeDirectAssign
};

export const pathPlugin = {
  keys: ['path'],
  getNaturalValue(propertyKey, domNode) {
    return 0;
  },
  contribute(propertyKey, stops, elementCfg) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pct = `${Math.round(stop.p * 100)}%`;
      percentPatch[pct] = percentPatch[pct] || {};
      percentPatch[pct].__pathProgress = Math.max(0, Math.min(1, Number(stop.v)));
      if (stop.ease) percentPatch[pct].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  }
};

// Lazy plugin stubs
export const splitTextPlugin = { keys: ['splitText'], lazy: true, load: () => Promise.resolve(), contribute() {}, getNaturalValue() {} };
export const morphSvgPlugin = { keys: ['morphSVG'], lazy: true, load: () => Promise.resolve(), contribute() {}, getNaturalValue() {} };
export const drawSvgPlugin = { keys: ['drawSVG'], lazy: true, load: () => Promise.resolve(), contribute() {}, getNaturalValue() {} };
export const scrambleTextPlugin = { keys: ['scrambleText'], lazy: true, load: () => Promise.resolve(), contribute() {}, getNaturalValue() {} };

export const ALL_PLUGINS = [
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

export function resolvePluginForKey(key) {
  if (key.startsWith('--')) return cssVarPlugin;
  return _keyToPlugin.get(key);
}
