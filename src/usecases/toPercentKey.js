/**
 * Convert normalized progress to the canonical GSAP percent-key format.
 * Six decimal places remove IEEE-754 noise such as 0.29 * 100 =>
 * 28.999999999999996 while preserving useful author precision.
 */
export function toPercentKey(progress) {
  const value = Number(progress) * 100;
  if (!Number.isFinite(value)) return `${value}%`;
  const rounded = Number(value.toFixed(6));
  return `${rounded}%`;
}
