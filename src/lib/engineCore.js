import { gsap } from 'gsap';

/**
 * Creates the EngineCore coordinator.
 * Manages the global GSAP ticker and tracks active MotionInstances.
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
