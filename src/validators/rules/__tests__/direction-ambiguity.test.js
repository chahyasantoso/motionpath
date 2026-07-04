import { describe, it, expect } from 'vitest';
import { directionAmbiguityRule } from '../direction-ambiguity.js';

describe('direction-ambiguity rule', () => {
  it('should pass on 1 stop at p=0 when direction is undefined', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ p: 0, v: 0 }] }
      }
    };
    const errors = directionAmbiguityRule(element, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(0);
  });

  it('should pass on 1 stop near p=0 (within 0.001 epsilon) when direction is undefined', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ p: 0.0005, v: 0 }] }
      }
    };
    const errors = directionAmbiguityRule(element, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(0);
  });

  it('should error on 1 stop at p=0.5 when direction is undefined', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ p: 0.5, v: 10 }] }
      }
    };
    const errors = directionAmbiguityRule(element, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('direction-ambiguity');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('scenarios[0].elements[0].keyframes.x');
  });

  it('should error on 1 stop when direction is fromTo', () => {
    const element = {
      id: 'test-el',
      direction: 'fromTo',
      keyframes: {
        x: { stops: [{ p: 0, v: 0 }] }
      }
    };
    const errors = directionAmbiguityRule(element, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('direction-ambiguity');
  });

  it('should pass on 2 stops when direction is fromTo', () => {
    const element = {
      id: 'test-el',
      direction: 'fromTo',
      keyframes: {
        x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] }
      }
    };
    const errors = directionAmbiguityRule(element, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(0);
  });
});
