import { gsap } from 'gsap';

const filterSuffixes = {
  blur: 'px',
  brightness: '',
  contrast: '',
  saturate: ''
};

function serializeFilter(filterValues) {
  return Object.entries(filterSuffixes)
    .filter(([key]) => filterValues[key] !== undefined)
    .map(([key, suffix]) => `${key}(${filterValues[key]}${suffix})`)
    .join(' ');
}


export function domRenderer(target, patch) {
  if (!target || !patch) return;
  const domPatch = { ...patch };

  if (domPatch.filter && typeof domPatch.filter === 'object') {
    domPatch.filter = serializeFilter(domPatch.filter);
  }

  // Filter out non-CSS internal computation properties to prevent GSAP warnings
  delete domPatch.pathProgress;
  delete domPatch.cubicPath;
  delete domPatch.autoRotate;

  gsap.set(target, domPatch);
}
