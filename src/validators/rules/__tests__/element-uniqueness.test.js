import { describe, it, expect } from 'vitest';
import { elementUniquenessRule } from '../element-uniqueness.js';

describe('element-uniqueness rule', () => {
  it('should pass with disjoint track IDs in same sectionId', () => {
    const motions = [
      {
        driver: { sectionId: 'scene-1' },
        tracks: [{ id: 'el-1' }, { id: 'el-2' }]
      },
      {
        driver: { sectionId: 'scene-1' },
        tracks: [{ id: 'el-3' }]
      }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(0);
  });

  it('should error when a track ID is repeated across motions with the same sectionId', () => {
    const motions = [
      {
        driver: { sectionId: 'scene-1' },
        tracks: [{ id: 'el-1' }]
      },
      {
        driver: { sectionId: 'scene-1' },
        tracks: [{ id: 'el-1' }]
      }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(2); // error for each duplicate location
    expect(errors[0].ruleId).toBe('element-uniqueness');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[0].tracks[0].id');
    expect(errors[1].path).toBe('motions[1].tracks[0].id');
    expect(errors[0].message).toContain("Duplicate track ID 'el-1'");
  });

  it('should error when the same track ID is used across different sectionId values', () => {
    const motions = [
      {
        driver: { sectionId: 'scene-1' },
        tracks: [{ id: 'el-1' }]
      },
      {
        driver: { sectionId: 'scene-2' },
        tracks: [{ id: 'el-1' }]
      }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(2);
    expect(errors[0].ruleId).toBe('element-uniqueness');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[0].tracks[0].id');
    expect(errors[1].path).toBe('motions[1].tracks[0].id');
    expect(errors[0].message).toContain("Duplicate track ID 'el-1' found across multiple motions");
  });
});
