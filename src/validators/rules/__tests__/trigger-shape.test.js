import { describe, it, expect } from 'vitest';
import { triggerShapeRule } from '../trigger-shape.js';

describe('trigger-shape rule', () => {
  it('should pass on valid scroll-scrub triggers', () => {
    const scenario = {
      trigger: { type: 'scroll', scrub: true, endTrigger: '#x' }
    };
    const errors = triggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(0);
  });

  it('should error on scroll observer trigger with endTrigger', () => {
    const scenario = {
      trigger: { type: 'scroll', scrub: false, endTrigger: '#x' }
    };
    const errors = triggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('trigger-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].trigger.endTrigger');
  });

  it('should pass on valid time triggers', () => {
    const scenario = {
      trigger: { type: 'time', duration: 2, repeat: -1 }
    };
    const errors = triggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(0);
  });

  it('should error on scroll-scrub with repeat settings', () => {
    const scenario = {
      trigger: { type: 'scroll', scrub: true, repeat: -1 }
    };
    const errors = triggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('trigger-shape');
    expect(errors[0].path).toBe('scenarios[0].trigger');
  });

  it('should error on scroll-scrub with delay', () => {
    const scenario = {
      trigger: { type: 'scroll', scrub: true, delay: 1 }
    };
    const errors = triggerShapeRule(scenario, {}, 'scenarios[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('scenarios[0].trigger.delay');
  });

  it('should error if trigger is missing or type is invalid', () => {
    expect(triggerShapeRule({}, {}, 'scenarios[0]')).toHaveLength(1);
    expect(triggerShapeRule({ trigger: {} }, {}, 'scenarios[0]')).toHaveLength(1);
    expect(triggerShapeRule({ trigger: { type: 'invalid' } }, {}, 'scenarios[0]')).toHaveLength(1);
  });

  it('should error if scrub is missing or not a boolean in scroll trigger', () => {
    const missingScrub = triggerShapeRule({ trigger: { type: 'scroll' } }, {}, 'scenarios[0]');
    expect(missingScrub).toHaveLength(1);
    expect(missingScrub[0].path).toBe('scenarios[0].trigger.scrub');

    const invalidScrub = triggerShapeRule({ trigger: { type: 'scroll', scrub: 'yes' } }, {}, 'scenarios[0]');
    expect(invalidScrub).toHaveLength(1);
    expect(invalidScrub[0].path).toBe('scenarios[0].trigger.scrub');
  });
});
