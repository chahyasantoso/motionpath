import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { convertToCubicPath } from './pathUtils.js';

// Register plugins for browser environments (safe for SSR)
if (typeof window !== 'undefined') {
  gsap.registerPlugin(MotionPathPlugin, ScrollTrigger);
}

export class MotionEngineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MotionEngineError';
  }
}




class GsapPubSub {
  constructor() {
    this._listeners = new Map(); // elementId -> Set of callbacks
    this._cache = new Map();     // elementId -> last proxy coordinates { x, y, rotation, progress }
    this._scenes = new Map();    // sceneId -> scene configuration { timeline, tweens, elementIds }
  }

  /**
   * Initializes animations for a motion scene.
   * @param {Object} sceneData MotionScene object following schema.md
   * @param {HTMLElement} containerEl DOM container element for scroll trigger pinning/scrubbing
   */
  initScene(sceneData, containerEl) {
    if (!sceneData || !sceneData.sceneId) {
      throw new MotionEngineError('[GsapPubSub] Scene initialization failed: sceneData or sceneId is missing.');
    }

    // Clean up existing scene with same ID to prevent duplicates/leaks
    this.destroyScene(sceneData.sceneId);

    const elementIds = sceneData.elements.map(el => el.id);

    if (sceneData.triggerType === 'scroll') {
      this._createScrollScene(sceneData, containerEl, elementIds);
    } else if (sceneData.triggerType === 'timer') {
      this._createTimerScene(sceneData, elementIds);
    } else {
      throw new MotionEngineError(`[GsapPubSub] Unsupported triggerType: "${sceneData.triggerType}".`);
    }
  }

  /**
   * Subscribes a callback to element's coordinate changes.
   * @param {string} elementId ID of the element to watch
   * @param {Function} callback Function triggered with ({ x, y, rotation, progress })
   * @returns {Function} Unsubscribe cleanup function
   */
  subscribe(elementId, callback) {
    if (typeof callback !== 'function') {
      throw new MotionEngineError('[GsapPubSub] Subscriber callback must be a function.');
    }

    if (!this._listeners.has(elementId)) {
      this._listeners.set(elementId, new Set());
    }

    const listenersSet = this._listeners.get(elementId);
    listenersSet.add(callback);

    // Cache lookup to prevent jumping visual bugs for late-subscribers
    if (this._cache.has(elementId)) {
      callback(this._cache.get(elementId));
    }

    // Return the cleanup function directly
    return () => {
      const activeListeners = this._listeners.get(elementId);
      if (activeListeners) {
        activeListeners.delete(callback);
        if (activeListeners.size === 0) {
          this._listeners.delete(elementId);
        }
      }
    };
  }

