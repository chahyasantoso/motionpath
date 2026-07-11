import { describe, it, expect } from 'vitest';
import { pathShapeRule } from '../path-shape.js';

describe('path-shape rule', () => {
  it('errors when fewer than 2 points are given', () => {
    const track = { keyframes: { path: { points: [{ x: 0, y: 0 }] } } };
    const errors = pathShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors.some(e => e.severity === 'error')).toBe(true);
  });

  it('accepts the minimum valid path (2 plain waypoints)', () => {
    const track = { keyframes: { path: { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] } } };
    const errors = pathShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors.length).toBe(0);
  });

  it('errors when only one of ctrlX/ctrlY is provided', () => {
    const track = { keyframes: { path: { points: [
      { x: 0, y: 0 }, { x: 10, y: 10, ctrlX: 5 },
    ] } } };
    const errors = pathShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors.some(e => e.severity === 'error')).toBe(true);
  });

  it('warns when ctrlX/ctrlY are given on the first point', () => {
    const track = { keyframes: { path: { points: [
      { x: 0, y: 0, ctrlX: 1, ctrlY: 1 }, { x: 10, y: 10 },
    ] } } };
    const errors = pathShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors.some(e => e.severity === 'warning')).toBe(true);
    expect(errors.some(e => e.severity === 'error')).toBe(false);
  });

  it('errors on non-numeric x/y', () => {
    const track = { keyframes: { path: { points: [
      { x: 'a', y: 0 }, { x: 1, y: 1 },
    ] } } };
    const errors = pathShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors.some(e => e.severity === 'error')).toBe(true);
  });

  it('returns no errors when path is absent', () => {
    const track = { keyframes: { x: { stops: [{ p: 0, v: 0 }] } } };
    const errors = pathShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors.length).toBe(0);
  });

  it('errors when a stop has v out of range [0, 1]', () => {
    const track = { keyframes: { path: {
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      stops: [{ p: 0, v: -0.1 }, { p: 1, v: 1.5 }],
    } } };
    const errors = pathShapeRule(track, {}, { schema: {} }, 'motions[0].tracks[0]');
    expect(errors.filter(e => e.severity === 'error').length).toBe(2);
    expect(errors[0].path).toBe('motions[0].tracks[0].keyframes.path.stops[0].v');
    expect(errors[1].path).toBe('motions[0].tracks[0].keyframes.path.stops[1].v');
  });
});
