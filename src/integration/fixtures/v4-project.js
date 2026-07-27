/**
 * The canonical v4 integration fixture.
 *
 * Deliberately exercises one of everything the schema supports, because it is
 * the shared input for every phase's integration tests:
 *   - a scroll-scrub motion (no track durations -- scroll position IS the playhead)
 *   - a time motion with stagger + staggerTransition
 *   - a time motion with autoplay:false (R-03 regression surface)
 *   - a manual motion
 *   - an image-sequence motion
 *   - a template consumed by three tracks
 *   - a path track
 *   - a CSS custom property
 *   - a standalone schema.tracks[] entry for runtime stamping
 *
 * INVARIANT: validateProject(v4Project) must return zero severity:'error'
 * entries. src/integration/__tests__/validation-gate.test.js enforces that.
 */
export const v4Project = {
  schemaVersion: 4,
  projectId: 'integration-fixture',
  perspective: 1200,

  templates: [
    {
      templateId: 'fade-pop',
      duration: 0.6,
      transformOrigin: '50% 50%',
      keyframes: {
        opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
        scale: { stops: [{ p: 0, v: 0.8 }, { p: 1, v: 1, ease: 'back.out(2)' }] },
      },
    },
  ],

  motions: [
    {
      id: 'scroll-scrub',
      trigger: { type: 'scroll', scrub: true, start: 'top top', end: 'bottom top' },
      tracks: [
        {
          id: 'scroll-path-track',
          keyframes: {
            path: {
              points: [
                { x: 0, y: 0 },
                { x: 320, y: 180, ctrlX: 160, ctrlY: 0 },
                { x: 640, y: 0 },
              ],
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1, ease: 'none' }],
              autoRotate: true,
            },
            blur: { stops: [{ p: 0, v: 0 }, { p: 0.5, v: 6 }, { p: 1, v: 0 }] },
          },
        },
      ],
    },

    {
      id: 'time-loop',
      trigger: { type: 'time', repeat: 1, yoyo: true, repeatDelay: 0.1 },
      stagger: 0.12,
      staggerTransition: { duration: 0.55, ease: 'power2.out' },
      tracks: [
        { id: 'card-1', use: 'fade-pop' },
        { id: 'card-2', use: 'fade-pop', duration: 0.9 },
        {
          id: 'card-3',
          use: 'fade-pop',
          duration: 1,
          keyframes: {
            '--card-size': { stops: [{ p: 0, v: '28px' }, { p: 1, v: '56px' }] },
          },
        },
      ],
    },

    {
      id: 'time-paused',
      trigger: { type: 'time', autoplay: false },
      tracks: [
        {
          id: 'paused-track',
          duration: 1,
          keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } },
        },
      ],
    },

    {
      id: 'manual-scrubber',
      trigger: { type: 'manual' },
      tracks: [
        {
          id: 'needle',
          duration: 1,
          keyframes: { rotation: { stops: [{ p: 0, v: -90 }, { p: 1, v: 90 }] } },
        },
      ],
    },

    {
      id: 'sequence',
      trigger: { type: 'time' },
      tracks: [
        {
          id: 'film-strip',
          duration: 1,
          keyframes: {
            imageSequence: {
              frames: ['/seq/001.webp', '/seq/002.webp', '/seq/003.webp'],
              stops: [{ p: 0, v: 0 }, { p: 1, v: 2 }],
            },
          },
        },
      ],
    },
  ],

  tracks: [
    {
      id: 'ball-exit-track',
      duration: 0.35,
      keyframes: {
        scale: { stops: [{ p: 0, v: 1 }, { p: 0.35, v: 1.7 }, { p: 1, v: 0 }] },
        opacity: { stops: [{ p: 0, v: 1 }, { p: 1, v: 0 }] },
      },
    },
  ],
};

export default v4Project;
