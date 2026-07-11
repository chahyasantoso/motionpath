import { describe, it, expect } from 'vitest';
import { timelineGroupRule } from '../timeline-group.js';

describe('timeline-group rule', () => {
  it('should pass on group of two time motions with one primary', () => {
    const motions = [
      {
        driver: {
          timelineId: 'group-1',
          primary: true,
          trigger: { type: 'time' }
        }
      },
      {
        driver: {
          timelineId: 'group-1',
          primary: false,
          trigger: { type: 'time' }
        }
      }
    ];
    const errors = timelineGroupRule(motions);
    expect(errors).toHaveLength(0);
  });

  it('should error when mixing time and scroll trigger types in the same group', () => {
    const motions = [
      {
        driver: {
          timelineId: 'group-1',
          primary: true,
          trigger: { type: 'time' }
        }
      },
      {
        driver: {
          timelineId: 'group-1',
          primary: false,
          trigger: { type: 'scroll', scrub: true }
        }
      }
    ];
    const errors = timelineGroupRule(motions);
    // Should complain about mismatching trigger
    expect(errors.some(e => e.ruleId === 'timeline-group' && e.path === 'motions[1].driver.trigger')).toBe(true);
  });

  it('should error when group contains a scroll observer motion (scrub: false)', () => {
    const motions = [
      {
        driver: {
          timelineId: 'group-1',
          primary: true,
          trigger: { type: 'scroll', scrub: true }
        }
      },
      {
        driver: {
          timelineId: 'group-1',
          primary: false,
          trigger: { type: 'scroll', scrub: false }
        }
      }
    ];
    const errors = timelineGroupRule(motions);
    // Should complain about scrub mismatch and about observer being grouped
    expect(errors.some(e => e.message.includes('observer trigger'))).toBe(true);
  });

  it('should error when group has zero primary motions', () => {
    const motions = [
      {
        driver: {
          timelineId: 'group-1',
          primary: false,
          trigger: { type: 'time' }
        }
      },
      {
        driver: {
          timelineId: 'group-1',
          primary: false,
          trigger: { type: 'time' }
        }
      }
    ];
    const errors = timelineGroupRule(motions);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('Found 0 primary');
  });

  it('should error when group has two primary motions', () => {
    const motions = [
      {
        driver: {
          timelineId: 'group-1',
          primary: true,
          trigger: { type: 'time' }
        }
      },
      {
        driver: {
          timelineId: 'group-1',
          primary: true,
          trigger: { type: 'time' }
        }
      }
    ];
    const errors = timelineGroupRule(motions);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('Found 2 primary');
  });

  it('should error if a non-primary motion in a group declares forbidden trigger fields', () => {
    const motions = [
      {
        driver: {
          timelineId: 'group-1',
          primary: true,
          trigger: { type: 'scroll', scrub: true, pin: true }
        }
      },
      {
        driver: {
          timelineId: 'group-1',
          primary: false,
          trigger: { type: 'scroll', scrub: true, pin: true, start: 'top top' }
        }
      }
    ];
    const errors = timelineGroupRule(motions);
    expect(errors).toHaveLength(2); // pin and start are forbidden on non-primary

    const errorPaths = errors.map(e => e.path);
    expect(errorPaths).toContain('motions[1].driver.trigger.pin');
    expect(errorPaths).toContain('motions[1].driver.trigger.start');

    errors.forEach(e => {
      expect(e.ruleId).toBe('timeline-group');
      expect(e.severity).toBe('error');
      expect(e.message).toContain('cannot declare trigger field');
    });
  });

  it('should pass if primary motion declares forbidden fields, and non-primary declares only type/scrub', () => {
    const motions = [
      {
        driver: {
          timelineId: 'group-1',
          primary: true,
          trigger: { type: 'scroll', scrub: true, pin: true, start: 'top top', end: 'bottom bottom', pinSpacing: true, snap: 0.5 }
        }
      },
      {
        driver: {
          timelineId: 'group-1',
          primary: false,
          trigger: { type: 'scroll', scrub: true }
        }
      }
    ];
    const errors = timelineGroupRule(motions);
    expect(errors).toHaveLength(0);
  });
});
