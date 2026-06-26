import { useState, useEffect } from 'react';
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
  const [sceneData, setSceneData] = useState(defaultScene);
  const [selectedElementId, setSelectedElementId] = useState('strawberry-editor-1');
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(1);
  const [timelineProgress, setTimelineProgress] = useState(0);
  const [isPlayPreview, setIsPlayPreview] = useState(false);

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

  // Handlers
  const handleAddElement = (type) => {
    const count = sceneData.elements.filter(el => el.id.startsWith(type)).length + 1;
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

    setSceneData(prev => ({
      ...prev,
      elements: [...prev.elements, newElement]
    }));

    setSelectedElementId(newId);
    setSelectedNodeIndex(1);
  };

  const handleDeleteElement = (elementId) => {
    setSceneData(prev => ({
      ...prev,
      elements: prev.elements.filter(el => el.id !== elementId)
    }));
    if (selectedElementId === elementId) {
      setSelectedElementId(null);
      setSelectedNodeIndex(-1);
    }
  };

  const handleUpdateElementTimeframe = (elementId, timeframe) => {
    setSceneData(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        if (el.id === elementId) {
          return { ...el, timeframe };
        }
        return el;
      })
    }));
  };

  const handleUpdateElementProperty = (elementId, propName, value) => {
    setSelectedElementId(elementId);
    if (!propName) {
      setSelectedNodeIndex(-1); // Only selected element
      return;
    }
    setSceneData(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        if (el.id === elementId) {
          return { ...el, [propName]: value };
        }
        return el;
      })
    }));
  };

  const handleUpdateNodeCoordinates = (elementId, nodeIndex, coords) => {
    setSceneData(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        if (el.id === elementId) {
          const pathNodes = [...el.pathNodes];
          pathNodes[nodeIndex] = {
            ...pathNodes[nodeIndex],
            ...coords
          };
          return { ...el, pathNodes };
        }
        return el;
      })
    }));
  };

  const handleAddNode = (elementId, coords) => {
    setSceneData(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        if (el.id === elementId) {
          return {
            ...el,
            pathNodes: [...el.pathNodes, coords]
          };
        }
        return el;
      })
    }));
    
    // Select the newly added node
    const el = sceneData.elements.find(item => item.id === elementId);
    if (el) {
      setSelectedNodeIndex(el.pathNodes.length);
    }
  };

  const handleSplitSegment = (elementId, segmentIndex, splitData) => {
    setSceneData(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        if (el.id === elementId) {
          const pathNodes = [...el.pathNodes];
          
          if (splitData.updatedNextNode) {
            // Bezier curve split
            pathNodes[segmentIndex] = {
              ...pathNodes[segmentIndex],
              ...splitData.updatedNextNode
            };
          }
          
          // Insert split node into pathNodes array
          pathNodes.splice(segmentIndex, 0, splitData.newNode);
          return { ...el, pathNodes };
        }
        return el;
      })
    }));

    setSelectedNodeIndex(segmentIndex);
  };

  const handleToggleCurve = (elementId, nodeIndex) => {
    setSceneData(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
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
            const ctrlY = (prevNode.y + node.y) / 2 - 50; // offset slightly upward for curve shape
            const ctrlZ = ((prevNode.z || 0) + (node.z || 0)) / 2;
            pathNodes[nodeIndex] = {
              ...node,
              ctrlX,
              ctrlY,
              ctrlZ
            };
          }
          return { ...el, pathNodes };
        }
        return el;
      })
    }));
  };

  const handleDeleteNode = (elementId, nodeIndex) => {
    const el = sceneData.elements.find(item => item.id === elementId);
    if (!el || el.pathNodes.length <= 1) return;

    setSceneData(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
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
    }));

    setSelectedNodeIndex(prev => Math.max(0, prev - 1));
  };

  return (
    <div className="editor-root-container">
      {/* Editor top toolbar */}
      <header className="editor-topbar">
        <div className="topbar-left">
          <h2>Interactive Path Editor</h2>
          <span className="badge">Active</span>
        </div>
        <div className="topbar-right">
          <div className="trigger-toggle">
            <button 
              className={sceneData.triggerType === 'scroll' ? 'active' : ''}
              onClick={() => setSceneData(prev => ({ ...prev, triggerType: 'scroll' }))}
            >
              Scroll Mode
            </button>
            <button 
              className={sceneData.triggerType === 'timer' ? 'active' : ''}
              onClick={() => setSceneData(prev => ({ ...prev, triggerType: 'timer' }))}
            >
              Timer Mode
            </button>
          </div>
          <button className="close-editor-btn" onClick={onClose}>
            Exit Editor Mode
          </button>
        </div>
      </header>

      {/* Main work layout */}
      <div className="editor-main-layout">
        <EditorCanvas
          sceneData={sceneData}
          selectedElementId={selectedElementId}
          selectedNodeIndex={selectedNodeIndex}
          onSelectElement={setSelectedElementId}
          onSelectNode={setSelectedNodeIndex}
          onUpdateNodeCoordinates={handleUpdateNodeCoordinates}
          onAddNode={handleAddNode}
          onSplitSegment={handleSplitSegment}
          timelineProgress={timelineProgress}
          isPlayPreview={isPlayPreview}
        />
        
        <Inspector
          sceneData={sceneData}
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
        />
      </div>
    </div>
  );
}
