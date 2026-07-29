import { describe, it, expect } from "vitest";
import {
  schemaVersionRule,
  SUPPORTED_SCHEMA_VERSIONS,
} from "../schema-version.js";

describe("schema-version rule", () => {
  it("supports v4 only", () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toEqual([4]);
    expect(schemaVersionRule({ schemaVersion: 4 })).toEqual([]);
  });
  it("rejects v2 and v3 with a migration-safe error", () => {
    expect(schemaVersionRule({ schemaVersion: 2 })[0].message).toContain(
      "must be 4",
    );
    expect(schemaVersionRule({ schemaVersion: 3 })[0].message).toContain(
      "must be 4",
    );
  });
});
