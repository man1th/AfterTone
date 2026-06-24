import { Component, createSignal, createEffect, onCleanup } from 'solid-js';
import { buildMonotonicCubicSpline, Point } from '../utils/spline';

export type CurveChannel = 'master' | 'red' | 'green' | 'blue';
export type CurveState = Record<CurveChannel, Point[]>;
interface ToneCurveProps { curves: CurveState; setCurves: (curves: CurveState) => void; disabled?: boolean; }

export const ToneCurve: Component<ToneCurveProps> = (props) => {
  const [activeChannel, setActiveChannel] = createSignal<CurveChannel>('master');
  const [svgPaths, setSvgPaths] = createSignal<Record<CurveChannel, string>>({ master: '', red: '', green: '', blue: '' });
  let svgRef!: SVGSVGElement; let dragIndex = -1;

  createEffect(() => {
    const channels: CurveChannel[] = ['master', 'red', 'green', 'blue'];
    const updatedPaths = {} as Record<CurveChannel, string>;
    channels.forEach(ch => {
      const evaluator = buildMonotonicCubicSpline(props.curves[ch]);
      let path = '';
      for (let i = 0; i <= 150; i++) {
        const x = i / 150; const y = evaluator(x);
        path += `${i === 0 ? 'M' : 'L'} ${x * 100} ${100 - y * 100} `;
      }
      updatedPaths[ch] = path;
    });
    setSvgPaths(updatedPaths);
  });

  const getCoords = (clientX: number, clientY: number) => {
    const rect = svgRef.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height)) };
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (props.disabled) return;
    const coords = getCoords(e.clientX, e.clientY);
    const channelCurves = [...props.curves[activeChannel()]];
    const existingIndex = channelCurves.findIndex(pt => Math.abs(pt.x - coords.x) < 0.04 && Math.abs(pt.y - coords.y) < 0.04);
    if (existingIndex !== -1) { dragIndex = existingIndex; } 
    else { const newPoint = { x: coords.x, y: coords.y }; channelCurves.push(newPoint); channelCurves.sort((a, b) => a.x - b.x); dragIndex = channelCurves.findIndex(pt => pt.x === newPoint.x); props.setCurves({ ...props.curves, [activeChannel()]: channelCurves }); }
    window.addEventListener('mousemove', handleGlobalMouseMove); window.addEventListener('mouseup', handleGlobalMouseUp);
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (dragIndex === -1 || props.disabled) return;
    const coords = getCoords(e.clientX, e.clientY);
    const channelCurves = [...props.curves[activeChannel()]];
    if (dragIndex === 0) { channelCurves[dragIndex] = { x: 0, y: coords.y }; } else if (dragIndex === channelCurves.length - 1) { channelCurves[dragIndex] = { x: 1, y: coords.y }; } else { const minX = channelCurves[dragIndex - 1].x + 0.01; const maxX = channelCurves[dragIndex + 1].x - 0.01; channelCurves[dragIndex] = { x: Math.max(minX, Math.min(maxX, coords.x)), y: coords.y }; }
    props.setCurves({ ...props.curves, [activeChannel()]: channelCurves });
  };

  const handleGlobalMouseUp = () => { dragIndex = -1; window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); };
  const handleDoubleClick = (e: MouseEvent, index: number) => { e.stopPropagation(); if (props.disabled || index === 0 || index === props.curves[activeChannel()].length - 1) return; const channelCurves = props.curves[activeChannel()].filter((_, i) => i !== index); props.setCurves({ ...props.curves, [activeChannel()]: channelCurves }); };
  onCleanup(() => { window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); });

  const colors = { master: '#ffffff', red: '#ff4b4b', green: '#4ade80', blue: '#60a5fa' };

  return (
    <div style={{ padding: '0 4px', opacity: props.disabled ? 0.4 : 1 }}>
      <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '14px' }}>
        {(['master', 'red', 'green', 'blue'] as CurveChannel[]).map(ch => (
          <button onClick={() => setActiveChannel(ch)} style={{ flex: 1, padding: '5px 0', background: activeChannel() === ch ? '#2a2a2a' : '#1e1e1e', border: `1px solid ${activeChannel() === ch ? '#444' : '#2a2a2a'}`, 'border-radius': '4px', color: activeChannel() === ch ? colors[ch] : '#888', cursor: 'pointer', 'font-size': '10px', 'font-weight': '700', 'text-transform': 'uppercase' }}>{ch === 'master' ? 'RGB' : ch.charAt(0)}</button>
        ))}
      </div>
      <div style={{ position: 'relative', width: '100%', 'aspect-ratio': '1/1', background: '#141414', border: '1px solid #2d2d2d', 'border-radius': '6px', overflow: 'hidden' }}>
        <svg ref={svgRef} viewBox="0 0 100 100" style={{ width: '100%', height: '100%', cursor: 'crosshair', overflow: 'visible' }} onMouseDown={handleMouseDown}>
          <line x1="25" y1="0" x2="25" y2="100" stroke="#222" stroke-width="0.5" /><line x1="50" y1="0" x2="50" y2="100" stroke="#2a2a2a" stroke-width="0.5" /><line x1="75" y1="0" x2="75" y2="100" stroke="#222" stroke-width="0.5" /><line y1="25" x1="0" y2="25" x2="100" stroke="#222" stroke-width="0.5" /><line y1="50" x1="0" y2="50" x2="100" stroke="#2a2a2a" stroke-width="0.5" /><line y1="75" x1="0" y2="75" x2="100" stroke="#222" stroke-width="0.5" />
          
          {/* ULTRA THIN MATCHING HISTOGRAM STROKES */}
          {activeChannel() !== 'red' && <path d={svgPaths().red} fill="none" stroke={colors.red} stroke-width="0.4" opacity="0.25" />}
          {activeChannel() !== 'green' && <path d={svgPaths().green} fill="none" stroke={colors.green} stroke-width="0.4" opacity="0.25" />}
          {activeChannel() !== 'blue' && <path d={svgPaths().blue} fill="none" stroke={colors.blue} stroke-width="0.4" opacity="0.25" />}
          {activeChannel() !== 'master' && <path d={svgPaths().master} fill="none" stroke={colors.master} stroke-width="0.4" opacity="0.25" />}
          
          <path d={svgPaths()[activeChannel()]} fill="none" stroke={colors[activeChannel()]} stroke-width="0.8" style={{ 'pointer-events': 'none' }} />
          {props.curves[activeChannel()].map((pt, i) => (
            <circle cx={pt.x * 100} cy={100 - pt.y * 100} r="1.5" fill={colors[activeChannel()]} stroke="#141414" stroke-width="0.5" style={{ cursor: 'pointer' }} onDoubleClick={(e) => handleDoubleClick(e, i)} />
          ))}
        </svg>
      </div>
    </div>
  );
};
