import { validateProject } from '../validators/index.js';
import { buildProject } from './builder.js';
import { createEngineCore } from './engineCore.js';
import { createDeferredSubscribe } from './deferredSubscribe.js';

/**
 * Factory function per Brief 5.
 * No scroll-based triggers, no .play(). Every position change is an explicit setProgress call.
 *
 * @param {{ resolveElement: (id: string) => Element }} deps
 * @returns {EditorEngine}
 */
export function createEditorEngine(deps) {
  let _core = null;
  let _buildResult = null;
  const _subRegistry = createDeferredSubscribe();

  return {
    async loadProject(schema) {
      // Step 1: Validate (same as ProductionEngine steps 1–3, no step 4)
      const errors = validateProject(schema) || [];
      const hardErrors = errors.filter(e => e.severity === 'error');
      const warnings = errors.filter(e => e.severity !== 'error');
      warnings.forEach(w => console.warn('[EditorEngine]', w.message));
      if (hardErrors.length > 0) {
        throw new Error(
          '[EditorEngine] Schema validation failed:\n' +
          hardErrors.map(e => `  - ${e.message}`).join('\n')
        );
      }

      // Step 2: Build
      const buildResult = await buildProject(schema, deps);

      // Step 3: EngineCore — NO trigger wiring
      const core = createEngineCore(buildResult);

      if (_core) _core.destroy();
      _core = core;
      _buildResult = buildResult;
      _subRegistry.setCore(core);
    },

    subscribe(elementId, callback) {
      return _subRegistry.subscribe(elementId, callback);
    },

    compose(elementId, rawData) {
      if (!_core) return {};
      return _core.compose(elementId, rawData);
    },

    destroyScene(sceneId) {
      if (!_core) return;
      return _core.destroyScene(sceneId);
    },

    destroy() {
      _subRegistry.clearCore();
      if (_core) { _core.destroy(); _core = null; }
      _buildResult = null;
    },

    /**
     * Seeks to a normalized progress value on the target timeline.
     * target = timelineId (grouped) or scenarioIndex as string (ungrouped).
     * progress is clamped to [0, 1].
     */
    setProgress(target, progress) {
      if (!_buildResult) throw new Error(`setProgress: no project loaded.`);
      const clamped = Math.max(0, Math.min(1, progress));
      const group = _buildResult.timelineGroups.get(target);
      if (group) { group.masterTimeline.progress(clamped); return; }
      const scenario = _buildResult.scenarios.find(s => String(s.scenarioIndex) === target);
      if (scenario) { scenario.timeline.progress(clamped); return; }
      throw new Error(`setProgress: no group or scenario found for target "${target}".`);
    },
  };
}
