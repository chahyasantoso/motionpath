import { describe, it, expect } from 'vitest';
import { perspectiveUsageRule } from '../perspective-usage.js';

describe('perspective-usage rule', () => {
  it('should warn when 3D property is used and perspective is absent', () => {
    const scenario = {
      elements: [
        {
          id: 'test-el',
          keyframes: {
            rotationX: {}
          }
        }
      ]
    };
    const errors = perspectiveUsageRule(scenario, { schema: {} }, 'scenarios[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('perspective-usage');
    expect(errors[0].severity).toBe('warning');
    expect(errors[0].path).toBe('scenarios[0]');
  });

  it('should pass when 3D property is used but perspective is present', () => {
    const scenario = {
      elements: [
        {
          id: 'test-el',
          keyframes: {
            rotationX: {}
          }
        }
      ]
    };
    const errors = perspectiveUsageRule(scenario, { schema: { perspective: 800 } }, 'scenarios[0]');
    expect(errors).toHaveLength(0);
  });

  it('should pass when only 2D properties are used and perspective is absent', () => {
    const scenario = {
      elements: [
        {
          id: 'test-el',
          keyframes: {
            x: {},
            y: {}
          }
        }
      ]
    };
    const errors = perspectiveUsageRule(scenario, { schema: {} }, 'scenarios[0]');
    expect(errors).toHaveLength(0);
  });

  it('should warn when path has points with non-zero z and perspective is absent', () => {
    const scenario = {
      elements: [
        {
          id: 'test-el',
          keyframes: {
            path: {
              points: [{ x: 0, y: 0, z: 100 }, { x: 0, y: 0 }]
            }
          }
        }
      ]
    };
    const errors = perspectiveUsageRule(scenario, { schema: {} }, 'scenarios[0]');
    expect(errors).toHaveLength(1);
  });
});
