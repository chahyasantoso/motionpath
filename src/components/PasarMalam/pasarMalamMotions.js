// Generate paths for 192 static WebP frames
export const IMAGE_SEQUENCE_FRAMES = Array.from({ length: 192 }, (_, i) => {
  return `/sequence/frame_${String(i + 1).padStart(4, "0")}.webp`;
});

export const BOUNCE_DURATION = 1.2;

// ─── Scene Data Config ──────────────────────────────────────────
export const pasarMalamScene = {
  id: "pasar-malam-storytelling",
  trigger: {
    type: "scroll",
    scrub: 0.5,
    pin: "pin",
    start: "top top",
    end: "bottom bottom",
  },
  tracks: [
    {
      id: "pasar-malam-bg",
      keyframes: {
        imageSequence: {
          frames: IMAGE_SEQUENCE_FRAMES,
          stops: [
            { p: 0, v: 0, ease: "none" },
            { p: 1, v: 191 },
          ],
        },
      },
    },
    {
      id: "hero-title",
      keyframes: {
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.15, v: 1, ease: "power2.out" },
            { p: 0.8, v: 1 },
            { p: 1, v: 0, ease: "power2.in" },
          ],
        },
        y: {
          stops: [
            { p: 0, v: 120 },
            { p: 0.25, v: 0, ease: "power2.out" },
            { p: 0.75, v: 0 },
            { p: 1, v: -120, ease: "power2.in" },
          ],
        },
        scaleX: {
          stops: [
            { p: 0, v: 1.25 },
            { p: 0.25, v: 1, ease: "power2.out" },
            { p: 0.75, v: 1 },
            { p: 1, v: 0.8, ease: "power2.in" },
          ],
        },
        scaleY: {
          stops: [
            { p: 0, v: 1.25 },
            { p: 0.25, v: 1, ease: "power2.out" },
            { p: 0.75, v: 1 },
            { p: 1, v: 0.8, ease: "power2.in" },
          ],
        },
      },
    },
    {
      id: "card-left",
      keyframes: {
        x: {
          stops: [
            { p: 0, v: "-100vw" },
            { p: 0.35, v: 0, ease: "back.out(1.2)" },
            { p: 0.75, v: 0 },
            { p: 1, v: "-100vw", ease: "power2.in" },
          ],
        },
        rotation: {
          stops: [
            { p: 0, v: -8 },
            { p: 0.35, v: 0, ease: "back.out(1.2)" },
            { p: 0.75, v: 0 },
            { p: 1, v: -8, ease: "power2.in" },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.3, v: 1, ease: "power2.out" },
            { p: 0.75, v: 1 },
            { p: 1, v: 0, ease: "power2.in" },
          ],
        },
      },
    },
    {
      id: "card-right",
      keyframes: {
        x: {
          stops: [
            { p: 0, v: "100vw" },
            { p: 0.42, v: 0, ease: "back.out(1.2)" },
            { p: 0.78, v: 0 },
            { p: 1, v: "100vw", ease: "power2.in" },
          ],
        },
        rotation: {
          stops: [
            { p: 0, v: 8 },
            { p: 0.42, v: 0, ease: "back.out(1.2)" },
            { p: 0.78, v: 0 },
            { p: 1, v: 8, ease: "power2.in" },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.37, v: 1, ease: "power2.out" },
            { p: 0.78, v: 1 },
            { p: 1, v: 0, ease: "power2.in" },
          ],
        },
      },
    },
    {
      id: "stats-card",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 160 },
            { p: 0.3, v: 0, ease: "power2.out" },
            { p: 0.8, v: 0 },
            { p: 1, v: 160, ease: "power2.in" },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.25, v: 1, ease: "power2.out" },
            { p: 0.8, v: 1 },
            { p: 1, v: 0, ease: "power2.in" },
          ],
        },
        "--neon-opacity": {
          stops: [
            { p: 0, v: 1 },
            { p: 0.28, v: 1 },
            { p: 0.29, v: 0.1, ease: "none" },
            { p: 0.31, v: 1, ease: "none" },
            { p: 0.48, v: 1 },
            { p: 0.49, v: 0.3, ease: "none" },
            { p: 0.51, v: 1, ease: "none" },
            { p: 0.77, v: 1 },
            { p: 0.79, v: 0.15, ease: "none" },
            { p: 0.81, v: 1, ease: "none" },
          ],
        },
      },
    },
    {
      id: "lantern-1-wrap",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: -120 },
            { p: 0.35, v: 0, ease: "back.out(1.8)" },
            { p: 1, v: 0 },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.25, v: 1, ease: "power2.out" },
            { p: 1, v: 1 },
          ],
        },
      },
    },
    {
      id: "lantern-2-wrap",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: -150 },
            { p: 0.42, v: 0, ease: "back.out(1.8)" },
            { p: 1, v: 0 },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.3, v: 1, ease: "power2.out" },
            { p: 1, v: 1 },
          ],
        },
      },
    },
    {
      id: "lantern-3-wrap",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: -100 },
            { p: 0.38, v: 0, ease: "back.out(1.8)" },
            { p: 1, v: 0 },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.28, v: 1, ease: "power2.out" },
            { p: 1, v: 1 },
          ],
        },
      },
    },
  ],
};

// v4: duration belongs to the TRACK. It used to sit on the trigger, where
// TimeTriggerDelegate never read it, so the "1.2s" bounce actually ran at
// createTrack's 1s default. autoplay likewise belongs in the schema -- it was
// being passed as a useMotionInstance config bag that Engine.mountInstance
// does not forward.
export const lanternBounceScene = {
  id: "lantern-bounce",
  trigger: { type: "time", repeat: -1, yoyo: true, autoplay: false },
  tracks: [
    {
      id: "lantern-1",
      duration: BOUNCE_DURATION,
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: -18, ease: "power1.inOut" },
          ],
        },
      },
    },
    {
      id: "lantern-2",
      duration: BOUNCE_DURATION,
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: -12, ease: "power1.inOut" },
          ],
        },
      },
    },
    {
      id: "lantern-3",
      duration: BOUNCE_DURATION,
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: -20, ease: "power1.inOut" },
          ],
        },
      },
    },
  ],
};

export const pmProject = {
  schemaVersion: 4,
  projectId: "pasar-malam-page",
  perspective: 800,
  motions: [pasarMalamScene, lanternBounceScene],
};
