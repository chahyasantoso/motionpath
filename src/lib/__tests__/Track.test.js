import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
import { Track } from '../Track.js';

function createDummyTrack(id = 'test-track') {
  const proxy = { x: 0, y: 0 };
  const tween = gsap.to(proxy, { x: 100, y: 200, duration: 1, ease: 'none', paused: true });
  const plugins = [{
    keys: ['x', 'y'],
    compose: (raw) => ({ transform: `translate3d(${raw.x ?? 0}px, ${raw.y ?? 0}px, 0px)` }),
  }];
  const resolvedTrack = { id, keyframes: { x: {}, y: {} } };

  return new Track({
    id,
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins,
    resolvedTrack,
  });
}

describe('Track (v4 first-class playhead owner)', () => {
  it('should support progress(p) accessor reading and writing', () => {
    const track = createDummyTrack();
    expect(track.progress()).toBe(0);

    track.progress(0.5);
    expect(track.progress()).toBe(0.5);

    const snapshot = track.getSnapshot();
    expect(snapshot.x).toBe(50);
    expect(snapshot.y).toBe(100);
    expect(snapshot.progress).toBe(0.5);
  });

  it('should be directly tweenable by GSAP accessor duck-typing without proxy objects', () => {
    const track = createDummyTrack('gsap-tweened-track');
    expect(track.progress()).toBe(0);

    const tween = gsap.to(track, { progress: 1, duration: 0.1, ease: 'none', paused: true });
    tween.progress(0.5);

    expect(track.progress()).toBe(0.5);
    expect(track.getSnapshot().x).toBe(50);
  });

  it('should deliver raw proxy state on subscribe and separate composed patch on compose', () => {
    const track = createDummyTrack('sub-track');
    const subscriber = vi.fn();

    track.subscribe(subscriber);
    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 0, progress: 0 }));

    track.progress(1);
    expect(subscriber).toHaveBeenLastCalledWith(expect.objectContaining({ x: 100, y: 200, progress: 1 }));

    const composed = track.compose();
    expect(composed).toEqual({ transform: 'translate3d(100px, 200px, 0px)' });
  });

  it('should enforce single attachment guard and throw on subscribe if attached', () => {
    const hostTrack = createDummyTrack('host');
    const childTrack = createDummyTrack('attached-child');

    childTrack.attach(hostTrack);
    expect(childTrack.isAttached).toBe(true);

    expect(() => childTrack.attach(hostTrack)).toThrow(/already attached/);
    expect(() => childTrack.subscribe(() => {})).toThrow(/subscribe to the host instead/);

    childTrack.detach(hostTrack);
    expect(childTrack.isAttached).toBe(false);
  });

  it('should enforce single parent child relationship and throw on double addChild', () => {
    const parentA = createDummyTrack('parent-a');
    const parentB = createDummyTrack('parent-b');
    const child = createDummyTrack('child');

    parentA.addChild(child, { stagger: 0.1 });
    expect(child.parent).toBe(parentA);

    expect(() => parentB.addChild(child, { stagger: 0.1 })).toThrow(/already a child/);
  });
});
