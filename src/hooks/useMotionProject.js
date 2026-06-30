import { useEffect } from 'react';
import motionEngine from '../lib/motionEngine';

/**
 * Initializes multiple scenarios from a project data object.
 * Each scenario is initialized independently via motionEngine.initScene().
 *
 * @param {Object[]|Object} scenarios - Array of scenario objects, or a full project
 *   object with a `scenarios` array field.
 * @param {{ [sceneId]: React.RefObject }} containerRefMap - Map of sceneId → React ref
 *   to the DOM container for that scenario. Scenarios without a matching ref get null.
 * @param {{ paused?: boolean }} [options]
 */
export default function useMotionProject(scenarios, containerRefMap = {}, options = {}) {
  const { paused = false } = options;

  // Normalize: accept full project object or bare array
  const scenarioList = Array.isArray(scenarios)
    ? scenarios
    : Array.isArray(scenarios?.scenarios)
      ? scenarios.scenarios
      : [];

  useEffect(() => {
    if (scenarioList.length === 0) return;

    scenarioList.forEach(scenario => {
      if (!scenario?.sceneId) return;
      const ref = containerRefMap[scenario.sceneId];
      const containerEl = ref?.current ?? null;
      motionEngine.initScene(scenario, containerEl);
    });

    return () => {
      scenarioList.forEach(scenario => {
        if (scenario?.sceneId) motionEngine.destroyScene(scenario.sceneId);
      });
    };
  }, [scenarioList]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unified play/pause for all scenarios
  useEffect(() => {
    scenarioList.forEach(scenario => {
      if (!scenario?.sceneId) return;
      if (paused) motionEngine.pause(scenario.sceneId);
      else motionEngine.play(scenario.sceneId);
    });
  }, [scenarioList, paused]); // eslint-disable-line react-hooks/exhaustive-deps
}
