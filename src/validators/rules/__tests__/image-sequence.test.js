import { describe, it, expect } from 'vitest';
import { imageSequenceRule } from '../image-sequence.js';

describe('image-sequence rule', () => {
  it('should pass on valid imageSequence configs', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: ['/a.jpg', '/b.jpg'],
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 1 }
          ]
        }
      }
    };
    const errors = imageSequenceRule(element, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(0);
  });

  it('should error if keyframes.imageSequence is not an object', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        imageSequence: 'not-an-object'
      }
    };
    const errors = imageSequenceRule(element, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('image-sequence');
    expect(errors[0].path).toBe('scenarios[0].elements[0].keyframes.imageSequence');
  });

  it('should error if frames is missing, empty, or not an array', () => {
    const elementNoFrames = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
        }
      }
    };
    let errors = imageSequenceRule(elementNoFrames, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('frames is required');

    const elementEmptyFrames = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: [],
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
        }
      }
    };
    errors = imageSequenceRule(elementEmptyFrames, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('must contain at least 1 image URL');

    const elementInvalidFramesType = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: 'not-an-array',
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
        }
      }
    };
    errors = imageSequenceRule(elementInvalidFramesType, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('must be an array');
  });

  it('should error if frames array elements are not strings', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: ['/a.jpg', 123, null],
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
        }
      }
    };
    const errors = imageSequenceRule(element, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(2);
    expect(errors[0].path).toBe('scenarios[0].elements[0].keyframes.imageSequence.frames[1]');
    expect(errors[1].path).toBe('scenarios[0].elements[0].keyframes.imageSequence.frames[2]');
  });

  it('should error if stops is not an array', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: ['/a.jpg'],
          stops: 'not-an-array'
        }
      }
    };
    const errors = imageSequenceRule(element, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('stops must be an array');
  });

  it('should error if stops have non-numeric p or v', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: ['/a.jpg'],
          stops: [
            { p: 'zero', v: 0 },
            { p: 1, v: 'one' }
          ]
        }
      }
    };
    const errors = imageSequenceRule(element, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(2);
    expect(errors[0].path).toBe('scenarios[0].elements[0].keyframes.imageSequence.stops[0].p');
    expect(errors[1].path).toBe('scenarios[0].elements[0].keyframes.imageSequence.stops[1].v');
  });

  it('should error if a stop index v is out of range', () => {
    const elementTooHigh = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: ['/0.jpg', '/1.jpg', '/2.jpg'],
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 3 }
          ]
        }
      }
    };
    let errors = imageSequenceRule(elementTooHigh, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('must satisfy 0 <= v <= 2 (frames.length - 1). Got: 3');

    const elementNegative = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: ['/0.jpg', '/1.jpg', '/2.jpg'],
          stops: [
            { p: 0, v: -1 },
            { p: 1, v: 1 }
          ]
        }
      }
    };
    errors = imageSequenceRule(elementNegative, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('must satisfy 0 <= v <= 2 (frames.length - 1). Got: -1');
  });

  it('should pass if stop index v is at range boundary or is fractional', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: ['/0.jpg', '/1.jpg', '/2.jpg'],
          stops: [
            { p: 0, v: 2 },
            { p: 0.5, v: 1.5 },
            { p: 1, v: 0 }
          ]
        }
      }
    };
    const errors = imageSequenceRule(element, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(0);
  });

  it('should not error on range of v if frames itself is invalid', () => {
    const element = {
      id: 'test-el',
      keyframes: {
        imageSequence: {
          frames: 'invalid-frames',
          stops: [
            { p: 0, v: 40 },
            { p: 1, v: 1 }
          ]
        }
      }
    };
    const errors = imageSequenceRule(element, {}, {}, 'scenarios[0].elements[0]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('frames must be an array');
  });
});
