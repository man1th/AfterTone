import { Component, createEffect, onMount, createSignal, onCleanup, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Eye, EyeOff, RotateCcw, ChevronRight, GripHorizontal } from 'lucide-solid';
import { Slider } from './components/Slider';
import { Viewport } from './components/Viewport';
import { Histogram } from './components/Histogram';
import { ToneCurve, CurveState } from './components/ToneCurve';

declare const window: any;
type PanelId = 'histogram' | 'wb' | 'exposure' | 'hdr' | 'clarity' | 'dehaze' | 'curve' | 'texture' | 'bloom' | 'halation' | 'grain' | 'color_grading' | 'color_mixer' | 'vignette';

const NavBtn: Component<{ icon: string, label: string, onClick?: () => void, active?: boolean, disabled?: boolean }> = (props) => (
  <button onClick={props.onClick} disabled={props.disabled} style={{ opacity: props.disabled ? 0.35 : 1, pointerEvents: props.disabled ? 'none' : 'auto', background: props.active ? '#2a2a2a' : 'transparent', border: 'none', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', gap: '4px', cursor: props.disabled ? 'default' : 'pointer', padding: '6px 14px', 'border-radius': '6px', transition: 'background 0.15s ease' }}>
    <img src={props.icon} alt={props.label} style={{ width: '20px', height: '20px', filter: 'brightness(0) invert(67%)' }} />
    <span style={{ color: '#AAAAAA', 'font-size': '10px', 'text-transform': 'capitalize' }}>{props.label}</span>
  </button>
);

const ColorWheelControl: Component<{ h: number, s: number, disabled: boolean, onChange: (h: number, s: number) => void }> = (props) => {
  let wheelRef!: HTMLDivElement;
  let dragMode: 'inner' | 'outer' | null = null;
  const handleDrag = (e: any) => {
    if (!dragMode || props.disabled || !wheelRef) return;
    const rect = wheelRef.getBoundingClientRect(); const cx = rect.width / 2; const cy = rect.height / 2;
    const dx = e.clientX - rect.left - cx; const dy = e.clientY - rect.top - cy;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI; if (angle < 0) angle += 360;
    if (dragMode === 'outer') { props.onChange(Math.round(angle), props.s); } 
    else { const maxR = 60; const r = Math.min(maxR, Math.sqrt(dx * dx + dy * dy)); props.onChange(Math.round(angle), Math.round((r / maxR) * 100)); }
  };
  const CENTER = 80; const R_OUTER = 70; const R_INNER = 60;
  const innerPos = () => { const r = (props.s / 100) * R_INNER; const rad = props.h * Math.PI / 180; return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) }; };
  const outerPos = () => { const rad = props.h * Math.PI / 180; return { x: CENTER + R_OUTER * Math.cos(rad), y: CENTER + R_OUTER * Math.sin(rad) }; };

  return (
    <div style={{ display: 'flex', 'justify-content': 'center', 'padding': '16px 0', opacity: props.disabled ? 0.4 : 1, 'pointer-events': props.disabled ? 'none' : 'auto' }}>
      <div ref={wheelRef} onPointerDown={(e) => { const rect = wheelRef.getBoundingClientRect(); const cx = rect.width / 2; const cy = rect.height / 2; const dx = e.clientX - rect.left - cx; const dy = e.clientY - rect.top - cy; const dist = Math.sqrt(dx * dx + dy * dy); dragMode = dist > R_INNER ? 'outer' : 'inner'; e.currentTarget.setPointerCapture(e.pointerId); handleDrag(e); }} onPointerMove={handleDrag} onPointerUp={(e) => { dragMode = null; e.currentTarget.releasePointerCapture(e.pointerId); }} style={{ width: '160px', height: '160px', position: 'relative', cursor: 'crosshair', 'touch-action': 'none' }}>
        <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', bottom: '10px', 'border-radius': '50%', border: '4px solid #222' }}></div>
        <div style={{ position: 'absolute', top: '20px', left: '20px', right: '20px', bottom: '20px', 'border-radius': '50%', background: 'radial-gradient(circle, #808080 0%, rgba(128,128,128,0) 65%), conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)', 'box-shadow': '0 4px 12px rgba(0,0,0,0.5)' }}></div>
        <div style={{ position: 'absolute', left: `${outerPos().x}px`, top: `${outerPos().y}px`, width: '12px', height: '12px', background: `hsl(${props.h}, 100%, 50%)`, 'border-radius': '50%', border: '2px solid #fff', transform: 'translate(-50%, -50%)', 'box-shadow': '0 2px 4px rgba(0,0,0,0.5)', 'pointer-events': 'none' }}></div>
        <div style={{ position: 'absolute', left: `${innerPos().x}px`, top: `${innerPos().y}px`, width: '10px', height: '10px', background: 'transparent', 'border-radius': '50%', border: '2px solid #fff', transform: 'translate(-50%, -50%)', 'box-shadow': '0 1px 3px rgba(0,0,0,0.8)', 'pointer-events': 'none' }}></div>
      </div>
    </div>
  );
};

