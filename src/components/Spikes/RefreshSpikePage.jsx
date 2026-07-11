import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './RefreshSpikePage.css';

gsap.registerPlugin(ScrollTrigger);

/**
 * SPIKE — does adding a child tween to a GSAP timeline AFTER ScrollTrigger
 * has already attached to it require a manual ScrollTrigger.refresh() call?
 *
 * Directly relevant to the B2 proposal (lazy per-instance registerInstance()
 * construction): under B2, elements register themselves as their own React
 * component mounts, which can happen after the group's ScrollTrigger has
 * already been wired. Today (data-motion-id, eager batch build) this
 * situation cannot occur — every element is resolved before ScrollTrigger
 * is ever created. This spike isolates the question with raw GSAP, no
 * MotionPath engine/schema layers involved, matching the methodology
 * already used to empirically settle the "MotionPathPlugin dropped"
 * decision (Engine Architecture Decisions §4).
 *
 * PROTOCOL — read RefreshSpike.md alongside this file before running.
 */
export default function RefreshSpikePage() {
  const box1Ref = useRef(null);
  const box2Ref = useRef(null);
  const pinRef = useRef(null);
  const timelineRef = useRef(null);
  const scrollTriggerRef = useRef(null);
  const box2AddedRef = useRef(false);

  const [log, setLog] = useState([]);
  const [readout, setReadout] = useState(null);
  const [box2Added, setBox2Added] = useState(false);
  const [refreshCalled, setRefreshCalled] = useState(false);

  const appendLog = (message) => {
    // Only ever called from the ticker (after ScrollTrigger has completed
    // at least one measurement pass) or from a click handler after mount —
    // never synchronously right after ScrollTrigger.create(), since start/
    // end are not guaranteed to be populated at that exact instant
    // (pinned triggers in particular may defer their first measurement).
    const st = scrollTriggerRef.current;
    const tl = timelineRef.current;
    const entry = {
      t: performance.now().toFixed(0),
      message,
      tlDuration: tl ? tl.duration().toFixed(3) : '—',
      stStart: st && typeof st.start === 'number' ? st.start.toFixed(1) : '—',
      stEnd: st && typeof st.end === 'number' ? st.end.toFixed(1) : '—',
      scrollY: window.scrollY.toFixed(0),
      progress: st && typeof st.progress === 'number' ? st.progress.toFixed(4) : '—',
    };
    // eslint-disable-next-line no-console
    console.log('[RefreshSpike]', entry);
    setLog((prev) => [...prev, entry]);
  };

  useEffect(() => {
    // StrictMode guard: dev double-invokes this effect. If a prior
    // ScrollTrigger with this id is still registered (its own cleanup
    // hasn't fully settled), kill it first so we never end up with two
    // pins fighting over the same trigger element.
    ScrollTrigger.getById('refresh-spike')?.kill();

    // Build a master timeline with ONE child tween (box1), then attach
    // ScrollTrigger to it — mirrors ProductionEngine's grouped-scrub wiring
    // (Brief 4 / timelineId groups): a paused master timeline handed to
    // ScrollTrigger.create({ animation }).
    const tl = gsap.timeline({ paused: true });
    tl.to(box1Ref.current, { x: 500, rotation: 180, duration: 1, ease: 'none' });
    timelineRef.current = tl;
    box2AddedRef.current = false;

    const st = ScrollTrigger.create({
      id: 'refresh-spike',
      trigger: pinRef.current,
      start: 'top top',
      end: '+=2000',
      scrub: true,
      pin: true,
      animation: tl,
    });
    scrollTriggerRef.current = st;

    // Don't log synchronously here — start/end aren't guaranteed to be
    // measured yet. Wait one frame, by which point ScrollTrigger has
    // completed its initial refresh pass.
    requestAnimationFrame(() => appendLog('mounted: ScrollTrigger attached with box1 only'));

    // Live readout, updated on every tick regardless of user action.
    const ticker = () => {
      const stNow = scrollTriggerRef.current;
      const tlNow = timelineRef.current;
      if (!stNow || !tlNow) return;
      setReadout({
        tlDuration: tlNow.duration(),
        stStart: stNow.start,
        stEnd: stNow.end,
        progress: stNow.progress,
        scrollY: window.scrollY,
        box1X: gsap.getProperty(box1Ref.current, 'x'),
        box2X: box2Ref.current ? gsap.getProperty(box2Ref.current, 'x') : null,
      });
    };
    gsap.ticker.add(ticker);

    return () => {
      gsap.ticker.remove(ticker);
      st.kill();
      tl.kill();
    };
  }, []);

  const handleAddLateElement = () => {
    if (box2AddedRef.current) return;
    box2AddedRef.current = true;
    // Simulates a component mounting AFTER ScrollTrigger has already
    // attached and calling registerInstance() — appended sequentially,
    // extending the master timeline's total duration.
    timelineRef.current.to(
      box2Ref.current,
      { x: 500, rotation: -180, duration: 1, ease: 'none' },
      '>'
    );
    setBox2Added(true);
    appendLog('LATE ADD: box2 tween appended to master timeline (no refresh yet)');
  };

  const handleRefresh = () => {
    ScrollTrigger.refresh();
    setRefreshCalled(true);
    appendLog('ScrollTrigger.refresh() called');
  };

  return (
    <div className="refresh-spike">
      {/* Normal in-flow intro — scrolls away like any other content.
          Deliberately NOT sticky/fixed at the top: the pin below activates
          with start:"top top", i.e. it takes over that exact screen
          region once you scroll to it. Anything sticky/fixed pinned to
          the same spot would render on top of it and hide it. */}
      <div className="refresh-spike__intro">
        <h1>Refresh Spike</h1>
        <p>
          Scroll down. The blue box (box1) is inside a pinned section — it
          will lock in place and animate as you scroll through it. Once
          you&apos;re inside the pinned section, use the controls in the
          bottom-right corner: click <strong>&quot;Add Late Element&quot;</strong>{' '}
          mid-scroll (simulating a B2 registerInstance() arriving after
          ScrollTrigger attached), then keep scrolling — does the red box
          (box2) move, and does the scroll distance look right? Then try{' '}
          <strong>&quot;Call ScrollTrigger.refresh()&quot;</strong> and see what changes.
        </p>
      </div>

      {/* Fixed corner panel — deliberately NOT at top:0 / not full-width,
          so it can never overlap the pinned section regardless of scroll
          position. */}
      <div className="refresh-spike__panel">
        <div className="refresh-spike__controls">
          <button onClick={handleAddLateElement} disabled={box2Added}>
            {box2Added ? 'box2 added ✓' : 'Add Late Element (box2)'}
          </button>
          <button onClick={handleRefresh} disabled={refreshCalled}>
            {refreshCalled ? 'refresh() called ✓' : 'Call ScrollTrigger.refresh()'}
          </button>
        </div>
        {readout && (
          <table className="refresh-spike__readout">
            <tbody>
              <tr><td>tl duration</td><td>{readout.tlDuration.toFixed(3)}s</td></tr>
              <tr><td>ST start</td><td>{readout.stStart.toFixed(1)}px</td></tr>
              <tr><td>ST end</td><td>{readout.stEnd.toFixed(1)}px</td></tr>
              <tr><td>progress</td><td>{readout.progress.toFixed(4)}</td></tr>
              <tr><td>scrollY</td><td>{readout.scrollY.toFixed(0)}px</td></tr>
              <tr><td>box1 x</td><td>{readout.box1X?.toFixed(1)}</td></tr>
              <tr><td>box2 x</td><td>{readout.box2X != null ? readout.box2X.toFixed(1) : '—'}</td></tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="refresh-spike__spacer" />

      <div ref={pinRef} className="refresh-spike__pin">
        <div ref={box1Ref} className="refresh-spike__box refresh-spike__box--1">box1</div>
        <div ref={box2Ref} className="refresh-spike__box refresh-spike__box--2">box2</div>
      </div>

      <div className="refresh-spike__spacer" />

      <div className="refresh-spike__log">
        <h2>Event log</h2>
        <table>
          <thead>
            <tr>
              <th>t (ms)</th><th>event</th><th>tl dur</th><th>ST start</th>
              <th>ST end</th><th>scrollY</th><th>progress</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry, i) => (
              <tr key={i}>
                <td>{entry.t}</td>
                <td>{entry.message}</td>
                <td>{entry.tlDuration}</td>
                <td>{entry.stStart}</td>
                <td>{entry.stEnd}</td>
                <td>{entry.scrollY}</td>
                <td>{entry.progress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
