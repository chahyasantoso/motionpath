import { describe, it, expect } from 'vitest';
import { stopCountRule } from '../stop-count.js';

describe('stop-count rule', () => {
  it('should error on fewer than 2 stops for simple property', () => {
    const track = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ p: 0, v: 0 }] }
      }
    };
    const errors = stopCountRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stop-count');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[0].tracks[0].keyframes.x');
    expect(errors[0].message).toContain("Property 'x' on track 'test-el' must have at least 2 stops");
  });

  it('should error on 0 stops/missing stops for simple property', () => {
    const track = {
      id: 'test-el',
      keyframes: {
        x: { stops: [] }
      }
    };
    const errors = stopCountRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stop-count');
  });

  it('should pass on 2 stops', () => {
    const track = {
      id: 'test-el',
      keyframes: {
        x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 10 }] }
      }
    };
    const errors = stopCountRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(0);
  });

  it('should error on path.stops with fewer than 2 entries', () => {
    const track = {
      id: 'test-el2',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
          stops: [{ p: 0, v: 0 }]
        }
      }
    };
    const errors = stopCountRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stop-count');
    expect(errors[0].path).toBe('motions[0].tracks[0].keyframes.path');
  });

  it('should pass on path.stops with 2 entries', () => {
    const track = {
      id: 'test-el2',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
        }
      }
    };
    const errors = stopCountRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(0);
  });

  it('should error on imageSequence.stops with fewer than 2 entries', () => {
    const track = {
      id: 'test-el3',
      keyframes: {
        imageSequence: {
          frames: ['/a.jpg'],
          stops: [{ p: 0, v: 0 }]
        }
      }
    };
    const errors = stopCountRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('stop-count');
    expect(errors[0].path).toBe('motions[0].tracks[0].keyframes.imageSequence');
  });

  it('should pass on imageSequence.stops with 2 entries', () => {
    const track = {
      id: 'test-el3',
      keyframes: {
        imageSequence: {
          frames: ['/a.jpg', '/b.jpg'],
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
        }
      }
    };
    const errors = stopCountRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors).toHaveLength(0);
  });
});
