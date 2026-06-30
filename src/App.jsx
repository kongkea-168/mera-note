import { useState, useEffect, useRef } from 'react';
import './index.css';

const THEMES = [
  { id: '#fff4e6', name: 'Pastel Yellow', btnBg: '#fff4e6', cssClass: '' },
  { id: '#e6f7ff', name: 'Pastel Blue', btnBg: '#e6f7ff', cssClass: '' },
  { id: '#f6ffed', name: 'Pastel Green', btnBg: '#f6ffed', cssClass: '' },
  { id: '#fff0f6', name: 'Pastel Pink', btnBg: '#fff0f6', cssClass: '' },
  { id: 'khmer-frame', name: 'Khmer Frame', btnBg: '#5c2c34', cssClass: 'khmer-frame-style' },
  { id: 'dark-mode', name: 'Dark Mode', btnBg: '#1e1e1e', cssClass: 'dark-mode-style' },
  { id: 'cyberpunk', name: 'Cyberpunk', btnBg: '#110b29', cssClass: 'cyberpunk-style' },
  { id: 'dark-blue', name: 'Dark Blue', btnBg: '#0f172a', cssClass: 'dark-blue-style' },
  { id: 'dark-grey', name: 'Dark Grey', btnBg: '#334155', cssClass: 'dark-grey-style' },
  { id: 'dark-green', name: 'Dark Green', btnBg: '#064e3b', cssClass: 'dark-green-style' },
];

function App() {
  const [text, setText] = useState('');
  const [color, setColor] = useState(THEMES[0].id);
  const [textColor, setTextColor] = useState('#333333');
  const [fontSize, setFontSize] = useState(16);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const saveTimeoutRef = useRef(null);
  
  // Custom drag state
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Load initial note data
    if (window.api) {
      window.api.loadNote().then((data) => {
        if (data.text) setText(data.text);
        if (data.color) setColor(data.color);
        if (data.textColor) setTextColor(data.textColor);
        if (data.fontSize) setFontSize(data.fontSize);
        setIsLoaded(true);
      });
    } else {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Save note data when it changes
    if (!isLoaded) return;
    
    document.documentElement.style.setProperty('--note-bg', color);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (window.api) {
        window.api.saveNote({ text, color, textColor, fontSize });
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [text, color, textColor, fontSize, isLoaded]);

  const handleClose = () => {
    if (window.api) {
      window.api.closeApp();
    }
  };

  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 2, 72));
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 2, 10));

  const handlePointerDown = (e) => {
    // Don't drag if clicking interactive elements
    if (e.target.closest('.tool-btn') || e.target.closest('.color-btn') || e.target.closest('.close-btn') || e.target.closest('.color-picker-input')) {
      return;
    }
    isDragging.current = true;
    lastMousePos.current = { x: e.screenX, y: e.screenY };
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!isDragging.current) return;
      
      const dx = e.screenX - lastMousePos.current.x;
      const dy = e.screenY - lastMousePos.current.y;
      
      if (dx !== 0 || dy !== 0) {
        if (window.api) {
          window.api.moveWindow({ dx, dy });
        }
        lastMousePos.current = { x: e.screenX, y: e.screenY };
      }
    };

    const handlePointerUp = () => {
      isDragging.current = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const activeTheme = THEMES.find(t => t.id === color) || THEMES[0];

  return (
    <div 
      className={`sticky-note ${activeTheme.cssClass}`} 
      style={{ backgroundColor: !activeTheme.cssClass ? color : undefined }}
      onPointerDown={handlePointerDown}
    >
      <div className="toolbar">
        <div className="text-tools">
          <button className="tool-btn" onClick={decreaseFontSize} title="Decrease Font Size">A-</button>
          <button className="tool-btn" onClick={increaseFontSize} title="Increase Font Size">A+</button>
          <input 
            type="color" 
            className="color-picker-input" 
            value={textColor} 
            onChange={(e) => setTextColor(e.target.value)} 
            title="Text Color"
          />
        </div>
        <div className="drag-indicator">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 9 2 12 5 15"></polyline>
            <polyline points="19 9 22 12 19 15"></polyline>
            <line x1="2" y1="12" x2="22" y2="12"></line>
          </svg>
        </div>
        <div className="bg-colors">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`color-btn ${t.id === 'khmer-frame' ? 'khmer-btn' : ''}`}
              style={{ 
                backgroundColor: t.btnBg, 
                border: t.id === color ? '2px solid rgba(0,0,0,0.5)' : '1px solid rgba(0,0,0,0.1)' 
              }}
              onClick={() => setColor(t.id)}
              title={t.name}
            />
          ))}
          <button className="close-btn" onClick={handleClose} title="Hide App">
            ✕
          </button>
        </div>
      </div>
      <textarea
        className="note-content"
        style={{ color: textColor, fontSize: `${fontSize}px` }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="សរសេរអ្វីមួយ... (Write something...)"
        spellCheck="false"
      />
      <div className="watermark"> © K. Sothea-Made in Cambodia ♥ </div>
    </div>
  );
}

export default App;
