#!/usr/bin/env bash
#
# MotionPath v4 -- Phase 0 + Phase 1 patch
# =========================================
# Phase 0: baseline safety net (canonical fixture + first integration tests)
# Phase 1: stop production correctness failures
#          R-01 wire the validator into loadProject (+ standalone tracks)
#          R-02 make `id` the one authoritative motion identifier
#          R-03 honor autoplay / delay on time triggers, stop swallowing duration
#          R-04 engine-owned lifecycle: unmount(), adopt(), createTrackInstance()
#          R-10 (partial) ManualTriggerDelegate.seek()
#
# Usage:
#   bash motionpath-phase1.sh            # write files, then run `npm test`
#   bash motionpath-phase1.sh --no-test  # write files only
#   bash motionpath-phase1.sh --force    # skip the clean-worktree check
#
# Run it from the repository root on branch v4.

set -euo pipefail

RUN_TESTS=1
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --no-test) RUN_TESTS=0 ;;
    --force)   FORCE=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
fail() { printf "\033[31m%s\033[0m\n" "$1" >&2; exit 1; }

# --- preflight -------------------------------------------------------------
[ -f package.json ] || fail "No package.json here. Run this from the repo root."
grep -q '"name": "motionpath"' package.json || fail "package.json does not look like motionpath."
[ -d src/engines ] && [ -d src/validators/rules ] || fail "src/engines or src/validators/rules missing -- wrong branch? Expected v4."

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
[ "$BRANCH" = "v4" ] || echo "WARNING: you are on branch '$BRANCH', expected 'v4'."

