import { useRef } from "react";
import useMotionSubscribers from "@motionpath/react/useMotionSubscribers";

export default function GraphSpiralBall({ vm }) {
  const ref = useRef(null);
  const source = { track: vm.renderTrack, transformFn: (rawData, compose) => { const p = rawData?.pathProgress ?? 0; if (p <= 0 || p >= 1) return { display: "none", opacity: 0 }; return { ...compose(rawData), display: "flex" }; } };
  useMotionSubscribers([source], ref);
  return <div ref={ref} className="element spiral-ball" onClick={vm.isClickable ? vm.onClick : undefined} style={{ "--ball-color": vm.color }} />;
}
