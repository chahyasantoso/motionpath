import { useState, useEffect } from 'react';

// Reusable numeric input helper that manages its own local string state
// to prevent cursor jumping, digit locking, or sign-typing bugs.
function NumericInput({ label, value, onChange, min, max, step = 1, isFloat = false }) {
  const [localVal, setLocalVal] = useState(value !== undefined ? String(value) : '');

  // Update local string value when external state changes (e.g. from canvas drag)
  useEffect(() => {
    if (value === undefined) {
      setLocalVal('');
    } else {
      const formatted = isFloat ? String(value) : String(Math.round(value));
      setLocalVal(formatted);
    }
  }, [value, isFloat]);

  const handleChange = (e) => {
    const valStr = e.target.value;
    setLocalVal(valStr);

    let parsed = parseFloat(valStr);
    if (!isNaN(parsed)) {
      if (min !== undefined) parsed = Math.max(min, parsed);
      if (max !== undefined) parsed = Math.min(max, parsed);
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    let parsed = parseFloat(localVal);
    if (isNaN(parsed)) {
      parsed = 0;
    }
    if (min !== undefined) parsed = Math.max(min, parsed);
    if (max !== undefined) parsed = Math.min(max, parsed);
    
    onChange(parsed);
    setLocalVal(isFloat ? String(parsed) : String(Math.round(parsed)));
  };

  return (
    <div className="input-group">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={localVal}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
}

export default function Inspector({
  sceneData,
  selectedElementId,
  selectedNodeIndex,
  onAddElement,
  onDeleteElement,
  onUpdateElementTimeframe,
  onUpdateElementProperty,
  onUpdateNodeProperty,
  onToggleCurve,
  onDeleteNode,
  timelineProgress,
  onChangeTimelineProgress,
  isPlayPreview,
  onTogglePlayPreview
}) {
  const [copyStatus, setCopyStatus] = useState('Copy JSON');

  const selectedElement = sceneData.elements.find(el => el.id === selectedElementId);
  const selectedNode = selectedElement ? selectedElement.pathNodes[selectedNodeIndex] : null;

  const handleCopyJSON = () => {
    const jsonStr = JSON.stringify(sceneData, null, 2);
    navigator.clipboard.writeText(jsonStr)
      .then(() => {
        setCopyStatus('Copied! ✓');
        setTimeout(() => setCopyStatus('Copy JSON'), 2000);
      })
      .catch(() => {
        setCopyStatus('Failed to copy');
      });
  };

  return (
    <aside className="editor-inspector">
      <div className="inspector-section">
        <h3>Workspace Elements</h3>
        <div className="element-adder-grid">
          <button className="add-el-btn" onClick={() => onAddElement('strawberry')}>
            <span>🍓</span> Straw
          </button>
          <button className="add-el-btn" onClick={() => onAddElement('icecream')}>
            <span>🍦</span> Center
          </button>
          <button className="add-el-btn" onClick={() => onAddElement('card')}>
            <span>🎴</span> Card
          </button>
          <button className="add-el-btn" onClick={() => onAddElement('cloud')}>
            <span>☁️</span> Cloud
          </button>
        </div>

        <ul className="inspector-element-list">
          {sceneData.elements.map(el => (
            <li 
              key={el.id} 
              className={`element-list-item ${el.id === selectedElementId ? 'active' : ''}`}
              onClick={() => onUpdateElementProperty(el.id, null, null)} // Selects element
            >
              <span className="element-name">{el.id}</span>
              <button 
                className="delete-item-btn" 
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteElement(el.id);
                }}
                title="Delete Element"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selectedElement && (
        <div className="inspector-section">
          <h3>Element Config: <code className="accent-text">{selectedElement.id}</code></h3>
          
          <div className="input-group-row">
            <NumericInput
              label="Timeframe Start"
              min={0}
              max={1}
              step={0.05}
              isFloat={true}
              value={selectedElement.timeframe ? selectedElement.timeframe[0] : 0}
              onChange={(val) => {
                const end = selectedElement.timeframe ? selectedElement.timeframe[1] : 1;
                onUpdateElementTimeframe(selectedElement.id, [val, Math.max(val, end)]);
              }}
            />
            <NumericInput
              label="Timeframe End"
              min={0}
              max={1}
              step={0.05}
              isFloat={true}
              value={selectedElement.timeframe ? selectedElement.timeframe[1] : 1}
              onChange={(val) => {
                const start = selectedElement.timeframe ? selectedElement.timeframe[0] : 0;
                onUpdateElementTimeframe(selectedElement.id, [Math.min(start, val), val]);
              }}
            />
          </div>

          <div className="input-group">
            <label>Easing Function</label>
            <select
              value={selectedElement.ease || 'power1.inOut'}
              onChange={(e) => onUpdateElementProperty(selectedElement.id, 'ease', e.target.value)}
            >
              <option value="none">linear (none)</option>
              <option value="power1.inOut">power1.inOut (Standard)</option>
              <option value="power2.inOut">power2.inOut (Smooth)</option>
              <option value="back.out">back.out (Bounce End)</option>
              <option value="elastic.out">elastic.out (Elastic)</option>
            </select>
          </div>

          {sceneData.triggerType === 'timer' && (
            <div className="input-group-row">
              <NumericInput
                label="Base Duration (s)"
                min={0.1}
                step={0.5}
                isFloat={true}
                value={selectedElement.duration !== undefined ? selectedElement.duration : 1}
                onChange={(val) => onUpdateElementProperty(selectedElement.id, 'duration', val)}
              />
              <NumericInput
                label="Base Delay (s)"
                min={0}
                step={0.5}
                isFloat={true}
                value={selectedElement.delay || 0}
                onChange={(val) => onUpdateElementProperty(selectedElement.id, 'delay', val)}
              />
            </div>
          )}
        </div>
      )}

      {selectedNode && (
        <div className="inspector-section">
          <div className="section-header-row">
            <h3>Node #{selectedNodeIndex} Settings</h3>
            <button 
              className="delete-node-btn-header" 
              onClick={() => onDeleteNode(selectedElement.id, selectedNodeIndex)}
              disabled={selectedElement.pathNodes.length <= 1}
              title="Delete Node"
            >
              Delete Node
            </button>
          </div>

          <div className="input-group-row">
            <NumericInput
              label="X Position"
              value={selectedNode.x}
              onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, 'x', val)}
            />
            <NumericInput
              label="Y Position"
              value={selectedNode.y}
              onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, 'y', val)}
            />
            <NumericInput
              label="Z Depth"
              value={selectedNode.z || 0}
              onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, 'z', val)}
            />
          </div>

          <div className="curve-toggle-container">
            <label className="checkbox-label">
              <input 
                type="checkbox"
                checked={selectedNode.ctrlX !== undefined && selectedNode.ctrlY !== undefined}
                onChange={() => onToggleCurve(selectedElement.id, selectedNodeIndex)}
                disabled={selectedNodeIndex === 0}
              />
              <span>Bezier Curve Segment</span>
            </label>
          </div>

          {selectedNode.ctrlX !== undefined && selectedNode.ctrlY !== undefined && (
            <div className="input-group-row control-points-block">
              <NumericInput
                label="Control X"
                value={selectedNode.ctrlX}
                onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, 'ctrlX', val)}
              />
              <NumericInput
                label="Control Y"
                value={selectedNode.ctrlY}
                onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, 'ctrlY', val)}
              />
            </div>
          )}
        </div>
      )}

      <div className="inspector-section preview-controls-section">
        <h3>Timeline Scrub</h3>
        <div className="timeline-row">
          <button 
            className={`play-btn ${isPlayPreview ? 'active' : ''}`}
            onClick={onTogglePlayPreview}
            title={isPlayPreview ? 'Pause Preview' : 'Play Preview'}
          >
            {isPlayPreview ? '⏸' : '▶'}
          </button>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.005"
            className="timeline-slider"
            value={timelineProgress}
            onChange={(e) => onChangeTimelineProgress(parseFloat(e.target.value))}
          />
          <span className="timeline-percent">{Math.round(timelineProgress * 100)}%</span>
        </div>
      </div>

      <div className="inspector-section json-exporter-section">
        <div className="exporter-header">
          <h3>JSON Config Output</h3>
          <button className="copy-json-btn" onClick={handleCopyJSON}>
            {copyStatus}
          </button>
        </div>
        <textarea 
          className="json-output-area" 
          readOnly 
          value={JSON.stringify(sceneData, null, 2)}
        />
      </div>
    </aside>
  );
}
