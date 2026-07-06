import { describe, it, expect } from 'vitest';
import { pathPlugin } from '../pathPlugin.js';

describe('pathPlugin', () => {
  it('declares correct keys list', () => {
    expect(pathPlugin.keys).toEqual(['path']);
    expect(pathPlugin.lazy).toBe(false);
  });

  it('getNaturalValue returns default start progress 0', () => {
    expect(pathPlugin.getNaturalValue()).toBe(0);
  });

  it('contribute maps progress stops and injects cubicPath and auto-rotate metadata at 0%', () => {
    const stops = [
      { p: 0.1, v: 0.1 },
      { p: 0.8, v: 0.8, ease: 'power1.out' }
    ];

    // autoRotate lives inside keyframes.path (not on the element root).
    // points are expected to be already in cubic Bezier format (pre-converted by the caller).
    const mockElement = {
      keyframes: {
        path: {
          autoRotate: true,
          points: [
            { x: 0, y: 0 },
            { x: 5, y: 5 },
            { x: 10, y: 10 },
            { x: 15, y: 15 }
          ]
        }
      }
    };

    const result = pathPlugin.contribute('path', stops, mockElement);

    // Verify raw progress stops mapping
    expect(result.percentPatch['10%']).toEqual({ __pathProgress: 0.1 });
    expect(result.percentPatch['80%']).toEqual({ __pathProgress: 0.8, ease: 'power1.out' });

    // Verify proxy metadata seeding at 0%
    const zeroFrame = result.percentPatch['0%'];
    expect(zeroFrame).toBeDefined();
    expect(zeroFrame.__autoRotate).toBe(true);
    expect(zeroFrame.__cubicPath).toBeInstanceOf(Array);
    // Plugin calls convertToCubicPath internally: 4 raw waypoints → 3*(4-1)+1 = 10 cubic points
    expect(zeroFrame.__cubicPath.length).toBe(10);
    // First cubic anchor matches the first waypoint's coordinates (z defaults to 0)
    expect(zeroFrame.__cubicPath[0]).toEqual({ x: 0, y: 0, z: 0 });
  });

  describe('compose', () => {
    it('returns empty object if rawData has no path progress or cubicPath', () => {
      expect(pathPlugin.compose({})).toEqual({});
      expect(pathPlugin.compose({ __pathProgress: 0.5 })).toEqual({});
    });

    it('interpolates coordinate along cubic path and injects automatic centering', () => {
      const rawData = {
        __pathProgress: 0.5,
        __cubicPath: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
          { x: 10, y: 10 },
          { x: 15, y: 15 }
        ],
        __autoRotate: true
      };

      const result = pathPlugin.compose(rawData);
      expect(result.x).toBeCloseTo(7.5);
      expect(result.y).toBeCloseTo(7.5);
      expect(result.z).toBe(0);
      expect(result.xPercent).toBe(-50);
      expect(result.yPercent).toBe(-50);
      expect(result.rotation).toBeDefined();
    });
  });
});
