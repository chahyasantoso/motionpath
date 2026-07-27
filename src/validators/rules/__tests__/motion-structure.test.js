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

  it('should error on duplicate motion ids', () => {
    const schema = {
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] },
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ id: 'tr2' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[1].id');
    expect(errors[0].message).toContain("Duplicate motion id 'm1'");
  });

  it('should error if driver or other forbidden fields are present on motion', () => {
    const schema = {
      motions: [
        {
          id: 'm1',
          trigger: { type: 'time' },
          driver: { type: 'timeline' },
          timelineId: 'tl1',
          primary: true,
          lifecycle: {},
          playback: {},
          tracks: [{ id: 'tr1' }]
        }
      ]
    };
    const errors = motionStructureRule(schema);
    const paths = errors.map(e => e.path);
    expect(paths).toContain('motions[0].driver');
    expect(paths).toContain('motions[0].timelineId');
    expect(paths).toContain('motions[0].primary');
    expect(paths).toContain('motions[0].lifecycle');
    expect(paths).toContain('motions[0].playback');
  });

  // --- R-02: id is the ONE authoritative motion identifier -------------------

  it('rejects motionId as a v3 field and still demands id', () => {
    const schema = {
      motions: [
        { motionId: 'legacy', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    const paths = errors.map(e => e.path);

    // The old rule computed `effectiveId = id ?? motionId`, so this schema
    // PASSED validation and then registered under the key `undefined`.
    expect(paths).toContain('motions[0].motionId');
    expect(paths).toContain('motions[0].id');
    expect(errors.find(e => e.path === 'motions[0].motionId').message)
      .toContain('rename it to "id"');
  });

  it('rejects motionId even when a valid id is also present', () => {
    const schema = {
      motions: [
        { id: 'm1', motionId: 'm1', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].motionId');
  });

  it('accepts a motion identified only by id', () => {
    const schema = {
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    expect(motionStructureRule(schema)).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------

  it('should error if trigger is missing on motion', () => {
    const schema = {
      motions: [
        { id: 'm1', tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].trigger');
    expect(errors[0].message).toContain('trigger is required on every motion');
  });

  it('should error if trigger is not an object', () => {
    const schema = {
      motions: [
        { id: 'm1', trigger: 'not-an-object', tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].trigger');
    expect(errors[0].message).toContain('trigger must be an object');
  });

  it('should error if trigger.type is invalid', () => {
    const schema = {
      motions: [
        { id: 'm1', trigger: { type: 123 }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].trigger.type');
    expect(errors[0].message).toContain('trigger.type is required and must be a string');
  });

  it('should error if tracks is missing or empty', () => {
    const schema1 = {
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [] }
      ]
    };
    const schema2 = {
      motions: [
        { id: 'm1', trigger: { type: 'time' } }
      ]
    };
    expect(motionStructureRule(schema1)[0].path).toBe('motions[0].tracks');
    expect(motionStructureRule(schema2)[0].path).toBe('motions[0].tracks');
  });

  it('should error on missing id', () => {
    const schema = {
      motions: [
        { trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].id');
    expect(errors[0].message).toContain('motion.id is required');
  });

  it('should error on empty string id', () => {
    const schema = {
      motions: [
        { id: '', trigger: { type: 'time' }, tracks: [{ id: 'tr1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].id');
    expect(errors[0].message).toContain('motion.id is required');
  });

  it('should error on missing track.id', () => {
    const schema = {
      templates: [{ templateId: 't1' }],
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ use: 't1' }] }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].tracks[0].id');
    expect(errors[0].message).toContain('track.id is required');
  });

  it('should error on empty string track.id', () => {
    const schema = {
      templates: [{ templateId: 't1' }],
      motions: [
        { id: 'm1', trigger: { type: 'time' }, tracks: [{ id: '', use: 't1' }] }
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
          id: 'm1',
          trigger: { type: 'time' },
          tracks: [{ id: 'tr1', use: 'non-existent' }]
        }
      ]
    };
    const errors = motionStructureRule(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('motions[0].tracks[0].use');
  });
});
