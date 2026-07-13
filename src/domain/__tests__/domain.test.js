import { describe, expect, it } from 'vitest';
import { parseProjectSchema } from '../../usecases/ParseProjectSchema.js';
import {
  MotionProject,
  MotionTemplate,
  MotionDefinition,
  TimelineDriver,
  DelegateDriver,
  ManualDriver,
  ScrollTriggerConfig,
  TimeTriggerConfig,
  MotionTrack
} from '../models.js';

describe('Domain Models and Parser', () => {
  it('correctly parses raw schema into MotionProject and its nested domain models', () => {
    const rawSchema = {
      schemaVersion: 2,
      perspective: '1200px',
      templates: [
        {
          templateId: 'tmpl-1',
          duration: 1.5,
          transformOrigin: 'top left',
          keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 100 }] } }
        }
      ],
      motions: [
        {
          motionId: 'motion-timeline-scroll',
          stagger: 0.25,
          driver: {
            type: 'timeline',
            sectionId: 'sec-1',
            timelineId: 'time-g1',
            primary: true,
            trigger: {
              type: 'scroll',
              scrub: true,
              start: 'top top',
              end: 'bottom bottom',
              pin: '#sec-1'
            }
          },
          tracks: [
            {
              id: 'track-a',
              use: 'tmpl-1',
              keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } }
            }
          ]
        },
        {
          motionId: 'motion-timeline-time',
          driver: {
            type: 'timeline',
            trigger: {
              type: 'time',
              repeat: -1,
              yoyo: true,
              delay: 2
            }
          },
          tracks: [
            { id: 'track-b', duration: 3.0 }
          ]
        },
        {
          motionId: 'motion-delegate',
          driver: { type: 'delegate' },
          tracks: [{ id: 'track-c' }]
        },
        {
          motionId: 'motion-manual',
          driver: { type: 'manual' },
          tracks: [{ id: 'track-d' }]
        }
      ]
    };

    const project = parseProjectSchema(rawSchema);

    expect(project).toBeInstanceOf(MotionProject);
    expect(project.schemaVersion).toBe(2);
    expect(project.perspective).toBe('1200px');

    // Test templates
    const template = project.getTemplate('tmpl-1');
    expect(template).toBeInstanceOf(MotionTemplate);
    expect(template.duration).toBe(1.5);
    expect(template.transformOrigin).toBe('top left');

    // Test motions
    const motionsList = project.getMotionsList();
    expect(motionsList).toHaveLength(4);

    // Scroll timeline motion
    const scrollMotion = project.getMotion('motion-timeline-scroll');
    expect(scrollMotion).toBeInstanceOf(MotionDefinition);
    expect(scrollMotion.stagger).toBe(0.25);
    expect(scrollMotion.driver).toBeInstanceOf(TimelineDriver);
    expect(scrollMotion.driver.sectionId).toBe('sec-1');
    expect(scrollMotion.driver.timelineId).toBe('time-g1');
    expect(scrollMotion.driver.primary).toBe(true);
    expect(scrollMotion.driver.trigger).toBeInstanceOf(ScrollTriggerConfig);
    expect(scrollMotion.driver.trigger.scrub).toBe(true);
    expect(scrollMotion.driver.trigger.pin).toBe('#sec-1');
    expect(scrollMotion.tracks[0]).toBeInstanceOf(MotionTrack);
    expect(scrollMotion.tracks[0].id).toBe('track-a');
    expect(scrollMotion.tracks[0].use).toBe('tmpl-1');

    // Time timeline motion
    const timeMotion = project.getMotion('motion-timeline-time');
    expect(timeMotion.driver).toBeInstanceOf(TimelineDriver);
    expect(timeMotion.driver.trigger).toBeInstanceOf(TimeTriggerConfig);
    expect(timeMotion.driver.trigger.repeat).toBe(-1);
    expect(timeMotion.driver.trigger.yoyo).toBe(true);
    expect(timeMotion.driver.trigger.delay).toBe(2);

    // Delegate motion
    const delegateMotion = project.getMotion('motion-delegate');
    expect(delegateMotion.driver).toBeInstanceOf(DelegateDriver);

    // Manual motion
    const manualMotion = project.getMotion('motion-manual');
    expect(manualMotion.driver).toBeInstanceOf(ManualDriver);
  });

  it('correctly keys unnamed motions by their positional index string to prevent map collision', () => {
    const rawSchema = {
      schemaVersion: 2,
      motions: [
        {
          driver: { type: 'manual' },
          tracks: [{ id: 'track-1' }]
        },
        {
          driver: { type: 'manual' },
          tracks: [{ id: 'track-2' }]
        },
        {
          motionId: 'named-motion',
          driver: { type: 'manual' },
          tracks: [{ id: 'track-3' }]
        }
      ]
    };

    const project = parseProjectSchema(rawSchema);

    // Verify motions map is not collapsed onto `undefined` key.
    // 3 motions total. Unnamed motions are indexed '0' and '1'.
    expect(project.motions.size).toBe(3);
    
    const motion0 = project.getMotion('0');
    const motion1 = project.getMotion('1');
    const namedMotion = project.getMotion('named-motion');

    expect(motion0).toBeDefined();
    expect(motion1).toBeDefined();
    expect(namedMotion).toBeDefined();

    expect(motion0.tracks[0].id).toBe('track-1');
    expect(motion1.tracks[0].id).toBe('track-2');
    expect(namedMotion.tracks[0].id).toBe('track-3');

    // getMotionsList preserves the original order
    const list = project.getMotionsList();
    expect(list[0]).toBe(motion0);
    expect(list[1]).toBe(motion1);
    expect(list[2]).toBe(namedMotion);
  });
});
