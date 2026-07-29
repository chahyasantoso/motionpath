export function applyAnchor(patch, anchor) {
  if (!anchor) return patch;
  const result = { ...patch, ...anchor };
  if (anchor.offset) {
    result.x = (patch.x ?? 0) + (anchor.offset.x ?? 0);
    result.y = (patch.y ?? 0) + (anchor.offset.y ?? 0);
    delete result.offset;
  }
  return result;
}
