export function createBallVm({ id, color, baseTrack }) {
  return {
    id,
    color,
    baseTrack,
    activeTrack: baseTrack,
    status: 'active',
    isClickable: true,
    onClick: () => {},
  };
}
