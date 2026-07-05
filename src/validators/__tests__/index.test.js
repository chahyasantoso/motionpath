import { describe, it, expect } from 'vitest';
import { validateProject } from '../index.js';
import { directionAmbiguityRule } from '../rules/direction-ambiguity.js';
import { pathXYExclusivityRule } from '../rules/path-xy-exclusivity.js';
import { pathShapeRule } from '../rules/path-shape.js';
import { timelineGroupRule } from '../rules/timeline-group.js';
import { elementUniquenessRule } from '../rules/element-uniqueness.js';
import { triggerShapeRule } from '../rules/trigger-shape.js';
import { easeCollisionRule } from '../rules/ease-collision.js';
import { staggerShapeRule } from '../rules/stagger-shape.js';
import { perspectiveUsageRule } from '../rules/perspective-usage.js';

describe('validateProject integration tests', () => {
  it('should return empty array for a fully valid minimal project', () => {
    const project = {
      projectId: 'hero-page',
      schemaVersion: 1,
      perspective: 1000,
      scenarios: [
        {
          sceneId: 'scene-1',
          trigger: {
            type: 'time',
            duration: 2,
            repeat: -1
          },
          elements: [
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
      scenarios: [
        {
          sceneId: 'scene-1',
          trigger: {
            type: 'scroll',
            scrub: true,
            repeat: -1 // rule: trigger-shape (repeat incompatible with scrub)
          },
          stagger: -0.5, // rule: stagger-shape (negative stagger)
          elements: [
            {
              id: 'el-1',
              keyframes: {
                path: {
                  points: [{}, {}, {}] // rule: path-shape (invalid points count)
                },
                x: { stops: [{ p: 0, v: 0 }] } // rule: path-xy-exclusivity (path & x present)
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

    const badScenarios = { schemaVersion: 1, scenarios: 'not-an-array' };
    expect(() => validateProject(badScenarios)).not.toThrow();
    const badScenariosErrors = validateProject(badScenarios);
    expect(badScenariosErrors).toHaveLength(1);
    expect(badScenariosErrors[0].ruleId).toBe('invalid-shape');
    expect(badScenariosErrors[0].severity).toBe('error');
    expect(badScenariosErrors[0].path).toBe('$.scenarios');

    // scenarios is entirely absent
    const missingScenarios = { schemaVersion: 1 };
    expect(() => validateProject(missingScenarios)).not.toThrow();
    const missingScenariosErrors = validateProject(missingScenarios);
    expect(missingScenariosErrors).toHaveLength(1);
    expect(missingScenariosErrors[0].ruleId).toBe('invalid-shape');
    expect(missingScenariosErrors[0].severity).toBe('error');
    expect(missingScenariosErrors[0].path).toBe('$.scenarios');
  });

  it('every rule function has the correct arity for its type', () => {
    const scenarioRules = [triggerShapeRule, easeCollisionRule, staggerShapeRule, perspectiveUsageRule];
    const elementRules = [directionAmbiguityRule, pathXYExclusivityRule, pathShapeRule];
    const crossScenarioRules = [timelineGroupRule, elementUniquenessRule];

    scenarioRules.forEach(rule => expect(rule.length).toBe(3));   // (scenario, context, path)
    elementRules.forEach(rule => expect(rule.length).toBe(4));    // (element, scenario, context, path)
    crossScenarioRules.forEach(rule => expect(rule.length).toBe(2)); // (scenarios, context)
  });
});
