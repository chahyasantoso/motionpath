import { useRef, useState, useEffect } from 'react';
import { buildMotionPath, splitQuadraticBezier, findClosestPointOnSegment, convertToCubicPath, getPointOnCubicPath } from '../../lib/pathUtils';
import { project3DTo2D } from '../../lib/projection3d';

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
  isPlayPreview
}) {
  const containerRef = useRef(null);
  const [dragState, setDragState] = useState(null); // { type: 'node'|'control'|'extrude'|'z-depth', elementId, nodeIndex, startX, startY }
  const [hoverPath, setHoverPath] = useState(null); // { elementId, segmentIndex, t, x, y }
  const [stageSize, setStageSize] = useState({ width: 800, height: 500 });

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

  const getRelativeCoords = (e) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handlePointerDown = (e, type, elementId, nodeIndex) => {
    e.stopPropagation();
    const coords = getRelativeCoords(e);

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

      if (dragState.type === 'node') {
        onUpdateNodeCoordinates(dragState.elementId, dragState.nodeIndex, {
          x: coords.x,
          y: coords.y
        });
      } else if (dragState.type === 'control') {
        onUpdateNodeCoordinates(dragState.elementId, dragState.nodeIndex, {
          ctrlX: coords.x,
          ctrlY: coords.y
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
        // Add new node at dropped coords
        onAddNode(dragState.elementId, {
          x: coords.x,
          y: coords.y,
          z: 0
        });
      }
      setDragState(null);
    }
  };

  const handlePathMouseMove = (e, elementId, segmentIndex) => {
    if (dragState) return;
    const coords = getRelativeCoords(e);
    const el = sceneData.elements.find(item => item.id === elementId);
    if (!el) return;

    const p0 = el.pathNodes[segmentIndex - 1];
    const p2 = el.pathNodes[segmentIndex];
    const q = p2.ctrlX !== undefined ? { x: p2.ctrlX, y: p2.ctrlY } : null;

    const result = findClosestPointOnSegment(p0, p2, coords.x, coords.y, q);
    
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

      const p0 = el.pathNodes[segmentIndex - 1];
      const p2 = el.pathNodes[segmentIndex];
      const q = p2.ctrlX !== undefined ? { x: p2.ctrlX, y: p2.ctrlY, z: p2.ctrlZ } : null;

      if (q) {
        // Curve split using de Casteljau
        const split = splitQuadraticBezier(p0, q, p2, hoverPath.t);
        
        onSplitSegment(elementId, segmentIndex, {
          newNode: {
            x: split.P_split.x,
            y: split.P_split.y,
            z: split.P_split.z,
            ctrlX: split.C_L.x,
            ctrlY: split.C_L.y
          },
          updatedNextNode: {
            ctrlX: split.C_R.x,
            ctrlY: split.C_R.y
          }
        });
      } else {
        // Straight line split (just linear node addition)
        const z0 = p0.z || 0;
        const z2 = p2.z || 0;
        const splitZ = z0 + hoverPath.t * (z2 - z0);
        
        onSplitSegment(elementId, segmentIndex, {
          newNode: {
            x: hoverPath.x,
            y: hoverPath.y,
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
    
    // Perform 3D depth perspective division scale & blur
    const scale = PERSPECTIVE / (PERSPECTIVE - point.z);
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
          transform: `translate3d(${point.x}px, ${point.y}px, 0px) translate(-50%, -50%) scale(${scale})`,
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

          return (
            <g key={el.id} className={`path-group ${isSelectedEl ? 'selected' : ''}`}>
              {/* Render visible path line */}
              <path 
                d={buildMotionPath(el.pathNodes)}
                className="visual-path"
              />

              {/* Render segment-splitting interactive stroke overlays */}
              {el.pathNodes.map((node, idx) => {
                if (idx === 0) return null;
                const pathStr = buildMotionPath([el.pathNodes[idx - 1], node]);
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
        {dragState && dragState.type === 'extrude' && (
          <line
            x1={selectedElement.pathNodes[dragState.nodeIndex].x}
            y1={selectedElement.pathNodes[dragState.nodeIndex].y}
            x2={dragState.currentX}
            y2={dragState.currentY}
            className="extrusion-line-guide"
            strokeDasharray="4 4"
          />
        )}

        {/* Control Handles and Tangent lines of selected element */}
        {selectedElement && selectedElement.pathNodes.map((node, idx) => {
          if (node.ctrlX === undefined || node.ctrlY === undefined) return null;
          const prev = selectedElement.pathNodes[idx - 1];
          const isNodeSelected = idx === selectedNodeIndex;

          return (
            <g key={`control-${idx}`} className={`control-guide-group ${isNodeSelected ? 'active' : ''}`}>
              <line x1={prev.x} y1={prev.y} x2={node.ctrlX} y2={node.ctrlY} className="control-tangent-line" />
              <line x1={node.ctrlX} y1={node.ctrlY} x2={node.x} y2={node.y} className="control-tangent-line" />
              <circle
                cx={node.ctrlX}
                cy={node.ctrlY}
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
        return el.pathNodes.map((node, idx) => {
          const isSelectedNode = isSelectedEl && idx === selectedNodeIndex;
          
          // Calculate local node visual projection depth scale
          const zDepth = node.z || 0;
          const nodeScale = PERSPECTIVE / (PERSPECTIVE - zDepth);
          const shadowSpread = Math.max(2, nodeScale * 8);

          return (
            <div 
              key={`${el.id}-node-${idx}`}
              className={`node-handle ${isSelectedNode ? 'selected' : ''}`}
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                transform: `translate(-50%, -50%) scale(${nodeScale})`,
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
      {sceneData.elements.map(renderPreviewElement)}
    </div>
  );
}
