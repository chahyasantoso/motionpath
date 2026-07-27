export const STRAW_PERSPECTIVE = 800;

// ─── Strawberry Burst Demo Configs ──────────────────────────────
// v4: `id` (never motionId), no `driver` wrapper, trigger lives on the
// motion. The stage is pinned via the "pin" role-string, which useScrollMotion
// resolves to a component-owned ref instead of a v2 string element id.
export const strawberryScene = {
  id: "strawberry-burst-scroll",
  trigger: {
    type: "scroll",
    scrub: 0.5,
    pin: "pin",
    start: "top top",
    end: "bottom bottom",
  },
  tracks: [
    {
      id: "strawberry-1",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -1420 },
            { x: -160, y: -120, z: 200 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.0675, v: 1 },
            { p: 0.3825, v: 1 },
            { p: 0.45, v: 0 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "strawberry-2",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -280 },
            { x: 160, y: -120, z: 150 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.0675, v: 1 },
            { p: 0.3825, v: 1 },
            { p: 0.45, v: 0 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "strawberry-3",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -1350 },
            { x: -40, y: 140, z: 250 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.15, v: 0 },
            { p: 0.6, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.15, v: 0 },
            { p: 0.2175, v: 1 },
            { p: 0.5325, v: 1 },
            { p: 0.6, v: 0 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "strawberry-4",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -1220 },
            { x: -200, y: 30, z: 180 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.15, v: 0 },
            { p: 0.6, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.15, v: 0 },
            { p: 0.2175, v: 1 },
            { p: 0.5325, v: 1 },
            { p: 0.6, v: 0 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "strawberry-5",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -400 },
            { x: 200, y: 60, z: 220 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.75, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.3675, v: 1 },
            { p: 0.6825, v: 1 },
            { p: 0.75, v: 0 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "strawberry-6",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -1310 },
            { x: -100, y: -180, z: 120 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.75, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.3675, v: 1 },
            { p: 0.6825, v: 1 },
            { p: 0.75, v: 0 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "strawberry-7",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -450 },
            { x: 100, y: -180, z: 240 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 0 },
            { p: 0.9, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 0 },
            { p: 0.5175, v: 1 },
            { p: 0.8325, v: 1 },
            { p: 0.9, v: 0 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "strawberry-8",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -1260 },
            { x: 80, y: 160, z: 160 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 0 },
            { p: 0.9, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 0 },
            { p: 0.5175, v: 1 },
            { p: 0.8325, v: 1 },
            { p: 0.9, v: 0 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "strawberry-9",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -370 },
            { x: -120, y: 100, z: 300 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.6, v: 0 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.6, v: 0 },
            { p: 0.66, v: 1 },
            { p: 0.94, v: 1 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "strawberry-10",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: -200 },
            { x: 180, y: -50, z: 100 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.6, v: 0 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.6, v: 0 },
            { p: 0.66, v: 1 },
            { p: 0.94, v: 1 },
            { p: 1.0, v: 0 },
          ],
        },
      },
    },
    {
      id: "ice-cream-center",
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: 400 },
            { x: 0, y: -35, z: 0 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.7, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
      },
    },
  ],
};

// v2 authored this as `trigger: { scrub: false, startTrigger: 'strawberry-
// burst-scroll', ... }` -- a string reference into a global element-id
// registry that no longer exists. In v4 the trigger is a real DOM element,
// so BurstPage hands this motion the SAME section ref as the scrubbed scene
// and the observer fires off it directly. scrub:false keeps track `duration`
// legal, which is what makes this a self-playing slide-in rather than a
// scroll-scrubbed one.
export const iceCreamCardScene = {
  id: "ice-cream-card-slide",
  trigger: {
    type: "scroll",
    scrub: false,
    start: "top 30%",
    toggleActions: "play none none none",
  },
  tracks: [
    {
      id: "strawberry-card",
      duration: 2.2,
      keyframes: {
        path: {
          points: [
            { x: 0, y: 300 },
            { x: 0, y: 0 },
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 1.0, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.767, v: 1 },
            { p: 1.0, v: 1 },
          ],
        },
      },
    },
  ],
};

export const burstProject = {
  schemaVersion: 4,
  projectId: "burst-page",
  perspective: STRAW_PERSPECTIVE,
  motions: [strawberryScene, iceCreamCardScene],
};
