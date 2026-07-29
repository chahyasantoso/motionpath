/** Convert normalized progress to canonical GSAP percent-key format. */
export function toPercentKey(progress) { const value = Number(progress) * 100; if (!Number.isFinite(value)) return `${value}%`; return `${Number(value.toFixed(6))}%`; }
