import { describe, it, expect } from 'vitest';
import { elementUniquenessRule } from '../element-uniqueness.js';

describe('element-uniqueness rule', () => {
  it('should pass with disjoint element IDs in same sceneId', () => {
    const scenarios = [
      {
        sceneId: 'scene-1',
        elements: [{ id: 'el-1' }, { id: 'el-2' }]
      },
      {
        sceneId: 'scene-1',
        elements: [{ id: 'el-3' }]
      }
    ];
    const errors = elementUniquenessRule(scenarios);
    expect(errors).toHaveLength(0);
  });

  it('should error when an element ID is repeated across scenarios with the same sceneId', () => {
    const scenarios = [
      {
        sceneId: 'scene-1',
        elements: [{ id: 'el-1' }]
      },
      {
        sceneId: 'scene-1',
        elements: [{ id: 'el-1' }]
      }
    ];
    const errors = elementUniquenessRule(scenarios);
    expect(errors).toHaveLength(2); // error for each duplicate location
    expect(errors[0].ruleId).toBe('element-uniqueness');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].elements[0].id');
    expect(errors[1].path).toBe('scenarios[1].elements[0].id');
    expect(errors[0].message).toContain("Duplicate element ID 'el-1'");
  });

  it('should error when the same element ID is used across different sceneId values', () => {
    const scenarios = [
      {
        sceneId: 'scene-1',
        elements: [{ id: 'el-1' }]
      },
      {
        sceneId: 'scene-2',
        elements: [{ id: 'el-1' }]
      }
    ];
    const errors = elementUniquenessRule(scenarios);
    expect(errors).toHaveLength(2);
    expect(errors[0].ruleId).toBe('element-uniqueness');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].elements[0].id');
    expect(errors[1].path).toBe('scenarios[1].elements[0].id');
    expect(errors[0].message).toContain("Duplicate element ID 'el-1' found across multiple scenarios");
  });
});
