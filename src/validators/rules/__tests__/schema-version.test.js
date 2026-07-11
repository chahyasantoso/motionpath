import { describe, it, expect } from 'vitest';
import { schemaVersionRule } from '../schema-version.js';

describe('schema-version rule', () => {
  it('should return error if schema is not an object', () => {
    const errors = schemaVersionRule(null);
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('schema-version');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('$');
  });

  it('should return error if schemaVersion is missing', () => {
    const errors = schemaVersionRule({});
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('schema-version');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('$');
  });

  it('should return error if schemaVersion is not a number', () => {
    const errors = schemaVersionRule({ schemaVersion: '1' });
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('schema-version');
    expect(errors[0].severity).toBe('error');
  });

  it('should return error if schemaVersion is not an integer', () => {
    const errors = schemaVersionRule({ schemaVersion: 1.5 });
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe('error');
  });

  it('should return error if schemaVersion is not positive', () => {
    const errors = schemaVersionRule({ schemaVersion: 0 });
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe('error');

    const errorsNeg = schemaVersionRule({ schemaVersion: -1 });
    expect(errorsNeg).toHaveLength(1);
  });

  it('should return no errors if schemaVersion is exactly 2', () => {
    const errors = schemaVersionRule({ schemaVersion: 2 });
    expect(errors).toHaveLength(0);
  });

  it('should return error if schemaVersion is 1', () => {
    const errors = schemaVersionRule({ schemaVersion: 1 });
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('schema-version');
    expect(errors[0].severity).toBe('error');
  });
});
