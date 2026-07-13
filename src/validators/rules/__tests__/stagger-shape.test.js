import { describe, it, expect } from 'vitest';
import { staggerShapeRule } from '../stagger-shape.js';

describe('stagger-shape rule', () => {
  it('should error when stagger number is negative', () => {
    const motion = {
      stagger: -0.1,
      tracks: [{}, {}]
    };
    const errors = staggerShapeRule(motion, {}, 'motions[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stagger-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[0].stagger');
  });

  it('should error when stagger is an object', () => {
    const motion = {
      stagger: { each: 0.2 },
      tracks: [{}, {}]
    };
    const errors = staggerShapeRule(motion, {}, 'motions[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stagger-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[0].stagger');
  });

  it('should error when stagger is a string', () => {
    const motion = {
      stagger: '0.2',
      tracks: [{}, {}]
    };
    const errors = staggerShapeRule(motion, {}, 'motions[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stagger-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[0].stagger');
  });

  it('should pass when stagger is non-zero and motion has fewer than 2 tracks (valid for dynamic stagger)', () => {
    const motion = {
      stagger: 0.2,
      tracks: [{}]
    };
    const errors = staggerShapeRule(motion, {}, 'motions[0]');
    expect(errors).toHaveLength(0);
  });

  it('should pass with positive stagger and 2+ tracks', () => {
    const motion = {
      stagger: 0.2,
      tracks: [{}, {}, {}]
    };
    const errors = staggerShapeRule(motion, {}, 'motions[0]');
    expect(errors).toHaveLength(0);
  });

  it('should pass when stagger is omitted', () => {
    const motion = {
      tracks: [{}]
    };
    const errors = staggerShapeRule(motion, {}, 'motions[0]');
    expect(errors).toHaveLength(0);
  });
});
