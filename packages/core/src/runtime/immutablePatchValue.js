/**
 * Patch-value view of the shared immutable-value contract.
 *
 * The implementation moved to `contract/immutableValue.js` in pass-2 P2-01 so
 * that graph values and patch values are frozen by exactly one utility with
 * one documented supported shape. These names are retained because
 * `PatchRegistry` and the existing patch immutability suite are written
 * against them.
 *
 * @see ../contract/immutableValue.js for the supported shape, copy/reference
 * rules, and cycle handling.
 */
export {
  toImmutableValue as toImmutablePatchValue,
  toImmutableValues as toImmutablePatchValues,
} from "../contract/immutableValue.js";
