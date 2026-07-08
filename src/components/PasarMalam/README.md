# Pasar Malam Page — Design & Implementation Story

This document captures the story, design decisions, element structure, and animation relationships of the Pasar Malam scrollytelling demo page.

---

## 1. The Story

**Pasar Malam** (Malay for "Night Market") is a Malaysian cultural experience: a sprawling open-air bazaar lit by neon signs and string lights, filled with the aromas of street food and the sounds of carnival games.

The goal of this page was to create a **scroll-driven storytelling experience** that simulates walking into a night market. As the user scrolls down, the scene comes alive:

1. A real video of a night market is played back frame-by-frame, locked to scroll position.
2. A large title emerges from below with a 3D tilt effect.
3. Two glassmorphic content cards fly in from the left and right sides of the screen.
4. A stats card rises from below, counting up live visitor and stall numbers.

The entire experience is pinned — the stage does not scroll. The page height creates the scroll budget, and the engine maps every pixel of scroll distance to a frame in the animation.

---

## 2. Technical Decisions

### Video as an Image Sequence

The source material was an MP4 video. Rather than embedding it as a `<video>` element (which cannot be scrubbed frame-accurately via scroll), the video was extracted as **192 static WebP frames** using `ffmpeg`:

```bash
ffmpeg -i input.mp4 -vf fps=24 -q:v 80 frame_%04d.webp
```

These are served from `/public/sequence/` and driven by the engine's `imageSequence` plugin, which maps the animated index to a `backgroundImage: url(...)` on the background element.

### Frame Preloading via Hidden DOM

The browser only fetches images on demand. Without preloading, the first scroll into the sequence would visibly stutter as frames load. To force all 192 frames into GPU memory before the user starts scrolling, all frames are rendered into a **hidden `<div>`**:

```jsx
<div style={{ display: 'none' }}>
  {IMAGE_SEQUENCE_FRAMES.map(src => <img key={src} src={src} alt="" />)}
</div>
```

This keeps the images decoded in browser memory and eliminates first-scroll flicker entirely.

### Sticky Pinned Stage

The layout uses a two-section structure:
- **Section 1** (`pm-hero-section`): very tall (600vh). Contains the pinned stage. ScrollTrigger pins `pm-stage` at `top top` and scrubs animations from its entrance to its exit.
- **Section 2** (`pm-scroll-indicator-section`): a regular-flow section that appears below when the user scrolls past the storytelling sequence.

### Smooth Scrolling

The page uses the custom `useSmoothScroll` hook (powered by Lenis) for physics-based scroll deceleration. GSAP `scrub` is set to `0.5` — low enough to stay synchronized with Lenis's own deceleration, preventing the counters and background frames from appearing to "coast" after the user stops scrolling.

### Perspective

The project-level `perspective: 800` enables CSS 3D transforms across all elements. The HeroTitle uses this to generate a realistic `rotateX` tilt as it enters and exits.

### Stateful React vs. Pure Observer-driven Approach

We implemented two versions of the Pasar Malam page to demonstrate the evolution of play-state control:

1. **Stateful Hook Version (`/pasarmalam`)**:
   - Uses `useMotionSubscriber` on `lantern-1-wrap` to monitor scroll progress.
   - Triggers `setBouncing(true/false)` crossing the `0.5` progress threshold.
   - Forwards the React state `{ 'lantern-bounce-tl': bouncing }` into `useMotionProject` to trigger `playTimer()` and `pauseTimer()`.
   - **Trade-off**: Requires local React state, ref threshold checks, and hook re-evaluation on state changes.

2. **Pure Observer-driven Version (`/pasarmalam-observer`)**:
   - Shifts the threshold logic entirely into the JSON schema configuration using `type: 'scroll'` and `scrub: false` (Scroll Observer).
   - Uses ScrollTrigger's native `toggleActions: 'play pause resume pause'` triggered at `start: '50% top'` to manage play/pause of the loop.
   - Adds `repeat: -1` and `yoyo: true` directly to the observer trigger to control timeline looping.
   - **Benefit**: Zero React state, zero hooks, and zero subscriber gating logic in the component body. The UI component is completely stateless and declarative.

