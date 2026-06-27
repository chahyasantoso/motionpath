import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';
import motionEngine from '../../lib/motionEngine';
import { buildMotionPath, convertToCubicPath, findClosestPointOnSegment, getPointOnCubicPath, splitQuadraticBezier } from '../../lib/pathUtils';

const PERSPECTIVE = 1000;

export default function EditorCanvas({
  sceneData,
  selectedElementId,
  selectedNodeIndex,
  onSelectElement,
  onSelectNode,
  onUpdateNodeCoordinates,
  onAddNode,
  onSplitSegment,
  timelineProgress,
  isPlayPreview,
  importedComponent: ImportedComponent
}) {
  const containerRef = useRef(null);
  const [dragState, setDragState] = useState(null); // { type: 'node'|'control'|'extrude'|'z-depth', elementId, nodeIndex, startX, startY }
  const [hoverPath, setHoverPath] = useState(null); // { elementId, segmentIndex, t, x, y }
  const [stageSize, setStageSize] = useState({ width: 800, height: 500 });
  const [refsVersion, setRefsVersion] = useState(0);

  // Cached origins mapping during drag operations to avoid browser layout layout/rendering latency jitter
  const originsRef = useRef(new Map());

  // Design-stage resolution baseline is 1200px width
  const viewScale = stageSize.width / 1200;

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setStageSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Watch for imported component mounting to refresh and capture subscriber refs
  useEffect(() => {
    if (!ImportedComponent) return;
    const timer = setTimeout(() => {
      setRefsVersion(prev => prev + 1);
    }, 150);
    return () => clearTimeout(timer);
  }, [ImportedComponent]);

  // untranslated element origin relative to editor canvas container viewport
  const getElementOrigin = (elementId) => {
    const domEl = motionEngine._domRefs?.get(elementId);
    if (!domEl) return { x: 0, y: 0, cx: stageSize.width / 2, cy: stageSize.height / 2, perspective: PERSPECTIVE };

    try {
      const rect = domEl.getBoundingClientRect();
      const canvasRect = containerRef.current.getBoundingClientRect();
      const parentEl = domEl.parentElement;

      // Determine parent's 3D perspective origin center relative to screen
      let cx = canvasRect.left + canvasRect.width / 2;
      let cy = canvasRect.top + canvasRect.height / 2;
      let perspectiveVal = PERSPECTIVE;

      if (parentEl) {
        const parentRect = parentEl.getBoundingClientRect();
        const style = window.getComputedStyle(parentEl);
        
        if (style.perspective && style.perspective !== 'none') {
          perspectiveVal = parseFloat(style.perspective) || PERSPECTIVE;
        }

        const optOrigin = style.perspectiveOrigin.split(' ');
        if (optOrigin.length === 2) {
          cx = parentRect.left + parseFloat(optOrigin[0]) * viewScale;
          cy = parentRect.top + parseFloat(optOrigin[1]) * viewScale;
        }
      }

      // Retrieve current GSAP translations
      const gsapX = gsap.getProperty(domEl, 'x') || 0;
      const gsapY = gsap.getProperty(domEl, 'y') || 0;
      const gsapZ = gsap.getProperty(domEl, 'z') || 0;

      // Calculate Z perspective division scale
      const zScale = perspectiveVal / (perspectiveVal - gsapZ);

      // Current screen center of element
      const screenX = rect.left + rect.width / 2;
      const screenY = rect.top + rect.height / 2;

      // Project back to Z = 0 layout space relative to canvas
      const x = cx - canvasRect.left + (screenX - cx) / zScale - (gsapX * viewScale);
      const y = cy - canvasRect.top + (screenY - cy) / zScale - (gsapY * viewScale);

      return { 
        x, 
        y, 
        cx: cx - canvasRect.left, 
        cy: cy - canvasRect.top,
        perspective: perspectiveVal
      };
    } catch (e) {
      console.warn('Failed to calculate origin for', elementId, e);
      return { x: 0, y: 0, cx: stageSize.width / 2, cy: stageSize.height / 2, perspective: PERSPECTIVE };
    }
  };

  // Helper to project raw 3D coordinates (x, y, z) into 2D canvas relative screen coordinates
  const projectPoint = (x_raw, y_raw, z_raw, origin) => {
    const z = z_raw || 0;
    const perspective = origin.perspective !== undefined ? origin.perspective : PERSPECTIVE;
    const scale = perspective / (perspective - z);
    const cx = origin.cx !== undefined ? origin.cx : stageSize.width / 2;
    const cy = origin.cy !== undefined ? origin.cy : stageSize.height / 2;

    return {
      x: cx + (origin.x + x_raw * viewScale - cx) * scale,
      y: cy + (origin.y + y_raw * viewScale - cy) * scale,
      scale
    };
  };

  // Helper that returns cached coordinates during drag operations to prevent direct feedback loops
  const getActiveOrigin = (elementId) => {
    if (dragState && originsRef.current && originsRef.current.has(elementId)) {
      return originsRef.current.get(elementId);
    }
    return getElementOrigin(elementId);
  };

  const getRelativeCoords = (e) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handlePointerDown = (e, type, elementId, nodeIndex) => {
    e.preventDefault();
    e.stopPropagation();
    const coords = getRelativeCoords(e);

    // Cache origins of all active subscribers at the start of drag
    const currentOrigins = new Map();
    if (motionEngine._domRefs) {
      Array.from(motionEngine._domRefs.keys()).forEach(id => {
        currentOrigins.set(id, getElementOrigin(id));
      });
    }
    originsRef.current = currentOrigins;

    // If Ctrl is held and pointer down is on an anchor node, trigger extrusion
    if (type === 'node' && e.ctrlKey) {
      setDragState({
        type: 'extrude',
        elementId,
        nodeIndex,
        startX: coords.x,
        startY: coords.y,
        currentX: coords.x,
        currentY: coords.y
      });
      return;
    }

    setDragState({
      type,
      elementId,
      nodeIndex,
      startX: coords.x,
      startY: coords.y
    });

    onSelectElement(elementId);
    onSelectNode(nodeIndex);
  };

  const handlePointerMove = (e) => {
    const coords = getRelativeCoords(e);

    if (dragState) {
      e.preventDefault();
      const el = sceneData.elements.find(item => item.id === dragState.elementId);
      if (!el) return;

      const origin = getActiveOrigin(dragState.elementId);

      // Determine Z depth for the dragged point to reverse perspective projection
      let nodeZ = 0;
      if (dragState.type === 'node') {
        nodeZ = el.pathNodes[dragState.nodeIndex].z || 0;
      } else if (dragState.type === 'control') {
        const curr = el.pathNodes[dragState.nodeIndex];
        const prev = el.pathNodes[dragState.nodeIndex - 1];
        if (curr) {
          nodeZ = curr.ctrlZ !== undefined ? curr.ctrlZ : (prev ? (prev.z + curr.z) / 2 : curr.z || 0);
        }
      }

      const perspective = origin.perspective !== undefined ? origin.perspective : PERSPECTIVE;
      const nodeScale = perspective / (perspective - nodeZ);
      const cx = origin.cx !== undefined ? origin.cx : stageSize.width / 2;
      const cy = origin.cy !== undefined ? origin.cy : stageSize.height / 2;

      // Project screen mouse coordinates back to layout space
      const relativeX = (cx + (coords.x - cx) / nodeScale - origin.x) / viewScale;
      const relativeY = (cy + (coords.y - cy) / nodeScale - origin.y) / viewScale;

      if (dragState.type === 'node') {
        onUpdateNodeCoordinates(dragState.elementId, dragState.nodeIndex, {
          x: relativeX,
          y: relativeY
        });
      } else if (dragState.type === 'control') {
        onUpdateNodeCoordinates(dragState.elementId, dragState.nodeIndex, {
          ctrlX: relativeX,
          ctrlY: relativeY
        });
      } else if (dragState.type === 'extrude') {
        setDragState(prev => ({
          ...prev,
          currentX: coords.x,
          currentY: coords.y
        }));
      } else if (dragState.type === 'z-depth') {
        // Vertical slider movement translates to Z-depth change. Standard mapping:
        // Moving up (negative dy) decreases Y, which should INCREASE Z (closer).
        const dy = coords.y - dragState.startY;
        const currentZ = el.pathNodes[dragState.nodeIndex].z || 0;
        const speed = -4; // 1px drag = 4 units depth change
        const targetZ = Math.max(-2000, Math.min(1000, currentZ + dy * speed));
        
        onUpdateNodeCoordinates(dragState.elementId, dragState.nodeIndex, { z: targetZ });
        setDragState(prev => ({ ...prev, startY: coords.y })); // reset baseline
      }
    }
  };

  const handlePointerUp = (e) => {
    if (dragState) {
      if (dragState.type === 'extrude') {
        const coords = getRelativeCoords(e);
        const origin = getActiveOrigin(dragState.elementId);
        // Add new node at dropped coords
        onAddNode(dragState.elementId, {
          x: (coords.x - origin.x) / viewScale,
          y: (coords.y - origin.y) / viewScale,
          z: 0
        });
      }
      setDragState(null);
      originsRef.current.clear();
    }
  };

  const handlePathMouseMove = (e, elementId, segmentIndex) => {
    if (dragState) return;
    const coords = getRelativeCoords(e);
    const el = sceneData.elements.find(item => item.id === elementId);
    if (!el) return;

    const origin = getActiveOrigin(elementId);
    const node0 = el.pathNodes[segmentIndex - 1];
    const node2 = el.pathNodes[segmentIndex];

    const absP0 = projectPoint(node0.x, node0.y, node0.z, origin);
    const absP2 = projectPoint(node2.x, node2.y, node2.z, origin);
    
    let q = null;
    if (node2.ctrlX !== undefined && node2.ctrlY !== undefined) {
      const ctrlZ = node2.ctrlZ !== undefined ? node2.ctrlZ : (node0.z + node2.z) / 2;
      const projCtrl = projectPoint(node2.ctrlX, node2.ctrlY, ctrlZ, origin);
      q = { x: projCtrl.x, y: projCtrl.y };
    }

    const result = findClosestPointOnSegment(absP0, absP2, coords.x, coords.y, q);
    
    // Ignore splitting if too close to either anchor
    if (result.t > 0.05 && result.t < 0.95 && result.distance < 20) {
      setHoverPath({
        elementId,
        segmentIndex,
        t: result.t,
        x: result.x,
        y: result.y
      });
    } else {
      setHoverPath(null);
    }
  };

  const handlePathClick = (e, elementId, segmentIndex) => {
    e.stopPropagation();
    if (hoverPath && hoverPath.elementId === elementId && hoverPath.segmentIndex === segmentIndex) {
      const el = sceneData.elements.find(item => item.id === elementId);
      if (!el) return;

      const node0 = el.pathNodes[segmentIndex - 1];
      const node2 = el.pathNodes[segmentIndex];

      const rawP0 = { x: node0.x, y: node0.y, z: node0.z || 0 };
      const rawP2 = { x: node2.x, y: node2.y, z: node2.z || 0 };
      
      let rawQ = null;
      if (node2.ctrlX !== undefined && node2.ctrlY !== undefined) {
        const ctrlZ = node2.ctrlZ !== undefined ? node2.ctrlZ : (node0.z + node2.z) / 2;
        rawQ = { x: node2.ctrlX, y: node2.ctrlY, z: ctrlZ };
      }

      if (rawQ) {
        // Curve split using de Casteljau in raw space
        const split = splitQuadraticBezier(rawP0, rawQ, rawP2, hoverPath.t);
        
        onSplitSegment(elementId, segmentIndex, {
          newNode: {
            x: split.P_split.x,
            y: split.P_split.y,
            z: split.P_split.z || 0,
            ctrlX: split.C_L.x,
            ctrlY: split.C_L.y
          },
          updatedNextNode: {
            ctrlX: split.C_R.x,
            ctrlY: split.C_R.y
          }
        });
      } else {
        // Straight line split (just linear node addition in raw space)
        const z0 = node0.z || 0;
        const z2 = node2.z || 0;
        const splitZ = z0 + hoverPath.t * (z2 - z0);
        const splitX = node0.x + hoverPath.t * (node2.x - node0.x);
        const splitY = node0.y + hoverPath.t * (node2.y - node0.y);
        
        onSplitSegment(elementId, segmentIndex, {
          newNode: {
            x: splitX,
            y: splitY,
            z: splitZ
          }
        });
      }
      setHoverPath(null);
    }
  };

  // Helper to render elements along their paths based on timelineProgress
  const renderPreviewElement = (el) => {
    if (el.pathNodes.length === 0) return null;
    const cubicPath = convertToCubicPath(el.pathNodes);
    
    // Map timelineProgress (0-1) to element's timeframe window
    let progress = timelineProgress;
    if (el.timeframe && Array.isArray(el.timeframe) && el.timeframe.length === 2) {
      const [start, end] = el.timeframe;
      if (timelineProgress < start) {
        progress = 0;
      } else if (timelineProgress > end) {
        progress = 1;
      } else {
        progress = (timelineProgress - start) / (end - start);
      }
    }

    const point = getPointOnCubicPath(cubicPath, progress);
    
    const origin = getActiveOrigin(el.id);
    const projected = projectPoint(point.x, point.y, point.z, origin);
    const blur = Math.max(0, (point.z * -1) / 100); // deeper is blurrier

    // Setup node element emoji or style depending on its id
    let label = '✨';
    let className = 'editor-preview-item';
    if (el.id.includes('strawberry')) {
      label = '🍓';
      className += ' straw';
    } else if (el.id.includes('center')) {
      label = '🍦';
      className += ' centerpiece';
    } else if (el.id.includes('card')) {
      label = '🎴';
      className += ' card';
    } else if (el.id.includes('cloud')) {
      label = '☁️';
      className += ' cloud';
    }

    return (
      <div 
        key={el.id}
        className={className}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate3d(${projected.x}px, ${projected.y}px, 0px) translate(-50%, -50%) scale(${projected.scale})`,
          filter: `blur(${blur}px)`,
          zIndex: Math.round(point.z + 1000)
        }}
      >
        <div className="preview-label">{label}</div>
        <div className="preview-id">{el.id}</div>
      </div>
    );
  };

  const selectedElement = sceneData.elements.find(el => el.id === selectedElementId);
  const selectedNode = selectedElement ? selectedElement.pathNodes[selectedNodeIndex] : null;

  return (
    <div 
      className={`editor-canvas ${dragState ? 'dragging' : ''}`}
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { setDragState(null); setHoverPath(null); }}
    >
      {/* Background Dot Grid */}
      <div className="canvas-dot-grid" />

      {/* SVG guides overlay */}
      <svg className="editor-svg-layer" width="100%" height="100%">
        {sceneData.elements.map(el => {
          if (el.pathNodes.length === 0) return null;
          const isSelectedEl = el.id === selectedElementId;
          const origin = getActiveOrigin(el.id);

          const shiftedNodes = el.pathNodes.map((node, nodeIdx) => {
            const projectedAnchor = projectPoint(node.x, node.y, node.z, origin);
            const result = {
              ...node,
              x: projectedAnchor.x,
              y: projectedAnchor.y,
            };

            if (node.ctrlX !== undefined && node.ctrlY !== undefined) {
              const prevNode = el.pathNodes[nodeIdx - 1];
              const ctrlZ = node.ctrlZ !== undefined ? node.ctrlZ : (prevNode ? (prevNode.z + node.z) / 2 : 0);
              const projectedCtrl = projectPoint(node.ctrlX, node.ctrlY, ctrlZ, origin);
              result.ctrlX = projectedCtrl.x;
              result.ctrlY = projectedCtrl.y;
            }

            return result;
          });

          return (
            <g key={el.id} className={`path-group ${isSelectedEl ? 'selected' : ''}`}>
              {/* Render visible path line */}
              <path 
                d={buildMotionPath(shiftedNodes)}
                className="visual-path"
              />

              {/* Render segment-splitting interactive stroke overlays */}
              {shiftedNodes.map((node, idx) => {
                if (idx === 0) return null;
                const pathStr = buildMotionPath([shiftedNodes[idx - 1], node]);
                return (
                  <path
                    key={idx}
                    d={pathStr}
                    className="interactive-segment-overlay"
                    onPointerMove={(e) => handlePathMouseMove(e, el.id, idx)}
                    onPointerOut={() => setHoverPath(null)}
                    onClick={(e) => handlePathClick(e, el.id, idx)}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Hover Split Node Preview */}
        {hoverPath && (
          <circle 
            cx={hoverPath.x} 
            cy={hoverPath.y} 
            r="6" 
            className="hover-split-preview"
          />
        )}

        {/* Extrusion Line Preview */}
        {dragState && dragState.type === 'extrude' && selectedElement && (() => {
          const origin = getActiveOrigin(dragState.elementId);
          const startNode = selectedElement.pathNodes[dragState.nodeIndex];
          const projectedStart = projectPoint(startNode.x, startNode.y, startNode.z, origin);
          return (
            <line
              x1={projectedStart.x}
              y1={projectedStart.y}
              x2={dragState.currentX}
              y2={dragState.currentY}
              className="extrusion-line-guide"
              strokeDasharray="4 4"
            />
          );
        })()}

        {/* Control Handles and Tangent lines of selected element */}
        {selectedElement && selectedElement.pathNodes.map((node, idx) => {
          if (node.ctrlX === undefined || node.ctrlY === undefined) return null;
          const origin = getActiveOrigin(selectedElementId);
          const prev = selectedElement.pathNodes[idx - 1];
          const isNodeSelected = idx === selectedNodeIndex;

          const ctrlZ = node.ctrlZ !== undefined ? node.ctrlZ : (prev ? (prev.z + node.z) / 2 : 0);
          const projectedCtrl = projectPoint(node.ctrlX, node.ctrlY, ctrlZ, origin);
          const projectedNode = projectPoint(node.x, node.y, node.z, origin);
          const projectedPrev = projectPoint(prev.x, prev.y, prev.z, origin);

          return (
            <g key={`control-${idx}`} className={`control-guide-group ${isNodeSelected ? 'active' : ''}`}>
              <line x1={projectedPrev.x} y1={projectedPrev.y} x2={projectedCtrl.x} y2={projectedCtrl.y} className="control-tangent-line" />
              <line x1={projectedCtrl.x} y1={projectedCtrl.y} x2={projectedNode.x} y2={projectedNode.y} className="control-tangent-line" />
              <circle
                cx={projectedCtrl.x}
                cy={projectedCtrl.y}
                r="6"
                className="control-handle"
                onPointerDown={(e) => handlePointerDown(e, 'control', selectedElementId, idx)}
              />
            </g>
          );
        })}
      </svg>

      {/* HTML interactive elements: Nodes & Z-sliders overlay */}
      {sceneData.elements.map(el => {
        const isSelectedEl = el.id === selectedElementId;
        const origin = getActiveOrigin(el.id);

        return el.pathNodes.map((node, idx) => {
          const isSelectedNode = isSelectedEl && idx === selectedNodeIndex;
          
          // Calculate local node visual projection depth scale using projected helper
          const zDepth = node.z || 0;
          const projected = projectPoint(node.x, node.y, node.z, origin);
          const nodeScale = projected.scale;
          const shadowSpread = Math.max(2, nodeScale * 8);

          return (
            <div 
              key={`${el.id}-node-${idx}`}
              className={`node-handle ${isSelectedNode ? 'selected' : ''}`}
              style={{
                position: 'absolute',
                left: `${projected.x}px`,
                top: `${projected.y}px`,
                transform: `translate(-50%, -50%) scale(${nodeScale * viewScale})`,
                boxShadow: isSelectedNode 
                  ? `0 0 16px var(--accent)` 
                  : `0 2px ${shadowSpread}px rgba(0,0,0,0.5)`,
                zIndex: Math.round(zDepth + 1010)
              }}
              onPointerDown={(e) => handlePointerDown(e, 'node', el.id, idx)}
            >
              <div className="node-number">{idx}</div>

              {/* Renders in-context vertical Z-depth slider helper next to selected node */}
              {isSelectedNode && (
                <div 
                  className="z-depth-slider-hud"
                  onPointerDown={(e) => handlePointerDown(e, 'z-depth', el.id, idx)}
                >
                  <div className="hud-line" />
                  <div className="hud-slider-thumb" style={{ bottom: `${((zDepth + 1000) / 2000) * 100}%` }} />
                  <span className="hud-value-tooltip">Z: {Math.round(zDepth)}</span>
                </div>
              )}
            </div>
          );
        });
      })}

      {/* Render extruded ghost item representation */}
      {dragState && dragState.type === 'extrude' && (
        <div 
          className="extrusion-ghost"
          style={{
            left: `${dragState.currentX}px`,
            top: `${dragState.currentY}px`,
            transform: 'translate(-50%, -50%) opacity(0.6)'
          }}
        >
          {selectedElement.id.includes('strawberry') ? '🍓' : '✨'}
        </div>
      )}

      {/* Preview items animating when timeline progress is scrubbed */}
      {ImportedComponent ? (
        <div className="canvas-imported-wrapper" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'auto',
          overflow: 'hidden'
        }}>
          <div style={{
            pointerEvents: 'none',
            width: '1200px',
            height: `${1200 * (stageSize.height / stageSize.width)}px`,
            transform: `scale(${viewScale})`,
            transformOrigin: 'top left'
          }}>
            <ImportedComponent />
          </div>
        </div>
      ) : (
        sceneData.elements.map(renderPreviewElement)
      )}
    </div>
  );
}
