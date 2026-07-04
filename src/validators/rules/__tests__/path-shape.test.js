import { describe, it, expect } from 'vitest';
import { pathShapeRule } from '../path-shape.js';

describe('path-shape rule', () => {
  it('should pass with points length 4 and stops in range', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        path: {
          points: [{}, {}, {}, {}],
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
        }
      }
    };
    const errors = pathShapeRule(element, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(0);
  });

  it('should pass with points length 7 (Bézier chain)', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        path: {
          points: [{}, {}, {}, {}, {}, {}, {}]
        }
      }
    };
    const errors = pathShapeRule(element, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(0);
  });

  it('should error when points length is 5 (invalid Bézier chain)', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        path: {
          points: [{}, {}, {}, {}, {}]
        }
      }
    };
    const errors = pathShapeRule(element, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('path-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].elements[0].keyframes.path.points');
  });

  it('should error when a stop has v out of range [0, 1]', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        path: {
          points: [{}, {}, {}, {}],
          stops: [{ p: 0, v: -0.1 }, { p: 1, v: 1.5 }]
        }
      }
    };
    const errors = pathShapeRule(element, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(2);
    expect(errors[0].ruleId).toBe('path-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].elements[0].keyframes.path.stops[0].v');
    expect(errors[1].path).toBe('scenarios[0].elements[0].keyframes.path.stops[1].v');
  });
});
