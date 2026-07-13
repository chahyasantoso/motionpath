import { describe, it, expect } from 'vitest';
import { validateProject } from '../index.js';
import { stopCountRule } from '../rules/stop-count.js';
import { pathXYExclusivityRule } from '../rules/path-xy-exclusivity.js';
import { pathShapeRule } from '../rules/path-shape.js';
import { timelineGroupRule } from '../rules/timeline-group.js';
import { elementUniquenessRule } from '../rules/element-uniqueness.js';
import { triggerShapeRule } from '../rules/trigger-shape.js';
import { easeCollisionRule } from '../rules/ease-collision.js';
import { staggerShapeRule } from '../rules/stagger-shape.js';
import { perspectiveUsageRule } from '../rules/perspective-usage.js';
import { stopShapeRule } from '../rules/stop-shape.js';

describe('validateProject integration tests', () => {
  it('should return empty array for a fully valid minimal project', () => {
    const project = {
      projectId: 'hero-page',
      schemaVersion: 2,
      perspective: 1000,
      motions: [
        {
          motionId: 'motion-1',
          driver: {
            type: 'timeline',
            sectionId: 'scene-1',
            trigger: {
              type: 'time',
              duration: 2,
              repeat: -1
            }
          },
          tracks: [
            {
              id: 'el-1',
              keyframes: {
                x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] },
                y: { stops: [{ p: 0, v: 0 }, { p: 1, v: 200 }] }
              }
            }
          ]
        }
      ]
    };
    const errors = validateProject(project);
    expect(errors).toEqual([]);
  });

  it('should collect multiple simultaneous errors across different rules', () => {
    const project = {
      schemaVersion: 'not-a-number', // rule: schema-version
      motions: [
        {
          driver: {
            type: 'timeline',
            sectionId: 'scene-1',
            trigger: {
              type: 'scroll',
              scrub: true,
              repeat: -1 // rule: trigger-shape (repeat incompatible with scrub)
            }
          },
          stagger: -0.5, // rule: stagger-shape (negative stagger)
          tracks: [
            {
              id: 'el-1',
              keyframes: {
                path: {
                  points: [{}, {}, {}], // rule: path-shape (invalid points count)
                  stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
                },
                x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] } // rule: path-xy-exclusivity (path & x present)
              }
            }
          ]
        }
      ]
    };

    const errors = validateProject(project);

    // Let's assert that we got errors from each rule
    const ruleIds = errors.map(e => e.ruleId);
    expect(ruleIds).toContain('schema-version');
    expect(ruleIds).toContain('trigger-shape');
    expect(ruleIds).toContain('stagger-shape');
    expect(ruleIds).toContain('path-shape');
    expect(ruleIds).toContain('path-xy-exclusivity');

    // Make sure we didn't throw an exception and returned everything
    expect(errors.length).toBeGreaterThanOrEqual(5);
  });

  it('should defensively handle garbage/malformed inputs without throwing', () => {
    // null
    expect(() => validateProject(null)).not.toThrow();
    expect(validateProject(null)[0].ruleId).toBe('schema-version');

    // empty object
    expect(() => validateProject({})).not.toThrow();
    expect(validateProject({}).length).toBe(2);

    const badMotions = { schemaVersion: 2, motions: 'not-an-array' };
    expect(() => validateProject(badMotions)).not.toThrow();
    const badMotionsErrors = validateProject(badMotions);
    expect(badMotionsErrors).toHaveLength(1);
    expect(badMotionsErrors[0].ruleId).toBe('invalid-shape');
    expect(badMotionsErrors[0].severity).toBe('error');
    expect(badMotionsErrors[0].path).toBe('$.motions');

    // motions is entirely absent
    const missingMotions = { schemaVersion: 2 };
    expect(() => validateProject(missingMotions)).not.toThrow();
    const missingMotionsErrors = validateProject(missingMotions);
    expect(missingMotionsErrors).toHaveLength(1);
    expect(missingMotionsErrors[0].ruleId).toBe('invalid-shape');
    expect(missingMotionsErrors[0].severity).toBe('error');
    expect(missingMotionsErrors[0].path).toBe('$.motions');
  });

  it('every rule function has the correct arity for its type', () => {
    const motionRules = [triggerShapeRule, easeCollisionRule, staggerShapeRule, perspectiveUsageRule];
    const trackRules = [stopCountRule, stopShapeRule, pathXYExclusivityRule, pathShapeRule];
    const crossMotionRules = [timelineGroupRule, elementUniquenessRule];

    motionRules.forEach(rule => expect(rule.length).toBe(3));   // (motion, context, path)
    trackRules.forEach(rule => expect(rule.length).toBe(4));    // (track, motion, context, path)
    crossMotionRules.forEach(rule => expect(rule.length).toBe(2)); // (motions, context)
  });

  it('track rules use the 3rd argument positionally as context, never sniffing its type', () => {
    const motion = {};
    const realPath = 'motions[0].tracks[0]';

    // 1. stopCountRule
    const trackDA = { keyframes: { opacity: { stops: [{ p: 0.5 }] } } };
    const errorsDA = stopCountRule(trackDA, motion, 'not-a-context-object', realPath);
    expect(errorsDA.length).toBeGreaterThan(0);
    errorsDA.forEach(e => expect(e.path.startsWith(realPath)).toBe(true));

    // 2. pathXYExclusivityRule
    const trackXY = { keyframes: { path: {}, x: {} } };
    const errorsXY = pathXYExclusivityRule(trackXY, motion, 'not-a-context-object', realPath);
    expect(errorsXY.length).toBeGreaterThan(0);
    errorsXY.forEach(e => expect(e.path.startsWith(realPath)).toBe(true));

    // 3. pathShapeRule
    const trackPS = { keyframes: { path: { points: [{}, {}, {}] } } };
    const errorsPS = pathShapeRule(trackPS, motion, 'not-a-context-object', realPath);
    expect(errorsPS.length).toBeGreaterThan(0);
    errorsPS.forEach(e => expect(e.path.startsWith(realPath)).toBe(true));
  });

  it('should validate malformed stop shape during full project validation', () => {
    const project = {
      projectId: 'demo',
      schemaVersion: 2,
      motions: [
        {
          motionId: 'motion-1',
          driver: { type: 'manual' },
          tracks: [
            {
              id: 'el-1',
              keyframes: {
                x: { stops: [1, 2] }
              }
            }
          ]
        }
      ]
    };

    const errors = validateProject(project);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const stopShapeErrors = errors.filter(e => e.ruleId === 'stop-shape');
    expect(stopShapeErrors).toHaveLength(2);
    expect(stopShapeErrors[0].path).toBe('motions[0].tracks[0].keyframes.x.stops[0]');
    expect(stopShapeErrors[1].path).toBe('motions[0].tracks[0].keyframes.x.stops[1]');
  });
});
