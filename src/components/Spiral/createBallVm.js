export function createBallVm({ id, color, baseInstance }) {
  return {
    id,
    color,
    baseInstance,
    activeInstance: baseInstance,
    activeTrackId: 'ball-track',
    status: 'active',
    isClickable: true,
    onClick: () => {},
  };
}
