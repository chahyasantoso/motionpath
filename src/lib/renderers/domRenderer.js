import { gsap } from 'gsap';

function serializeFilter(filterValues) {
  const parts = [];
  if (filterValues.blur !== undefined) parts.push(`blur(${filterValues.blur}px)`);
  if (filterValues.brightness !== undefined) parts.push(`brightness(${filterValues.brightness})`);
  if (filterValues.contrast !== undefined) parts.push(`contrast(${filterValues.contrast})`);
  if (filterValues.saturate !== undefined) parts.push(`saturate(${filterValues.saturate})`);
  return parts.join(' ');
}

export function domRenderer(target, patch) {
  if (!target || !patch) return;
  const domPatch = { ...patch };

  if (domPatch.filter && typeof domPatch.filter === 'object') {
    domPatch.filter = serializeFilter(domPatch.filter);
  }

  gsap.set(target, domPatch);
}
