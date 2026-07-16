import { BaseEngine } from './BaseEngine.js';

export class ProductionEngine extends BaseEngine {
  _configForMount(motionId, config, groupSpec) {
    return groupSpec ? { ...config, _suppressDriver: true } : config;
  }

  _onInstanceMounted(instance, groupSpec) {
    if (groupSpec) {
      const controller = this._groups.get(groupSpec.timelineId);
      instance.play = () => controller.play();
      instance.pause = () => controller.pause();
      instance.seek = (progress) => controller.seek(progress);
    }
  }
}

export function createProductionEngine(deps) {
  return new ProductionEngine(deps);
}

export const productionEngine = new ProductionEngine();
export default productionEngine;