const ColorGradingPanel: Component<{ state: any, bypassed: boolean, update: (field: string, val: number) => void }> = (props) => {
  const [activeTab, setActiveTab] = createSignal<'s' | 'm' | 'h' | 'g'>('s');
  const tabs = [ { id: 's', label: 'Shadows' }, { id: 'm', label: 'Midtones' }, { id: 'h', label: 'Highlights' }, { id: 'g', label: 'Global' } ];
  return (
    <div style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', 'border-bottom': '1px solid #333', 'margin-bottom': '8px' }}>
        {tabs.map(t => (
          <button onClick={() => setActiveTab(t.id as any)} style={{ flex: 1, background: 'none', border: 'none', 'border-bottom': activeTab() === t.id ? '2px solid #aaa' : '2px solid transparent', color: activeTab() === t.id ? '#ddd' : '#666', 'font-size': '10px', 'font-weight': '400', padding: '6px 0', cursor: 'pointer', transition: 'all 0.15s' }}>{t.label}</button>
        ))}
      </div>
      <ColorWheelControl h={props.state[`cg_${activeTab()}_h`]} s={props.state[`cg_${activeTab()}_s`]} disabled={props.bypassed} onChange={(h, s) => { props.update(`cg_${activeTab()}_h`, h); props.update(`cg_${activeTab()}_s`, s); }} />
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
        <Slider label="Hue" value={props.state[`cg_${activeTab()}_h`]} min={0} max={360} disabled={props.bypassed} onChange={(v) => props.update(`cg_${activeTab()}_h`, Math.round(v))} />
        <Slider label="Saturation" value={props.state[`cg_${activeTab()}_s`]} min={0} max={100} disabled={props.bypassed} onChange={(v) => props.update(`cg_${activeTab()}_s`, Math.round(v))} />
        <Slider label="Luminance" value={props.state[`cg_${activeTab()}_l`]} min={-100} max={100} disabled={props.bypassed} onChange={(v) => props.update(`cg_${activeTab()}_l`, Math.round(v))} />
      </div>
    </div>
  );
};

const MIXER_COLORS = [
  { id: 'r', label: 'Red', hex: '#ef4444', hGrad: 'linear-gradient(to right, #ec4899, #ef4444, #f97316)' },
  { id: 'o', label: 'Orange', hex: '#f97316', hGrad: 'linear-gradient(to right, #ef4444, #f97316, #eab308)' },
  { id: 'y', label: 'Yellow', hex: '#eab308', hGrad: 'linear-gradient(to right, #f97316, #eab308, #22c55e)' },
  { id: 'g', label: 'Green', hex: '#22c55e', hGrad: 'linear-gradient(to right, #eab308, #22c55e, #06b6d4)' },
  { id: 'a', label: 'Aqua', hex: '#06b6d4', hGrad: 'linear-gradient(to right, #22c55e, #06b6d4, #3b82f6)' },
  { id: 'b', label: 'Blue', hex: '#3b82f6', hGrad: 'linear-gradient(to right, #06b6d4, #3b82f6, #a855f7)' },
  { id: 'p', label: 'Purple', hex: '#a855f7', hGrad: 'linear-gradient(to right, #3b82f6, #a855f7, #ec4899)' },
  { id: 'm', label: 'Magenta', hex: '#ec4899', hGrad: 'linear-gradient(to right, #a855f7, #ec4899, #ef4444)' }
];

