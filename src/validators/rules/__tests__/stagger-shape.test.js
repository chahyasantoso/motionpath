import { describe, it, expect } from 'vitest';
import { staggerShapeRule } from '../stagger-shape.js';

describe('stagger-shape rule', () => {
  it('should error when stagger number is negative', () => {
    const scenario = {
      stagger: -0.1,
      elements: [{}, {}]
    };
    const errors = staggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stagger-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].stagger');
  });

  it('should error when stagger is an object', () => {
    const scenario = {
      stagger: { each: 0.2 },
      elements: [{}, {}]
    };
    const errors = staggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stagger-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].stagger');
  });

  it('should error when stagger is a string', () => {
    const scenario = {
      stagger: '0.2',
      elements: [{}, {}]
    };
    const errors = staggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stagger-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].stagger');
  });

  it('should warn when stagger is non-zero and scenario has fewer than 2 elements', () => {
    const scenario = {
      stagger: 0.2,
      elements: [{}]
    };
    const errors = staggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stagger-shape');
    expect(errors[0].severity).toBe('warning');
    expect(errors[0].path).toBe('scenarios[0].stagger');
  });

  it('should pass with positive stagger and 2+ elements', () => {
    const scenario = {
      stagger: 0.2,
      elements: [{}, {}, {}]
    };
    const errors = staggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(0);
  });

  it('should pass when stagger is omitted', () => {
    const scenario = {
      elements: [{}]
    };
    const errors = staggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(0);
  });
});
