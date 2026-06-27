import React, { useState, useEffect, useRef, useCallback } from 'react';
import useMotionPlayer from '../../hooks/useMotionPlayer';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';
import { buildMotionPath } from '../../lib/pathUtils';
import { project3DTo2D, projectPathNodes3DTo2D } from '../../lib/projection3d';
import motionEngine from '../../lib/motionEngine';
import { parseSceneConfigs, parseTransformFns, validateCode, stripImports, stripExports } from './codeParser';
import EditorCanvas from './EditorCanvas';
import Inspector from './Inspector';

const defaultScene = {
  sceneId: 'editor-playground',
  triggerType: 'scroll',
  scrollConfig: { scrub: 1 },
  elements: [
    {
      id: 'strawberry-editor-1',
      timeframe: [0.0, 0.5],
      pathNodes: [
        { x: 150, y: 350, z: -200 },
        { x: 350, y: 150, z: 200, ctrlX: 200, ctrlY: 150 }
      ]
    },
    {
      id: 'cloud-editor-1',
      timeframe: [0.3, 1.0],
      pathNodes: [
        { x: 100, y: 100, z: 0 },
        { x: 700, y: 100, z: 0 }
      ]
    }
  ]
};

export default function PathEditor({ onClose }) {
  motionEngine.isEditorMode = true;

  const [allScenes, setAllScenes] = useState([defaultScene]);
  const [selectedElementId, setSelectedElementId] = useState('strawberry-editor-1');
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(1);
  const [timelineProgress, setTimelineProgress] = useState(0);
  const [isPlayPreview, setIsPlayPreview] = useState(false);

  const [isBabelLoaded, setIsBabelLoaded] = useState(false);
  const [importedCode, setImportedCode] = useState('');
  const [compileError, setCompileError] = useState(null);
  const [importedComponent, setImportedComponent] = useState(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [customTransforms, setCustomTransforms] = useState({});
  // Bumped on window resize (debounced) to force the sync effect to re-run
  // and rebroadcast element positions after the layout has changed.
  const [syncKey, setSyncKey] = useState(0);

  // Flat list of all elements across all scenes, each tagged with their parent sceneId
  const allElements = allScenes.flatMap(scene =>
    scene.elements.map(el => ({ ...el, _sceneId: scene.sceneId }))
  );

  // Helper: find which scene owns a given elementId
  const getSceneForElement = (elementId) =>
    allScenes.find(scene => scene.elements.some(el => el.id === elementId));




  useEffect(() => {
    if (window.Babel) {
      setIsBabelLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js';
    script.async = true;
    script.onload = () => setIsBabelLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Sync manual timeline scrubbing and live path coordinate updates with motionEngine.
  // We force all scenes to run as scroll-triggered scenes inside the editor so they
  // respond to the timeline slider and update their layouts instantly when dragged,
  // without losing their original metadata configs (which are exported as-is).
  useEffect(() => {
    allScenes.forEach(scene => {
      if (scene && scene.sceneId) {
        try {
          motionEngine.initScene({
            ...scene,
            triggerType: 'scroll'
          });
          motionEngine.setProgress(scene.sceneId, timelineProgress);
        } catch (err) {
          console.warn('[PathEditor] Failed to sync scene updates on engine:', err);
        }
      }
    });
  }, [timelineProgress, allScenes, syncKey]);


  // Cleanup overrides when Editor unmounts
  useEffect(() => {
    return () => {
      motionEngine.isEditorMode = false;
      motionEngine._transformOverrides.clear();
    };
  }, []);

  const compileAndExecute = useCallback((code) => {
    if (!window.Babel) return;
    if (!code.trim()) {
      setCompileError(null);
      setImportedComponent(null);
      setCustomTransforms({});
      setAllScenes([defaultScene]);
      motionEngine._transformOverrides.clear();
      return;
    }

    try {
      const cleanedCode = stripExports(stripImports(code));

      const validation = validateCode(cleanedCode);
      if (!validation.valid) {
        setCompileError(validation.error?.message || 'Code has syntax errors');
        setImportedComponent(null);
        return;
      }

      const transpiled = window.Babel.transform(cleanedCode, {
        presets: ['react'],
      }).code;

      const exportsMock = {};
      const moduleMock = { exports: exportsMock };

      const dependencies = {
        React,
        useState,
        useEffect,
        useRef,
        useCallback,
        useMotionPlayer,
        useMotionSubscriber,
        buildMotionPath,
        project3DTo2D,
        projectPathNodes3DTo2D,
        useNavigate: () => (() => {}),
        Routes: () => null,
        Route: () => null,
        exports: exportsMock,
        module: moduleMock,
      };

      const keys = Object.keys(dependencies);
      const values = Object.values(dependencies);

      const fn = new Function(...keys, `${transpiled}\nreturn typeof defaultExport !== "undefined" ? defaultExport : (module.exports.default || module.exports || exports.default);`);
      const ExecutedComponent = fn(...values);

      if (typeof ExecutedComponent !== 'function' && typeof ExecutedComponent !== 'object') {
        throw new Error('Component code does not export a default React component.');
      }

      setCompileError(null);
      setImportedComponent(() => ExecutedComponent);

      const scenes = parseSceneConfigs(cleanedCode);
      if (scenes) {
        const parsedScenes = Object.values(scenes);
        setAllScenes(parsedScenes);

        const firstScene = parsedScenes[0];
        if (firstScene.elements && firstScene.elements.length > 0) {
          setSelectedElementId(firstScene.elements[0].id);
          setSelectedNodeIndex(0);
        }
      } else {
        const fallbackScene = {
          sceneId: 'custom-scene',
          triggerType: 'scroll',
          elements: []
        };
        setAllScenes([fallbackScene]);
        setSelectedElementId(null);
        setSelectedNodeIndex(-1);
      }

      const transforms = parseTransformFns(cleanedCode);
      setCustomTransforms(transforms);

      // Pre-register original parsed transforms in engine overrides
      motionEngine._transformOverrides.clear();
      Object.entries(transforms).forEach(([elemId, fnStr]) => {
        try {
          let compiledFn;
          const transpiledFn = window.Babel.transform(`(${fnStr})`, {
            presets: ['react']
          }).code;
          compiledFn = new Function(`return ${transpiledFn}`)();
          if (typeof compiledFn === 'function') {
            motionEngine._transformOverrides.set(elemId, compiledFn);
          }
        } catch (err) {
          console.warn(`Failed to pre-compile transform for ${elemId}:`, err);
        }
      });

    } catch (err) {
      console.error(err);
      setCompileError(err.message || 'Failed to compile component code');
      setImportedComponent(null);
    }
  }, []);

  const handleUpdateTransformCode = (elementId, newCode) => {
    setCustomTransforms(prev => {
      const next = { ...prev, [elementId]: newCode };
      
      try {
        const transResult = validateCode(`(${newCode})`);
        if (transResult.valid) {
          let compiledFn;
          if (window.Babel) {
            const transpiled = window.Babel.transform(`(${newCode})`, {
              presets: ['react']
            }).code;
            compiledFn = new Function(`return ${transpiled}`)();
          } else {
            compiledFn = new Function(`return (${newCode})`)();
          }
          
          if (typeof compiledFn === 'function') {
            motionEngine._transformOverrides.set(elementId, compiledFn);
            const cached = motionEngine._cache.get(elementId);
            if (cached) {
              motionEngine._broadcast(elementId, cached);
            }
          }
        }
      } catch (e) {
        console.warn('Transform compilation failed:', e);
      }
      
      return next;
    });
  };

  // Playhead update animation loop
  useEffect(() => {
    if (!isPlayPreview) return;
    let lastTime = performance.now();
    let animId;

    const tick = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const speed = 0.25; // 4 seconds for full path loops
      
      setTimelineProgress(prev => {
        const next = prev + dt * speed;
        return next > 1 ? 0 : next;
      });
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlayPreview]);

  // Handle Delete/Backspace keys to delete the selected node
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in form inputs
      const activeEl = document.activeElement;
      if (
        activeEl && 
        (activeEl.tagName === 'INPUT' || 
         activeEl.tagName === 'SELECT' || 
         activeEl.tagName === 'TEXTAREA' || 
         activeEl.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId && selectedNodeIndex >= 0) {
          const el = allElements.find(item => item.id === selectedElementId);
          if (el) {
            e.preventDefault();
            if (el.pathNodes.length > 1) {
              handleDeleteNode(selectedElementId, selectedNodeIndex);
            } else {
              handleDeleteElement(selectedElementId);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, selectedNodeIndex, allElements]);

  // Handlers
  const handleAddElement = (type) => {
    const count = allElements.filter(el => el.id.startsWith(type)).length + 1;
    const newId = `${type}-editor-${count}`;

    // Add default template path nodes
    const newElement = {
      id: newId,
      timeframe: [0, 1],
      pathNodes: [
        { x: 100, y: 250, z: 0 },
        { x: 400, y: 250, z: 0, ctrlX: 250, ctrlY: 150 }
      ]
    };

    // Add to the first scene by default
    setAllScenes(prev => {
      const updated = [...prev];
      updated[0] = { ...updated[0], elements: [...updated[0].elements, newElement] };
      return updated;
    });

    setSelectedElementId(newId);
    setSelectedNodeIndex(1);
  };

  const handleDeleteElement = (elementId) => {
    setAllScenes(prev => prev.map(scene => ({
      ...scene,
      elements: scene.elements.filter(el => el.id !== elementId)
    })));
    if (selectedElementId === elementId) {
      setSelectedElementId(null);
      setSelectedNodeIndex(-1);
    }
  };

  const handleUpdateElementTimeframe = (elementId, timeframe) => {
    setAllScenes(prev => prev.map(scene => ({
      ...scene,
      elements: scene.elements.map(el =>
        el.id === elementId ? { ...el, timeframe } : el
      )
    })));
  };

  const handleUpdateElementProperty = (elementId, propName, value) => {
    setSelectedElementId(elementId);
    if (!propName) {
      setSelectedNodeIndex(-1); // Only selected element
      return;
    }
    setAllScenes(prev => prev.map(scene => ({
      ...scene,
      elements: scene.elements.map(el =>
        el.id === elementId ? { ...el, [propName]: value } : el
      )
    })));
  };

  const handleUpdateNodeCoordinates = (elementId, nodeIndex, coords) => {
    setAllScenes(prev => prev.map(scene => ({
      ...scene,
      elements: scene.elements.map(el => {
        if (el.id === elementId) {
          const pathNodes = [...el.pathNodes];
          pathNodes[nodeIndex] = { ...pathNodes[nodeIndex], ...coords };
          return { ...el, pathNodes };
        }
        return el;
      })
    })));
  };

  const handleAddNode = (elementId, coords) => {
    setAllScenes(prev => prev.map(scene => ({
      ...scene,
      elements: scene.elements.map(el => {
        if (el.id === elementId) {
          return { ...el, pathNodes: [...el.pathNodes, coords] };
        }
        return el;
      })
    })));

    // Select the newly added node
    const el = allElements.find(item => item.id === elementId);
    if (el) {
      setSelectedNodeIndex(el.pathNodes.length);
    }
  };

  const handleSplitSegment = (elementId, segmentIndex, splitData) => {
    setAllScenes(prev => prev.map(scene => ({
      ...scene,
      elements: scene.elements.map(el => {
        if (el.id === elementId) {
          const pathNodes = [...el.pathNodes];
          if (splitData.updatedNextNode) {
            // Bezier curve split
            pathNodes[segmentIndex] = { ...pathNodes[segmentIndex], ...splitData.updatedNextNode };
          }
          // Insert split node into pathNodes array
          pathNodes.splice(segmentIndex, 0, splitData.newNode);
          return { ...el, pathNodes };
        }
        return el;
      })
    })));

    setSelectedNodeIndex(segmentIndex);
  };

  const handleToggleCurve = (elementId, nodeIndex) => {
    setAllScenes(prev => prev.map(scene => ({
      ...scene,
      elements: scene.elements.map(el => {
        if (el.id === elementId) {
          const pathNodes = [...el.pathNodes];
          const node = pathNodes[nodeIndex];
          const prevNode = pathNodes[nodeIndex - 1];

          if (node.ctrlX !== undefined && node.ctrlY !== undefined) {
            // Make Straight (delete control points)
            const { ctrlX, ctrlY, ctrlZ, ...straightNode } = node;
            pathNodes[nodeIndex] = straightNode;
          } else {
            // Make Curve (inject control point at midpoint)
            const ctrlX = (prevNode.x + node.x) / 2;
            const ctrlY = (prevNode.y + node.y) / 2 - 50;
            const ctrlZ = ((prevNode.z || 0) + (node.z || 0)) / 2;
            pathNodes[nodeIndex] = { ...node, ctrlX, ctrlY, ctrlZ };
          }
          return { ...el, pathNodes };
        }
        return el;
      })
    })));
  };

  const handleDeleteNode = (elementId, nodeIndex) => {
    const el = allElements.find(item => item.id === elementId);
    if (!el || el.pathNodes.length <= 1) return;

    setAllScenes(prev => prev.map(scene => ({
      ...scene,
      elements: scene.elements.map(el => {
        if (el.id === elementId) {
          const pathNodes = [...el.pathNodes];
          pathNodes.splice(nodeIndex, 1);
          // If first node deleted, clear control coordinates of the new first node
          if (nodeIndex === 0 && pathNodes.length > 0) {
            const { ctrlX, ctrlY, ctrlZ, ...rest } = pathNodes[0];
            pathNodes[0] = rest;
          }
          return { ...el, pathNodes };
        }
        return el;
      })
    })));

    setSelectedNodeIndex(prev => Math.max(0, prev - 1));
  };

  const handleAddPathToElement = useCallback((elementId) => {
    const exists = allElements.some(el => el.id === elementId);
    if (exists) {
      setSelectedElementId(elementId);
      setSelectedNodeIndex(0);
      return;
    }

    const newElement = {
      id: elementId,
      timeframe: [0.0, 1.0],
      pathNodes: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 100, z: 0 }
      ]
    };

    // Add to the first scene by default
    setAllScenes(prev => {
      const updated = [...prev];
      updated[0] = { ...updated[0], elements: [...updated[0].elements, newElement] };
      return updated;
    });
    setSelectedElementId(elementId);
    setSelectedNodeIndex(0);
  }, [allElements]);

  const activeSubscribers = Array.from(motionEngine._domRefs?.keys() || []);

  return (
    <div className="editor-root-container">
      {/* Editor top toolbar */}
      <header className="editor-topbar">
        <div className="topbar-left">
          <h2>Interactive Path Editor</h2>
          <span className="badge">Active</span>
        </div>
        <div className="topbar-right">
          <button 
            className={`import-toggle-btn ${isImportOpen ? 'active' : ''}`}
            onClick={() => setIsImportOpen(!isImportOpen)}
            style={{
              padding: '0.4rem 1rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text)',
              background: isImportOpen ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            Import Component 📂
          </button>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {allScenes.map(scene => (
              <span key={scene.sceneId} style={{
                padding: '0.3rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: scene.triggerType === 'scroll' ? 'rgba(100,200,255,0.15)' : 'rgba(255,180,100,0.15)',
                color: scene.triggerType === 'scroll' ? '#64c8ff' : '#ffb464',
                border: `1px solid ${scene.triggerType === 'scroll' ? 'rgba(100,200,255,0.3)' : 'rgba(255,180,100,0.3)'}`,
              }}>
                {scene.triggerType === 'scroll' ? '🖱 Scroll' : '⏱ Timer'}: {scene.sceneId}
              </span>
            ))}
          </div>
          <button className="close-editor-btn" onClick={onClose}>
            Exit Editor Mode
          </button>
        </div>
      </header>

      {/* Main work layout */}
      <div className="editor-main-layout">
        {isImportOpen && (
          <div className="editor-import-panel" style={{
            width: '400px',
            background: 'var(--surface)',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Import React Component</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Paste a React Component (e.g. <code>BurstPage.jsx</code>) to load its scenes, edit transform functions, and render it dynamically on the canvas.
            </p>
            <textarea
              value={importedCode}
              onChange={(e) => {
                setImportedCode(e.target.value);
                compileAndExecute(e.target.value);
              }}
              placeholder="Paste JSX / React component code here..."
              style={{
                flex: 1,
                minHeight: '280px',
                background: '#060613',
                color: '#00ffaa',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.8rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                resize: 'none',
                outline: 'none',
                marginBottom: '1rem'
              }}
            />
            {compileError ? (
              <div className="compile-error-box" style={{
                background: 'rgba(255, 70, 70, 0.1)',
                border: '1px solid rgba(255, 70, 70, 0.3)',
                borderRadius: '8px',
                padding: '0.8rem',
                color: '#ff6666',
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace'
              }}>
                <strong>Compilation Error:</strong>
                <br />
                {compileError}
              </div>
            ) : (
              importedComponent && (
                <div className="compile-success-box" style={{
                  background: 'rgba(0, 255, 170, 0.1)',
                  border: '1px solid rgba(0, 255, 170, 0.3)',
                  borderRadius: '8px',
                  padding: '0.8rem',
                  color: '#00ffaa',
                  fontSize: '0.75rem'
                }}>
                  ✅ Component compiled successfully! Scene configs and transform functions loaded.
                </div>
              )
            )}
          </div>
        )}

        <EditorCanvas
          allElements={allElements}
          selectedElementId={selectedElementId}
          selectedNodeIndex={selectedNodeIndex}
          onSelectElement={setSelectedElementId}
          onSelectNode={setSelectedNodeIndex}
          onUpdateNodeCoordinates={handleUpdateNodeCoordinates}
          onAddNode={handleAddNode}
          onSplitSegment={handleSplitSegment}
          timelineProgress={timelineProgress}
          isPlayPreview={isPlayPreview}
          importedComponent={importedComponent}
          onResize={() => setSyncKey(k => k + 1)}
        />
        
        <Inspector
          allScenes={allScenes}
          selectedElementId={selectedElementId}
          selectedNodeIndex={selectedNodeIndex}
          onAddElement={handleAddElement}
          onDeleteElement={handleDeleteElement}
          onUpdateElementTimeframe={handleUpdateElementTimeframe}
          onUpdateElementProperty={handleUpdateElementProperty}
          onUpdateNodeProperty={handleUpdateNodeCoordinates}
          onToggleCurve={handleToggleCurve}
          onDeleteNode={handleDeleteNode}
          timelineProgress={timelineProgress}
          onChangeTimelineProgress={setTimelineProgress}
          isPlayPreview={isPlayPreview}
          onTogglePlayPreview={() => setIsPlayPreview(!isPlayPreview)}
          customTransforms={customTransforms}
          onUpdateTransformCode={handleUpdateTransformCode}
          activeSubscribers={activeSubscribers}
          onAddPathToElement={handleAddPathToElement}
          onSelectElement={setSelectedElementId}
        />
      </div>
    </div>
  );
}
