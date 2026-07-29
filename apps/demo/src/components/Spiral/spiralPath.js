import { SPIRAL_CONFIG, BALL_SIZE, BALL_SPEED } from "./spiralConfig.js";

export function generateSpiralPoints(
  cx,
  cy,
  outerR,
  innerR,
  turns,
  targetSegments = 200,
) {
  // 1. Generate high-resolution raw spiral points
  const rawSegments = 2000;
  const rawPoints = [];
  for (let i = 0; i <= rawSegments; i++) {
    const p = i / rawSegments;
    const theta = p * turns * 2 * Math.PI;
    const r = outerR - (outerR - innerR) * p;
    rawPoints.push({
      x: cx + r * Math.cos(theta - Math.PI / 2),
      y: cy + r * Math.sin(theta - Math.PI / 2),
    });
  }

  // 2. Compute cumulative physical distances along the raw path
  const dists = [0];
  let totalLength = 0;
  for (let i = 1; i < rawPoints.length; i++) {
    const p1 = rawPoints[i - 1];
    const p2 = rawPoints[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
    dists.push(totalLength);
  }

  // 3. Re-sample the path to have perfectly uniform segment spacing
  const uniformPoints = [];
  const step = totalLength / targetSegments;

  for (let i = 0; i <= targetSegments; i++) {
    const targetDist = i * step;

    let idx = 0;
    while (idx < dists.length - 1 && dists[idx + 1] < targetDist) {
      idx++;
    }

    const dStart = dists[idx];
    const dEnd = dists[idx + 1];
    const segmentLength = dEnd - dStart;
    const ratio = segmentLength > 0 ? (targetDist - dStart) / segmentLength : 0;

    const pStart = rawPoints[idx];
    const pEnd = rawPoints[idx + 1];

    uniformPoints.push({
      x: pStart.x + (pEnd.x - pStart.x) * ratio,
      y: pStart.y + (pEnd.y - pStart.y) * ratio,
    });
  }

  return uniformPoints;
}

export const calculatePathLength = (points) => {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
};

export const spiralPathPoints = generateSpiralPoints(
  SPIRAL_CONFIG.cx,
  SPIRAL_CONFIG.cy,
  SPIRAL_CONFIG.outerR,
  SPIRAL_CONFIG.innerR,
  SPIRAL_CONFIG.turns,
);

export const totalPathLength = calculatePathLength(spiralPathPoints);

// --- Inferred Zuma Spawner Parameters ---
export const BALL_TRAVEL_SECONDS = totalPathLength / BALL_SPEED;
export const SPAWN_INTERVAL_MS = (BALL_SIZE / BALL_SPEED) * 1000;
export const MIN_SPAWN_PROGRESS = BALL_SIZE / totalPathLength;
