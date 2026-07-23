import { describe, it, expect } from 'vitest';
import { parseV4Project } from '../parseV4Project.js';
import { registerTriggerDelegate } from '../../TriggerDelegate.js';
import { gsap } from 'gsap';

describe('parseV4Project', () => {
  it('should parse motions and tracks into V4 Motion and Track instances', async () => {
    const schema = {
      schemaVersion: 4,
      motions: [
        {
          id: 'hero-motion',
          trigger: { type: 'time', duration: 1 },
          tracks: [
            {
              id: 'hero-bg',
              keyframes: {
                opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] }
              }
            }
          ]
        }
      ],
      tracks: [
        {
          id: 'bare-track',
          keyframes: {
            opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] }
          }
        }
      ]
    };

    const project = await parseV4Project(schema);
    const motion = project.getMotion('hero-motion');
    const track = project.getTrack('hero-bg');
    const bareTrack = project.getTrack('bare-track');

    expect(motion).toBeDefined();
    expect(track).toBeDefined();
    expect(bareTrack).toBeDefined();

    expect(track.isMounted).toBe(true);
    expect(bareTrack.isMounted).toBe(false);
  });

  it('should support custom trigger delegates registered via registerTriggerDelegate', async () => {
    registerTriggerDelegate('custom-test', () => ({
      build: () => gsap.timeline({ paused: true }),
    }));

    const schema = {
      schemaVersion: 4,
      motions: [
        {
          id: 'custom-motion',
          trigger: { type: 'custom-test' },
          tracks: [
            { id: 't1', keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }
          ]
        }
      ]
    };

    const project = await parseV4Project(schema);
    expect(project.getMotion('custom-motion')).toBeDefined();
  });
});
