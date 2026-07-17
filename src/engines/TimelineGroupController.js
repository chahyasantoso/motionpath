import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Manages one timelineId group's master timeline lifecycle.
 * Handles deferred driver attachment (ScrollTrigger or auto-play)
 * until the primary instance mounts.
 *
 * @param {string} timelineId
 * @param {string} primaryMotionId
 * @returns {TimelineGroupController}
 */
export function createTimelineGroupController(timelineId, primaryMotionId) {
  const masterTimeline = gsap.timeline({ paused: true });
  const members = new Map(); // instanceId → { instance, timeline }
  let scrollTrigger = null;
  let driverAttached = false;

  function resolveTriggerRef(value, deps, fallbackId) {
    if (value === undefined || value === null) return deps.resolveElement(fallbackId);
    if (typeof value === 'boolean') return value;
    return deps.resolveElement(value);
  }

  function attachDriver(primaryInstance) {
    if (driverAttached) return;
    driverAttached = true;

    const schemaMotion = primaryInstance.schemaMotion;
    const driver = schemaMotion.driver || {};
    const trigger = driver.trigger || {};

    const isTimelineDriver = driver.type === 'timeline' || driver.type === 'gsap-timeline' || driver.type === 'gsap-scroll' || driver.type === 'scroll';
    if (!isTimelineDriver) {
      return;
    }

    const isScrollTrigger = trigger.type === 'scroll' || driver.type === 'gsap-scroll' || driver.type === 'scroll';

    if (isScrollTrigger) {
      const deps = primaryInstance.deps;
      const sectionId = driver.sectionId;

      const resolvedConfig = {
        ...trigger,
        trigger: resolveTriggerRef(
          primaryInstance.config.trigger ?? trigger.trigger ?? trigger.startTrigger,
          deps,
          sectionId
        ),
      };

      if (trigger.pin !== undefined) {
        resolvedConfig.pin = resolveTriggerRef(
          primaryInstance.config.pin ?? trigger.pin,
          deps,
          sectionId
        );
      }

      if (trigger.endTrigger !== undefined) {
        resolvedConfig.endTrigger = resolveTriggerRef(
          primaryInstance.config.endTrigger ?? trigger.endTrigger,
          deps,
          sectionId
        );
      }

      if (trigger.scrub) {
        scrollTrigger = ScrollTrigger.create({
          ...resolvedConfig,
          animation: masterTimeline
        });
      } else {
        masterTimeline
          .repeat(trigger.repeat ?? 0)
          .yoyo(!!trigger.yoyo)
          .repeatDelay(trigger.repeatDelay ?? 0);

        scrollTrigger = ScrollTrigger.create({
          trigger: resolvedConfig.trigger,
          start: trigger.start,
          toggleActions: trigger.toggleActions,
          animation: masterTimeline
        });
      }
    } else {
      masterTimeline
        .repeat(trigger.repeat ?? 0)
        .yoyo(!!trigger.yoyo)
        .repeatDelay(trigger.repeatDelay ?? 0);

      const shouldPlay = primaryInstance.config.autoplay ?? true;
      if (shouldPlay) {
        masterTimeline.play();
      }
    }
  }

  return {
    timelineId,
    masterTimeline,

    addMember(instance) {
      members.set(instance.id, { instance, timeline: instance.timeline });

      instance.timeline.paused(false);
      masterTimeline.add(instance.timeline);

      if (instance.motionId === primaryMotionId) {
        attachDriver(instance);
      }

      if (scrollTrigger) {
        ScrollTrigger.refresh();
      }
    },

    removeMember(instanceId, motionId) {
      const entry = members.get(instanceId);
      if (!entry) return false;

      masterTimeline.remove(entry.timeline);
      members.delete(instanceId);

      if (motionId === primaryMotionId) {
        if (scrollTrigger) {
          scrollTrigger.kill();
          scrollTrigger = null;
        }
        masterTimeline.pause();
        driverAttached = false;
      }

      return members.size === 0;
    },

    destroy() {
      if (scrollTrigger) {
        scrollTrigger.kill();
        scrollTrigger = null;
      }
      masterTimeline.kill();
      members.clear();
      driverAttached = false;
    },

    play() { masterTimeline.play(); },
    pause() { masterTimeline.pause(); },
    seek(progress) { masterTimeline.progress(Math.max(0, Math.min(1, progress))); },

    get memberCount() { return members.size; },
    get hasPrimary() {
      for (const { instance } of members.values()) {
        if (instance.motionId === primaryMotionId) return true;
      }
      return false;
    },
  };
}
