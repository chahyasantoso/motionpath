import { describe, it, expect } from 'vitest';
import { validateProject } from '../index.js';

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
    expect(validateProject({}).length).toBe(1);

    // scenarios is not an array
    const badScenarios = { schemaVersion: 1, scenarios: 'not-an-array' };
    expect(() => validateProject(badScenarios)).not.toThrow();
    expect(validateProject(badScenarios).length).toBe(0); // since schemaVersion is valid, but isValidShape is false so returns only version errors (which are 0)
    // Wait! If schemaVersion is valid, but scenarios is 'not-an-array', should isValidShape return false?
    // Yes. And since isValidShape returns false, validateProject returns errors which contains only version check errors (which is empty in this case).
    // Let's verify that this behaves correctly.
  });
});
