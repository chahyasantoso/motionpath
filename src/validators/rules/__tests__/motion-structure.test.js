import { describe, it, expect } from 'vitest';
import { motionStructureRule } from '../motion-structure.js';

describe('motion-structure rule', () => {
  it('should return errors when templates have forbidden fields', () => {
    const schema = {
      templates: [
        {
          templateId: 't1',
          driver: { type: 'timeline' },
          timelineId: 'tl1',
          primary: true,
          trigger: { type: 'time' }
        }
      ]
    };
    const errors = motionStructureRule(schema);
    const paths = errors.map(e => e.path);
    expect(paths).toContain('templates[0].driver');
    expect(paths).toContain('templates[0].timelineId');
    expect(paths).toContain('templates[0].primary');
    expect(paths).toContain('templates[0].trigger');
  });

  it('should error on duplicate templateIds', () => {
    const schema = {
      templates: [
        { templateId: 't1' },
        { templateId: 't1' }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('templates[1].templateId');
    expect(errors[0].message).toContain("Duplicate templateId 't1'");
  });

  it('should error on duplicate motionIds', () => {
    const schema = {
      motions: [
        { motionId: 'm1', driver: { type: 'timeline', trigger: {} }, tracks: [{ id: 'tr1' }] },
        { motionId: 'm1', driver: { type: 'timeline', trigger: {} }, tracks: [{ id: 'tr2' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[1].motionId');
    expect(errors[0].message).toContain("Duplicate motionId 'm1'");
  });

  it('should error if driver is missing on motion', () => {
    const schema = {
      motions: [
        { motionId: 'm1', tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].driver');
  });

  it('should error if driver.type is invalid', () => {
    const schema = {
      motions: [
        { motionId: 'm1', driver: { type: 'invalid' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].driver.type');
  });

  it('should error if delegate driver contains forbidden fields', () => {
    const schema = {
      motions: [
        {
          motionId: 'm1',
          driver: {
            type: 'delegate',
            trigger: {},
            sectionId: 'sec1',
            timelineId: 'tl1',
            primary: true
          },
          stagger: 0.5,
          tracks: [{ id: 'tr1' }]
        }
      ]
    };
    const errors = motionStructureRule(schema);
    const paths = errors.map(e => e.path);
    expect(paths).toContain('motions[0].driver.trigger');
    expect(paths).toContain('motions[0].driver.sectionId');
    expect(paths).toContain('motions[0].driver.timelineId');
    expect(paths).toContain('motions[0].driver.primary');
    expect(paths).toContain('motions[0].stagger');
  });

  it('should error if tracks is missing or empty', () => {
    const schema1 = {
      motions: [
        { motionId: 'm1', driver: { type: 'delegate' }, tracks: [] }
      ]
    };
    const schema2 = {
      motions: [
        { motionId: 'm1', driver: { type: 'delegate' } }
      ]
    };
    expect(motionStructureRule(schema1)[0].path).toBe('motions[0].tracks');
    expect(motionStructureRule(schema2)[0].path).toBe('motions[0].tracks');
  });

  it('should error on missing motionId', () => {
    const schema = {
      motions: [
        { driver: { type: 'timeline', trigger: {} }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].motionId');
    expect(errors[0].message).toContain('motionId is required');
  });

  it('should error on empty string motionId', () => {
    const schema = {
      motions: [
        { motionId: '', driver: { type: 'timeline', trigger: {} }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].motionId');
    expect(errors[0].message).toContain('motionId is required');
  });

  it('should error on negative track.id (missing or empty)', () => {
    const schema = {
      motions: [
        { motionId: 'm1', driver: { type: 'timeline', trigger: {} }, tracks: [{ use: 't1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].tracks[0].id');
    expect(errors[0].message).toContain('track.id is required');
  });

  it('should error on empty string track.id', () => {
    const schema = {
      motions: [
        { motionId: 'm1', driver: { type: 'timeline', trigger: {} }, tracks: [{ id: '', use: 't1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].tracks[0].id');
    expect(errors[0].message).toContain('track.id is required');
  });

  it('should error if track references non-existent template', () => {
    const schema = {
      templates: [{ templateId: 't1' }],
      motions: [
        {
          motionId: 'm1',
          driver: { type: 'delegate' },
          tracks: [{ id: 'tr1', use: 'non-existent' }]
        }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].tracks[0].use');
  });
});
