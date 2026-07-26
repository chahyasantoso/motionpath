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
    motion.init();
    const track = createDummyTrack('m-track');

    motion.mount(track);
    expect(track.isMounted).toBe(true);

    motion.trigger.seek(0.5);
    expect(track.progress()).toBe(0.5);
  });

  it('should support ManualTriggerDelegate without clock controls', () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({ id: 'manual-motion', triggerDelegate: delegate });
    motion.init();
    const track = createDummyTrack('manual-track');

    motion.mount(track);
    expect(motion.trigger.play).toBeUndefined();

    motion.trigger.progress(0.75);
    expect(track.progress()).toBe(0.75);
  });

  it('should render a newly added child track at the current master timeline progress', () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({ id: 'manual-motion', triggerDelegate: delegate });
    motion.init();

    const parentTrack = createDummyTrack('parent-track');
    motion.mount(parentTrack);

    motion.trigger.progress(0.5);

    const childTrack = createDummyTrack('child-track');
    parentTrack.addChild(childTrack, { stagger: 0 });

    expect(childTrack.progress()).toBeCloseTo(0.5, 5);
  });

  it('should reposition a sibling\'s mounted tween on removal-triggered reflow, not just update bookkeeping', () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({ id: 'manual-motion', triggerDelegate: delegate });
    motion.init();

    const parentTrack = createDummyTrack('parent-track');
    motion.mount(parentTrack);

    // Three children so we can remove a MIDDLE one — GaplessLayoutDelegate
    // intentionally never reflows on a rank-0 (frontmost) removal (see its
    // own computeReflow comments), so that case wouldn't exercise this fix.
    const childA = createDummyTrack('child-a');
    const childB = createDummyTrack('child-b');
    const childC = createDummyTrack('child-c');
    parentTrack.addChild(childA, { stagger: 0.2 }); // rank 0, offset 0
    parentTrack.addChild(childB, { stagger: 0.2 }); // rank 1, offset 0.2
    parentTrack.addChild(childC, { stagger: 0.2 }); // rank 2, offset 0.4

    parentTrack.removeChild(childB.id); // rank 1 (middle) — should cascade to childC

    // childC inherits childB's old slot (0.2), per computeReflow's
    // "ordered[k-1].currentOffset" rule.
    expect(childC.currentOffset).toBeCloseTo(0.2, 5);

    // The bookkeeping update alone has no visual effect — this is the actual
    // regression check. Without _reflowChild wired up, childC's REAL mounted
    // gsap tween keeps its stale absolute position (0.4) even though
    // #currentOffset now says 0.2, changing the master's total duration and
    // desyncing childC's rendered progress from what its new offset implies.
    // Values below confirmed via direct instrumentation of this exact
    // scenario (mount 3 children, remove the middle one, probe progress at
    // several fractions) rather than hand-derived — see PR discussion.
    motion.trigger.progress(0.3);
    expect(childC.progress()).toBeCloseTo(0.16, 2);
  });

  it('should snap (not animate) reflow when staggerTransition is absent, matching v3\'s duration:0 short-circuit', () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({ id: 'manual-motion', triggerDelegate: delegate }); // no staggerTransition
    motion.init();

    const toSpy = vi.spyOn(gsap, 'to');
    const parentTrack = createDummyTrack('parent-track');
    motion.mount(parentTrack);

    const childA = createDummyTrack('child-a');
    const childB = createDummyTrack('child-b');
    const childC = createDummyTrack('child-c');
    parentTrack.addChild(childA, { stagger: 0.2 });
    parentTrack.addChild(childB, { stagger: 0.2 });
    parentTrack.addChild(childC, { stagger: 0.2 });

    toSpy.mockClear(); // ignore the addChild-time gsap.to calls, only care about reflow
    parentTrack.removeChild(childB.id);

    // No gsap.to call should target childC's reposition with a `startTime` var
    // — the snap branch uses masterTimeline.add() + render(), not a tween.
    const reflowAnimateCalls = toSpy.mock.calls.filter(
      ([, vars]) => vars && Object.prototype.hasOwnProperty.call(vars, 'startTime')
    );
    expect(reflowAnimateCalls.length).toBe(0);
    toSpy.mockRestore();
  });

  it('should animate reflow via tween.startTime when staggerTransition has a nonzero duration', () => {
    const delegate = new ManualTriggerDelegate();
    const motion = new Motion({
      id: 'manual-motion',
      triggerDelegate: delegate,
      staggerTransition: { duration: 0.3, ease: 'power3.out' },
    });
    motion.init();

    const parentTrack = createDummyTrack('parent-track');
    motion.mount(parentTrack);

    const childA = createDummyTrack('child-a');
    const childB = createDummyTrack('child-b');
    const childC = createDummyTrack('child-c');
    parentTrack.addChild(childA, { stagger: 0.2 });
    parentTrack.addChild(childB, { stagger: 0.2 });
    parentTrack.addChild(childC, { stagger: 0.2 });

    const toSpy = vi.spyOn(gsap, 'to');
    parentTrack.removeChild(childB.id); // triggers reflow for childC

    const reflowAnimateCalls = toSpy.mock.calls.filter(
      ([, vars]) => vars && Object.prototype.hasOwnProperty.call(vars, 'startTime')
    );
    expect(reflowAnimateCalls.length).toBe(1);
    const [, vars] = reflowAnimateCalls[0];
    expect(vars.startTime).toBeCloseTo(0.2, 5); // childB's old slot, per computeReflow
    expect(vars.duration).toBe(0.3);
    expect(vars.ease).toBe('power3.out');
    expect(typeof vars.onUpdate).toBe('function');

    toSpy.mockRestore();
  });
});
