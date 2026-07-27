import { schemaVersionRule } from './rules/schema-version.js';
import { triggerShapeRule } from './rules/trigger-shape.js';
import { easeCollisionRule } from './rules/ease-collision.js';
import { staggerShapeRule } from './rules/stagger-shape.js';
import { perspectiveUsageRule } from './rules/perspective-usage.js';
import { stopCountRule } from './rules/stop-count.js';
import { stopSequenceRule } from './rules/stop-sequence.js';
import { pathXYExclusivityRule } from './rules/path-xy-exclusivity.js';
import { pathShapeRule } from './rules/path-shape.js';
import { elementUniquenessRule } from './rules/element-uniqueness.js';
import { imageSequenceRule } from './rules/image-sequence.js';
import { motionStructureRule } from './rules/motion-structure.js';
import { stopShapeRule } from './rules/stop-shape.js';
import { resolveTrack } from '../usecases/ResolveTrack.js';

const motionRules = [triggerShapeRule, easeCollisionRule, staggerShapeRule, perspectiveUsageRule];
const trackRules = [stopCountRule, stopShapeRule, stopSequenceRule, pathXYExclusivityRule, pathShapeRule, imageSequenceRule];
const crossMotionRules = [elementUniquenessRule];

function isValidShape(schema) { return schema !== null && typeof schema === 'object' && Array.isArray(schema.motions); }
export function hasFatalErrors(errors) { return Array.isArray(errors) && errors.some((e) => e && e.severity === 'error'); }

export function validateProject(schema) {
  const errors = [];
  errors.push(...runSafely(schemaVersionRule, schema, '$'));
  if (!isValidShape(schema)) {
    if (schema && typeof schema === 'object') errors.push({ ruleId: 'invalid-shape', severity: 'error', message: 'schema.motions must be an array.', path: '$.motions' });
    return errors;
  }
  errors.push(...runSafely(motionStructureRule, schema));
  const context = { schema };
  for (const [i, motion] of schema.motions.entries()) {
    const motionPath = `motions[${i}]`;
    const resolvedTracks = [];
    if (motion && typeof motion === 'object' && Array.isArray(motion.tracks)) for (const track of motion.tracks) resolvedTracks.push(resolveTrack(track, schema.templates));
    const resolvedMotion = motion && typeof motion === 'object' ? { ...motion, tracks: resolvedTracks } : motion;
    for (const rule of motionRules) errors.push(...runSafely(rule, resolvedMotion, context, motionPath));
    if (motion && typeof motion === 'object' && Array.isArray(motion.tracks)) {
      for (const [j] of motion.tracks.entries()) {
        const trackPath = `${motionPath}.tracks[${j}]`;
        for (const rule of trackRules) errors.push(...runSafely(rule, resolvedTracks[j], resolvedMotion, context, trackPath));
      }
    }
  }
  if (Array.isArray(schema.tracks)) for (const [k, track] of schema.tracks.entries()) {
    const trackPath = `tracks[${k}]`;
    const resolvedTrack = runSafelyValue(() => resolveTrack(track, schema.templates), null);
    const standaloneHost = { id: null, trigger: undefined, tracks: [resolvedTrack] };
    for (const rule of trackRules) errors.push(...runSafely(rule, resolvedTrack, standaloneHost, context, trackPath));
  };
  for (const rule of crossMotionRules) errors.push(...runSafely(rule, schema.motions, context));
  return errors;
}
function runSafely(rule, ...args) { try { return rule(...args); } catch (e) { return [{ ruleId: 'internal-error', severity: 'error', message: `Validator rule threw unexpectedly: ${e.message}`, path: String(args.at(-1)) }]; } }
function runSafelyValue(fn, fallback) { try { return fn(); } catch { return fallback; } }
