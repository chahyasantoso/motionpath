import { describe, it, expect } from "vitest";
import { validateProject } from "../../../../../packages/core/src/validators/index.js";
import { demoProject } from "../Demo/demoMotions.js";
import { burstProject } from "../Burst/burstMotions.js";
import { motorcycleProject } from "../Motorcycle/motorcycleMotions.js";
import { pmProject } from "../PasarMalam/pasarMalamMotions.js";
import { pmObserverProject } from "../PasarMalam/pasarMalamObserverMotions.js";
import { towerDefenseProject } from "../TowerDefense/towerDefenseMotions.js";
import { walkerProject } from "../Walker/walkerMotions.js";
const DEMO_PROJECTS = [
  ["Demo", demoProject],
  ["Burst", burstProject],
  ["Motorcycle", motorcycleProject],
  ["PasarMalam", pmProject],
  ["PasarMalamObserver", pmObserverProject],
  ["TowerDefense", towerDefenseProject],
  ["Walker", walkerProject],
];
const FORBIDDEN_MOTION_FIELDS = [
  "motionId",
  "driver",
  "timelineId",
  "primary",
  "lifecycle",
  "playback",
];
describe("demo projects", () => {
  it.each(DEMO_PROJECTS)("%s declares schemaVersion 4", (_name, project) =>
    expect(project.schemaVersion).toBe(4),
  );
  it.each(DEMO_PROJECTS)("%s has no fatal violations", (_name, project) =>
    expect(
      validateProject(project).filter((error) => error.severity === "error"),
    ).toEqual([]),
  );
  it.each(DEMO_PROJECTS)("%s carries no v2/v3 motion fields", (_n, project) => {
    for (const motion of project.motions) {
      expect(typeof motion.id).toBe("string");
      expect(motion.trigger).toBeTruthy();
      for (const field of FORBIDDEN_MOTION_FIELDS)
        expect(motion[field]).toBeUndefined();
    }
  });
  it.each(DEMO_PROJECTS)(
    "%s keeps duration on tracks, never on the trigger",
    (_name, project) => {
      for (const motion of project.motions)
        expect(motion.trigger.duration).toBeUndefined();
    },
  );
});
