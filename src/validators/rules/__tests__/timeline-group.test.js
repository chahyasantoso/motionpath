import { describe, it, expect } from 'vitest';
import { timelineGroupRule } from '../timeline-group.js';

describe('timeline-group rule', () => {
  it('should pass on group of two time scenarios with one primary', () => {
    const scenarios = [
      {
        timelineId: 'group-1',
        primary: true,
        trigger: { type: 'time' }
      },
      {
        timelineId: 'group-1',
        primary: false,
        trigger: { type: 'time' }
      }
    ];
    const errors = timelineGroupRule(scenarios);
    expect(errors).toHaveLength(0);
  });

  it('should error when mixing time and scroll trigger types in the same group', () => {
    const scenarios = [
      {
        timelineId: 'group-1',
        primary: true,
        trigger: { type: 'time' }
      },
      {
        timelineId: 'group-1',
        primary: false,
        trigger: { type: 'scroll', scrub: true }
      }
    ];
    const errors = timelineGroupRule(scenarios);
    // Should complain about mismatching trigger
    expect(errors.some(e => e.ruleId === 'timeline-group' && e.path === 'scenarios[1].trigger')).toBe(true);
  });

  it('should error when group contains a scroll observer scenario (scrub: false)', () => {
    const scenarios = [
      {
        timelineId: 'group-1',
        primary: true,
        trigger: { type: 'scroll', scrub: true }
      },
      {
        timelineId: 'group-1',
        primary: false,
        trigger: { type: 'scroll', scrub: false }
      }
    ];
    const errors = timelineGroupRule(scenarios);
    // Should complain about scrub mismatch and about observer being grouped
    expect(errors.some(e => e.message.includes('observer trigger'))).toBe(true);
  });

  it('should error when group has zero primary scenarios', () => {
    const scenarios = [
      {
        timelineId: 'group-1',
        primary: false,
        trigger: { type: 'time' }
      },
      {
        timelineId: 'group-1',
        primary: false,
        trigger: { type: 'time' }
      }
    ];
    const errors = timelineGroupRule(scenarios);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('Found 0 primary');
  });

  it('should error when group has two primary scenarios', () => {
    const scenarios = [
      {
        timelineId: 'group-1',
        primary: true,
        trigger: { type: 'time' }
      },
      {
        timelineId: 'group-1',
        primary: true,
        trigger: { type: 'time' }
      }
    ];
    const errors = timelineGroupRule(scenarios);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('Found 2 primary');
  });
});