---

## 3. Elements & Animations

All elements are registered in `pasarMalamScene` and driven by a single scroll trigger on `pasar-malam-storytelling`. Progress values (`p`) are normalized floats from `0.0` (scene start) to `1.0` (scene end).

---

### `pasar-malam-bg` — Background Sequence

**Component**: `BackgroundSequence`  
**Type**: Image sequence (192 WebP frames)  
**Role**: The cinematic full-screen background.

| Property | Keyframes |
|---|---|
| `imageSequence` | `p:0 → frame 0`, `p:1 → frame 191` (linear, `ease: 'none'`) |

The frame index is always rounded to the nearest integer and clamped to `[0, 191]` by the plugin. The `ease: 'none'` ensures playback speed matches scroll speed exactly — no acceleration or deceleration on the frame scrub.

---

### `hero-title` — Main Title

**Component**: `HeroTitle`  
**Role**: The large "Pasar Malam / The Night Awakens" heading. Uses a custom `transform` callback to add a 3D `rotateX` tilt proportional to its vertical offset.

| Property | Entry (`p: 0→0.25`) | Hold (`p: 0.25→0.75`) | Exit (`p: 0.75→1`) |
|---|---|---|---|
| `opacity` | `0 → 1` (`power2.out`) | `1` | `1 → 0` (`power2.in`) |
| `y` | `120px → 0` (`power2.out`) | `0` | `0 → -120px` (`power2.in`) |
| `scaleX/Y` | `1.25 → 1` (`power2.out`) | `1` | `1 → 0.8` (`power2.in`) |
| `rotateX` *(custom)* | derived from `rawData.y * 0.15` | `0` | derived from exit `y` |

The `rotateX` is calculated in the custom callback — not a keyframe stop — because it's a **derived** value: `y * 0.15`. As the card rises into position, it tilts forward in 3D space and then flattens to `0°`. On exit, it tilts back as it recedes upward.

---

### `card-left` — Left Glassmorphic Card

**Component**: `LeftCard`  
**Content**: "Street Flavors / Nostalgic Tastes"  
**Role**: Flies in from the left side with a slight lean/rotation.

| Property | Entry | Hold | Exit |
|---|---|---|---|
| `x` | `-100vw → 0` at `p:0.35` (`back.out(1.2)`) | `0` | `0 → -100vw` at `p:1` (`power2.in`) |
| `rotation` | `-8° → 0°` at `p:0.35` (`back.out(1.2)`) | `0°` | `0° → -8°` at `p:1` (`power2.in`) |
| `opacity` | `0 → 1` at `p:0.3` (`power2.out`) | `1` | `1 → 0` at `p:1` (`power2.in`) |

The `back.out(1.2)` ease on both `x` and `rotation` gives the card a slight overshoot as it settles — it slides past center, bounces back, and snaps into place. The rotation lean reinforces the physicality of the motion: the card "tilts into the wind" as it flies in.

Viewport units (`-100vw`) are used for `x` instead of pixels so the card starts fully off-screen regardless of screen width, making the animation **responsive without breakpoints**.

---

### `card-right` — Right Glassmorphic Card

**Component**: `RightCard`  
**Content**: "Night Vibes / Carnival Thrills"  
**Role**: Flies in from the right side, slightly delayed relative to `card-left`.

| Property | Entry | Hold | Exit |
|---|---|---|---|
| `x` | `100vw → 0` at `p:0.42` (`back.out(1.2)`) | `0` | `0 → 100vw` at `p:1` (`power2.in`) |
| `rotation` | `8° → 0°` at `p:0.42` (`back.out(1.2)`) | `0°` | `0° → 8°` at `p:1` (`power2.in`) |
| `opacity` | `0 → 1` at `p:0.37` (`power2.out`) | `1` | `1 → 0` at `p:1` (`power2.in`) |

