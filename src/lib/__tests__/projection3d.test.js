import { describe, it, expect } from 'vitest';
import { projectPathNodes3DTo2D, project3DTo2D } from '../projection3d.js';

describe('projectPathNodes3DTo2D', () => {
  it('should return empty array for null or empty input', () => {
    expect(projectPathNodes3DTo2D(null, 0, 0, 0)).toEqual([]);
    expect(projectPathNodes3DTo2D(undefined, 0, 0, 0)).toEqual([]);
    expect(projectPathNodes3DTo2D([], 0, 0, 0)).toEqual([]);
  });

  it('should project 2D nodes (z=0) to offset by cx/cy', () => {
    const result = projectPathNodes3DTo2D(
      [{ x: 10, y: 20 }],
      100, 200, 0
    );
    // With tiltDeg=0, cos(0)=1, sin(0)=0 → x2d = cx + x, y2d = cy + y*cos(0) + z*sin(0) = cy + y
    expect(result[0].x).toBeCloseTo(110);
    expect(result[0].y).toBeCloseTo(220);
  });

  it('should project 3D nodes with tilt angle', () => {
    const result = projectPathNodes3DTo2D(
      [{ x: 0, y: 0, z: 100 }],
      0, 0, 90  // 90 degree tilt → cos=0, sin=1
    );
    // x2d = 0 + 0 = 0, y2d = (0 + 0*cos(90) + 100*sin(90)) * scale = 100 * (1000 / 900) = 111.11
    expect(result[0].x).toBeCloseTo(0);
    expect(result[0].y).toBeCloseTo(111.11);
  });

  it('should preserve and project control points', () => {
    const result = projectPathNodes3DTo2D(
      [{ x: 0, y: 0, z: 0, ctrlX: 50, ctrlY: 50, ctrlZ: 50 }],
      100, 200, 0
    );
    // With tiltDeg=0, ctrl projected at cx+ctrlX*scale, cy+ctrlY*scale
    // scale = 1000 / (1000 - 50) = 1.05263
    // ctrlX = 100 + 50 * 1.05263 = 152.63
    // ctrlY = 200 + 50 * 1.05263 = 252.63
    expect(result[0]).toHaveProperty('ctrlX');
    expect(result[0]).toHaveProperty('ctrlY');
    expect(result[0].ctrlX).toBeCloseTo(152.63);
    expect(result[0].ctrlY).toBeCloseTo(252.63);
  });

  it('should not add ctrlX/ctrlY when not present in input', () => {
    const result = projectPathNodes3DTo2D(
      [{ x: 10, y: 20 }],
      0, 0, 0
    );
    expect(result[0]).not.toHaveProperty('ctrlX');
    expect(result[0]).not.toHaveProperty('ctrlY');
  });

  it('should default z to 0 when not present in nodes', () => {
    // With z=0 and tilt, the result should be identical to no z
    const withZ = projectPathNodes3DTo2D(
      [{ x: 10, y: 20, z: 0 }],
      100, 200, 45
    );
    const withoutZ = projectPathNodes3DTo2D(
      [{ x: 10, y: 20 }],
      100, 200, 45
    );
    expect(withZ[0].x).toBeCloseTo(withoutZ[0].x);
    expect(withZ[0].y).toBeCloseTo(withoutZ[0].y);
  });

  it('should handle invertTilt parameter', () => {
    const normal = projectPathNodes3DTo2D(
      [{ x: 0, y: 0, z: 100 }],
      0, 0, 45, false
    );
    const inverted = projectPathNodes3DTo2D(
      [{ x: 0, y: 0, z: 100 }],
      0, 0, 45, true
    );
    // With invertTilt, z contribution to y is negated
    expect(normal[0].y).toBeCloseTo(-inverted[0].y);
  });

  it('should project multiple nodes correctly', () => {
    const result = projectPathNodes3DTo2D(
      [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 50 },
        { x: 200, y: 0, z: 0 },
      ],
      0, 0, 0
    );
    expect(result).toHaveLength(3);
    // Node 2 has z=50 -> scale = 1000 / 950 = 1.0526
    // x_proj = 100 * 1.0526 = 105.26
    expect(result[0].x).toBeCloseTo(0);
    expect(result[1].x).toBeCloseTo(105.26);
    expect(result[2].x).toBeCloseTo(200);
  });
});

