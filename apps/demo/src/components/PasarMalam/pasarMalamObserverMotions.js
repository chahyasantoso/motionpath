import { lanternBounceScene, pasarMalamScene } from "./pasarMalamMotions.js";

// The scrubbed storytelling stage is identical to the scrub page's -- reused
// on purpose so the diff between the two demos is exactly one thing: how the
// lantern bounce is driven.
export { IMAGE_SEQUENCE_FRAMES } from "./pasarMalamMotions.js";
export const pmoStorytellingScene = pasarMalamScene;

// The demo's whole point: a self-driving scroll observer. scrub:false means
// the timeline is NOT the scroll position, so it keeps its own clock --
// repeat/yoyo and per-track duration are legal here, and ScrollTriggerDelegate
// now actually applies them. toggleActions parks the loop when the section
// leaves the viewport, so nothing burns frames off-screen and no component
// has to hold a `bouncing` boolean in React state.
export const lanternBounceObserverScene = {
  id: "lantern-bounce-observer",
  trigger: {
    type: "scroll",
    scrub: false,
    start: "50% top",
    end: "bottom top",
    toggleActions: "play pause resume pause",
    repeat: -1,
    yoyo: true,
  },
  tracks: lanternBounceScene.tracks,
};

export const pmObserverProject = {
  schemaVersion: 4,
  projectId: "pasar-malam-observer-page",
  perspective: 800,
  motions: [pmoStorytellingScene, lanternBounceObserverScene],
};