Intentionally delayed by `Δp ≈ 0.07` relative to `card-left`. The staggered arrival makes the two cards feel like they're responding to separate cues rather than triggering simultaneously, which is more visually interesting.

---

### `stats-card` — Statistics Panel

**Component**: `StatsCard`  
**Content**: Live stall count (0→192+) and visitor count (0→10,000), plus a neon "Open" tag.  
**Role**: Rises from below. Uses a custom `transform` callback to drive DOM counter text directly via `rawData.progress`.

| Property | Entry | Hold | Exit |
|---|---|---|---|
| `y` | `160px → 0` at `p:0.3` (`power2.out`) | `0` | `0 → 160px` at `p:1` (`power2.in`) |
| `opacity` | `0 → 1` at `p:0.25` (`power2.out`) | `1` | `1 → 0` at `p:1` (`power2.in`) |
| `--neon-opacity` *(CSS var)* | `1` | flicker at `p:0.29`, `p:0.49`, `p:0.79` | `1` |

**Counter logic** (custom callback):
```javascript
const easeOut = gsap.parseEase('power2.out'); // parsed once at module scope

// Stalls: resolves to 192 by p = 0.55
const t = easeOut(Math.min(1, p / 0.55));
stallsEl.textContent = `${Math.round(t * 192)}+`;

// Visitors: resolves to 10,000 by p = 0.65
const t = easeOut(Math.min(1, p / 0.65));
visitorsEl.textContent = Math.round(t * 10000).toLocaleString();
```

The counters finish counting before the hold phase ends, so they appear settled and "true" by the time the user pauses mid-scroll. They run entirely outside of React's render cycle — directly writing `textContent` via `querySelector` — for maximum performance.

**Neon flicker** is implemented as a CSS custom variable `--neon-opacity` on the `stats-card` element, applied via `opacity: var(--neon-opacity, 1)` in CSS on the `.pm-neon-tag` child. Three discrete flicker events are defined at `p≈0.29`, `p≈0.49`, and `p≈0.79`, each dropping briefly to `0.1–0.3` and snapping back with `ease: 'none'`. This simulates the natural irregular flicker of an aging neon sign.

---

## 4. Layout & Visual Design

- **Color palette**: Midnight blue `#0a0a1a` background, neon pink `#ff0080` and cyan `#00e5ff` accents.
- **Glassmorphism**: Cards use `backdrop-filter: blur(20px)` with semi-transparent backgrounds and neon-colored borders.
- **Ambient lanterns**: Three absolutely-positioned lanterns (`lantern-1/2/3`) utilizing a wrapper-inner HTML structure. The outer wrappers are driven by a scroll-scrub entry scenario (`lantern-scene`) that handles entry fly-in and opacity. The inner divs are driven by a time-based looping scenario (`lantern-bounce`) that triggers a gentle, infinite bounce once the user scrolls past 50% scroll progress (controlled via the React hook `playStates` API).
- **Typography**: `'Playfair Display'` for the hero title (editorial serif), `'Inter'` for card body text.
- **Responsive**: At `max-width: 768px`, cards stack vertically, typography scales down, and the content column layout adapts to single-column.

---

## 5. Element Timeline Overview

```
p: 0.0   0.1   0.2   0.3   0.4   0.5   0.6   0.7   0.8   0.9   1.0
         |                                             |
bg       [======= frame scrub: 0 → 191 (linear) ===========]

title       [in]    [====== hold ======]     [out]

card-left      [===in===]  [=== hold ===]   [out]

card-right        [====in====] [== hold ==] [out]

stats-card    [in]  [========= hold =========]  [out]
counters      [counting up: stalls→p0.55, visitors→p0.65]
neon                       [flk] [flk]          [flk]
```
