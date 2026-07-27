import { describe, it, expect } from 'vitest';
import { Motion } from '../Motion.js';
import { ManualTriggerDelegate } from '../TriggerDelegate.js';
import { gsap } from 'gsap';

function track(id, duration = 2) {
  const proxy = { value: 0 };
  const tween = gsap.to(proxy, { value: 1, duration, paused: true });
  return { id, duration, _mount() {}, _unmount() {}, get progress() { return undefined; } };
}

describe('Motion Phase 2 controls', () => {
  it('exposes the same control vocabulary for manual motions', () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({ id: 'manual', triggerDelegate: delegate });
    motion.init();
    expect(typeof motion.play).toBe('function');
    expect(typeof motion.pause).toBe('function');
    expect(typeof motion.seek).toBe('function');
    expect(typeof motion.reverse).toBe('function');
    expect(typeof motion.onComplete).toBe('function');
    motion.destroy();
  });
});
