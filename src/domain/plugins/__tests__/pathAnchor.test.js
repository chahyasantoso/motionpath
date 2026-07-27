import { describe, it, expect } from 'vitest';
import { pathPlugin } from '../pathPlugin.js';

const raw = { pathProgress: 0.5, cubicPath: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }, { x: 15, y: 15 }], autoRotate: false };

describe('path anchor policy', () => {
  it('keeps centered anchoring as the compatibility default', () => {
    expect(pathPlugin.compose(raw, { keyframes: { path: {} } })).toMatchObject({ xPercent: -50, yPercent: -50 });
  });

  it('supports none and explicit percentage anchors', () => {
    expect(pathPlugin.compose(raw, { keyframes: { path: { anchor: 'none' } } })).not.toHaveProperty('xPercent');
    expect(pathPlugin.compose(raw, { keyframes: { path: { anchor: { xPercent: 0, yPercent: -100 } } } })).toMatchObject({ xPercent: 0, yPercent: -100 });
  });
});
