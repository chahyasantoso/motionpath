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

    const mockElement = {
      autoRotate: true,
      keyframes: {
        path: {
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
    expect(zeroFrame.__cubicPath.length).toBe(10);
    expect(zeroFrame.__cubicPath[0]).toEqual({ x: 0, y: 0, z: 0 }); // coordinates translated to cubic path representation
  });
});
