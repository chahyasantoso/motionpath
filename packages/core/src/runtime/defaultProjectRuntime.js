import { ProjectRuntime } from "./ProjectRuntime.js";

/**
 * Direct Track construction predates Engine and has no caller-owned runtime to
 * inject. Keep that legacy path working without letting Track construct an
 * adapter: the only constructor remains ProjectRuntime. Production Engine
 * paths always inject their own runtime adapter and never use this fallback.
 */
export const defaultProjectRuntime = new ProjectRuntime();
