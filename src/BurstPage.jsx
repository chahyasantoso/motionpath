import { useCallback, useEffect, useRef, useState } from 'react';
import './BurstPage.css';
import useMotionPlayer from './hooks/useMotionPlayer';
import useMotionSubscriber from './hooks/useMotionSubscriber';
import { buildMotionPath } from './lib/pathUtils';
import { projectPathNodes3DTo2D } from './lib/projection3d';

// ─── Strawberry Burst Demo Configs ──────────────────────────────
const STRAW_PERSPECTIVE = 800;

const strawberryScene = {
  sceneId: 'strawberry-burst-scroll',
  trigger: {
    type: 'scroll',
    scrub: 0.5,
    pin: '.burst-stage',
    start: 'top top',
    end: 'bottom bottom'
  },
  elements: [
    {
      id: 'strawberry-1',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -1420 }, { x: -160, y: -120, z: 200 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 1 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.0675, v: 1 },
            { p: 0.3825, v: 1 },
            { p: 0.45, v: 0 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'strawberry-2',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -280 }, { x: 160, y: -120, z: 150 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 1 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.0675, v: 1 },
            { p: 0.3825, v: 1 },
            { p: 0.45, v: 0 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'strawberry-3',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -1350 }, { x: -40, y: 140, z: 250 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.15, v: 0 },
            { p: 0.6, v: 1 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.15, v: 0 },
            { p: 0.2175, v: 1 },
            { p: 0.5325, v: 1 },
            { p: 0.6, v: 0 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'strawberry-4',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -1220 }, { x: -200, y: 30, z: 180 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.15, v: 0 },
            { p: 0.6, v: 1 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.15, v: 0 },
            { p: 0.2175, v: 1 },
            { p: 0.5325, v: 1 },
            { p: 0.6, v: 0 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'strawberry-5',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -400 }, { x: 200, y: 60, z: 220 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.75, v: 1 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.3675, v: 1 },
            { p: 0.6825, v: 1 },
            { p: 0.75, v: 0 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'strawberry-6',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -1310 }, { x: -100, y: -180, z: 120 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.75, v: 1 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.3675, v: 1 },
            { p: 0.6825, v: 1 },
            { p: 0.75, v: 0 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'strawberry-7',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -450 }, { x: 100, y: -180, z: 240 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 0 },
            { p: 0.9, v: 1 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 0 },
            { p: 0.5175, v: 1 },
            { p: 0.8325, v: 1 },
            { p: 0.9, v: 0 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'strawberry-8',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -1260 }, { x: 80, y: 160, z: 160 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 0 },
            { p: 0.9, v: 1 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.45, v: 0 },
            { p: 0.5175, v: 1 },
            { p: 0.8325, v: 1 },
            { p: 0.9, v: 0 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'strawberry-9',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -370 }, { x: -120, y: 100, z: 300 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.6, v: 0 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.6, v: 0 },
            { p: 0.66, v: 1 },
            { p: 0.94, v: 1 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'strawberry-10',
      keyframes: {
        path: {
          points: [{ x: 0, y: 0, z: -200 }, { x: 180, y: -50, z: 100 }],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.6, v: 0 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.6, v: 0 },
            { p: 0.66, v: 1 },
            { p: 0.94, v: 1 },
            { p: 1.0, v: 0 }
          ]
        }
      }
    },
    {
      id: 'ice-cream-center',
      keyframes: {
        path: {
          points: [
            { x: 0, y: 0, z: 400 },
            { x: 0, y: -35, z: 0 }
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.7, v: 1 },
            { p: 1.0, v: 1 }
          ]
        }
      }
    }
  ]
};

const iceCreamCardScene = {
  sceneId: 'ice-cream-card-slide',
  trigger: {
    type: 'scroll',
    scrub: false,
    startTrigger: '#strawberry-burst-scroll',
    start: 'top 30%',
    toggleActions: 'play none none none'
  },
  elements: [
    {
      id: 'strawberry-card',
      duration: 2.2,
      keyframes: {
        path: {
          points: [
            { x: 0, y: 300 },
            { x: 0, y: 0 }
          ],
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 1.0, v: 1 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.3, v: 0 },
            { p: 0.767, v: 1 },
            { p: 1.0, v: 1 }
          ]
        }
      }
    }
  ]
};

