import { gsap } from 'gsap';

/**
 * @typedef {Object} EngineCore
 * @property {function(import('../domain/MotionInstance.js').MotionInstance): void} registerActiveInstance - Registers a stateful MotionInstance to receive frame ticks.
 * @property {function(import('../domain/MotionInstance.js').MotionInstance): void} unregisterActiveInstance - Removes a MotionInstance from the active ticker list.
 * @property {function(): void} destroy - Shuts down the ticker callback and clears all instances.
 */

/**
 * Creates the EngineCore coordinator.
 * Manages the global GSAP ticker and tracks active MotionInstances.
 *
 * @returns {EngineCore}
 */
export function createEngineCore() {
  const activeInstances = new Set();
  let tickerCallback = null;

  function startTicker() {
    if (tickerCallback) return;
    tickerCallback = () => {
      for (const instance of activeInstances) {
        instance.broadcast();
      }
    };
    gsap.ticker.add(tickerCallback);
  }

  function stopTicker() {
    if (!tickerCallback) return;
    gsap.ticker.remove(tickerCallback);
    tickerCallback = null;
  }

  return {
    registerActiveInstance(instance) {
      activeInstances.add(instance);
      if (activeInstances.size === 1) {
        startTicker();
      }
    },

    unregisterActiveInstance(instance) {
      activeInstances.delete(instance);
      if (activeInstances.size === 0) {
        stopTicker();
      }
    },

    destroy() {
      stopTicker();
      activeInstances.clear();
    }
  };
}
