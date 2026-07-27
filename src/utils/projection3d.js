/**
 * ─── 3D Projection Utility ───
 */

/**
 * Projects a 3D coordinate (x, y, z) onto a tilted 2D perspective screen plane.
 * @param {number} x3d - X in 3D space
 * @param {number} y3d - Y in 3D space
 * @param {number} z3d - Z in 3D space (depth)
 * @param {number} cx - X coordinate of the viewport/stage center
 * @param {number} cy - Y coordinate of the viewport/stage center
 * @param {number} tiltDeg - Angle to tilt the vertical axis forward (degrees)
 * @param {boolean} [invertTilt=false] - Inverts the depth tilt direction
 * @returns {Object} { x, y } projected 2D coordinates
 */
export function project3DTo2D(
  x3d,
  y3d,
  z3d,
  cx,
  cy,
  tiltDeg,
  invertTilt = false,
  perspective = 1000,
) {
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const distance = perspective - z3d;
  if (distance <= 0) {
    return { x: cx, y: cy, scale: 0 };
  }

  const scale = perspective / distance;

  const x2d = cx + x3d * scale;
  const y2d =
    cy +
    (y3d * Math.cos(tiltRad) + (invertTilt ? -z3d : z3d) * Math.sin(tiltRad)) *
      scale;

  return {
    x: Math.round(x2d * 100) / 100,
    y: Math.round(y2d * 100) / 100,
    scale: Math.round(scale * 10000) / 10000,
  };
}

/**
 * Projects an array of 3D path nodes to 2D, preserving ctrlX/ctrlY structure
 * for SVG path visualization via buildMotionPath.
 * @param {Array} pathNodes Array of { x, y, z?, ctrlX?, ctrlY?, ctrlZ? }
 * @param {number} cx - Viewport center X
 * @param {number} cy - Viewport center Y
 * @param {number} tiltDeg - Tilt angle in degrees
 * @param {boolean} [invertTilt=false]
 * @param {number} [perspective=1000] - CSS perspective value
 * @returns {Array} Array of { x, y, ctrlX?, ctrlY? } projected 2D path nodes
 */
export function projectPathNodes3DTo2D(
  pathNodes,
  cx,
  cy,
  tiltDeg,
  invertTilt = false,
  perspective = 1000,
) {
  if (!pathNodes || pathNodes.length === 0) return [];

  return pathNodes.map((node) => {
    const z = node.z !== undefined ? node.z : 0;
    const projected = project3DTo2D(
      node.x,
      node.y,
      z,
      cx,
      cy,
      tiltDeg,
      invertTilt,
      perspective,
    );
    const result = { x: projected.x, y: projected.y };

    // Project control points if present
    if (node.ctrlX !== undefined && node.ctrlY !== undefined) {
      const ctrlZ = node.ctrlZ !== undefined ? node.ctrlZ : 0;
      const projCtrl = project3DTo2D(
        node.ctrlX,
        node.ctrlY,
        ctrlZ,
        cx,
        cy,
        tiltDeg,
        invertTilt,
        perspective,
      );
      result.ctrlX = projCtrl.x;
      result.ctrlY = projCtrl.y;
    }

    return result;
  });
}

/**
 * Geometric shape generators returning arrays of 2D projected path nodes.
 */
export const shapeGenerators = {
  /**
   * Generates a spiral path wrapping a vertical cylinder (helix/spring).
   */
  helix({ radius, height, turns, segments = 150 }) {
    const nodes = [];
    for (let i = 0; i <= segments; i++) {
      const p = i / segments;
      const theta = p * turns * 2 * Math.PI;
      const x3d = radius * Math.cos(theta);
      const y3d = p * height;
      const z3d = radius * Math.sin(theta);

      nodes.push({ x: x3d, y: y3d, z: z3d });
    }
    return nodes;
  },
};
