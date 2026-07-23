import { describe, it, expect, vi } from 'vitest';
import { Motion } from '../Motion.js';
import { Track } from '../Track.js';
import { TimeTriggerDelegate, ManualTriggerDelegate } from '../TriggerDelegate.js';
import { gsap } from 'gsap';

function createDummyTrack(id = 'test-track') {
  const proxy = { opacity: 0 };
  const tween = gsap.to(proxy, { opacity: 1, duration: 1, paused: true });
  return new Track({
    id,
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins: [],
    resolvedTrack: { id, keyframes: {} },
  });
}

describe('Motion & TriggerDelegates (v4)', () => {
  it('should mount tracks and drive progress through master timeline seeking', () => {
    const delegate = new TimeTriggerDelegate({ duration: 2 });
    const motion = new Motion({ id: 'time-motion', triggerDelegate: delegate });
    const track = createDummyTrack('m-track');

    motion.mount(track);
    expect(track.isMounted).toBe(true);

    motion.trigger.seek(0.5);
    expect(track.progress()).toBe(0.5);
  });

  it('should support ManualTriggerDelegate without clock controls', () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({ id: 'manual-motion', triggerDelegate: delegate });
    const track = createDummyTrack('manual-track');

    motion.mount(track);
    expect(motion.trigger.play).toBeUndefined();

    motion.trigger.progress(0.75);
    expect(track.progress()).toBe(0.75);
  });

  it('should throw clear error when resolving unregistered trigger DOM element', async () => {
    const { ScrollTriggerDelegate } = await import('../TriggerDelegate.js');
    const delegate = new ScrollTriggerDelegate({ trigger: 'missing-el-id' });
    const motion = new Motion({ id: 'scroll-motion', triggerDelegate: delegate, lazy: true });

    expect(() => {
      motion.init(() => {
        throw new Error("MotionPath: trigger ref 'missing-el-id' is not registered.");
      });
    }).toThrow(/missing-el-id/);
  });
});