const RadioBtn: Component<{ active: boolean, label: string, onClick: () => void }> = (props) => (
  <div onClick={props.onClick} style={{ display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}>
    <div style={{ width: '12px', height: '12px', 'border-radius': '50%', border: props.active ? '4px solid #aaa' : '1px solid #555', transition: 'all 0.15s', boxSizing: 'border-box' }}></div>
    <span style={{ 'font-size': '10px', color: props.active ? '#ddd' : '#888', 'font-weight': props.active ? '600' : '400' }}>{props.label}</span>
  </div>
);

const ColorMixerPanel: Component<{ state: any, bypassed: boolean, update: (field: string, val: number) => void }> = (props) => {
  const [mode, setMode] = createSignal<'hsl'|'color'>('hsl');
  const [activeColor, setActiveColor] = createSignal<string>('r');

  return (
    <div style={{ padding: '12px 14px' }}>
      <style>{`
        .color-mixer-square { width: 22px; height: 22px; border-radius: 4px; cursor: pointer; transition: all 0.1s; flex-shrink: 0; }
        .color-mixer-square.active { box-shadow: 0 0 0 2px #1e1e1e, 0 0 0 4px #aaa; transform: scale(1.05); }
        .hide-spinners::-webkit-inner-spin-button, .hide-spinners::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .hide-spinners { -moz-appearance: textfield; }
      `}</style>
      
      <div style={{ display: 'flex', 'align-items': 'center', gap: '16px', 'margin-bottom': '16px' }}>
        <span style={{ 'font-size': '11px', color: '#888' }}>Adjust:</span>
        <RadioBtn active={mode() === 'hsl'} label="HSL" onClick={() => setMode('hsl')} />
        <RadioBtn active={mode() === 'color'} label="Colour" onClick={() => setMode('color')} />
      </div>

      {mode() === 'color' && (
        <>
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '16px', padding: '4px 0' }}>
            {MIXER_COLORS.map(c => (
              <div 
                onClick={() => setActiveColor(c.id)} 
                class={`color-mixer-square ${activeColor() === c.id ? 'active' : ''}`}
                style={{ background: c.hex, opacity: props.bypassed ? 0.4 : 1 }} 
              />
            ))}
          </div>
          {MIXER_COLORS.map(c => activeColor() === c.id && (
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              <Slider label="Hue" value={props.state[`cm_h_${c.id}`]} disabled={props.bypassed} onChange={(v) => props.update(`cm_h_${c.id}`, v)} trackBg={c.hGrad} />
              <Slider label="Saturation" value={props.state[`cm_s_${c.id}`]} disabled={props.bypassed} onChange={(v) => props.update(`cm_s_${c.id}`, v)} trackBg={`linear-gradient(to right, #808080, ${c.hex})`} />
              <Slider label="Luminance" value={props.state[`cm_l_${c.id}`]} disabled={props.bypassed} onChange={(v) => props.update(`cm_l_${c.id}`, v)} trackBg={`linear-gradient(to right, #000, ${c.hex}, #fff)`} />
            </div>
          ))}
        </>
      )}

      {mode() === 'hsl' && (
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
          <div>
            <div style={{ 'font-size': '11px', color: '#ccc', 'margin-bottom': '8px', 'font-weight': '400', 'text-transform': 'capitalize', 'letter-spacing': '0.5px' }}>Hue</div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              {MIXER_COLORS.map(c => <Slider label={c.label} value={props.state[`cm_h_${c.id}`]} disabled={props.bypassed} onChange={(v) => props.update(`cm_h_${c.id}`, v)} trackBg={c.hGrad} />)}
            </div>
          </div>
          <div style={{ height: '1px', background: '#333' }}></div>
          <div>
            <div style={{ 'font-size': '11px', color: '#ccc', 'margin-bottom': '8px', 'font-weight': '400', 'text-transform': 'capitalize', 'letter-spacing': '0.5px' }}>Saturation</div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              {MIXER_COLORS.map(c => <Slider label={c.label} value={props.state[`cm_s_${c.id}`]} disabled={props.bypassed} onChange={(v) => props.update(`cm_s_${c.id}`, v)} trackBg={`linear-gradient(to right, #808080, ${c.hex})`} />)}
            </div>
          </div>
          <div style={{ height: '1px', background: '#333' }}></div>
          <div>
            <div style={{ 'font-size': '11px', color: '#ccc', 'margin-bottom': '8px', 'font-weight': '400', 'text-transform': 'capitalize', 'letter-spacing': '0.5px' }}>Luminance</div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
              {MIXER_COLORS.map(c => <Slider label={c.label} value={props.state[`cm_l_${c.id}`]} disabled={props.bypassed} onChange={(v) => props.update(`cm_l_${c.id}`, v)} trackBg={`linear-gradient(to right, #000, ${c.hex}, #fff)`} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const App: Component = () => {
  const [lightState, setLightState] = createStore({ 
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, texture: 0, clarity: 0, dehaze: 0, temp: 0, tint: 0, vibrance: 0, saturation: 0, 
    hal_thresh: 85, hal_radius: 20, hal_intensity: 0, hal_color: '#ff3300', show_hal_map: false, bloom_intensity: 0,
    grain_amount: 0, grain_size: 35, grain_roughness: 25, grain_color_variance: 0,
    cg_s_h: 210, cg_s_s: 0, cg_s_l: 0, cg_m_h: 30, cg_m_s: 0, cg_m_l: 0, cg_h_h: 45, cg_h_s: 0, cg_h_l: 0, cg_g_h: 0, cg_g_s: 0, cg_g_l: 0,
    cm_h_r: 0, cm_s_r: 0, cm_l_r: 0, cm_h_o: 0, cm_s_o: 0, cm_l_o: 0, cm_h_y: 0, cm_s_y: 0, cm_l_y: 0, cm_h_g: 0, cm_s_g: 0, cm_l_g: 0, cm_h_a: 0, cm_s_a: 0, cm_l_a: 0, cm_h_b: 0, cm_s_b: 0, cm_l_b: 0, cm_h_p: 0, cm_s_p: 0, cm_l_p: 0, cm_h_m: 0, cm_s_m: 0, cm_l_m: 0,
    vig_amount: 0, vig_midpoint: 50, vig_roundness: 0, vig_feather: 50,
    enabled: true 
  });
  
  const [isWasmReady, setIsWasmReady] = createSignal(false); const [isCompare, setIsCompare] = createSignal(false); const [isOriginal, setIsOriginal] = createSignal(false);
  const [hasImage, setHasImage] = createSignal(false); 
  const [histogramData, setHistogramData] = createSignal<number[]>(new Array(1024).fill(0)); const [hoverLuminance, setHoverLuminance] = createSignal<number | null>(null); const [metadata, setMetadata] = createSignal({ iso: '---', shutter: '---', fstop: '---' });
  
  const [panelOrder, setPanelOrder] = createSignal<PanelId[]>(['histogram', 'wb', 'exposure', 'hdr', 'clarity', 'dehaze', 'vignette', 'curve', 'texture', 'color_mixer', 'color_grading', 'bloom', 'halation', 'grain']);
  const [draggedIndex, setDraggedIndex] = createSignal<number | null>(null);
  const [expanded, setExpanded] = createStore<Record<PanelId, boolean>>({ histogram: true, wb: true, exposure: false, hdr: false, clarity: false, dehaze: false, curve: false, texture: false, halation: false, bloom: false, grain: false, color_grading: false, color_mixer: false, vignette: false });
  const [bypassed, setBypassed] = createStore<Record<string, boolean>>({ wb: false, exposure: false, hdr: false, clarity: false, dehaze: false, curve: false, texture: false, halation: false, bloom: false, grain: false, color_grading: false, color_mixer: false, vignette: false });
  const [activeSliderName, setActiveSliderName] = createSignal<string | null>(null);

  const defaultCurves = (): CurveState => ({ master: [{x:0,y:0}, {x:1,y:1}], red: [{x:0,y:0}, {x:1,y:1}], green: [{x:0,y:0}, {x:1,y:1}], blue: [{x:0,y:0}, {x:1,y:1}] });
  const [curves, setCurves] = createSignal<CurveState>(defaultCurves());
  let triggerExport: () => void = () => {}; let triggerImport: () => void = () => {};

  onMount(() => { const initBackend = () => { setIsWasmReady(true); window.Module.ccall('init_backend', 'number', [], []); }; if (typeof window.Module !== 'undefined' && window.Module.ccall) { initBackend(); } else { window.addEventListener('wasm-ready', initBackend); onCleanup(() => window.removeEventListener('wasm-ready', initBackend)); } });

  const getProcessedLightState = () => ({
    exposure: bypassed.exposure ? 0 : lightState.exposure, contrast: bypassed.exposure ? 0 : lightState.contrast, highlights: bypassed.hdr ? 0 : lightState.highlights, shadows: bypassed.hdr ? 0 : lightState.shadows, whites: bypassed.hdr ? 0 : lightState.whites, blacks: bypassed.hdr ? 0 : lightState.blacks, texture: bypassed.texture ? 0 : lightState.texture, clarity: bypassed.clarity ? 0 : lightState.clarity, dehaze: bypassed.dehaze ? 0 : lightState.dehaze, temp: bypassed.wb ? 0 : lightState.temp, tint: bypassed.wb ? 0 : lightState.tint, vibrance: bypassed.exposure ? 0 : lightState.vibrance, saturation: bypassed.exposure ? 0 : lightState.saturation, 
    hal_thresh: bypassed.halation ? 80 : lightState.hal_thresh, hal_radius: bypassed.halation ? 0 : lightState.hal_radius, hal_intensity: bypassed.halation ? 0 : lightState.hal_intensity, hal_color: lightState.hal_color, show_hal_map: lightState.show_hal_map,
    bloom_intensity: bypassed.bloom ? 0 : lightState.bloom_intensity,
    grain_amount: bypassed.grain ? 0 : lightState.grain_amount, grain_size: lightState.grain_size, grain_roughness: lightState.grain_roughness, grain_color_variance: lightState.grain_color_variance,
    cg_s_h: bypassed.color_grading ? 0 : lightState.cg_s_h, cg_s_s: bypassed.color_grading ? 0 : lightState.cg_s_s, cg_s_l: bypassed.color_grading ? 0 : lightState.cg_s_l,
    cg_m_h: bypassed.color_grading ? 0 : lightState.cg_m_h, cg_m_s: bypassed.color_grading ? 0 : lightState.cg_m_s, cg_m_l: bypassed.color_grading ? 0 : lightState.cg_m_l,
    cg_h_h: bypassed.color_grading ? 0 : lightState.cg_h_h, cg_h_s: bypassed.color_grading ? 0 : lightState.cg_h_s, cg_h_l: bypassed.color_grading ? 0 : lightState.cg_h_l,
    cg_g_h: bypassed.color_grading ? 0 : lightState.cg_g_h, cg_g_s: bypassed.color_grading ? 0 : lightState.cg_g_s, cg_g_l: bypassed.color_grading ? 0 : lightState.cg_g_l,
    cm_h_r: bypassed.color_mixer ? 0 : lightState.cm_h_r, cm_s_r: bypassed.color_mixer ? 0 : lightState.cm_s_r, cm_l_r: bypassed.color_mixer ? 0 : lightState.cm_l_r,
    cm_h_o: bypassed.color_mixer ? 0 : lightState.cm_h_o, cm_s_o: bypassed.color_mixer ? 0 : lightState.cm_s_o, cm_l_o: bypassed.color_mixer ? 0 : lightState.cm_l_o,
    cm_h_y: bypassed.color_mixer ? 0 : lightState.cm_h_y, cm_s_y: bypassed.color_mixer ? 0 : lightState.cm_s_y, cm_l_y: bypassed.color_mixer ? 0 : lightState.cm_l_y,
    cm_h_g: bypassed.color_mixer ? 0 : lightState.cm_h_g, cm_s_g: bypassed.color_mixer ? 0 : lightState.cm_s_g, cm_l_g: bypassed.color_mixer ? 0 : lightState.cm_l_g,
    cm_h_a: bypassed.color_mixer ? 0 : lightState.cm_h_a, cm_s_a: bypassed.color_mixer ? 0 : lightState.cm_s_a, cm_l_a: bypassed.color_mixer ? 0 : lightState.cm_l_a,
    cm_h_b: bypassed.color_mixer ? 0 : lightState.cm_h_b, cm_s_b: bypassed.color_mixer ? 0 : lightState.cm_s_b, cm_l_b: bypassed.color_mixer ? 0 : lightState.cm_l_b,
    cm_h_p: bypassed.color_mixer ? 0 : lightState.cm_h_p, cm_s_p: bypassed.color_mixer ? 0 : lightState.cm_s_p, cm_l_p: bypassed.color_mixer ? 0 : lightState.cm_l_p,
    cm_h_m: bypassed.color_mixer ? 0 : lightState.cm_h_m, cm_s_m: bypassed.color_mixer ? 0 : lightState.cm_s_m, cm_l_m: bypassed.color_mixer ? 0 : lightState.cm_l_m,
    vig_amount: bypassed.vignette ? 0 : lightState.vig_amount, vig_midpoint: bypassed.vignette ? 50 : lightState.vig_midpoint, vig_roundness: bypassed.vignette ? 0 : lightState.vig_roundness, vig_feather: bypassed.vignette ? 50 : lightState.vig_feather,
    enabled: lightState.enabled
  });

  const getActiveSliderVal = () => { 
    const name = activeSliderName(); 
    if (name === 'Exposure') return lightState.exposure; 
    if (name === 'Contrast') return lightState.contrast; 
    if (name === 'Shadows') return lightState.shadows; 
    if (name === 'Threshold') return lightState.hal_thresh;
    if (name === 'Gaussian Blur (px)') return lightState.hal_radius;
    return null; 
  };
  
  const resetAllToOriginal = () => { setLightState({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, texture: 0, clarity: 0, dehaze: 0, temp: 0, tint: 0, vibrance: 0, saturation: 0, hal_thresh: 85, hal_radius: 20, hal_intensity: 0, bloom_intensity: 0, grain_amount: 0, grain_size: 35, grain_roughness: 25, grain_color_variance: 0, cg_s_h: 210, cg_s_s: 0, cg_s_l: 0, cg_m_h: 30, cg_m_s: 0, cg_m_l: 0, cg_h_h: 45, cg_h_s: 0, cg_h_l: 0, cg_g_h: 0, cg_g_s: 0, cg_g_l: 0, cm_h_r: 0, cm_s_r: 0, cm_l_r: 0, cm_h_o: 0, cm_s_o: 0, cm_l_o: 0, cm_h_y: 0, cm_s_y: 0, cm_l_y: 0, cm_h_g: 0, cm_s_g: 0, cm_l_g: 0, cm_h_a: 0, cm_s_a: 0, cm_l_a: 0, cm_h_b: 0, cm_s_b: 0, cm_l_b: 0, cm_h_p: 0, cm_s_p: 0, cm_l_p: 0, cm_h_m: 0, cm_s_m: 0, cm_l_m: 0, vig_amount: 0, vig_midpoint: 50, vig_roundness: 0, vig_feather: 50 }); setCurves(defaultCurves()); };

  const panelMeta: Record<PanelId, { title: string, features: boolean, reset: () => void }> = {
    histogram: { title: 'Histogram', features: false, reset: () => {} }, wb: { title: 'White Balance', features: true, reset: () => setLightState({ temp: 0, tint: 0 }) }, exposure: { title: 'Exposure', features: true, reset: () => setLightState({ exposure: 0, contrast: 0, saturation: 0, vibrance: 0 }) }, hdr: { title: 'High Dynamic Range', features: true, reset: () => setLightState({ highlights: 0, shadows: 0, whites: 0, blacks: 0 }) }, clarity: { title: 'Clarity', features: true, reset: () => setLightState({ clarity: 0 }) }, dehaze: { title: 'Dehaze', features: true, reset: () => setLightState({ dehaze: 0 }) }, curve: { title: 'Tone Curve', features: true, reset: () => setCurves(defaultCurves()) }, texture: { title: 'Texture', features: true, reset: () => setLightState({ texture: 0 }) },
    vignette: { title: 'Vignette', features: true, reset: () => setLightState({ vig_amount: 0, vig_midpoint: 50, vig_roundness: 0, vig_feather: 50 }) },
    halation: { title: 'Halation', features: true, reset: () => setLightState({ hal_thresh: 85, hal_radius: 20, hal_intensity: 0 }) },
    bloom: { title: 'Bloom', features: true, reset: () => setLightState({ bloom_intensity: 0 }) },
    grain: { title: 'Film Grain', features: true, reset: () => setLightState({ grain_amount: 0, grain_size: 35, grain_roughness: 25, grain_color_variance: 0 }) },
    color_grading: { title: 'Colour Grading', features: true, reset: () => setLightState({ cg_s_h: 210, cg_s_s: 0, cg_s_l: 0, cg_m_h: 30, cg_m_s: 0, cg_m_l: 0, cg_h_h: 45, cg_h_s: 0, cg_h_l: 0, cg_g_h: 0, cg_g_s: 0, cg_g_l: 0 }) },
    color_mixer: { title: 'Colour Mixer', features: true, reset: () => setLightState({ cm_h_r: 0, cm_s_r: 0, cm_l_r: 0, cm_h_o: 0, cm_s_o: 0, cm_l_o: 0, cm_h_y: 0, cm_s_y: 0, cm_l_y: 0, cm_h_g: 0, cm_s_g: 0, cm_l_g: 0, cm_h_a: 0, cm_s_a: 0, cm_l_a: 0, cm_h_b: 0, cm_s_b: 0, cm_l_b: 0, cm_h_p: 0, cm_s_p: 0, cm_l_p: 0, cm_h_m: 0, cm_s_m: 0, cm_l_m: 0 }) }
  };

  const renderContent = (id: PanelId) => {
    switch (id) {
      case 'histogram': return <div style={{ padding: '16px 14px' }}><Histogram data={histogramData()} hoverLuminance={hoverLuminance()} metadata={metadata()} activeSlider={activeSliderName() ? { name: activeSliderName()!, value: getActiveSliderVal()! } : null} /></div>;
      case 'wb': return (
        <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
          <Slider label="Temperature" value={lightState.temp} disabled={bypassed.wb} onChange={(v) => setLightState('temp', v)} trackBg="linear-gradient(to right, #3b82f6, #808080, #eab308)" />
          <Slider label="Tint" value={lightState.tint} disabled={bypassed.wb} onChange={(v) => setLightState('tint', v)} trackBg="linear-gradient(to right, #22c55e, #808080, #ec4899)" />
        </div>
      );
      case 'exposure': return (
        <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
          <div onMouseEnter={() => setActiveSliderName('Exposure')} onMouseLeave={() => setActiveSliderName(null)}><Slider label="Exposure" value={lightState.exposure} disabled={bypassed.exposure} onChange={(v) => setLightState('exposure', v)} /></div>
          <Slider label="Contrast" value={lightState.contrast} disabled={bypassed.exposure} onChange={(v) => setLightState('contrast', v)} />
          <Slider label="Saturation" value={lightState.saturation} disabled={bypassed.exposure} onChange={(v) => setLightState('saturation', v)} trackBg="linear-gradient(to right, #808080 35%, #8b5cf6, #3b82f6, #10b981, #eab308, #f97316, #ef4444)" />
          <Slider label="Vibrance" value={lightState.vibrance} disabled={bypassed.exposure} onChange={(v) => setLightState('vibrance', v)} trackBg="linear-gradient(to right, #808080 35%, #8b5cf6, #3b82f6, #10b981, #eab308, #f97316, #ef4444)" />
        </div>
      );
      case 'hdr': return (
        <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
          <div onMouseEnter={() => setActiveSliderName('Highlights')} onMouseLeave={() => setActiveSliderName(null)}><Slider label="Highlights" value={lightState.highlights} disabled={bypassed.hdr} onChange={(v) => setLightState('highlights', v)} /></div>
          <div onMouseEnter={() => setActiveSliderName('Shadows')} onMouseLeave={() => setActiveSliderName(null)}><Slider label="Shadows" value={lightState.shadows} disabled={bypassed.hdr} onChange={(v) => setLightState('shadows', v)} /></div>
          <Slider label="Whites" value={lightState.whites} disabled={bypassed.hdr} onChange={(v) => setLightState('whites', v)} />
          <Slider label="Blacks" value={lightState.blacks} disabled={bypassed.hdr} onChange={(v) => setLightState('blacks', v)} />
        </div>
      );
      case 'clarity': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Clarity" value={lightState.clarity} disabled={bypassed.clarity} onChange={(v) => setLightState('clarity', v)} /></div>;
      case 'dehaze': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Dehaze" value={lightState.dehaze} disabled={bypassed.dehaze} onChange={(v) => setLightState('dehaze', v)} /></div>;
      case 'curve': return <div style={{ padding: '16px 14px' }}><ToneCurve curves={curves()} setCurves={setCurves} disabled={bypassed.curve} /></div>;
      case 'texture': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Texture" value={lightState.texture} disabled={bypassed.texture} onChange={(v) => setLightState('texture', v)} /></div>;
      case 'vignette': return (
        <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
          <Slider label="Amount" value={lightState.vig_amount} min={-100} max={100} disabled={bypassed.vignette} onChange={(v) => setLightState('vig_amount', v)} />
          <Slider label="Midpoint" value={lightState.vig_midpoint} min={0} max={100} disabled={bypassed.vignette} onChange={(v) => setLightState('vig_midpoint', v)} />
          <Slider label="Roundness" value={lightState.vig_roundness} min={-100} max={100} disabled={bypassed.vignette} onChange={(v) => setLightState('vig_roundness', v)} />
          <Slider label="Feather" value={lightState.vig_feather} min={0} max={100} disabled={bypassed.vignette} onChange={(v) => setLightState('vig_feather', v)} />
        </div>
      );
      case 'bloom': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Intensity" value={lightState.bloom_intensity} min={0} max={100} disabled={bypassed.bloom} onChange={(v) => setLightState('bloom_intensity', v)} /></div>;
      case 'color_grading': return <ColorGradingPanel state={lightState} bypassed={bypassed.color_grading} update={setLightState as any} />;
      case 'color_mixer': return <ColorMixerPanel state={lightState} bypassed={bypassed.color_mixer} update={setLightState as any} />;
      case 'halation': return (
        <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <div style={{ flex: 1 }} onMouseEnter={() => setActiveSliderName('Threshold')} onMouseLeave={() => setActiveSliderName(null)}>
              <Slider label="Threshold" value={lightState.hal_thresh} min={0} max={100} disabled={bypassed.halation} onChange={(v) => setLightState('hal_thresh', v)} />
            </div>
            <button 
              onClick={() => setLightState('show_hal_map', !lightState.show_hal_map)} 
              disabled={bypassed.halation} 
              title="Toggle Binary View"
              style={{ background: lightState.show_hal_map ? '#e0e0e0' : '#222', color: lightState.show_hal_map ? '#111' : '#aaa', border: '1px solid #444', 'border-radius': '4px', padding: '0 6px', 'font-size': '9px', 'font-weight': '800', cursor: bypassed.halation ? 'default' : 'pointer', height: '20px', 'margin-bottom': '6px', transition: 'all 0.15s' }}
            >
              B/W
            </button>
          </div>
          <div onMouseEnter={() => setActiveSliderName('Gaussian Blur (px)')} onMouseLeave={() => setActiveSliderName(null)}>
            <Slider label="Radius (px)" value={lightState.hal_radius} min={0} max={100} disabled={bypassed.halation} onChange={(v) => setLightState('hal_radius', v)} />
          </div>
          <Slider label="Intensity" value={lightState.hal_intensity} min={0} max={100} disabled={bypassed.halation} onChange={(v) => setLightState('hal_intensity', v)} />
          <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '6px 0', 'margin-top': '4px', opacity: bypassed.halation ? 0.4 : 1 }}>
            <span style={{ 'font-size': '10px', color: '#b0b0b0', 'text-transform': 'capitalize' }}>Halation Color</span>
            <input type="color" value={lightState.hal_color} disabled={bypassed.halation} onInput={(e) => setLightState('hal_color', e.currentTarget.value)} style={{ background: 'none', border: '1px solid #444', 'border-radius': '4px', cursor: 'pointer', height: '22px', width: '32px', padding: 0 }} />
          </div>
        </div>
      );
      case 'grain': return (
        <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
          <Slider label="Amount" value={lightState.grain_amount} min={0} max={100} disabled={bypassed.grain} onChange={(v) => setLightState('grain_amount', v)} />
          <Slider label="Size" value={lightState.grain_size} min={0} max={100} disabled={bypassed.grain} onChange={(v) => setLightState('grain_size', v)} />
          <Slider label="Roughness" value={lightState.grain_roughness} min={0} max={100} disabled={bypassed.grain} onChange={(v) => setLightState('grain_roughness', v)} />
          <Slider label="Color Variance" value={lightState.grain_color_variance} min={0} max={100} disabled={bypassed.grain} onChange={(v) => setLightState('grain_color_variance', v)} />
        </div>
      );
    }
  };

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100vh', width: '100vw' }}>
      <header style={{ height: '64px', background: '#050505', 'border-bottom': '1px solid #282828', display: 'flex', 'align-items': 'center', padding: '0 16px' }}>
        <img src="/assets/brand/logo.svg" alt="Logo" style={{ height: '20px' }} />
        <div style={{ width: '1px', height: '28px', background: '#333', margin: '0 16px' }}></div>
        <div style={{ display: 'flex', gap: '2px', 'align-items': 'center' }}>
          <NavBtn icon="/assets/icons/import.svg" label="Import" onClick={() => triggerImport()} />
          <NavBtn icon="/assets/icons/export.svg" label="Export" onClick={() => triggerExport()} disabled={!hasImage()} />
          <div style={{ width: '1px', height: '28px', background: '#333', margin: '0 12px' }}></div>
          <NavBtn icon="/assets/icons/original.svg" label="Reset" onClick={resetAllToOriginal} disabled={!hasImage()} />
          <NavBtn icon="/assets/icons/undo.svg" label="Undo" disabled={!hasImage()} />
          <NavBtn icon="/assets/icons/redo.svg" label="Redo" disabled={!hasImage()} />
          <div style={{ width: '1px', height: '28px', background: '#333', margin: '0 12px' }}></div>
          <NavBtn icon={isOriginal() ? "/assets/icons/eye-closed.svg" : "/assets/icons/eye-open.svg"} label="Original" onClick={() => setIsOriginal(!isOriginal())} disabled={!hasImage()} />
          <NavBtn icon="/assets/icons/compare.svg" label="Compare" active={isCompare()} onClick={() => setIsCompare(!isCompare())} disabled={!hasImage()} />
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <main style={{ flex: 1, background: 'transparent' }}>
          <Viewport lightState={isOriginal() ? { ...getProcessedLightState(), enabled: false } : getProcessedLightState()} curves={(!bypassed.curve && !isOriginal()) ? curves() : defaultCurves()} isCompare={isCompare()} isOriginal={isOriginal()} onHistogramUpdate={setHistogramData} onHoverLuminance={setHoverLuminance} onMetadataUpdate={setMetadata} getExportFn={(fn) => triggerExport = fn} getImportFn={(fn) => triggerImport = fn} onImageChange={setHasImage} />
        </main>

        <aside style={{ width: '310px', background: '#1a1a1a', 'border-left': '1px solid #282828', 'overflow-y': 'auto' }}>
          <For each={panelOrder()}>
            {(id, index) => (
              <div onDragOver={(e) => { e.preventDefault(); const c = draggedIndex(); if (c !== null && c !== index()) { const o = [...panelOrder()]; o.splice(index(), 0, o.splice(c, 1)[0]); setPanelOrder(o); setDraggedIndex(index()); } }} style={{ opacity: draggedIndex() === index() ? 0.3 : 1 }}>
                <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '8px 14px', background: '#1e1e1e', 'border-bottom': '1px solid #282828', cursor: 'pointer' }} onClick={() => setExpanded(id, !expanded[id])}>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}><ChevronRight size={14} color="#888" style={{ transform: expanded[id] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} /><span style={{ 'font-size': '11px', color: '#AAAAAA' }}>{panelMeta[id].title}</span></div>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    {panelMeta[id].features && (
                      <><button onClick={(e) => { e.stopPropagation(); setBypassed(id, !bypassed[id]); }} style={{ background: 'none', border: 'none', color: bypassed[id] ? '#444' : '#aaa', cursor: 'pointer', display: 'flex', padding: 0 }}>{bypassed[id] ? <EyeOff size={14} /> : <Eye size={14} />}</button><button onClick={(e) => { e.stopPropagation(); panelMeta[id].reset(); }} style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', display: 'flex', padding: 0 }}><RotateCcw size={12} /></button></>
                    )}
                    <div draggable="true" onDragStart={(e) => { setDraggedIndex(index()); e.dataTransfer!.effectAllowed = 'move'; }} onDragEnd={() => setDraggedIndex(null)} class="drag-handle" style={{ cursor: 'grab', color: '#555', display: 'flex', padding: '2px' }}><GripHorizontal size={14} /></div>
                  </div>
                </div>
                {expanded[id] && <div style={{ 'border-bottom': '1px solid #282828' }}>{renderContent(id)}</div>}
              </div>
            )}
          </For>
        </aside>
      </div>
    </div>
  );
};
export default App;
