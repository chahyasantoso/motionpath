/**
 * Converts path nodes (including optional Bezier controls) to an SVG path string.
 * @param {Array} pathNodes Array of { x, y, ctrlX, ctrlY }
 * @returns {string} SVG Path string (e.g. "M 0 0 Q 150 -50 300 150 L 800 400")
 */
export function buildMotionPath(pathNodes) {
  if (!pathNodes || pathNodes.length === 0) return "";

  let path = `M ${pathNodes[0].x} ${pathNodes[0].y}`;

  for (let i = 1; i < pathNodes.length; i++) {
    const node = pathNodes[i];
    if (node.ctrlX !== undefined && node.ctrlY !== undefined) {
      path += ` Q ${node.ctrlX} ${node.ctrlY} ${node.x} ${node.y}`;
    } else {
      path += ` L ${node.x} ${node.y}`;
    }
  }

  return path;
}

/**
 * Converts an already-cubic Bezier path (3n+1 format from convertToCubicPath)
 * to an SVG path string using cubic `C` commands.
 * Input format: [anchor, cp1, cp2, anchor, cp1, cp2, anchor, ...]
 * @param {Array} cubicPath Array of { x, y, z? }
 * @returns {string} SVG Path string with C commands
 */
export function buildCubicMotionPath(cubicPath) {
  if (!cubicPath || cubicPath.length < 4) return "";
  // First point is always an anchor
  let path = `M ${cubicPath[0].x} ${cubicPath[0].y}`;
  // Every subsequent segment is: cp1, cp2, anchor (groups of 3)
  for (let i = 1; i + 2 < cubicPath.length; i += 3) {
    const cp1 = cubicPath[i];
    const cp2 = cubicPath[i + 1];
    const anchor = cubicPath[i + 2];
    path += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${anchor.x} ${anchor.y}`;
  }
  return path;
}

/**
 * Converts path nodes to a GSAP cubic Bezier array for MotionPathPlugin.
 * Each node's `z` defaults to 0. Quadratic control points (ctrlX/ctrlY) are
 * elevated to cubic using the standard degree-elevation formula.
 * The result is always in the format: [anchor, cp1, cp2, anchor, cp1, cp2, anchor, ...]
 * with total length = 3n + 1 (where n = number of segments).
 *
 * @param {Array} pathNodes Array of { x, y, z?, ctrlX?, ctrlY?, ctrlZ? }
 * @returns {Array} Cubic Bezier array of { x, y, z } for GSAP type: "cubic"
 */
export function convertToCubicPath(pathNodes) {
  if (!pathNodes || pathNodes.length === 0) return [];

  const nodes = pathNodes.map((node) => ({
    x: node.x,
    y: node.y,
    z: node.z !== undefined ? node.z : 0,
    ctrlX: node.ctrlX,
    ctrlY: node.ctrlY,
    ctrlZ: node.ctrlZ,
  }));

  // First anchor
  const cubicPath = [{ x: nodes[0].x, y: nodes[0].y, z: nodes[0].z }];

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    const isCurved = curr.ctrlX !== undefined && curr.ctrlY !== undefined;

    let cp1, cp2;

    if (isCurved) {
      // Quadratic→Cubic elevation: CP1 = P0 + 2/3 * (Q - P0), CP2 = P1 + 2/3 * (Q - P1)
      const ctrlZ =
        curr.ctrlZ !== undefined ? curr.ctrlZ : (prev.z + curr.z) / 2;
      cp1 = {
        x: prev.x + (2 / 3) * (curr.ctrlX - prev.x),
        y: prev.y + (2 / 3) * (curr.ctrlY - prev.y),
        z: prev.z + (2 / 3) * (ctrlZ - prev.z),
      };
      cp2 = {
        x: curr.x + (2 / 3) * (curr.ctrlX - curr.x),
        y: curr.y + (2 / 3) * (curr.ctrlY - curr.y),
        z: curr.z + (2 / 3) * (ctrlZ - curr.z),
      };
    } else {
      // Straight line → cubic with control points at 1/3 and 2/3
      cp1 = {
        x: prev.x + (1 / 3) * (curr.x - prev.x),
        y: prev.y + (1 / 3) * (curr.y - prev.y),
        z: prev.z + (1 / 3) * (curr.z - prev.z),
      };
      cp2 = {
        x: prev.x + (2 / 3) * (curr.x - prev.x),
        y: prev.y + (2 / 3) * (curr.y - prev.y),
        z: prev.z + (2 / 3) * (curr.z - prev.z),
      };
    }

    cubicPath.push(cp1);
    cubicPath.push(cp2);
    cubicPath.push({ x: curr.x, y: curr.y, z: curr.z });
  }

  return cubicPath;
}

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
    return {
      x: pStart.x,
      y: pStart.y,
      z: pStart.z !== undefined ? pStart.z : 0,
      rotation: 0,
    };
  }

  // Determine segment index and local progress t
  let segmentIndex = Math.floor(p * segments);
  if (segmentIndex >= segments) {
    segmentIndex = segments - 1;
  }
  const t = p * segments - segmentIndex;

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
  const dx =
    3 * mt2 * (p1.x - p0.x) +
    6 * mt * t * (p2.x - p1.x) +
    3 * t2 * (p3.x - p2.x);
  const dy =
    3 * mt2 * (p1.y - p0.y) +
    6 * mt * t * (p2.y - p1.y) +
    3 * t2 * (p3.y - p2.y);

  const rotation = Math.atan2(dy, dx) * (180 / Math.PI);

  return { x, y, z, rotation };
}

/**
 * Calculates the x, y coordinates and tangent rotation at a given progress along an SVG path.
 * @param {SVGPathElement} pathEl The SVG path element
 * @param {number} progress Progress along the path (0 to 1)
 * @param {number} [offset] Optional offset progress to add
 * @returns {Object} { x, y, rotation, progress }
 */
export function getPointOnPath(pathEl, progress, offset = 0) {
  if (!pathEl) {
    return { x: 0, y: 0, rotation: 0, progress: 0 };
  }

  const totalLength = pathEl.getTotalLength();
  let p = progress + offset;
  p = Math.max(0, Math.min(1, p));

  const point = pathEl.getPointAtLength(p * totalLength);

  // Calculate tangent rotation angle using delta step
  const delta = 0.001;
  let nextP = p + delta;
  let prevP = p - delta;
  if (nextP > 1) {
    nextP = 1;
    prevP = 1 - delta;
  }
  const pt1 = pathEl.getPointAtLength(Math.max(0, prevP) * totalLength);
  const pt2 = pathEl.getPointAtLength(nextP * totalLength);
  const rotation = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x) * (180 / Math.PI);

  return { x: point.x, y: point.y, rotation, progress: p };
}

/**
 * Splits a quadratic Bezier curve at parameter t into two quadratic curves
 * using de Casteljau's algorithm.
 *
 * @param {Object} p0 Start point {x, y, z?}
 * @param {Object} q Control point {x, y, z?} (representing ctrlX, ctrlY, ctrlZ)
 * @param {Object} p2 End point {x, y, z?}
 * @param {number} t Splitting progress parameter (0 to 1)
 * @returns {Object} { C_L, P_split, C_R }
 */
export function splitQuadraticBezier(p0, q, p2, t) {
  const z0 = p0.z !== undefined ? p0.z : 0;
  const zQ =
    q.z !== undefined ? q.z : (z0 + (p2.z !== undefined ? p2.z : 0)) / 2;
  const z2 = p2.z !== undefined ? p2.z : 0;

  // C_L = (1 - t)*P0 + t*Q
  const C_L = {
    x: p0.x + t * (q.x - p0.x),
    y: p0.y + t * (q.y - p0.y),
    z: z0 + t * (zQ - z0),
  };

  // C_R = (1 - t)*Q + t*P2
  const C_R = {
    x: q.x + t * (p2.x - q.x),
    y: q.y + t * (p2.y - q.y),
    z: zQ + t * (z2 - zQ),
  };

  // P_split = (1 - t)*C_L + t*C_R
  const P_split = {
    x: (1 - t) * C_L.x + t * C_R.x,
    y: (1 - t) * C_L.y + t * C_R.y,
    z: (1 - t) * C_L.z + t * C_R.z,
  };

  return { C_L, P_split, C_R };
}

/**
 * Finds the parameter t on a straight line or quadratic Bezier segment
 * that minimizes the distance to a given target coordinate (mouseX, mouseY).
 *
 * @param {Object} p0 Start point {x, y}
 * @param {Object} p2 End point {x, y}
 * @param {number} mouseX Target X coordinate
 * @param {number} mouseY Target Y coordinate
 * @param {Object} [q] Optional quadratic control point {x, y}
 * @returns {Object} { t, x, y, distance }
 */
export function findClosestPointOnSegment(p0, p2, mouseX, mouseY, q) {
  let minDistanceSq = Infinity;
  let bestT = 0;
  let bestX = p0.x;
  let bestY = p0.y;

  // Sample the segment at 101 points
  const steps = 100;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let x, y;
    if (q && q.x !== undefined && q.y !== undefined) {
      const mt = 1 - t;
      x = mt * mt * p0.x + 2 * mt * t * q.x + t * t * p2.x;
      y = mt * mt * p0.y + 2 * mt * t * q.y + t * t * p2.y;
    } else {
      x = p0.x + t * (p2.x - p0.x);
      y = p0.y + t * (p2.y - p0.y);
    }

    const dx = x - mouseX;
    const dy = y - mouseY;
    const distSq = dx * dx + dy * dy;

    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      bestT = t;
      bestX = x;
      bestY = y;
    }
  }

  return {
    t: bestT,
    x: bestX,
    y: bestY,
    distance: Math.sqrt(minDistanceSq),
  };
}
