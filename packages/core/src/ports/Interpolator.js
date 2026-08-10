/** Renderer-neutral interpolation port. */
export function assertInterpolator(interpolator) {
  if (!interpolator || typeof interpolator.create !== "function")
    throw new TypeError("Interpolator requires create(vars).");
  return interpolator;
}
