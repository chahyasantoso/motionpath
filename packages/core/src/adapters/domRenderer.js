import { gsap } from "gsap";
import { getInternalKeys, getOutputSerializers } from "../../../../src/domain/plugins.js";

const lastApplied = new WeakMap();
const frameworkKeys = new Set(["offset"]);
function isInternalKey(key) {
  return key.startsWith("_") || frameworkKeys.has(key) || getInternalKeys().has(key);
}
function normalizePatch(patch) {
  const normalized = { ...patch };
  for (const [key, serialize] of getOutputSerializers()) {
    const value = normalized[key];
    if (value !== null && typeof value === "object" && typeof serialize === "function") normalized[key] = serialize(value);
  }
  for (const key of Object.keys(normalized)) if (isInternalKey(key)) delete normalized[key];
  return normalized;
}
export function domRenderer(target, patch) {
  if (!target || !patch) return;
  const next = normalizePatch(patch);
  const previous = lastApplied.get(target) || {};
  const dirty = {};
  for (const [key, value] of Object.entries(next)) if (!Object.is(previous[key], value)) dirty[key] = value;
  for (const key of Object.keys(previous)) if (!(key in next)) dirty[key] = undefined;
  if (Object.keys(dirty).length === 0) return;
  lastApplied.set(target, next);
  gsap.set(target, dirty);
}
export function clearRendererTarget(target) { if (target) lastApplied.delete(target); }
