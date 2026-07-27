import { gsap } from 'gsap';

const filterSuffixes = { blur: 'px', brightness: '', contrast: '', saturate: '' };

function serializeFilter(filterValues) {
  return Object.entries(filterValues)
    .filter(([key, value]) => value !== undefined && filterSuffixes[key] !== undefined)
    .map(([key, value]) => `${key}(${value}${filterSuffixes[key]})`)
    .join(' ');
}

export function domRenderer(target, patch) {
  if (!target || !patch) return;
  const domPatch = { ...patch };
  if (domPatch.filter && typeof domPatch.filter === 'object') domPatch.filter = serializeFilter(domPatch.filter);

  // Plugin-owned proxy internals are never render output. Keep the legacy
  // names as a compatibility guard for callers passing raw snapshots directly.
  for (const key of Object.keys(domPatch)) {
    if (key.startsWith('_') || ['pathProgress', 'cubicPath', 'autoRotate'].includes(key)) delete domPatch[key];
  }
  gsap.set(target, domPatch);
}
