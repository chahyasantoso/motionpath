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
  onTogglePlayPreview,
  customTransforms,
  onUpdateTransformCode,
  activeSubscribers,
  onAddPathToElement,
  onSelectElement
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

        <ul className="inspector-element-list" style={{ maxHeight: '180px' }}>
          {sceneData.elements.map(el => (
            <li 
              key={el.id} 
              className={`element-list-item ${el.id === selectedElementId ? 'active' : ''}`}
              onClick={() => onSelectElement ? onSelectElement(el.id) : null}
            >
              <span className="element-name">🍓 {el.id}</span>
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

          {activeSubscribers && activeSubscribers
            .filter(subId => !sceneData.elements.some(el => el.id === subId))
            .map(subId => (
              <li 
                key={subId} 
                className={`element-list-item ${subId === selectedElementId ? 'active' : ''}`}
                style={{ opacity: 0.5, borderStyle: 'dashed', borderColor: 'rgba(255, 255, 255, 0.15)' }}
                onClick={() => onSelectElement ? onSelectElement(subId) : null}
              >
                <span className="element-name" style={{ fontStyle: 'italic' }}>❓ {subId} (no path)</span>
              </li>
            ))
          }
        </ul>
      </div>

      {selectedElement ? (
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

          {customTransforms && customTransforms[selectedElement.id] !== undefined && (
            <div className="input-group" style={{ marginTop: '1rem' }}>
              <label>Transform Function (transformFn)</label>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.4rem', lineHeight: '1.2' }}>
                Customize visual translations (scale, opacity, rotation, etc.) dynamically based on <code>{`{ x, y, z, rotation, progress }`}</code>.
              </p>
              <textarea
                value={customTransforms[selectedElement.id]}
                onChange={(e) => onUpdateTransformCode(selectedElement.id, e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '120px',
                  background: '#060613',
                  color: '#00ffaa',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  outline: 'none',
                  resize: 'vertical',
                  lineHeight: '1.4'
                }}
              />
            </div>
          )}
        </div>
      ) : (
        selectedElementId && (
          <div className="inspector-section" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <h3 style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>Element Config: <code className="accent-text">{selectedElementId}</code></h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: '1.4' }}>
              This element is active in the React component but has no motion path configured.
            </p>
            <button 
              onClick={() => onAddPathToElement && onAddPathToElement(selectedElementId)}
              style={{
                width: '100%',
                padding: '0.6rem 1rem',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.target.style.background = '#8c6eff'}
              onMouseOut={(e) => e.target.style.background = 'var(--accent)'}
            >
              Create Motion Path ➕
            </button>
          </div>
        )
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
              onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, { x: val })}
            />
            <NumericInput
              label="Y Position"
              value={selectedNode.y}
              onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, { y: val })}
            />
            <NumericInput
              label="Z Depth"
              value={selectedNode.z || 0}
              onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, { z: val })}
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
                onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, { ctrlX: val })}
              />
              <NumericInput
                label="Control Y"
                value={selectedNode.ctrlY}
                onChange={(val) => onUpdateNodeProperty(selectedElement.id, selectedNodeIndex, { ctrlY: val })}
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

      {selectedElement && customTransforms && customTransforms[selectedElement.id] !== undefined && (
        <div className="inspector-section hook-exporter-section" style={{ marginTop: '1rem' }}>
          <div className="exporter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3>Subscriber Hook Snippet</h3>
            <button 
              className="copy-json-btn"
              onClick={() => {
                const snippet = `useMotionSubscriber('${selectedElement.id}', ref, useCallback(${customTransforms[selectedElement.id]}, []));`;
                navigator.clipboard.writeText(snippet);
              }}
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                color: 'var(--text)'
              }}
            >
              Copy Hook
            </button>
          </div>
          <textarea
            readOnly
            value={`useMotionSubscriber('${selectedElement.id}', ref, useCallback(${customTransforms[selectedElement.id]}, []));`}
            style={{
              width: '100%',
              minHeight: '80px',
              background: '#060613',
              color: '#e4e4f0',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '0.5rem',
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              outline: 'none',
              resize: 'none'
            }}
          />
        </div>
      )}
    </aside>
  );
}
