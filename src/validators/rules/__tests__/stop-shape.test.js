import { describe, it, expect } from 'vitest';
import { stopShapeRule } from '../stop-shape.js';

describe('stop-shape rule', () => {
  it('should pass on valid stops', () => {
    const track = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] }
      }
    };
    const errors = stopShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(0);
  });

  it('should error when stop is not an object', () => {
    const track = {
      id: 'test-el',
      keyframes: {
        x: { stops: [0.5, 100] } // raw numbers instead of objects
      }
    };
    const errors = stopShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(2);
    expect(errors[0].ruleId).toBe('stop-shape');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[0].tracks[0].keyframes.x.stops[0]');
    expect(errors[0].message).toContain('must be a plain object');
  });

  it('should error when stop is missing required p', () => {
    const track = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ v: 0 }, { p: 1, v: 100 }] }
      }
    };
    const errors = stopShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stop-shape');
    expect(errors[0].path).toBe('motions[0].tracks[0].keyframes.x.stops[0].p');
    expect(errors[0].message).toContain("missing required property 'p'");
  });

  it('should error when p is not a number', () => {
    const track = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ p: 'half', v: 0 }, { p: 1, v: 100 }] }
      }
    };
    const errors = stopShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stop-shape');
    expect(errors[0].path).toBe('motions[0].tracks[0].keyframes.x.stops[0].p');
    expect(errors[0].message).toContain('must have \'p\' as a number between 0 and 1');
  });

  it('should error when p is out of bounds', () => {
    const track = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ p: -0.1, v: 0 }, { p: 1.2, v: 100 }] }
      }
    };
    const errors = stopShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(2);
    expect(errors[0].path).toBe('motions[0].tracks[0].keyframes.x.stops[0].p');
    expect(errors[1].path).toBe('motions[0].tracks[0].keyframes.x.stops[1].p');
  });

  it('should error when v is undefined', () => {
    const track = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ p: 0 }, { p: 1, v: 100 }] }
      }
    };
    const errors = stopShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stop-shape');
    expect(errors[0].path).toBe('motions[0].tracks[0].keyframes.x.stops[0].v');
    expect(errors[0].message).toContain("must have a defined 'v' value");
  });
});
