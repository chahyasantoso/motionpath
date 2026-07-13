import { compileProject } from '../usecases/CompileProject.js';
import { createDeferredCall } from '../utils/deferredCall.js';
import { createMotionResolver } from './resolveMotion.js';

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
  let _schema = null;
  let _project = null;
  let _loadGeneration = 0;
  const _deferredCall = createDeferredCall();
  const _motionResolver = createMotionResolver();

  function _cleanup() {
    _loadGeneration++;
    if (_core) { _core.destroy(); _core = null; }
    _buildResult = null;
    _schema = null;
    _project = null;
    _motionResolver.clearCache();
  }

  return {
    async loadProject(schema) {
      const loadId = ++_loadGeneration;

      const { core, buildResult, project } = await compileProject(schema, deps, 'EditorEngine');

      // Stale-load guard: a newer loadProject() call (or destroy()) started
      // while buildProject was awaited — discard this result entirely.
      if (loadId !== _loadGeneration) {
        for (const motion of buildResult.motions) motion.timeline?.kill();
        for (const group of buildResult.timelineGroups.values()) group.masterTimeline?.kill();
        return;
      }

      if (_core) _core.destroy();
      _core = core;
      _buildResult = buildResult;
      _schema = schema;
      _project = project;
      _deferredCall.setCore(core);
    },

    subscribe(trackId, callback) {
      return _deferredCall.call((core) => core.subscribe(trackId, callback));
    },

    compose(trackId, rawData) {
      if (!_core) return {};
      return _core.compose(trackId, rawData);
    },

    destroySection(sectionId) {
      if (!_core) return;
      return _core.destroySection(sectionId);
    },

    destroy() {
      _deferredCall.clearCore();
      _cleanup();
    },

    /**
     * Seeks to a normalized progress value on the target timeline.
     * target = timelineId (grouped) or motionIndex as string (ungrouped).
     * progress is clamped to [0, 1].
     */
    setProgress(target, progress) {
      if (!_buildResult) throw new Error(`setProgress: no project loaded.`);
      const clamped = Math.max(0, Math.min(1, progress));
      const group = _buildResult.timelineGroups.get(target);
      if (group) { group.masterTimeline.progress(clamped); return; }
      const motion = _buildResult.motions.find(m => String(m.motionIndex) === target || m.motionId === target);
      if (motion) { motion.timeline.progress(clamped); return; }
      throw new Error(`setProgress: no group or motion found for target "${target}".`);
    },

    resolveMotion(motionId, progress, overrides = {}) {
      if (!_project || !_buildResult) {
        throw new Error('resolveMotion: project not loaded.');
      }
      return _motionResolver.resolve(_project, motionId, progress, overrides);
    }
  };
}
