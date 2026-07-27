import { gsap } from 'gsap';
import { getInternalKeys } from '../domain/plugins.js';

const filterSuffixes = { blur: 'px', brightness: '', contrast: '', saturate: '' };
const lastApplied = new WeakMap();
// `offset` is framework state owned by applyAnchor, not a plugin and not CSS.
const frameworkKeys = new Set(['offset']);
function isInternalKey(key) { return key.startsWith('_') || frameworkKeys.has(key) || getInternalKeys().has(key); }
function serializeFilter(values) { return Object.entries(values).filter(([key, value]) => value !== undefined && filterSuffixes[key] !== undefined).map(([key, value]) => `${key}(${value}${filterSuffixes[key]})`).join(' '); }
function normalizePatch(patch) { const normalized = { ...patch }; if (normalized.filter && typeof normalized.filter === 'object') normalized.filter = serializeFilter(normalized.filter); for (const key of Object.keys(normalized)) if (isInternalKey(key)) delete normalized[key]; return normalized; }
export function domRenderer(target, patch) {
  if (!target || !patch) return;
  const next = normalizePatch(patch); const previous = lastApplied.get(target) || {}; const dirty = {};
  for (const [key, value] of Object.entries(next)) if (!Object.is(previous[key], value)) dirty[key] = value;
  for (const key of Object.keys(previous)) if (!(key in next)) dirty[key] = undefined;
  if (Object.keys(dirty).length === 0) return;
  lastApplied.set(target, { ...previous, ...next });
  gsap.set(target, dirty);
}
export function clearRendererTarget(target) { if (target) lastApplied.delete(target); }
