import { describe, it, expect } from 'vitest';
import { transformActive, transformTransition } from '../SpiralBall.jsx';

describe('SpiralBall Transform Helpers', () => {
  describe('transformActive', () => {
    it('returns display none and opacity 0 when progress <= 0', () => {
      const basePatch = { x: 10, y: 20, pathProgress: 0, opacity: 1 };
      const result = transformActive(basePatch);
      expect(result).toEqual({ display: 'none', opacity: 0 });
    });

    it('returns display none and opacity 0 when progress >= 1', () => {
      const basePatch = { x: 10, y: 20, pathProgress: 1, opacity: 1 };
      const result = transformActive(basePatch);
      expect(result).toEqual({ display: 'none', opacity: 0 });
    });

    it('returns display flex and composed patch when progress is within (0, 1)', () => {
      const basePatch = { x: 10, y: 20, pathProgress: 0.5, opacity: 1 };
      const result = transformActive(basePatch);
      expect(result).toEqual({ x: 10, y: 20, pathProgress: 0.5, opacity: 1, display: 'flex' });
    });
  });

  describe('transformTransition', () => {
    it('merges base coordinate patch and transition patch, overriding overlapping properties, and forces display flex', () => {
      const basePatch = { x: 10, y: 20, pathProgress: 0, opacity: 1 };
      const transitionPatch = { scale: 1.5, opacity: 0.7 };
      const result = transformTransition(basePatch, transitionPatch);
      
      expect(result).toEqual({
        x: 10,
        y: 20,
        pathProgress: 0,
        scale: 1.5,
        opacity: 0.7,
        display: 'flex'
      });
    });
  });
});
