/**
 * Interpolates a coordinate and tangent rotation at a given progress along a cubic Bezier path.
 * The path is an array of cubic Bezier nodes (length 3n + 1).
 *
 * @param {Array} cubicPath Array of { x, y, z }
 * @param {number} progress Progress along the path (0 to 1)
 * @returns {Object} { x, y, z, rotation } interpolated coordinate and rotation
 */
export function getPointOnCubicPath(cubicPath, progress) {
  if (!cubicPath || cubicPath.length === 0) {
    return { x: 0, y: 0, z: 0, rotation: 0 };
  }
  if (cubicPath.length === 1) {
    const p = cubicPath[0];
    return { x: p.x, y: p.y, z: p.z !== undefined ? p.z : 0, rotation: 0 };
  }

  const p = Math.max(0, Math.min(1, progress));
  const segments = Math.floor((cubicPath.length - 1) / 3);
  if (segments <= 0) {
    const pStart = cubicPath[0];
    return { x: pStart.x, y: pStart.y, z: pStart.z !== undefined ? pStart.z : 0, rotation: 0 };
  }

  // Determine segment index and local progress t
  let segmentIndex = Math.floor(p * segments);
  if (segmentIndex >= segments) {
    segmentIndex = segments - 1;
  }
  const t = (p * segments) - segmentIndex;

  const startIndex = segmentIndex * 3;
  const p0 = cubicPath[startIndex];
  const p1 = cubicPath[startIndex + 1];
  const p2 = cubicPath[startIndex + 2];
  const p3 = cubicPath[startIndex + 3];

  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  // Cubic Bezier interpolation formula:
  // B(t) = (1-t)^3 * P0 + 3(1-t)^2 * t * P1 + 3(1-t) * t^2 * P2 + t^3 * P3
  const x = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
  const y = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;
  
  const z0 = p0.z !== undefined ? p0.z : 0;
  const z1 = p1.z !== undefined ? p1.z : 0;
  const z2 = p2.z !== undefined ? p2.z : 0;
  const z3 = p3.z !== undefined ? p3.z : 0;
  
  const z = mt3 * z0 + 3 * mt2 * t * z1 + 3 * mt * t2 * z2 + t3 * z3;

  // Calculate derivative tangent vector: B'(t) = 3(1-t)^2(P1-P0) + 6(1-t)t(P2-P1) + 3t^2(P3-P2)
  const dx = 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x);
  const dy = 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y);
  
  const rotation = Math.atan2(dy, dx) * (180 / Math.PI);

  return { x, y, z, rotation };
}
