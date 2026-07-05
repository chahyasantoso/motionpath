import { describe, it, expect } from 'vitest';
import { pathXYExclusivityRule } from '../path-xy-exclusivity.js';

describe('path-xy-exclusivity rule', () => {
  it('should error when both path and x are present', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        path: {},
        x: {}
      }
    };
    const errors = pathXYExclusivityRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('path-xy-exclusivity');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].elements[0].keyframes');
  });

  it('should error when both path and y are present', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        path: {},
        y: {}
      }
    };
    const errors = pathXYExclusivityRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
  });

  it('should pass when only path is present', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        path: {}
      }
    };
    const errors = pathXYExclusivityRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(0);
  });

  it('should pass when only x and y are present', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        x: {},
        y: {}
      }
    };
    const errors = pathXYExclusivityRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(0);
  });
});
