/** Projects 3D coordinates and generated shapes for demo-independent math consumers. */
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
  if (distance <= 0) return { x: cx, y: cy, scale: 0 };
  const scale = perspective / distance;
  return {
    x: Math.round((cx + x3d * scale) * 100) / 100,
    y:
      Math.round(
        (cy +
          (y3d * Math.cos(tiltRad) +
            (invertTilt ? -z3d : z3d) * Math.sin(tiltRad)) *
            scale) *
          100,
      ) / 100,
    scale: Math.round(scale * 10000) / 10000,
  };
}
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
    const z = node.z ?? 0;
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
    if (node.ctrlX !== undefined && node.ctrlY !== undefined) {
      const ctrl = project3DTo2D(
        node.ctrlX,
        node.ctrlY,
        node.ctrlZ ?? 0,
        cx,
        cy,
        tiltDeg,
        invertTilt,
        perspective,
      );
      result.ctrlX = ctrl.x;
      result.ctrlY = ctrl.y;
    }
    return result;
  });
}
export const shapeGenerators = {
  helix({ radius, height, turns, segments = 150 }) {
    const nodes = [];
    for (let i = 0; i <= segments; i += 1) {
      const p = i / segments;
      const theta = p * turns * 2 * Math.PI;
      nodes.push({
        x: radius * Math.cos(theta),
        y: p * height,
        z: radius * Math.sin(theta),
      });
    }
    return nodes;
  },
};
