import { describe, expect, it } from 'vitest';
import { parseProjectSchema } from '../../usecases/ParseProjectSchema.js';
import {
  getMotion,
  getTemplate,
  getMotionsList
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

    // Verify project structure (plain object, not class instance)
    expect(project).toBeDefined();
    expect(project.schemaVersion).toBe(2);
    expect(project.perspective).toBe('1200px');
    expect(project.motions).toBeInstanceOf(Map);
    expect(project.templates).toBeInstanceOf(Map);

    // Test templates using helper function
    const template = getTemplate(project, 'tmpl-1');
    expect(template).toBeDefined();
    expect(template.templateId).toBe('tmpl-1');
    expect(template.duration).toBe(1.5);
    expect(template.transformOrigin).toBe('top left');

    // Test motions using helper function
    const motionsList = getMotionsList(project);
    expect(motionsList).toHaveLength(4);

    // Scroll timeline motion
    const scrollMotion = getMotion(project, 'motion-timeline-scroll');
    expect(scrollMotion).toBeDefined();
    expect(scrollMotion.motionId).toBe('motion-timeline-scroll');
    expect(scrollMotion.stagger).toBe(0.25);
    expect(scrollMotion.driver).toBeDefined();
    expect(scrollMotion.driver.type).toBe('timeline');
    expect(scrollMotion.driver.sectionId).toBe('sec-1');
    expect(scrollMotion.driver.timelineId).toBe('time-g1');
    expect(scrollMotion.driver.primary).toBe(true);
    expect(scrollMotion.driver.trigger).toBeDefined();
    expect(scrollMotion.driver.trigger.type).toBe('scroll');
    expect(scrollMotion.driver.trigger.scrub).toBe(true);
    expect(scrollMotion.driver.trigger.pin).toBe('#sec-1');
    expect(scrollMotion.tracks[0]).toBeDefined();
    expect(scrollMotion.tracks[0].id).toBe('track-a');
    expect(scrollMotion.tracks[0].use).toBe('tmpl-1');

    // Time timeline motion
    const timeMotion = getMotion(project, 'motion-timeline-time');
    expect(timeMotion).toBeDefined();
    expect(timeMotion.driver.type).toBe('timeline');
    expect(timeMotion.driver.trigger).toBeDefined();
    expect(timeMotion.driver.trigger.type).toBe('time');
    expect(timeMotion.driver.trigger.repeat).toBe(-1);
    expect(timeMotion.driver.trigger.yoyo).toBe(true);
    expect(timeMotion.driver.trigger.delay).toBe(2);

    // Delegate motion
    const delegateMotion = getMotion(project, 'motion-delegate');
    expect(delegateMotion).toBeDefined();
    expect(delegateMotion.driver.type).toBe('delegate');

    // Manual motion
    const manualMotion = getMotion(project, 'motion-manual');
    expect(manualMotion).toBeDefined();
    expect(manualMotion.driver.type).toBe('manual');
  });

  it('correctly keys all motions by their motionId without collision', () => {
    const rawSchema = {
      schemaVersion: 2,
      motions: [
        {
          motionId: 'motion-1',
          driver: { type: 'manual' },
          tracks: [{ id: 'track-1' }]
        },
        {
          motionId: 'motion-2',
          driver: { type: 'manual' },
          tracks: [{ id: 'track-2' }]
        },
        {
          motionId: 'motion-3',
          driver: { type: 'manual' },
          tracks: [{ id: 'track-3' }]
        }
      ]
    };

    const project = parseProjectSchema(rawSchema);

    // Verify all 3 motions are stored correctly in the map
    expect(project.motions.size).toBe(3);
    
    const motion1 = getMotion(project, 'motion-1');
    const motion2 = getMotion(project, 'motion-2');
    const motion3 = getMotion(project, 'motion-3');

    expect(motion1).toBeDefined();
    expect(motion2).toBeDefined();
    expect(motion3).toBeDefined();

    expect(motion1.tracks[0].id).toBe('track-1');
    expect(motion2.tracks[0].id).toBe('track-2');
    expect(motion3.tracks[0].id).toBe('track-3');

    // getMotionsList preserves the original order
    const list = getMotionsList(project);
    expect(list[0]).toBe(motion1);
    expect(list[1]).toBe(motion2);
    expect(list[2]).toBe(motion3);
  });
});
