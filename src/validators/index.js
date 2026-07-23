import { schemaVersionRule } from './rules/schema-version.js';
import { triggerShapeRule } from './rules/trigger-shape.js';
import { easeCollisionRule } from './rules/ease-collision.js';
import { staggerShapeRule } from './rules/stagger-shape.js';
import { perspectiveUsageRule } from './rules/perspective-usage.js';
import { stopCountRule } from './rules/stop-count.js';
import { pathXYExclusivityRule } from './rules/path-xy-exclusivity.js';
import { pathShapeRule } from './rules/path-shape.js';
import { elementUniquenessRule } from './rules/element-uniqueness.js';
import { imageSequenceRule } from './rules/image-sequence.js';
import { motionStructureRule } from './rules/motion-structure.js';
import { stopShapeRule } from './rules/stop-shape.js';
import { resolveTrack } from '../usecases/ResolveTrack.js';

const motionRules = [
  triggerShapeRule,
  easeCollisionRule,
  staggerShapeRule,
  perspectiveUsageRule,
];

const trackRules = [
  stopCountRule,
  stopShapeRule,
  pathXYExclusivityRule,
  pathShapeRule,
  imageSequenceRule,
];

const crossMotionRules = [
  elementUniquenessRule,
];

/**
 * Validates whether the project schema is structurally valid enough to iterate motions.
 *
 * @param {unknown} schema
 * @returns {boolean}
 */
function isValidShape(schema) {
  return (
    schema !== null &&
    typeof schema === 'object' &&
    Array.isArray(schema.motions)
  );
}

/**
 * Main project validation entry point. Runs synchronously on plain JSON,
 * catching all violations (collect-all) and never throwing runtime exceptions.
 *
 * @param {unknown} schema - Plain JSON object representation of a MotionPath project.
 * @returns {ValidationError[]}
 */
export function validateProject(schema) {
  const errors = [];

  // Run top-level schema-version check first
  errors.push(...runSafely(schemaVersionRule, schema, "$"));
  if (!isValidShape(schema)) {
    if (schema && typeof schema === 'object') {
      errors.push({
        ruleId: "invalid-shape",
        severity: "error",
        message: "schema.motions must be an array.",
        path: "$.motions"
      });
    }
    return errors; // cannot iterate motions safely; return early
  }

  // Run structural check for templates and motions
  errors.push(...runSafely(motionStructureRule, schema));

  const context = { schema };

  // Iterate motions
  for (const [i, motion] of schema.motions.entries()) {
    const motionPath = `motions[${i}]`;

    // Resolve tracks of this motion first (if valid object structure)
    const resolvedTracks = [];
    if (motion && typeof motion === 'object' && Array.isArray(motion.tracks)) {
      for (const track of motion.tracks) {
        resolvedTracks.push(resolveTrack(track, schema.templates));
      }
    }

    // Create a resolved motion object to pass to motion rules so they see resolved tracks
    const resolvedMotion = motion && typeof motion === 'object'
      ? { ...motion, tracks: resolvedTracks }
      : motion;

    // Run motion rules (MotionRule signature: (motion, context, path) => errors)
    for (const rule of motionRules) {
      errors.push(...runSafely(rule, resolvedMotion, context, motionPath));
    }

    // Run track rules
    if (motion && typeof motion === 'object' && Array.isArray(motion.tracks)) {
      for (const [j, track] of motion.tracks.entries()) {
        const trackPath = `${motionPath}.tracks[${j}]`;
        const resolvedTrack = resolvedTracks[j];
        for (const rule of trackRules) {
          errors.push(...runSafely(rule, resolvedTrack, resolvedMotion, context, trackPath));
        }
      }
    }
  }

  // Run cross-motion rules (CrossMotionRule signature: (motions, context) => errors)
  for (const rule of crossMotionRules) {
    errors.push(...runSafely(rule, schema.motions, context));
  }

  return errors;
}

/**
 * Runs a rule function safely. If it throws, translates the exception into
 * an internal-error ValidationError to prevent the validation pass from crashing.
 */
function runSafely(rule, ...args) {
  try {
    return rule(...args);
  } catch (e) {
    return [{
      ruleId: "internal-error",
      severity: "error",
      message: `Validator rule threw unexpectedly: ${e.message}`,
      path: String(args.at(-1))
    }];
  }
}
