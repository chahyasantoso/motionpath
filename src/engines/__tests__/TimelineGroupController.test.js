import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimelineGroupController } from '../TimelineGroupController.js';

vi.mock('gsap/ScrollTrigger', () => {
  return {
    ScrollTrigger: {
      create: vi.fn(() => ({
        kill: vi.fn(),
        disable: vi.fn(),
        enable: vi.fn()
      })),
      refresh: vi.fn()
    }
  };
});

function createMockInstance(motionId, opts = {}) {
  const timeline = gsap.timeline({ paused: true });
  // Add a real tween so the timeline has non-zero duration
  const proxy = { value: 0 };
  timeline.to(proxy, { value: 1, duration: 1 });

  return {
    id: opts.id || `inst-${Math.random().toString(36).slice(2, 6)}`,
    motionId,
    config: opts.config || {},
    schemaMotion: opts.schemaMotion || {
      driver: {
        type: opts.driverType || 'gsap-timeline',
        sectionId: opts.sectionId || 'section-1',
        trigger: opts.trigger || { type: 'time', duration: 1, repeat: -1, yoyo: true }
      }
    },
    deps: {
      resolveElement: opts.resolveElement || vi.fn((id) => ({ id })),
      mountInstance: vi.fn()
    },
    timeline
  };
}

describe('TimelineGroupController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addMember', () => {
    it('adds member timeline to master timeline', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const instance = createMockInstance('motion-a');

      controller.addMember(instance);

      expect(controller.memberCount).toBe(1);
      const children = controller.masterTimeline.getChildren();
      expect(children).toContain(instance.timeline);
    });

    it('unpauses member timeline before adding to master', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const instance = createMockInstance('motion-a');

      expect(instance.timeline.paused()).toBe(true);
      controller.addMember(instance);
      expect(instance.timeline.paused()).toBe(false);
    });

    it('does not attach driver for non-primary members', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const instance = createMockInstance('motion-a');

      controller.addMember(instance);

      expect(controller.masterTimeline.paused()).toBe(true);
      expect(ScrollTrigger.create).not.toHaveBeenCalled();
    });

    it('attaches driver when primary mounts (timeline type)', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const primary = createMockInstance('motion-primary', {
        trigger: { type: 'time', duration: 1, repeat: 2, yoyo: true, repeatDelay: 0.5 }
      });

      controller.addMember(primary);

      expect(controller.masterTimeline.repeat()).toBe(2);
      expect(controller.masterTimeline.yoyo()).toBe(true);
      expect(controller.masterTimeline.repeatDelay()).toBe(0.5);
    });

    it('attaches driver when primary mounts (scroll-scrub type)', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const primary = createMockInstance('motion-primary', {
        driverType: 'gsap-scroll',
        trigger: { type: 'scroll', scrub: true, trigger: '#hero', start: 'top top', end: '+=2000' }
      });

      controller.addMember(primary);

      expect(ScrollTrigger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          animation: controller.masterTimeline,
          scrub: true
        })
      );
    });

    it('calls ScrollTrigger.refresh when ScrollTrigger exists and new member added', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const primary = createMockInstance('motion-primary', {
        driverType: 'gsap-scroll',
        trigger: { type: 'scroll', scrub: true, trigger: '#hero' }
      });

      controller.addMember(primary);
      ScrollTrigger.refresh.mockClear();

      const nonPrimary = createMockInstance('motion-b');
      controller.addMember(nonPrimary);

      expect(ScrollTrigger.refresh).toHaveBeenCalled();
    });
  });

  describe('mount order handling', () => {
    it('non-primary first, primary second: driver attaches on primary mount', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const nonPrimary = createMockInstance('motion-a');
      const primary = createMockInstance('motion-primary', {
        trigger: { type: 'time', duration: 1, repeat: -1, yoyo: true }
      });

      controller.addMember(nonPrimary);
      expect(controller.masterTimeline.paused()).toBe(true);
      expect(controller.hasPrimary).toBe(false);

      controller.addMember(primary);
      expect(controller.hasPrimary).toBe(true);
    });

    it('primary first, non-primary second: both timelines in master', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const primary = createMockInstance('motion-primary', {
        trigger: { type: 'time', duration: 1, repeat: 0, yoyo: false }
      });
      const nonPrimary = createMockInstance('motion-b');

      controller.addMember(primary);
      controller.addMember(nonPrimary);

      expect(controller.memberCount).toBe(2);
      const children = controller.masterTimeline.getChildren();
      expect(children).toContain(primary.timeline);
      expect(children).toContain(nonPrimary.timeline);
    });
  });

  describe('removeMember', () => {
    it('removes non-primary member timeline from master', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const primary = createMockInstance('motion-primary', {
        id: 'inst-p',
        trigger: { type: 'time', repeat: 0 }
      });
      const nonPrimary = createMockInstance('motion-b', { id: 'inst-b' });

      controller.addMember(primary);
      controller.addMember(nonPrimary);

      const isEmpty = controller.removeMember('inst-b', 'motion-b');

      expect(isEmpty).toBe(false);
      expect(controller.memberCount).toBe(1);
    });

    it('removing primary kills ScrollTrigger and pauses master', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const primary = createMockInstance('motion-primary', {
        id: 'inst-p',
        driverType: 'gsap-scroll',
        trigger: { type: 'scroll', scrub: true, trigger: '#el' }
      });
      const nonPrimary = createMockInstance('motion-b', { id: 'inst-b' });

      controller.addMember(primary);
      controller.addMember(nonPrimary);

      const mockST = ScrollTrigger.create.mock.results[0].value;
      const isEmpty = controller.removeMember('inst-p', 'motion-primary');

      expect(isEmpty).toBe(false);
      expect(mockST.kill).toHaveBeenCalled();
      expect(controller.masterTimeline.paused()).toBe(true);
    });

    it('returns true when last member removed', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const instance = createMockInstance('motion-a', { id: 'inst-a' });

      controller.addMember(instance);
      const isEmpty = controller.removeMember('inst-a', 'motion-a');

      expect(isEmpty).toBe(true);
      expect(controller.memberCount).toBe(0);
    });
  });

  describe('destroy', () => {
    it('kills master timeline and ScrollTrigger', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const primary = createMockInstance('motion-primary', {
        driverType: 'gsap-scroll',
        trigger: { type: 'scroll', scrub: true, trigger: '#el' }
      });

      controller.addMember(primary);
      const mockST = ScrollTrigger.create.mock.results[0].value;
      const killSpy = vi.spyOn(controller.masterTimeline, 'kill');

      controller.destroy();

      expect(mockST.kill).toHaveBeenCalled();
      expect(killSpy).toHaveBeenCalled();
      expect(controller.memberCount).toBe(0);
    });
  });

  describe('play/pause/seek', () => {
    it('play/pause proxy to master timeline', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const playSpy = vi.spyOn(controller.masterTimeline, 'play');
      const pauseSpy = vi.spyOn(controller.masterTimeline, 'pause');

      controller.play();
      expect(playSpy).toHaveBeenCalled();

      controller.pause();
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('seek clamps progress to [0, 1]', () => {
      const controller = createTimelineGroupController('tl-1', 'motion-primary');
      const progressSpy = vi.spyOn(controller.masterTimeline, 'progress');

      controller.seek(0.5);
      expect(progressSpy).toHaveBeenCalledWith(0.5);

      controller.seek(-0.5);
      expect(progressSpy).toHaveBeenCalledWith(0);

      controller.seek(1.5);
      expect(progressSpy).toHaveBeenCalledWith(1);
    });
  });
});