if [ "$FORCE" -eq 0 ] && [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  fail "Working tree is dirty. Commit or stash first, or re-run with --force."
fi

bold "Writing Phase 0 + Phase 1 files..."

mkdir -p src/errors
echo '  src/errors/MotionPathValidationError.js'
cat > src/errors/MotionPathValidationError.js <<'MPFILE'
/**
 * Aggregate error thrown by Engine.loadProject() when a project fails
 * validation. Carries EVERY violation, not just the first one, so a caller can
 * fix the whole schema in one pass.
 *
 * Review findings: R-01 (validator never wired into the runtime).
 */
export class MotionPathValidationError extends Error {
  constructor(errors = [], { projectId } = {}) {
    const fatal = errors.filter((e) => e && e.severity === 'error');
    const label = projectId ? ` "${projectId}"` : '';
    const body = fatal
      .map((e) => `  [${e.ruleId}] ${e.path ?? '$'}: ${e.message}`)
      .join('\n');

    super(
      `MotionPath: project${label} failed validation with ${fatal.length} error(s):\n${body}`
    );

    this.name = 'MotionPathValidationError';
    /** every ValidationError, including warnings */
    this.errors = errors;
    /** only severity === 'error' */
    this.fatalErrors = fatal;
    /** only severity !== 'error' */
    this.warnings = errors.filter((e) => e && e.severity !== 'error');
  }
}
MPFILE

mkdir -p src/validators
echo '  src/validators/index.js'
cat > src/validators/index.js <<'MPFILE'
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
 * True when at least one ValidationError has severity 'error'.
 * Warnings alone never block a load.
 *
 * @param {ValidationError[]} errors
 * @returns {boolean}
 */
export function hasFatalErrors(errors) {
  return Array.isArray(errors) && errors.some((e) => e && e.severity === 'error');
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

  // Run the SAME track rules over standalone (stampable) schema.tracks[].
  // Before this, only motion-structure ever saw top-level tracks, so a
  // stamping-only project was effectively unvalidated. Fixes R-01 (part 2).
  //
  // Standalone tracks have no owning motion. We pass a synthetic host that
  // carries no trigger, so the motion-aware track rules stay inert instead of
  // reading `undefined.trigger`.
  if (Array.isArray(schema.tracks)) {
    for (const [k, track] of schema.tracks.entries()) {
      const trackPath = `tracks[${k}]`;
      const resolvedTrack = runSafelyValue(() => resolveTrack(track, schema.templates), null);
      const standaloneHost = { id: null, trigger: undefined, tracks: [resolvedTrack] };
      for (const rule of trackRules) {
        errors.push(...runSafely(rule, resolvedTrack, standaloneHost, context, trackPath));
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

/** Same collect-all discipline, for non-rule helpers that may throw. */
function runSafelyValue(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
MPFILE

mkdir -p src/validators/rules
echo '  src/validators/rules/motion-structure.js'
cat > src/validators/rules/motion-structure.js <<'MPFILE'
/**
 * Rule: motion-structure
 * Performs structural validation for templates, motions, triggers, and track template references.
 * Validates the v4 motion shape. v2/v3 fields (driver, timelineId, primary, lifecycle, playback,
 * motionId) are explicitly forbidden with a dedicated error each.
 *
 * R-02: `id` is the ONE authoritative motion identifier. The runtime
 * (parseV4Project + Engine) only ever reads `motion.id`, so accepting
 * `motionId` here used to let a schema validate and then register under the
 * key `undefined`. `motionId` is now a forbidden v3 field like the rest.
 *
 * @param {unknown} schema - Full project schema
 * @returns {ValidationError[]}
 */
export function motionStructureRule(schema) {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  // 1. Validate templates structure and forbidden fields
  const seenTemplateIds = new Set();
  const templates = Array.isArray(schema.templates) ? schema.templates : [];

  for (const [i, template] of templates.entries()) {
    const templatePath = `templates[${i}]`;
    if (!template || typeof template !== 'object') {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Template at index ${i} must be an object.`,
        path: templatePath
      });
      continue;
    }

    const { templateId, driver, timelineId, primary, trigger } = template;

    if (!templateId || typeof templateId !== 'string') {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'templateId is required and must be a string.',
        path: `${templatePath}.templateId`
      });
    } else {
      if (seenTemplateIds.has(templateId)) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: `Duplicate templateId '${templateId}' found.`,
          path: `${templatePath}.templateId`
        });
      }
      seenTemplateIds.add(templateId);
    }

    if (driver !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'Template forbids driver property.',
        path: `${templatePath}.driver`
      });
    }
    if (timelineId !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'Template forbids timelineId property.',
        path: `${templatePath}.timelineId`
      });
    }
    if (primary !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'Template forbids primary property.',
        path: `${templatePath}.primary`
      });
    }
    if (trigger !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'Template forbids trigger property.',
        path: `${templatePath}.trigger`
      });
    }
  }

  // Helper to validate track references
  const validateTracksArray = (tracks, pathPrefix, motionIdOrIdx) => {
    if (tracks === undefined || tracks === null) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Motion "${motionIdOrIdx}": tracks must have at least 1 entry`,
        path: pathPrefix
      });
    } else if (!Array.isArray(tracks)) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'tracks must be an array.',
        path: pathPrefix
      });
    } else if (tracks.length < 1) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Motion "${motionIdOrIdx}": tracks must have at least 1 entry`,
        path: pathPrefix
      });
    } else {
      for (const [j, track] of tracks.entries()) {
        if (!track || typeof track !== 'object') continue;

        if (typeof track.id !== 'string' || track.id === '') {
          errors.push({
            ruleId: 'motion-structure',
            severity: 'error',
            message: `Motion "${motionIdOrIdx}": track.id is required and must be a non-empty string.`,
            path: `${pathPrefix}[${j}].id`
          });
        }

        if (track.use !== undefined) {
          if (!seenTemplateIds.has(track.use)) {
            errors.push({
              ruleId: 'motion-structure',
              severity: 'error',
              message: `Track references non-existent templateId '${track.use}'.`,
              path: `${pathPrefix}[${j}].use`
            });
          }
        }
      }
    }
  };

  // 2. Validate motions structure
  const seenMotionIds = new Set();
  const motions = Array.isArray(schema.motions) ? schema.motions : [];

  for (const [i, motion] of motions.entries()) {
    const motionPath = `motions[${i}]`;
    if (!motion || typeof motion !== 'object') {
      continue;
    }

    const { id, motionId, driver, trigger, tracks, timelineId, primary, lifecycle, playback } = motion;

    // R-02: motionId is a v3 leftover. The runtime never reads it.
    if (motionId !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: '"motionId" is a v3 field, not valid in v4 -- rename it to "id". parseV4Project and Engine only read motion.id, so a motionId-only motion registers under the key `undefined` and can never be mounted.',
        path: `${motionPath}.motionId`
      });
    }

    if (typeof id !== 'string' || id === '') {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'motion.id is required and must be a non-empty string.',
        path: `${motionPath}.id`
      });
    } else {
      if (seenMotionIds.has(id)) {
        errors.push({
          ruleId: 'motion-structure',
          severity: 'error',
          message: `Duplicate motion id '${id}' found.`,
          path: `${motionPath}.id`
        });
      }
      seenMotionIds.add(id);
    }

    // Forbidden v2/v3 fields in v4
    if (driver !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: '"driver" is a v2/v3 field, not valid in v4 -- motions always have a trigger, no driver wrapper needed.',
        path: `${motionPath}.driver`
      });
    }
    if (timelineId !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: '"timelineId" is a v2/v3 field, not valid in v4 -- tracks under the same motion share a trigger automatically.',
        path: `${motionPath}.timelineId`
      });
    }
    if (primary !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: '"primary" is a v2/v3 field, not valid in v4.',
        path: `${motionPath}.primary`
      });
    }
    if (lifecycle !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: '"lifecycle" is a v2/v3 field, not valid in v4.',
        path: `${motionPath}.lifecycle`
      });
    }
    if (playback !== undefined) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: '"playback" is a v2/v3 field, not valid in v4.',
        path: `${motionPath}.playback`
      });
    }

    if (trigger === undefined || trigger === null) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'trigger is required on every motion in v4.',
        path: `${motionPath}.trigger`
      });
    } else if (typeof trigger !== 'object') {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'trigger must be an object.',
        path: `${motionPath}.trigger`
      });
    } else if (!trigger.type || typeof trigger.type !== 'string') {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: 'trigger.type is required and must be a string.',
        path: `${motionPath}.trigger.type`
      });
    }

    validateTracksArray(tracks, `${motionPath}.tracks`, id || i);
  }

  // Validate top-level bare tracks if present
  if (Array.isArray(schema.tracks)) {
    validateTracksArray(schema.tracks, 'tracks', 'top-level');
  }

  return errors;
}
MPFILE

mkdir -p src/validators/rules/__tests__
echo '  src/validators/rules/__tests__/motion-structure.test.js'
cat > src/validators/rules/__tests__/motion-structure.test.js <<'MPFILE'
import { describe, it, expect } from 'vitest';
import { motionStructureRule } from '../motion-structure.js';

describe('motion-structure rule', () => {
  it('should return errors when templates have forbidden fields', () => {
    const schema = {
      templates: [
        {
          templateId: 't1',
          driver: { type: 'timeline' },
          timelineId: 'tl1',
          primary: true,
          trigger: { type: 'time' }
        }
      ]
    };
    const errors = motionStructureRule(schema);
    const paths = errors.map(e => e.path);
    expect(paths).toContain('templates[0].driver');
    expect(paths).toContain('templates[0].timelineId');
    expect(paths).toContain('templates[0].primary');
    expect(paths).toContain('templates[0].trigger');
  });

  it('should error on duplicate templateIds', () => {
    const schema = {
      templates: [
        { templateId: 't1' },
        { templateId: 't1' }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('templates[1].templateId');
    expect(errors[0].message).toContain("Duplicate templateId 't1'");
  });

  it('should error on duplicate motion ids', () => {
    const schema = {
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] },
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ id: 'tr2' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[1].id');
    expect(errors[0].message).toContain("Duplicate motion id 'm1'");
  });

  it('should error if driver or other forbidden fields are present on motion', () => {
    const schema = {
      motions: [
        {
          id: 'm1',
          trigger: { type: 'time' },
          driver: { type: 'timeline' },
          timelineId: 'tl1',
          primary: true,
          lifecycle: {},
          playback: {},
          tracks: [{ id: 'tr1' }]
        }
      ]
    };
    const errors = motionStructureRule(schema);
    const paths = errors.map(e => e.path);
    expect(paths).toContain('motions[0].driver');
    expect(paths).toContain('motions[0].timelineId');
    expect(paths).toContain('motions[0].primary');
    expect(paths).toContain('motions[0].lifecycle');
    expect(paths).toContain('motions[0].playback');
  });

  // --- R-02: id is the ONE authoritative motion identifier -------------------

  it('rejects motionId as a v3 field and still demands id', () => {
    const schema = {
      motions: [
        { motionId: 'legacy', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    const paths = errors.map(e => e.path);

    // The old rule computed `effectiveId = id ?? motionId`, so this schema
    // PASSED validation and then registered under the key `undefined`.
    expect(paths).toContain('motions[0].motionId');
    expect(paths).toContain('motions[0].id');
    expect(errors.find(e => e.path === 'motions[0].motionId').message)
      .toContain('rename it to "id"');
  });

  it('rejects motionId even when a valid id is also present', () => {
    const schema = {
      motions: [
        { id: 'm1', motionId: 'm1', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].motionId');
  });

  it('accepts a motion identified only by id', () => {
    const schema = {
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    expect(motionStructureRule(schema)).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------

  it('should error if trigger is missing on motion', () => {
    const schema = {
      motions: [
        { id: 'm1', tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].trigger');
    expect(errors[0].message).toContain('trigger is required on every motion');
  });

  it('should error if trigger is not an object', () => {
    const schema = {
      motions: [
        { id: 'm1', trigger: 'not-an-object', tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].trigger');
    expect(errors[0].message).toContain('trigger must be an object');
  });

  it('should error if trigger.type is invalid', () => {
    const schema = {
      motions: [
        { id: 'm1', trigger: { type: 123 }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].trigger.type');
    expect(errors[0].message).toContain('trigger.type is required and must be a string');
  });

  it('should error if tracks is missing or empty', () => {
    const schema1 = {
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [] }
      ]
    };
    const schema2 = {
      motions: [
        { id: 'm1', trigger: { type: 'time' } }
      ]
    };
    expect(motionStructureRule(schema1)[0].path).toBe('motions[0].tracks');
    expect(motionStructureRule(schema2)[0].path).toBe('motions[0].tracks');
  });

  it('should error on missing id', () => {
    const schema = {
      motions: [
        { trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].id');
    expect(errors[0].message).toContain('motion.id is required');
  });

  it('should error on empty string id', () => {
    const schema = {
      motions: [
        { id: '', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].id');
    expect(errors[0].message).toContain('motion.id is required');
  });

  it('should error on missing track.id', () => {
    const schema = {
      templates: [{ templateId: 't1' }],
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ use: 't1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].tracks[0].id');
    expect(errors[0].message).toContain('track.id is required');
  });

  it('should error on empty string track.id', () => {
    const schema = {
      templates: [{ templateId: 't1' }],
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ id: '', use: 't1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].tracks[0].id');
    expect(errors[0].message).toContain('track.id is required');
  });

  it('should error if track references non-existent template', () => {
    const schema = {
      templates: [{ templateId: 't1' }],
      motions: [
        {
          id: 'm1',
          trigger: { type: 'time' },
          tracks: [{ id: 'tr1', use: 'non-existent' }]
        }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].tracks[0].use');
  });
});
MPFILE

mkdir -p src/lib
echo '  src/lib/TriggerDelegate.js'
cat > src/lib/TriggerDelegate.js <<'MPFILE'
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

function clamp01(val) {
  return Math.max(0, Math.min(1, Number(val) || 0));
}

const isDev = () => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

export class AutonomousTimelineControls {
  #timeline;

  constructor(timeline) {
    this.#timeline = timeline;
  }

  play() {
    this.#timeline.play();
  }

  pause() {
    this.#timeline.pause();
  }

  seek(p) {
    this.#timeline.progress(clamp01(p));
  }

  reverse() {
    this.#timeline.reverse();
  }

  onComplete(cb) {
    this.#timeline.eventCallback('onComplete', cb);
  }
}

export class ScrollTriggerDelegate {
  #config;
  #controls;
  #timeline;

  constructor(config = {}) {
    this.#config = config;
  }

  build() {
    const triggerEl = this.#config.trigger;
    const pinEl = this.#config.pin === true ? triggerEl : this.#config.pin;
    const endTriggerEl = this.#config.endTrigger;

    const scrollTriggerObj = {
      start: this.#config.start,
      end: this.#config.end,
      scrub: this.#config.scrub,
      pin: pinEl,
      pinSpacing: this.#config.pinSpacing,
      toggleActions: this.#config.toggleActions,
    };
    if (triggerEl) {
      scrollTriggerObj.trigger = triggerEl;
    }
    if (endTriggerEl) {
      scrollTriggerObj.endTrigger = endTriggerEl;
    }

    this.#timeline = gsap.timeline({
      scrollTrigger: scrollTriggerObj,
    });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }

  play() { this.#controls?.play(); }
  pause() { this.#controls?.pause(); }
  seek(p) { this.#controls?.seek(p); }
  reverse() { this.#controls?.reverse(); }
  onComplete(cb) { this.#controls?.onComplete(cb); }

  destroy() {
    if (this.#timeline) {
      if (this.#timeline.scrollTrigger) {
        this.#timeline.scrollTrigger.kill(true); // true reverts styling and layout
      }
      this.#timeline.kill();
    }
  }
}

export class TimeTriggerDelegate {
  #config;
  #controls;
  #timeline;

  constructor(config = {}) {
    this.#config = config;
  }

  build() {
    const cfg = this.#config;

    // R-03: autoplay and delay were declared in types.js and shipped in demo
    // schemas, but build() read neither -- EVERY time motion autoplayed and
    // `autoplay: false` was a silent no-op. Both are honored now.
    // Default stays `true` so existing schemas that omit it are unchanged.
    const autoplay = cfg.autoplay ?? true;
    const delay = typeof cfg.delay === 'number' ? cfg.delay : 0;

    // `trigger.duration` has no coherent meaning on a master timeline whose
    // length is derived from its children. Rather than silently swallowing it
    // (the old behavior), say so out loud in dev. Promoting this to a hard
    // validator error is a Phase 2 decision, once demo schemas are migrated.
    if (isDev() && cfg.duration !== undefined) {
      console.warn(
        '[MotionPath] time trigger: `duration` is ignored. A time motion gets its length from the ' +
        '`duration` on each of its tracks. Remove trigger.duration.'
      );
    }

    this.#timeline = gsap.timeline({
      repeat: cfg.repeat ?? 0,
      yoyo: !!cfg.yoyo,
      repeatDelay: cfg.repeatDelay ?? 0,
      delay,
      paused: !autoplay,
    });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }

  play() { this.#controls?.play(); }
  pause() { this.#controls?.pause(); }
  seek(p) { this.#controls?.seek(p); }
  reverse() { this.#controls?.reverse(); }
  onComplete(cb) { this.#controls?.onComplete(cb); }

  destroy() {
    this.#timeline?.kill();
  }
}

export class ManualTriggerDelegate {
  #timeline;

  build() {
    this.#timeline = gsap.timeline({ paused: true });
    return this.#timeline;
  }

  progress(p) {
    if (!this.#timeline) return 0;
    if (p === undefined) return this.#timeline.progress();
    this.#timeline.progress(clamp01(p));
  }

  // R-10 (partial): `seek` is the single playhead verb every other delegate
  // exposes. Manual now answers to it too, so app code can stop branching on
  // the concrete delegate class. `progress()` stays as the existing alias and
  // will be deprecated in Phase 2 when the delegate contract is unified.
  seek(p) {
    return this.progress(p);
  }

  destroy() {
    this.#timeline?.kill();
  }
}

export const triggerDelegateRegistry = new Map([
  ['scroll', (config) => new ScrollTriggerDelegate(config)],
  ['time', (config) => new TimeTriggerDelegate(config)],
  ['manual', (config) => new ManualTriggerDelegate(config)],
]);

export function registerTriggerDelegate(type, factory) {
  triggerDelegateRegistry.set(type, factory);
}
MPFILE

mkdir -p src/engines
echo '  src/engines/Engine.js'
cat > src/engines/Engine.js <<'MPFILE'
import { parseV4Project } from '../lib/schema/parseV4Project.js';
import { triggerDelegateRegistry } from '../lib/TriggerDelegate.js';
import { createTrack } from '../lib/createTrack.js';
import { Motion } from '../lib/Motion.js';
import { validateProject, hasFatalErrors } from '../validators/index.js';
import { MotionPathValidationError } from '../errors/MotionPathValidationError.js';

const isDev = () => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

export class Engine {
  #v4Project = null;

  // Engine-owned identity. Keyed by an opaque handle, NOT by schema id, so a
  // Motion and a Track can never collide in the same key space (R-04).
  #instances = new Map();   // handle -> runtime object
  #handles = new WeakMap(); // runtime object -> handle
  #instanceCounter = 0;
  #lastValidation = [];

  /**
   * @param {object} schema - plain v4 project JSON
   * @param {{ validate?: boolean }} [options]
   *   validate: run validateProject() first and throw on any fatal error.
   *   Defaults to true. Pass false ONLY for trusted internal callers and tests
   *   that deliberately load a known-broken schema.
   * @throws {MotionPathValidationError}
   */
  async loadProject(schema, options = {}) {
    const { validate = true } = options;

    // Validate BEFORE tearing down the current project or building anything.
    // A rejected load must leave the engine exactly as it was. Fixes R-01.
    if (validate) {
      const errors = validateProject(schema);
      this.#lastValidation = errors;

      if (hasFatalErrors(errors)) {
        throw new MotionPathValidationError(errors, { projectId: schema?.projectId });
      }

      const warnings = errors.filter((e) => e && e.severity !== 'error');
      if (isDev() && warnings.length > 0) {
        console.warn(
          `[MotionPath] project loaded with ${warnings.length} validation warning(s):\n` +
            warnings.map((w) => `  [${w.ruleId}] ${w.path ?? '$'}: ${w.message}`).join('\n')
        );
      }
    } else {
      this.#lastValidation = [];
    }

    this.destroy();
    this.#v4Project = await parseV4Project(schema);
  }

  /** Every ValidationError from the most recent validated load (warnings included). */
  get validationReport() {
    return this.#lastValidation;
  }

  /** How many runtime objects the engine currently owns. Must not grow across mount/unmount cycles. */
  get instanceCount() {
    return this.#instances.size;
  }

  #register(runtimeObject, kind) {
    const handle = `${kind}#${++this.#instanceCounter}`;
    this.#instances.set(handle, runtimeObject);
    this.#handles.set(runtimeObject, handle);
    return handle;
  }

  #mountMotionWithDelegate(motionConfig, delegate) {
    const instanceId = `motion-${this.#instanceCounter + 1}`;
    const motion = new Motion({
      id: instanceId,
      triggerDelegate: delegate,
      staggerTransition: motionConfig.staggerTransition,
    });
    motion.motionId = motionConfig.id;

    const stagger = typeof motionConfig.stagger === 'number' ? motionConfig.stagger : 0;
    const motionTracks = motionConfig.tracks || [];
    for (let i = 0; i < motionTracks.length; i++) {
      const trackConfig = motionTracks[i];
      const track = createTrack(trackConfig, this.#v4Project.templates);
      motion.mount(track, i * stagger);
    }

    motion.init();

    this.#register(motion, 'motion');
    return motion;
  }

  mountInstance(motionId, config = {}) {
    if (!this.#v4Project) {
      throw new Error('mountInstance: project not loaded.');
    }

    const motionConfig = this.#v4Project.getMotionConfig(motionId);
    if (motionConfig) {
      const triggerType = motionConfig.trigger?.type;
      const factory = triggerDelegateRegistry.get(triggerType);
      if (!factory) {
        throw new Error(
          `Unknown trigger type "${triggerType}" on motion "${motionId}".`
        );
      }
      const delegate = factory(motionConfig.trigger);
      return this.#mountMotionWithDelegate(motionConfig, delegate);
    }

    const trackConfig = this.#v4Project.getTrackConfig(motionId);
    if (trackConfig) {
      const track = createTrack(trackConfig, this.#v4Project.templates);
      this.#register(track, 'track');
      return track;
    }

    throw new Error(`mountInstance: motion or track "${motionId}" not found in project.`);
  }

  mountWithDelegate(motionId, delegate) {
    if (!this.#v4Project) throw new Error('mountWithDelegate: project not loaded.');
    const motionConfig = this.#v4Project.getMotionConfig(motionId);
    if (!motionConfig) throw new Error(`mountWithDelegate: motion "${motionId}" not found in project.`);
    return this.#mountMotionWithDelegate(motionConfig, delegate);
  }

  /**
   * Stamp a NEW runtime Track from a schema track definition and take ownership
   * of it. This is the supported replacement for calling createTrack() directly
   * with engine.getTrackConfig() -- tracks made that way were invisible to the
   * engine and survived engine.destroy(). Fixes R-04 (second half).
   *
   * @param {string} trackId - id of a track declared under a motion or schema.tracks[]
   * @param {object} [overrides] - e.g. { id: `ball-${n}`, duration: 4 }
   * @returns {import('../lib/Track.js').Track}
   */
  createTrackInstance(trackId, overrides = {}) {
    if (!this.#v4Project) throw new Error('createTrackInstance: project not loaded.');
    const cfg = this.#v4Project.getTrackConfig(trackId);
    if (!cfg) throw new Error(`createTrackInstance: track "${trackId}" not found in project.`);
    const track = createTrack({ ...cfg, ...overrides }, this.#v4Project.templates);
    return this.adopt(track);
  }

  /**
   * Take ownership of a runtime object created elsewhere so engine.destroy()
   * can clean it up. Idempotent.
   */
  adopt(runtimeObject) {
    if (!runtimeObject) return runtimeObject;
    if (this.#handles.has(runtimeObject)) return runtimeObject;
    this.#register(runtimeObject, 'adopted');
    return runtimeObject;
  }

  /**
   * Destroy a runtime object AND drop it from the registry. This is the one
   * teardown call every hook and consumer should make -- calling
   * instance.destroy() directly leaves a corpse in #instances, which is what
   * made the map grow monotonically across route changes and made
   * engine.destroy() double-destroy afterwards. Fixes R-04.
   *
   * @returns {boolean} true when the engine actually owned the object
   */
  unmount(runtimeObject) {
    if (!runtimeObject) return false;

    const handle = this.#handles.get(runtimeObject);
    const owned = handle !== undefined;

    if (owned) {
      this.#handles.delete(runtimeObject);
      this.#instances.delete(handle);
    }

    try {
      runtimeObject.destroy?.();
    } catch (e) {
      if (isDev()) {
        console.warn('[MotionPath] error while destroying instance:', e);
      }
    }

    return owned;
  }

  isOwned(runtimeObject) {
    return Boolean(runtimeObject) && this.#handles.has(runtimeObject);
  }

  getTrack(trackId) {
    if (!this.#v4Project) return null;
    for (const inst of this.#instances.values()) {
      // Track exposes progress(); Motion does not. Cheap structural check that
      // keeps motions and tracks from colliding now that the key space is
      // engine-owned handles rather than schema ids.
      if (inst && typeof inst.progress === 'function' && inst.id === trackId) {
        return inst;
      }
    }
    return null;
  }

  getTrackConfig(trackId) {
    return this.#v4Project?.getTrackConfig(trackId) ?? null;
  }

  get templates() {
    return this.#v4Project?.templates ?? [];
  }

  destroy() {
    for (const inst of Array.from(this.#instances.values())) {
      try {
        inst?.destroy?.();
      } catch (e) {
        if (isDev()) {
          console.warn('[MotionPath] error during engine teardown:', e);
        }
      }
    }
    this.#instances.clear();
    this.#handles = new WeakMap();
    this.#v4Project = null;
  }
}

export const engine = new Engine();
MPFILE

mkdir -p src/hooks
echo '  src/hooks/useMotionInstance.js'
cat > src/hooks/useMotionInstance.js <<'MPFILE'
import { useEffect, useRef, useState } from 'react';
import { engine } from '../engines/Engine.js';

/**
 * React Hook to mount and manage a v4 Motion/Track.
 * Automatically unmounts the instance THROUGH the engine when the component
 * unmounts, so the engine's instance registry stays accurate (R-04).
 *
 * NOTE: The `config` parameter is mount-time-only. Changing `config` after the
 * component has mounted does not trigger a remount or update the running instance.
 *
 * @param {string} motionId
 * @param {Object} [config]
 * @returns {Object|null}
 */
export default function useMotionInstance(motionId, config) {
  const [instance, setInstance] = useState(null);
  const initialConfigRef = useRef(config);
  const warnedConfigChangeRef = useRef(false);

  if (
    import.meta.env?.DEV &&
    !warnedConfigChangeRef.current &&
    initialConfigRef.current !== config
  ) {
    warnedConfigChangeRef.current = true;
    console.warn(
      '[useMotionInstance] config is mount-time-only. Changing config after mount has no effect.'
    );
  }

  useEffect(() => {
    if (!motionId) return undefined;

    const inst = engine.mountInstance(motionId, initialConfigRef.current);
    if (!inst) return undefined;

    setInstance(inst);

    return () => {
      // engine.unmount destroys AND deregisters. Calling inst.destroy()
      // directly here is what leaked the registry across route changes.
      engine.unmount(inst);
      setInstance(null);
    };
  }, [motionId]);

  return instance;
}
MPFILE

mkdir -p src/hooks
echo '  src/hooks/useScrollMotion.js'
cat > src/hooks/useScrollMotion.js <<'MPFILE'
import { useEffect, useRef, useState } from 'react';
import { engine } from '../engines/Engine.js';
import { ScrollTriggerDelegate } from '../lib/TriggerDelegate.js';

/**
 * Mounts a scroll-triggered motion using component-local DOM refs instead of
 * the old string-id + TriggerRefRegistry indirection. Every call builds its
 * own delegate from its own refs, so multiple concurrent instances of the
 * same schema motion never collide on a shared id namespace -- there IS no
 * shared namespace.
 *
 * @param {Object|null} schema - the motion's schema object (e.g. scrollScene),
 *   or null to defer mounting (lazy-instancing gate, same convention as
 *   useMotionInstance's `motionId ? id : null` pattern).
 * @returns {{ refs: { trigger: RefObject, pin?: RefObject, endTrigger?: RefObject }, instance: Object|null }}
 */
export default function useScrollMotion(schema) {
  // Refs created unconditionally, every render, regardless of `schema` --
  // Rules of Hooks: the set of refs this hook allocates can't depend on a
  // value that might change across renders.
  const triggerRef = useRef(null);
  const pinRef = useRef(null);
  const endTriggerRef = useRef(null);
  const [instance, setInstance] = useState(null);

  const config = schema?.trigger;

  useEffect(() => {
    if (!schema?.id || !config || !triggerRef.current) return undefined;

    const delegate = new ScrollTriggerDelegate({
      ...config,
      trigger: triggerRef.current,
      pin: config.pin === 'pin' ? pinRef.current : config.pin, // 'pin' role-string -> separate element; `true`/falsy pass through
      endTrigger: config.endTrigger ? endTriggerRef.current : undefined,
    });

    const motion = engine.mountWithDelegate(schema.id, delegate);
    setInstance(motion);

    return () => {
      // Deregister as well as destroy -- see R-04.
      engine.unmount(motion);
      setInstance(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema?.id]);

  const refs = {
    trigger: triggerRef,
    pin: config?.pin === 'pin' ? pinRef : undefined,
    endTrigger: config?.endTrigger ? endTriggerRef : undefined,
  };

  return { refs, instance };
}
MPFILE

mkdir -p src/integration/fixtures
echo '  src/integration/fixtures/v4-project.js'
cat > src/integration/fixtures/v4-project.js <<'MPFILE'
/**
 * The canonical v4 integration fixture.
 *
 * Deliberately exercises one of everything the schema supports, because it is
 * the shared input for every phase's integration tests:
 *   - a scroll-scrub motion (no track durations -- scroll position IS the playhead)
 *   - a time motion with stagger + staggerTransition
 *   - a time motion with autoplay:false (R-03 regression surface)
 *   - a manual motion
 *   - an image-sequence motion
 *   - a template consumed by three tracks
 *   - a path track
 *   - a CSS custom property
 *   - a standalone schema.tracks[] entry for runtime stamping
 *
 * INVARIANT: validateProject(v4Project) must return zero severity:'error'
 * entries. src/integration/__tests__/validation-gate.test.js enforces that.
 */
export const v4Project = {
  schemaVersion: 4,
  projectId: 'integration-fixture',
  perspective: 1200,

  templates: [
    {
      templateId: 'fade-pop',
      duration: 0.6,
      transformOrigin: '50% 50%',
      keyframes: {
        opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
        scale: { stops: [{ p: 0, v: 0.8 }, { p: 1, v: 1, ease: 'back.out(2)' }] },
      },
    },
  ],

  motions: [
    {
      id: 'scroll-scrub',
      trigger: { type: 'scroll', scrub: true, start: 'top top', end: 'bottom top' },
      tracks: [
        {
          id: 'scroll-path-track',
          keyframes: {
            path: {
              points: [
                { x: 0, y: 0 },
                { x: 320, y: 180, ctrlX: 160, ctrlY: 0 },
                { x: 640, y: 0 },
              ],
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1, ease: 'none' }],
              autoRotate: true,
            },
            blur: { stops: [{ p: 0, v: 0 }, { p: 0.5, v: 6 }, { p: 1, v: 0 }] },
          },
        },
      ],
    },

    {
      id: 'time-loop',
      trigger: { type: 'time', repeat: 1, yoyo: true, repeatDelay: 0.1 },
      stagger: 0.12,
      staggerTransition: { duration: 0.55, ease: 'power2.out' },
      tracks: [
        { id: 'card-1', use: 'fade-pop' },
        { id: 'card-2', use: 'fade-pop', duration: 0.9 },
        {
          id: 'card-3',
          use: 'fade-pop',
          duration: 1,
          keyframes: {
            '--card-size': { stops: [{ p: 0, v: '28px' }, { p: 1, v: '56px' }] },
          },
        },
      ],
    },

    {
      id: 'time-paused',
      trigger: { type: 'time', autoplay: false },
      tracks: [
        {
          id: 'paused-track',
          duration: 1,
          keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } },
        },
      ],
    },

    {
      id: 'manual-scrubber',
      trigger: { type: 'manual' },
      tracks: [
        {
          id: 'needle',
          duration: 1,
          keyframes: { rotation: { stops: [{ p: 0, v: -90 }, { p: 1, v: 90 }] } },
        },
      ],
    },

    {
      id: 'sequence',
      trigger: { type: 'time' },
      tracks: [
        {
          id: 'film-strip',
          duration: 1,
          keyframes: {
            imageSequence: {
              frames: ['/seq/001.webp', '/seq/002.webp', '/seq/003.webp'],
              stops: [{ p: 0, v: 0 }, { p: 1, v: 2 }],
            },
          },
        },
      ],
    },
  ],

  tracks: [
    {
      id: 'ball-exit-track',
      duration: 0.35,
      keyframes: {
        scale: { stops: [{ p: 0, v: 1 }, { p: 0.35, v: 1.7 }, { p: 1, v: 0 }] },
        opacity: { stops: [{ p: 0, v: 1 }, { p: 1, v: 0 }] },
      },
    },
  ],
};

export default v4Project;
MPFILE

mkdir -p src/integration/__tests__
echo '  src/integration/__tests__/validation-gate.test.js'
cat > src/integration/__tests__/validation-gate.test.js <<'MPFILE'
import { describe, it, expect } from 'vitest';
import { Engine } from '../../engines/Engine.js';
import { validateProject, hasFatalErrors } from '../../validators/index.js';
import { MotionPathValidationError } from '../../errors/MotionPathValidationError.js';
import { v4Project } from '../fixtures/v4-project.js';

const fatal = (errors) => errors.filter((e) => e.severity === 'error');

describe('integration: the validator is the executable spec (R-01, R-02)', () => {
  it('the canonical fixture has zero fatal validation errors', () => {
    const errors = validateProject(v4Project);
    expect(fatal(errors)).toEqual([]);
  });

  it('a schema that validates also loads', async () => {
    const engine = new Engine();
    await expect(engine.loadProject(v4Project)).resolves.toBeUndefined();
    engine.destroy();
  });

  it('loadProject throws MotionPathValidationError and builds nothing', async () => {
    const engine = new Engine();
    const bad = {
      schemaVersion: 4,
      motions: [
        {
          id: 'broken',
          trigger: { type: 'definitely-not-registered' },
          tracks: [{ id: 't', keyframes: { opacity: { stops: [{ p: 0, v: 0 }] } } }],
        },
      ],
    };

    await expect(engine.loadProject(bad)).rejects.toBeInstanceOf(MotionPathValidationError);

    // Nothing was parsed, nothing was mounted, no plugin was loaded.
    expect(() => engine.mountInstance('broken')).toThrow(/project not loaded/);
    expect(engine.instanceCount).toBe(0);
  });

  it('reports EVERY violation, not just the first', async () => {
    const engine = new Engine();
    const bad = {
      schemaVersion: 4,
      motions: [
        {
          id: 'broken',
          trigger: { type: 'definitely-not-registered' },
          tracks: [{ id: 't', keyframes: { opacity: { stops: [{ p: 0, v: 0 }] } } }],
        },
      ],
    };

    const err = await engine.loadProject(bad).catch((e) => e);
    expect(err).toBeInstanceOf(MotionPathValidationError);
    expect(err.fatalErrors.length).toBeGreaterThan(1);
    expect(err.message).toContain('trigger-shape');
    expect(err.message).toContain('stop-count');
  });

  it('a failed load leaves a previously loaded project untouched', async () => {
    const engine = new Engine();
    await engine.loadProject(v4Project);
    const before = engine.getTrackConfig('needle');
    expect(before).not.toBeNull();

    await expect(
      engine.loadProject({ schemaVersion: 4, motions: [{ trigger: { type: 'time' }, tracks: [] }] })
    ).rejects.toBeInstanceOf(MotionPathValidationError);

    expect(engine.getTrackConfig('needle')).not.toBeNull();
    engine.destroy();
  });

  it('rejects motionId and demands id (R-02)', async () => {
    const legacy = {
      schemaVersion: 4,
      motions: [
        {
          motionId: 'legacy',
          trigger: { type: 'time' },
          tracks: [{ id: 'x', keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }],
        },
      ],
    };

    const errors = validateProject(legacy);
    expect(errors.some((e) => e.path === 'motions[0].motionId')).toBe(true);
    expect(errors.some((e) => e.path === 'motions[0].id')).toBe(true);

    const engine = new Engine();
    await expect(engine.loadProject(legacy)).rejects.toBeInstanceOf(MotionPathValidationError);
  });

  it('a motionId-only project can never reach mountInstance', async () => {
    const legacy = {
      schemaVersion: 4,
      motions: [
        {
          motionId: 'legacy',
          trigger: { type: 'time' },
          tracks: [{ id: 'x', keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }],
        },
      ],
    };

    const engine = new Engine();
    // With { validate: false } the OLD failure mode is still observable: the
    // motion lands under the key `undefined` and is unmountable. That is
    // exactly what the validator now catches up front.
    await engine.loadProject(legacy, { validate: false });
    expect(() => engine.mountInstance('legacy')).toThrow(/not found in project/);
    engine.destroy();
  });

  it('runs the full track rule set over standalone schema.tracks[] (R-01, part 2)', () => {
    const stampingOnly = {
      schemaVersion: 4,
      motions: [],
      tracks: [
        { id: 'stamp', keyframes: { opacity: { stops: [{ p: 0, v: 0 }] } } },
      ],
    };

    const errors = validateProject(stampingOnly);
    // Before this change only motion-structure ever saw top-level tracks, so a
    // one-stop property here was completely unvalidated.
    expect(
      errors.some((e) => e.ruleId === 'stop-count' && String(e.path).startsWith('tracks[0]'))
    ).toBe(true);
  });

  it('{ validate: false } is an explicit opt-out for trusted callers', async () => {
    const engine = new Engine();
    const sloppy = {
      schemaVersion: 4,
      motions: [
        {
          id: 'm',
          trigger: { type: 'time' },
          tracks: [{ id: 't', duration: 1, keyframes: { opacity: { stops: [{ p: 0, v: 0 }] } } }],
        },
      ],
    };

    expect(hasFatalErrors(validateProject(sloppy))).toBe(true);
    await expect(engine.loadProject(sloppy, { validate: false })).resolves.toBeUndefined();
    engine.destroy();
  });
});
MPFILE

mkdir -p src/integration/__tests__
echo '  src/integration/__tests__/engine-lifecycle.test.js'
cat > src/integration/__tests__/engine-lifecycle.test.js <<'MPFILE'
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Engine } from '../../engines/Engine.js';
import { TimeTriggerDelegate, ManualTriggerDelegate } from '../../lib/TriggerDelegate.js';
import { domRenderer } from '../../renderers/domRenderer.js';
import { v4Project } from '../fixtures/v4-project.js';

let engine;

beforeEach(() => {
  engine = new Engine();
});

afterEach(() => {
  engine.destroy();
  document.body.innerHTML = '';
});

describe('integration: Engine -> Motion -> Track -> compose -> domRenderer', () => {
  it('drives a manual motion all the way to a real DOM write', async () => {
    await engine.loadProject(v4Project);

    const motion = engine.mountInstance('manual-scrubber');
    const needle = motion.getTrack('needle');
    expect(needle).toBeTruthy();

    const el = document.createElement('div');
    document.body.appendChild(el);

    const patches = [];
    const unsubscribe = needle.subscribe((raw) => {
      const patch = needle.compose(raw);
      patches.push(patch);
      domRenderer(el, patch);
    });

    motion.trigger.seek(0);
    expect(patches.at(-1).rotation).toBeCloseTo(-90, 3);

    motion.trigger.seek(0.5);
    expect(patches.at(-1).rotation).toBeCloseTo(0, 3);

    motion.trigger.seek(1);
    expect(patches.at(-1).rotation).toBeCloseTo(90, 3);

    // The renderer actually touched the node rather than only computing a patch.
    expect(el.getAttribute('style')).toBeTruthy();

    unsubscribe();
  });

  it('resolves a template into three tracks and staggers them in SECONDS', async () => {
    await engine.loadProject(v4Project);

    const motion = engine.mountInstance('time-loop');
    expect(motion.getTrack('card-1')).toBeTruthy();
    expect(motion.getTrack('card-2')).toBeTruthy();
    expect(motion.getTrack('card-3')).toBeTruthy();

    // card-1/2 inherit the template's keyframes; card-3 adds a CSS var on top.
    const card1 = motion.getTrack('card-1');
    const patch = card1.compose(card1.getSnapshot());
    expect(patch).toHaveProperty('opacity');
    expect(patch).toHaveProperty('scale');

    const card3 = motion.getTrack('card-3');
    expect(card3.compose(card3.getSnapshot())).toHaveProperty('--card-size');

    // duration comes from the template (0.6) unless the track overrides it.
    expect(card1.duration).toBeCloseTo(0.6, 3);
    expect(motion.getTrack('card-2').duration).toBeCloseTo(0.9, 3);
  });

  it('mounts an image-sequence track and emits a backgroundImage', async () => {
    await engine.loadProject(v4Project);
    const motion = engine.mountInstance('sequence');
    const strip = motion.getTrack('film-strip');

    motion.trigger.seek(1);
    const patch = strip.compose(strip.getSnapshot());
    expect(String(patch.backgroundImage)).toContain('003.webp');
  });
});

describe('integration: lifecycle ownership (R-04)', () => {
  it('unmount() prunes the registry; repeated cycles do not grow it', async () => {
    await engine.loadProject(v4Project);

    for (let i = 0; i < 5; i++) {
      const motion = engine.mountInstance('time-paused');
      expect(engine.instanceCount).toBe(1);
      expect(engine.unmount(motion)).toBe(true);
      expect(engine.instanceCount).toBe(0);
    }
  });

  it('unmount() is idempotent and safe on an already-unmounted instance', async () => {
    await engine.loadProject(v4Project);
    const motion = engine.mountInstance('time-paused');

    expect(engine.unmount(motion)).toBe(true);
    expect(engine.unmount(motion)).toBe(false); // no longer owned, still no throw
    expect(engine.instanceCount).toBe(0);
  });

  it('stamped tracks are engine-owned and cleaned up by destroy()', async () => {
    await engine.loadProject(v4Project);

    const a = engine.createTrackInstance('ball-exit-track', { id: 'ball-1' });
    const b = engine.createTrackInstance('ball-exit-track', { id: 'ball-2' });

    expect(a).not.toBe(b);
    expect(engine.isOwned(a)).toBe(true);
    expect(engine.isOwned(b)).toBe(true);
    expect(engine.instanceCount).toBe(2);

    engine.destroy();
    expect(engine.instanceCount).toBe(0);
  });

  it('adopt() takes ownership of an externally created track exactly once', async () => {
    await engine.loadProject(v4Project);
    const track = engine.createTrackInstance('ball-exit-track', { id: 'ball-x' });

    const count = engine.instanceCount;
    engine.adopt(track);
    expect(engine.instanceCount).toBe(count);
  });

  it('destroy() is idempotent', async () => {
    await engine.loadProject(v4Project);
    engine.mountInstance('time-paused');
    engine.destroy();
    expect(() => engine.destroy()).not.toThrow();
    expect(engine.instanceCount).toBe(0);
  });
});

describe('integration: TimeTriggerDelegate honors its config (R-03)', () => {
  it('autoplays by default', () => {
    const d = new TimeTriggerDelegate({});
    const tl = d.build();
    expect(tl.paused()).toBe(false);
    d.destroy();
  });

  it('autoplay:false produces a PAUSED master timeline', () => {
    const d = new TimeTriggerDelegate({ autoplay: false });
    const tl = d.build();
    expect(tl.paused()).toBe(true);

    d.play();
    expect(tl.paused()).toBe(false);
    d.destroy();
  });

  it('forwards delay, repeat, yoyo and repeatDelay', () => {
    const d = new TimeTriggerDelegate({ delay: 0.4, repeat: 2, yoyo: true, repeatDelay: 0.2 });
    const tl = d.build();
    expect(tl.delay()).toBeCloseTo(0.4, 5);
    expect(tl.repeat()).toBe(2);
    expect(tl.yoyo()).toBe(true);
    expect(tl.repeatDelay()).toBeCloseTo(0.2, 5);
    d.destroy();
  });

  it('a mounted autoplay:false motion does not advance on its own', async () => {
    await engine.loadProject(v4Project);
    const motion = engine.mountInstance('time-paused');
    const track = motion.getTrack('paused-track');
    expect(track.progress()).toBeCloseTo(0, 5);
  });
});

describe('integration: ManualTriggerDelegate exposes seek() (R-10 partial)', () => {
  it('seek() and progress() are the same playhead', () => {
    const d = new ManualTriggerDelegate();
    const tl = d.build();
    d.seek(0.25);
    expect(tl.progress()).toBeCloseTo(0.25, 5);
    d.progress(0.75);
    expect(tl.progress()).toBeCloseTo(0.75, 5);
    d.destroy();
  });
});
MPFILE

bold ""
bold "Changed files:"
git --no-pager diff --stat || true
git status --porcelain

if [ "$RUN_TESTS" -eq 1 ]; then
  bold ""
  bold "Running npm test..."
  npm test
fi

bold ""
bold "Phase 0 + 1 applied."
cat <<'NOTES'

What to check before you push
-----------------------------
1. Validation is now ENFORCED at engine.loadProject(). Any demo schema with a
   real violation will now throw instead of silently misbehaving. Boot the dev
   server and click through every demo route once.
2. `motionId` on a motion is now a hard validation error. Grep for it:
       grep -rn "motionId:" src/components src/*.jsx
   Rename every occurrence to `id`. (motion.motionId as a READ-only property on
   the runtime Motion object is untouched -- only the schema field is rejected.)
3. `autoplay: false` on a time trigger now actually pauses the motion. The
   Spiral demo ships `trigger: { type: 'time', autoplay: false, duration: 0.35 }`
   and previously autoplayed regardless, with useSpiralWaveController driving
   those tracks by hand. Watch that page specifically.
4. `trigger.duration` on a time trigger now logs a dev warning. It is still
   ignored (that was already true). Promoting it to a hard error is a Phase 2
   decision, once the demo schemas are migrated.
5. Anywhere you call `instance.destroy()` on something the engine handed you,
   switch to `engine.unmount(instance)`. Anywhere you call
   `createTrack(engine.getTrackConfig(id), engine.templates)` to stamp, switch
   to `engine.createTrackInstance(id, { id: uniqueId, duration })` so the
   engine can clean it up. useSpiralWaveController and TowerDefense are the two
   call sites that matter; they are Phase 4 work but the new API is available now.
6. Escape hatch if a demo blocks you: `engine.loadProject(schema, { validate: false })`.
   Treat it as a TODO, not a fix.

Then: git add -A && git commit -m "phase 1: enforce validation, id, autoplay, lifecycle" && git push
NOTES
