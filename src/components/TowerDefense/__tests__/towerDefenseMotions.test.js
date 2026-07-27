import { describe, it, expect } from 'vitest';
import { validateProject } from '../../../../validators/index.js';
import { towerDefenseProject } from '../towerDefenseMotions.js';

describe('TowerDefense v4 migration', () => {
  it('has no fatal schema violations and no legacy v2 fields', () => {
    const errors = validateProject(towerDefenseProject);
    expect(errors.filter((error) => error.severity === 'error')).toEqual([]);
    expect(towerDefenseProject.schemaVersion).toBe(4);
    expect(towerDefenseProject.motions.every((motion) => motion.id && motion.trigger && !motion.driver && !motion.motionId)).toBe(true);
  });
});
