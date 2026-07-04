import { describe, it, expect } from 'vitest';
import { easeCollisionRule } from '../ease-collision.js';

describe('ease-collision rule', () => {
  it('should error on ease collision at same p with different ease values', () => {
    const scenario = {
      elements: [
        {
          id: 'test-el',
          keyframes: {
            x: { stops: [{ p: 0.5, v: 10, ease: 'power1.in' }] },
            y: { stops: [{ p: 0.5, v: 20, ease: 'power2.out' }] }
          }
        }
      ]
    };
    const errors = easeCollisionRule(scenario, 'scenarios[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('ease-collision');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].elements[0].keyframes');
    expect(errors[0].message).toContain("conflicting eases at p=0.5");
  });

  it('should pass if ease at same p is identical', () => {
    const scenario = {
      elements: [
        {
          id: 'test-el',
          keyframes: {
            x: { stops: [{ p: 0.5, v: 10, ease: 'power1.in' }] },
            y: { stops: [{ p: 0.5, v: 20, ease: 'power1.in' }] }
          }
        }
      ]
    };
    const errors = easeCollisionRule(scenario, 'scenarios[0]');
    expect(errors).toHaveLength(0);
  });

  it('should pass if one of the properties omits ease', () => {
    const scenario = {
      elements: [
        {
          id: 'test-el',
          keyframes: {
            x: { stops: [{ p: 0.5, v: 10, ease: 'power1.in' }] },
            y: { stops: [{ p: 0.5, v: 20 }] }
          }
        }
      ]
    };
    const errors = easeCollisionRule(scenario, 'scenarios[0]');
    expect(errors).toHaveLength(0);
  });

  it('should pass if stops are at different p values entirely', () => {
    const scenario = {
      elements: [
        {
          id: 'test-el',
          keyframes: {
            x: { stops: [{ p: 0.4, v: 10, ease: 'power1.in' }] },
            y: { stops: [{ p: 0.5, v: 20, ease: 'power2.out' }] }
          }
        }
      ]
    };
    const errors = easeCollisionRule(scenario, 'scenarios[0]');
    expect(errors).toHaveLength(0);
  });

  it('should work with path stops as well', () => {
    const scenario = {
      elements: [
        {
          id: 'test-el',
          keyframes: {
            path: {
              points: [{}, {}, {}, {}],
              stops: [{ p: 0.5, v: 0.5, ease: 'power2.in' }]
            },
            opacity: {
              stops: [{ p: 0.5, v: 1, ease: 'power1.out' }]
            }
          }
        }
      ]
    };
    const errors = easeCollisionRule(scenario, 'scenarios[0]');
    expect(errors).toHaveLength(1);
  });
});
