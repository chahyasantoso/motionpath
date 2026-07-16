import { describe, it, expect } from 'vitest';
import { elementUniquenessRule } from '../element-uniqueness.js';

describe('element-uniqueness rule', () => {
  it('should pass when track IDs are unique across the whole project', () => {
    const motions = [
      {
        tracks: [{ id: 'el-1' }, { id: 'el-2' }]
      },
      {
        tracks: [{ id: 'el-3' }]
      }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(0);
  });

  it('should error when a track ID is duplicated within the same motion', () => {
    const motions = [
      {
        tracks: [{ id: 'el-1' }, { id: 'el-1' }]
      }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('element-uniqueness');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[0].tracks[1].id');
    expect(errors[0].message).toContain("Duplicate track ID 'el-1'");
  });

  it('should error when the same track ID is used across different motions', () => {
    const motions = [
      {
        tracks: [{ id: 'el-1' }]
      },
      {
        tracks: [{ id: 'el-1' }]
      }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('element-uniqueness');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[1].tracks[0].id');
    expect(errors[0].message).toContain("Duplicate track ID 'el-1'");
    expect(errors[0].message).toContain('motions[0].tracks[0]');
  });

  it('should report each duplicate independently when the same ID repeats 3+ times', () => {
    const motions = [
      { tracks: [{ id: 'el-1' }] },
      { tracks: [{ id: 'el-1' }] },
      { tracks: [{ id: 'el-1' }] }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(2);
    expect(errors[0].path).toBe('motions[1].tracks[0].id');
    expect(errors[1].path).toBe('motions[2].tracks[0].id');
  });
});
