export function createBallVm({ id, color, ballTrack }) {
  return {
    id,
    color,
    ballTrack,
    status: 'active',
    isClickable: true,
    onClick: () => {},
  };
}
