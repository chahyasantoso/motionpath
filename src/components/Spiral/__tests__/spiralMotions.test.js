import { describe, it, expect } from 'vitest';
import { createSpiralProject } from '../spiralMotions.js';

describe('Spiral v4 project schema', () => {
  it('emits v4 ids and explicit track durations', () => {
    const project = createSpiralProject({ spiralPathPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }], ballTravelSeconds: 4, ballSize: 20, spawnIntervalMs: 500 });
    expect(project.schemaVersion).toBe(4);
    expect(project.motions.every((motion) => motion.id && !motion.motionId && motion.trigger)).toBe(true);
    expect(project.motions.flatMap((motion) => motion.tracks).every((track) => track.duration || track.id === 'keepalive')).toBe(true);
  });
});