  /**
   * Broadcasts coordinates to all subscribed callbacks for an element ID.
   * @private
   */
  _broadcast(elementId, data) {
    this._cache.set(elementId, data);

    const listenersSet = this._listeners.get(elementId);
    if (listenersSet) {
      listenersSet.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[GsapPubSub] Error in listener callback for element "${elementId}":`, error);
        }
      });
    }
  }

  /**
   * Sets up scroll-driven timelines.
   * @private
   */
  _createScrollScene(sceneData, containerEl, elementIds) {
    if (!containerEl) {
      throw new MotionEngineError(`[GsapPubSub] Container element missing for scroll-triggered scene "${sceneData.sceneId}". ScrollTrigger requires a container element to function.`);
    }

    const scrollConfig = sceneData.scrollConfig || { scrub: true, pin: false };
    
    // Resolve what element to pin
    let pinElement = scrollConfig.pin;
    if (scrollConfig.pin === true) {
      pinElement = containerEl;
    } else if (typeof scrollConfig.pin === 'string' && containerEl) {
      // Find the element within containerEl to avoid global selector conflicts
      pinElement = containerEl.querySelector(scrollConfig.pin) || scrollConfig.pin;
    }

    // Create master timeline bound to scroll progress
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: containerEl,
        start: 'top top',
        end: 'bottom bottom',
        scrub: scrollConfig.scrub,
        pin: pinElement,
        invalidateOnRefresh: true,
      }
    });

    sceneData.elements.forEach(element => {
      const cubicPath = convertToCubicPath(element.pathNodes);
      if (cubicPath.length === 0) return;

      const startNode = element.pathNodes[0] || { x: 0, y: 0, z: 0 };
      const proxy = {
        x: startNode.x,
        y: startNode.y,
        z: startNode.z !== undefined ? startNode.z : 0,
        rotation: 0,
        progress: 0,
      };

      // Set initial cache entry
      this._cache.set(element.id, { ...proxy });

      // Broadcast initial position so subscribers already mounted can render at the start node
      this._broadcast(element.id, { ...proxy });

      let startTime = 0;
      let duration = 1;
      if (element.timeframe && Array.isArray(element.timeframe) && element.timeframe.length === 2) {
        let [s, e] = element.timeframe;
        s = Math.max(0, Math.min(1, s));
        e = Math.max(0, Math.min(1, e));
        if (s < e) {
          startTime = s;
          duration = e - s;
        } else {
          console.warn(`[GsapPubSub] Invalid timeframe order for element "${element.id}":`, element.timeframe);
        }
      }

      tl.to(proxy, {
        progress: 1,
        motionPath: {
          path: cubicPath,
          type: 'cubic',
          autoRotate: true,
          properties: { x: 'x', y: 'y', z: 'z' },
        },
        ease: 'none', // Strict requirement: scroll trigger MUST use ease: "none"
        duration: duration,  // Normalized timeline duration
        onUpdate: () => {
          this._broadcast(element.id, {
            x: proxy.x,
            y: proxy.y,
            z: proxy.z,
            rotation: proxy.rotation,
            progress: proxy.progress,
          });
        }
      }, startTime);
    });

    // Force timeline to span exactly [0, 1] regardless of element timeframes
    tl.addLabel('end', 1);

    // Force timeline to evaluate at progress 0 to calculate GSAP auto-rotation
    tl.progress(0);

    this._scenes.set(sceneData.sceneId, {
      timeline: tl,
      tweens: null,
      elementIds,
    });
  }

  /**
   * Sets up time-driven individual tweens.
   * @private
   */
  _createTimerScene(sceneData, elementIds) {
    const tweens = [];

    sceneData.elements.forEach(element => {
      const cubicPath = convertToCubicPath(element.pathNodes);
      if (cubicPath.length === 0) return;

      const startNode = element.pathNodes[0] || { x: 0, y: 0, z: 0 };
      const proxy = {
        x: startNode.x,
        y: startNode.y,
        z: startNode.z !== undefined ? startNode.z : 0,
        rotation: 0,
        progress: 0,
      };

      // Set initial cache entry
      this._cache.set(element.id, { ...proxy });

      // Broadcast initial position so subscribers already mounted can render at the start node
      this._broadcast(element.id, { ...proxy });

      let startTime = 0;
      let durationFactor = 1;
      if (element.timeframe && Array.isArray(element.timeframe) && element.timeframe.length === 2) {
        let [s, e] = element.timeframe;
        s = Math.max(0, Math.min(1, s));
        e = Math.max(0, Math.min(1, e));
        if (s < e) {
          startTime = s;
          durationFactor = e - s;
        } else {
          console.warn(`[GsapPubSub] Invalid timeframe order for element "${element.id}":`, element.timeframe);
        }
      }

      const ease = element.ease || 'power1.inOut';
      const baseDuration = element.duration !== undefined ? element.duration : 1;
      const baseDelay = element.delay || 0;
      const repeat = element.repeat !== undefined ? element.repeat : 0;

      const duration = baseDuration * durationFactor;
      const delay = baseDelay + baseDuration * startTime;

      const tween = gsap.to(proxy, {
        progress: 1,
        motionPath: {
          path: cubicPath,
          type: 'cubic',
          autoRotate: true,
          properties: { x: 'x', y: 'y', z: 'z' },
        },
        ease: ease,
        duration: duration,
        delay: delay,
        repeat: repeat,
        onUpdate: () => {
          this._broadcast(element.id, {
            x: proxy.x,
            y: proxy.y,
            z: proxy.z,
            rotation: proxy.rotation,
            progress: proxy.progress,
          });
        }
      });

      // Force tween to evaluate at progress 0 to calculate GSAP auto-rotation
      tween.progress(0);

      tweens.push(tween);
    });

    this._scenes.set(sceneData.sceneId, {
      timeline: null,
      tweens,
      elementIds,
    });
  }

  /**
   * Pauses a timer-driven scene's animations.
   * @param {string} sceneId
   */
  pauseTimer(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene || !scene.tweens) return;
    scene.tweens.forEach(tween => tween.pause());
  }

  /**
   * Plays/resumes a timer-driven scene's animations.
   * @param {string} sceneId
   */
  playTimer(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene || !scene.tweens) return;
    scene.tweens.forEach(tween => tween.play());
  }

  /**
   * Disables a scroll-driven scene's scroll tracking.
   * @param {string} sceneId
   */
  disableScroll(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene || !scene.timeline || !scene.timeline.scrollTrigger) return;
    scene.timeline.scrollTrigger.disable();
  }

  /**
   * Enables a scroll-driven scene's scroll tracking.
   * @param {string} sceneId
   */
  enableScroll(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene || !scene.timeline || !scene.timeline.scrollTrigger) return;
    scene.timeline.scrollTrigger.enable();
  }

  /**
   * Destroys a single scene by its ID, cleaning up triggers and animations.
   * @param {string} sceneId ID of the scene to destroy
   */
  destroyScene(sceneId) {
    const scene = this._scenes.get(sceneId);
    if (!scene) return;

    if (scene.timeline) {
      if (scene.timeline.scrollTrigger) {
        scene.timeline.scrollTrigger.kill(true);
      }
      scene.timeline.kill();
    }

    if (scene.tweens) {
      scene.tweens.forEach(tween => {
        if (tween.scrollTrigger) {
          tween.scrollTrigger.kill(true);
        }
        tween.kill();
      });
    }

    // Clean cache entries for elements in this scene
    if (scene.elementIds) {
      scene.elementIds.forEach(id => {
        this._cache.delete(id);
      });
    }

    this._scenes.delete(sceneId);
  }

  /**
   * Destroys all active scenes and resets state maps.
   */
  destroy() {
    // Kill and clean all registered scenes
    Array.from(this._scenes.keys()).forEach(sceneId => {
      this.destroyScene(sceneId);
    });

    // Reset everything
    this._listeners.clear();
    this._cache.clear();
    this._scenes.clear();
  }
}

// Export singleton instance as default
const motionEngine = new GsapPubSub();
export default motionEngine;


