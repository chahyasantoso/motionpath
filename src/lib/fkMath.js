/**
 * 2D affine forward-kinematic accumulation.
 * A joint's world transform = parent's world transform composed with the
 * joint's own local transform. See observe-fk-design.md §4.
 *
 * @param {{x:number,y:number,rotation:number}} parentWorld - resolved parent world transform (rotation in degrees)
 * @param {{x:number,y:number,rotation:number}} local - this joint's local transform (rotation in degrees)
 * @returns {{x:number,y:number,rotation:number}}
 */
export function composeWorld(parentWorld, local) {
  const rad = (parentWorld.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: parentWorld.x + (local.x * cos - local.y * sin),
    y: parentWorld.y + (local.x * sin + local.y * cos),
    rotation: parentWorld.rotation + local.rotation,
  };
}
