/** Renderer-neutral scheduler port. */
export function assertScheduler(scheduler) {
  if (
    !scheduler ||
    typeof scheduler.to !== "function" ||
    typeof scheduler.timeline !== "function"
  )
    throw new TypeError(
      "Scheduler requires to(target, vars) and timeline(vars).",
    );
  return scheduler;
}
