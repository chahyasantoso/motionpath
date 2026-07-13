import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import useDynamicHeight from '../../hooks/useDynamicHeight';
import './StaggerSpikePage.css';

gsap.registerPlugin(ScrollTrigger);

/**
 * SPIKE — Demonstrates that coupling ScrollTrigger scroll range (end)
 * to the timeline duration OR offsetting playhead shifts prevents jumps
 * when adding elements dynamically.
 *
 * This spike page compares:
 * 1. FIXED (UNMITIGATED) (Fail): Scroll range is static. Adding box2 alters
 *    timeline duration, causing progress mapping to shift, leading to a jump.
 * 2. FIXED (PLAYHEAD OFFSET) (Success/Solution): Scroll range is static.
 *    Adding box2 shifts timeline duration, but the engine instantly offsets
 *    existing tweens by X = (P * D) / (1 - P). Box 1 remains static with ZERO JUMP.
 * 3. PROPORTIONAL RANGE (Success/Solution): Scroll range is linked to duration.
 *    Adding box2 expands the scroll range proportionally. No jump.
 */
export default function StaggerSpikePage() {
  const [mode, setMode] = useState('mitigated'); // 'fixed' | 'mitigated' | 'proportional'
  const [box2Added, setBox2Added] = useState(false);
  const [readout, setReadout] = useState(null);
  const [log, setLog] = useState([]);

  const sceneRef = useRef(null);
  const stageRef = useRef(null);
  const box1Ref = useRef(null);
  const box2Ref = useRef(null);
  const timelineRef = useRef(null);
  const scrollTriggerRef = useRef(null);
  const box2AddedRef = useRef(false);

  const childListenerRef = useRef(null);

  // Setup mockInstance for the hook
  const mockInstance = useMemo(() => {
    if (!timelineRef.current) return null;
    return {
      timeline: timelineRef.current,
      onChildChange: (cb) => {
        childListenerRef.current = cb;
        return () => { childListenerRef.current = null; };
      }
    };
  }, [timelineRef.current]);

  useDynamicHeight(mode === 'proportional' ? mockInstance : null, sceneRef);

  const appendLog = useCallback((message) => {
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
    setLog((prev) => [...prev, entry]);
  }, []);

  const resetTest = useCallback(() => {
    // Clean up existing GSAP timelines and ScrollTriggers
    ScrollTrigger.getById('stagger-spike')?.kill();
    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    setBox2Added(false);
    box2AddedRef.current = false;
    setLog([]);

    // Reset styles manually
    gsap.set([box1Ref.current, box2Ref.current], { clearProps: 'all' });
    if (sceneRef.current) {
      sceneRef.current.style.height = '300vh';
    }

    // Rebuild timeline and ScrollTrigger
    const tl = gsap.timeline({ paused: true });
    tl.to(box1Ref.current, { x: 500, rotation: 180, duration: 1, ease: 'none' });
    timelineRef.current = tl;

    // Configure scroll range based on selected mode
    const st = ScrollTrigger.create({
      id: 'stagger-spike',
      trigger: sceneRef.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      pin: stageRef.current,
      animation: tl,
    });
    scrollTriggerRef.current = st;

    requestAnimationFrame(() => {
      appendLog(`initialized: Mode "${mode.toUpperCase()}" with box1 only`);
    });
  }, [mode, appendLog]);

  useEffect(() => {
    resetTest();

    // Readout status updater tick
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
      ScrollTrigger.getById('stagger-spike')?.kill();
      if (timelineRef.current) timelineRef.current.kill();
    };
  }, [mode, resetTest]);

  const handleAddLateElement = () => {
    if (box2AddedRef.current) return;
    box2AddedRef.current = true;

    const tl = timelineRef.current;
    const st = scrollTriggerRef.current;
    const tweenDuration = 1.0;

    if (mode === 'mitigated') {
      const progress = st ? st.progress : 0;
      
      // Calculate shift to keep elapsed time of box1 identical:
      // X = (P * D) / (1 - P)
      let shift = 0;
      if (progress < 0.99) {
        shift = (progress * tweenDuration) / (1 - progress);
      } else {
        shift = tweenDuration;
      }

      // Shift existing children (box1) forward in the timeline
      tl.shiftChildren(shift, true, 0);

      // Append box2 at the end of the timeline (which is now shift + box1_duration)
      tl.to(
        box2Ref.current,
        { x: 500, rotation: -180, duration: tweenDuration, ease: 'none' },
        '>'
      );
      appendLog(`LATE ADD (MITIGATED): shifted existing by ${shift.toFixed(3)}s, appended box2`);
    } else {
      // Normal append (Fixed and Proportional modes)
      tl.to(
        box2Ref.current,
        { x: 500, rotation: -180, duration: tweenDuration, ease: 'none' },
        '>'
      );
      appendLog('LATE ADD: box2 tween appended to master timeline');

      // Proportional mode notifies the hook
      if (mode === 'proportional' && childListenerRef.current) {
        childListenerRef.current();
        appendLog('useDynamicHeight callback executed');
      }
    }

    setBox2Added(true);

    // Refresh ScrollTrigger so that either the fixed range is updated,
    // or the proportional function is re-evaluated.
    ScrollTrigger.refresh();
    appendLog('ScrollTrigger.refresh() called');
  };

  return (
    <div className="stagger-spike">
      <div className="stagger-spike__container">
        <div className="stagger-spike__header">
          <h1>Stagger Spike Dashboard</h1>
          <p className="description">
            Testing the dynamic child additions under GSAP ScrollTrigger to prove our solution.
          </p>

          <div className="mode-selector">
            <button
              className={`mode-btn ${mode === 'fixed' ? 'active' : ''}`}
              onClick={() => setMode('fixed')}
            >
              <span>Fixed (Unmitigated)</span>
              <span className="badge badge--error">JUMPS/FAILS</span>
            </button>
            <button
              className={`mode-btn ${mode === 'mitigated' ? 'active' : ''}`}
              onClick={() => setMode('mitigated')}
            >
              <span>Fixed (Playhead Offset)</span>
              <span className="badge badge--success">SMOOTH/WORKS</span>
            </button>
            <button
              className={`mode-btn ${mode === 'proportional' ? 'active' : ''}`}
              onClick={() => setMode('proportional')}
            >
              <span>Proportional Range</span>
              <span className="badge badge--success">SMOOTH/WORKS</span>
            </button>
          </div>
        </div>

        <div className="stagger-spike__instructions card">
          <h3>Test Protocol</h3>
          <ol>
            <li>Scroll down through the page. The pinned stage below will lock in the viewport.</li>
            <li>Stop scrolling around the middle of the pin (progress ≈ 0.3 - 0.6).</li>
            <li>Click <strong>&quot;Add Late Element&quot;</strong> in the floating panel.</li>
            <li>
              <strong>Compare:</strong> 
              <ul>
                <li>In <em>Fixed (Unmitigated)</em>, Box 1 will jump forward instantly.</li>
                <li>In <em>Fixed (Playhead Offset)</em>, Box 1 will maintain its position with <strong>zero jump</strong>!</li>
                <li>In <em>Proportional Range</em>, the scroll range expands, but Box 1 has <strong>zero jump</strong>!</li>
              </ul>
            </li>
          </ol>
          <button className="reset-btn" onClick={resetTest}>Reset Test State</button>
        </div>

        <div className="stagger-spike__panel card">
          <h3>Live Readout ({mode.toUpperCase()})</h3>
          {readout ? (
            <div className="readout-grid">
              <div className="readout-item">
                <span className="label">Timeline Duration</span>
                <span className="val">
                  {typeof readout.tlDuration === 'number' ? `${readout.tlDuration.toFixed(2)}s` : '—'}
                </span>
              </div>
              <div className="readout-item">
                <span className="label">ST Start / End</span>
                <span className="val">
                  {typeof readout.stStart === 'number' ? `${readout.stStart.toFixed(0)}px` : '—'} - {typeof readout.stEnd === 'number' ? `${readout.stEnd.toFixed(0)}px` : '—'}
                </span>
              </div>
              <div className="readout-item">
                <span className="label">Scroll Range</span>
                <span className="val">
                  {typeof readout.stStart === 'number' && typeof readout.stEnd === 'number' 
                    ? `${(readout.stEnd - readout.stStart).toFixed(0)}px` 
                    : '—'}
                </span>
              </div>
              <div className="readout-item">
                <span className="label">Current ScrollY</span>
                <span className="val">
                  {typeof readout.scrollY === 'number' ? `${readout.scrollY.toFixed(0)}px` : '—'}
                </span>
              </div>
              <div className="readout-item">
                <span className="label">ST Progress</span>
                <span className="val">
                  {typeof readout.progress === 'number' ? readout.progress.toFixed(4) : '—'}
                </span>
              </div>
              <div className="readout-item">
                <span className="label">Box 1 X</span>
                <span className="val accent-blue">
                  {typeof readout.box1X === 'number' ? `${readout.box1X.toFixed(1)}px` : '0.0px'}
                </span>
              </div>
              <div className="readout-item">
                <span className="label">Box 2 X</span>
                <span className="val accent-red">
                  {typeof readout.box2X === 'number' ? `${readout.box2X.toFixed(1)}px` : '—'}
                </span>
              </div>
            </div>
          ) : (
            <p>Loading readouts...</p>
          )}

          <div className="action-area">
            <button
              onClick={handleAddLateElement}
              disabled={box2Added}
              className={`add-btn ${box2Added ? 'disabled' : ''}`}
            >
              {box2Added ? 'Box 2 Added ✓' : 'Add Late Element (Box 2)'}
            </button>
          </div>
        </div>

        <div className="stagger-spike__spacer-half" />

        <div ref={sceneRef} className="stagger-spike__scene">
          <div ref={stageRef} className="stagger-spike__stage">
            <div className="stagger-spike__pin card">
              <div className="stage-label">PINNED VIEWPORT STAGE ({mode.toUpperCase()})</div>
              <div className="track-line" />
              <div ref={box1Ref} className="stagger-spike__box stagger-spike__box--1">
                Box 1
              </div>
              <div ref={box2Ref} className="stagger-spike__box stagger-spike__box--2">
                Box 2
              </div>
            </div>
          </div>
        </div>

        <div className="stagger-spike__spacer-half" />

        <div className="stagger-spike__log card">
          <h3>Event Log</h3>
          <div className="log-table-container">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Time (ms)</th>
                  <th>Event</th>
                  <th>TL Dur</th>
                  <th>ST End</th>
                  <th>ScrollY</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {log.slice().reverse().map((entry, i) => (
                  <tr key={i}>
                    <td>{entry.t}</td>
                    <td>{entry.message}</td>
                    <td>{entry.tlDuration}s</td>
                    <td>{entry.stEnd}px</td>
                    <td>{entry.scrollY}px</td>
                    <td>{entry.progress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
