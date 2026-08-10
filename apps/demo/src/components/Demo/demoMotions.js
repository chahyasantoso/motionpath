import { shapeGenerators } from "@motionpath/core/math/projection3d.js";

export const HELIX_CONFIG = {
  cx: 640,
  cy: 100,
  radius: 220,
  height: 520,
  turns: 3.0,
  tiltDeg: 0,
};
export const helixPathPoints = shapeGenerators.helix({
  radius: HELIX_CONFIG.radius,
  height: HELIX_CONFIG.height,
  turns: HELIX_CONFIG.turns,
});
export const scrollScene = {
  id: "hero-scrollytelling",
  trigger: {
    type: "scroll",
    pin: "pin",
    scrub: 1,
    start: "top top",
    end: "bottom bottom",
  },
  tracks: [
    {
      id: "rocket-track",
      keyframes: {
        path: {
          points: [
            { x: 50, y: 300 },
            { x: 400, y: 100, ctrlX: 200, ctrlY: -50 },
            { x: 900, y: 350, ctrlX: 700, ctrlY: 500 },
          ],
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 1 },
          ],
          autoRotate: true,
        },
      },
    },
    {
      id: "cloud",
      keyframes: {
        path: {
          points: [
            { x: -100, y: 80 },
            { x: 1100, y: 80 },
          ],
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 1 },
          ],
        },
      },
    },
  ],
};
export const dynamicCarouselScene = {
  id: "carousel-storytelling",
  trigger: {
    type: "scroll",
    pin: "pin",
    scrub: 1.2,
    start: "top top",
    end: "bottom bottom",
  },
  stagger: 0.1,
  staggerTransition: { duration: 0.4, ease: "power3.out" },
  tracks: [
    {
      id: "carousel-card-track",
      keyframes: {
        path: {
          points: [
            { x: -350, y: 400 },
            { x: 300, y: 150, ctrlX: -20, ctrlY: 100 },
            { x: 950, y: 500, ctrlX: 620, ctrlY: 200 },
            { x: 1600, y: 200, ctrlX: 1280, ctrlY: 800 },
            { x: 2200, y: 400, ctrlX: 1920, ctrlY: -400 },
          ],
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 1 },
          ],
          autoRotate: true,
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.15, v: 1 },
            { p: 0.85, v: 1 },
            { p: 1, v: 0 },
          ],
        },
      },
    },
  ],
};
export const dynamicHelixScene = {
  id: "helix-storytelling",
  trigger: {
    type: "scroll",
    pin: "pin",
    scrub: 1.2,
    start: "top top",
    end: "bottom bottom",
  },
  stagger: 0.16,
  tracks: [
    {
      id: "helix-card-track",
      keyframes: {
        path: {
          points: helixPathPoints,
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 1 },
          ],
        },
      },
    },
  ],
};
export const demoProject = {
  schemaVersion: 4,
  projectId: "demo-page",
  perspective: 1200,
  motions: [scrollScene, dynamicCarouselScene, dynamicHelixScene],
};
