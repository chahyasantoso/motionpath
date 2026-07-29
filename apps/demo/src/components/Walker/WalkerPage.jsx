import { useCallback, useRef } from "react";
import "./WalkerPage.css";
import useMotionProject from "@motionpath/react/useMotionProject";
import useMotionSubscriber from "@motionpath/react/useMotionSubscriber";
import useScrollMotion from "@motionpath/react/useScrollMotion";
import {
  BONES,
  GROUND_Y,
  JOINTS,
  RAIL_WIDTH,
  RIG,
  WALK,
  walkerProject,
  walkerScene,
} from "./walkerMotions";

// A bone rotates around its own joint, so its pivot sits on the element's left
// edge instead of GSAP's default centre.
const PIVOT_LEFT = "0px 50%";
const PIVOT_CENTER = "50% 50%";

const DRAWN_BONES = BONES.filter((bone) => bone.draw > 0);

// ─── Rig parts ──────────────────────────────────────────────────
function Bone({ instance, bone }) {
  const ref = useRef(null);
  const transform = useCallback(
    (raw, compose) => ({ ...compose(raw), transformOrigin: PIVOT_LEFT }),
    [],
  );

  useMotionSubscriber(instance, bone.id, ref, transform);

  return (
    <div
      ref={ref}
      className={`fk-bone fk-${bone.tone}`}
      style={{ width: `${bone.draw}px` }}
    />
  );
}

function Joint({ instance, joint }) {
  const ref = useRef(null);
  // A dot has no orientation, so the inherited world rotation is dropped
  // rather than applied to a circle nobody can see spin.
  const transform = useCallback((raw, compose) => {
    const { x, y } = compose(raw);
    return { x, y, transformOrigin: PIVOT_CENTER };
  }, []);

  useMotionSubscriber(instance, joint.id, ref, transform);

  return (
    <div
      ref={ref}
      className="fk-joint"
      style={{
        width: joint.size,
        height: joint.size,
        marginLeft: -joint.size / 2,
        marginTop: -joint.size / 2,
      }}
    />
  );
}

function Head({ instance }) {
  const ref = useRef(null);
  // The head track's world rotation points UP the neck while the sprite's rest
  // pose faces right. Counter-rotating here keeps that presentation detail out
  // of the authored gait data.
  const transform = useCallback((raw, compose) => {
    const world = compose(raw);
    return {
      ...world,
      rotation: world.rotation + 90,
      transformOrigin: PIVOT_CENTER,
    };
  }, []);

  useMotionSubscriber(instance, "head", ref, transform);

  return (
    <div ref={ref} className="fk-head">
      <span className="fk-eye" />
    </div>
  );
}

function Shadow({ instance }) {
  const ref = useRef(null);
  // Reuses the pelvis broadcast instead of authoring a second track: the hip
  // height already encodes the bounce.
  const transform = useCallback((raw, compose) => {
    const { x, y } = compose(raw);
    const lift = (WALK.hipY - y) / 5;
    return {
      x,
      y: GROUND_Y + 10,
      scaleX: 1 - lift * 0.08,
      opacity: 0.3 - lift * 0.06,
      transformOrigin: PIVOT_CENTER,
    };
  }, []);

  useMotionSubscriber(instance, "pelvis", ref, transform);

  return <div ref={ref} className="fk-shadow" />;
}

function RailDot({ instance }) {
  const ref = useRef(null);
  // Progress readout with zero React state in the scroll path: the pelvis x
  // IS the progress.
  const transform = useCallback((raw, compose) => {
    const { x } = compose(raw);
    const travelled = (x - WALK.startX) / (WALK.endX - WALK.startX);
    return { x: travelled * RAIL_WIDTH, transformOrigin: PIVOT_CENTER };
  }, []);

  useMotionSubscriber(instance, "pelvis", ref, transform);

  return <div ref={ref} className="fk-rail-dot" />;
}

// ─── Page ───────────────────────────────────────────────────────
export default function WalkerPage() {
  const isLoaded = useMotionProject(walkerProject);
  const { refs, instance } = useScrollMotion(isLoaded ? walkerScene : null);

  return (
    <div className="app">
      <header className="header">
        <h1>
          MotionPath <span className="accent">FK Walk Cycle</span>
        </h1>
        <p className="subtitle">
          Forward Kinematics • Observed Bone Chain • Scroll Scrub
        </p>
      </header>

      <section ref={refs.trigger} className="walk-scene">
        <div ref={refs.pin} className="walk-stage">
          <div className="scene-label">
            <h2>One authored position, thirteen derived bones</h2>
            <p>
              The pelvis track owns x, y and rotation. Every other track authors
              only a bone length and a local joint angle, then observes its
              parent as <code>parentWorld</code>. Four gait cycles are scrubbed
              by the scroll position, and no limb coordinate exists in the
              schema.
            </p>
          </div>

          <div className="walk-rig" style={{ "--ground": `${GROUND_Y}px` }}>
            <div className="fk-ground" />
            <Shadow instance={instance} />
            {DRAWN_BONES.map((bone) => (
              <Bone key={bone.id} instance={instance} bone={bone} />
            ))}
            <Head instance={instance} />
            {JOINTS.map((joint) => (
              <Joint key={joint.id} instance={instance} joint={joint} />
            ))}
          </div>

          <div className="walk-readout">
            <span className="walk-chip">pelvis · x / y / rotation</span>
            <span className="walk-chip">spine · boneLength 0, aimed up</span>
            <span className="walk-chip">chest · {RIG.torso}</span>
            <span className="walk-chip">head · {RIG.neck} ± 2.5 bob</span>
            <span className="walk-chip">
              thigh {RIG.thigh} → shin {RIG.shin} → foot {RIG.foot}
            </span>
            <span className="walk-chip">
              arm {RIG.upperArm} → forearm {RIG.forearm}
            </span>
          </div>

          <div className="walk-rail">
            <span>start</span>
            <div className="fk-rail-line" style={{ width: RAIL_WIDTH }}>
              <RailDot instance={instance} />
            </div>
            <span>end</span>
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>Scroll to walk. Scroll back up and the gait runs in reverse.</p>
      </footer>
    </div>
  );
}