// ─── Strawberry Burst Demo Components ───────────────────────────
function Strawberry({ elementId, emoji }) {
  const ref = useRef(null);
  
  // Stable random starting rotation angle between 0 and 360 degrees
  const startRotation = useRef(Math.floor(Math.random() * 360)).current;

  const transform = useCallback((rawData, composeFn) => {
    const point3D = composeFn(rawData);
    const progress = rawData.__pathProgress ?? 0;
    const rotation = startRotation + (progress * 90);

    let blurVal = 0;
    if (point3D.z < -100) {
      // Background blur (soft focus)
      blurVal = Math.min(3, (-point3D.z - 100) / 80);
    } else if (point3D.z > 50) {
      // Foreground lens blur (macro bokeh)
      blurVal = Math.min(8, (point3D.z - 50) / 20);
    }

    const composed = composeFn({
      ...rawData,
      __blur: Math.round(blurVal * 10) / 10
    });

    return {
      ...composed, // Has x, y, z, rotation, opacity, filter (merged blur + others), xPercent, yPercent, transformOrigin auto-aligned
      rotation: rotation,
    };
  }, [startRotation]);

  useMotionSubscriber(elementId, ref, transform);

  return (
    <div ref={ref} className="strawberry-element">
      {emoji}
    </div>
  );
}

function IceCreamCard() {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    return composeFn(rawData);
  }, []);

  useMotionSubscriber('strawberry-card', ref, transform);

  return (
    <div ref={ref} className="burst-card">
      <div className="badge">Limited Flavor</div>
      <h3>Strawberry Sundae</h3>
      <p>A double scoop of fresh strawberry and creamy vanilla ice cream, topped with rich syrup and juicy strawberry bursts.</p>
      <div className="growth-readout" style={{ color: '#ff6bca', border: '1px solid rgba(255, 107, 202, 0.3)' }}>
        🍓 $4.99 SPECIAL
      </div>
    </div>
  );
}

function IceCreamCenterpiece() {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    return composeFn(rawData);
  }, []);

  useMotionSubscriber('ice-cream-center', ref, transform);

  return (
    <div ref={ref} className="ice-cream-wrapper">
      <div className="ice-cream-center-el">🍦</div>
    </div>
  );
}

export default function BurstPage() {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    if (!stageRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(stageRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useMotionPlayer(strawberryScene, containerRef);
  useMotionPlayer(iceCreamCardScene, containerRef);

  const strawCx = dimensions.width * 0.25;
  const strawCy = dimensions.height * 0.5;

  // Map 3D path nodes to 2D for all 10 strawberries dynamically (excluding ice cream center)
  const strawberryPaths = strawberryScene.elements
    .filter((el) => el.id.startsWith('strawberry'))
    .map((el) => {
      const nodes = projectPathNodes3DTo2D(
        el.keyframes.path.points,
        strawCx,
        strawCy,
        0,
        false,
        STRAW_PERSPECTIVE
      );
      return {
        id: el.id,
        d: buildMotionPath(nodes),
      };
    });

  const cardNodes = iceCreamCardScene.elements[0].keyframes.path.points;

  return (
    <div className="app">
      <header className="header">
        <h1>MotionPath <span className="accent">Burst Demo</span></h1>
        <p className="subtitle">Staggered Timeframes • Native 3D Z-Depth Projection</p>
      </header>

      <section ref={containerRef} id={strawberryScene.sceneId} className="burst-scene">
        <div ref={stageRef} className="burst-stage">
          <div className="scene-label">
            <h2>Multi-Scene Orchestration (Scroll Scrub + Scroll Observer)</h2>
            <p>Ten scroll-triggered strawberries burst sequentially using staggered timeframes, while a scroll-observer triggered card slides in autonomously when the stage enters viewport.</p>
          </div>

          <div className="burst-inner" style={{ perspective: `${STRAW_PERSPECTIVE}px`, perspectiveOrigin: `${strawCx}px ${strawCy}px` }}>
            <svg className="path-guide" width="100%" height="100%">
              {strawberryPaths.map((path) => (
                <path
                  key={path.id}
                  d={path.d}
                  fill="none"
                  stroke="rgba(255, 107, 202, 0.1)"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                />
              ))}
              <g transform={`translate(${dimensions.width * 0.72}, ${dimensions.height * 0.5})`}>
                <path d={buildMotionPath(cardNodes)} fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" strokeDasharray="8 6" />
              </g>
            </svg>

            {strawberryScene.elements
              .filter((el) => el.id.startsWith('strawberry'))
              .map((el) => (
                <Strawberry key={el.id} elementId={el.id} emoji="🍓" />
              ))}

            <IceCreamCenterpiece />

            <IceCreamCard />
          </div>
        </div>
      </section>
      
      <footer className="footer">
        <p>Scroll down/up to trigger the burst effect</p>
      </footer>
    </div>
  );
}
