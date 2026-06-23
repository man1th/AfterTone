import { Component, createEffect, onMount, createSignal, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Eye, EyeOff, RotateCcw, ChevronRight } from 'lucide-solid';
import { Slider } from './components/Slider';
import { Viewport } from './components/Viewport';
import { Histogram } from './components/Histogram';
import { ToneCurve, CurveState } from './components/ToneCurve';

declare const window: any;

const App: Component = () => {
  const [lightState, setLightState] = createStore({ 
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, 
    texture: 0, clarity: 0, dehaze: 0, temp: 0, tint: 0, vibrance: 0, saturation: 0, 
    enabled: true 
  });
  
  const [isWasmReady, setIsWasmReady] = createSignal(false);
  const [histogramData, setHistogramData] = createSignal<number[]>(new Array(1024).fill(0));
  const [hoverLuminance, setHoverLuminance] = createSignal<number | null>(null);
  const [metadata, setMetadata] = createSignal({ iso: '---', shutter: '---', fstop: '---' });
  
  // Sidebar Panel Expand States
  const [histogramExpanded, setHistogramExpanded] = createSignal(true);
  const [lightExpanded, setLightExpanded] = createSignal(true);
  const [curveExpanded, setCurveExpanded] = createSignal(true);
  const [curveEnabled, setCurveEnabled] = createSignal(true);
  
  const defaultCurves = (): CurveState => ({
    master: [{x:0,y:0}, {x:1,y:1}], red: [{x:0,y:0}, {x:1,y:1}],
    green: [{x:0,y:0}, {x:1,y:1}], blue: [{x:0,y:0}, {x:1,y:1}]
  });
  const [curves, setCurves] = createSignal<CurveState>(defaultCurves());

  let triggerExport: () => void = () => {};

  onMount(() => {
    const initBackend = () => { setIsWasmReady(true); window.Module.ccall('init_backend', 'number', [], []); };
    if (typeof window.Module !== 'undefined' && window.Module.ccall) { initBackend(); } 
    else { window.addEventListener('wasm-ready', initBackend); onCleanup(() => window.removeEventListener('wasm-ready', initBackend)); }
  });

  createEffect(() => {
    if (!isWasmReady()) return;
    const params = [lightState.exposure, lightState.contrast, lightState.highlights, lightState.shadows, lightState.whites, lightState.blacks, lightState.texture, lightState.clarity, lightState.dehaze, lightState.temp, lightState.tint, lightState.vibrance, lightState.saturation];
    window.Module.ccall('update_light_params', 'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'], lightState.enabled ? params : [0,0,0,0,0,0,0,0,0,0,0,0,0]);
  });

  const resetLightParams = () => setLightState({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, texture: 0, clarity: 0, dehaze: 0, temp: 0, tint: 0, vibrance: 0, saturation: 0 });

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100vh', width: '100vw' }}>
      <header style={{ height: '44px', background: '#1c1c1c', 'border-bottom': '1px solid #282828', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '0 16px' }}>
        <img src="/assets/brand/logo.svg" alt="Aftertone Logo" style={{ height: '16px' }} />
        <div style={{ display: 'flex', gap: '12px', 'align-items': 'center' }}>
          <span style={{ 'font-size': '10px', color: isWasmReady() ? '#4ade80' : '#f87171', 'text-transform': 'uppercase', 'letter-spacing': '1px' }}>{isWasmReady() ? 'Core Online' : 'Booting...'}</span>
          <button onClick={() => triggerExport()} style={{ background: '#333', color: '#e0e0e0', border: '1px solid #444', padding: '4px 14px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '11px', 'font-weight': '600', transition: 'background 0.2s' }}>Export</button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        <main style={{ flex: 1, background: '#111', position: 'relative' }}>
          <Viewport lightState={lightState} curves={curveEnabled() ? curves() : defaultCurves()} onHistogramUpdate={setHistogramData} onHoverLuminance={setHoverLuminance} onMetadataUpdate={setMetadata} getExportFn={(fn) => triggerExport = fn} />
        </main>

        <aside style={{ width: '310px', background: '#1a1a1a', 'border-left': '1px solid #282828', display: 'flex', 'flex-direction': 'column', 'user-select': 'none' }}>
          <div style={{ flex: 1, 'overflow-y': 'auto' }}>
            
            {/* --- HISTOGRAM GROUP --- */}
            <div 
              style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '8px 14px', background: '#1e1e1e', 'border-bottom': '1px solid #282828', cursor: 'pointer' }} 
              onClick={() => setHistogramExpanded(!histogramExpanded())}
            >
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <ChevronRight size={14} color="#888" style={{ transform: histogramExpanded() ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                <span style={{ 'font-weight': '700', 'font-size': '11px', color: '#e0e0e0', 'text-transform': 'uppercase', 'letter-spacing': '1px' }}>Histogram</span>
              </div>
            </div>
            {histogramExpanded() && (
              <div style={{ padding: '16px 14px', 'border-bottom': '1px solid #282828' }}>
                <Histogram data={histogramData()} hoverLuminance={hoverLuminance()} metadata={metadata()} />
              </div>
            )}

            {/* --- LIGHT GROUP --- */}
            <div 
              style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '8px 14px', background: '#1e1e1e', 'border-bottom': '1px solid #282828', cursor: 'pointer' }} 
              onClick={() => setLightExpanded(!lightExpanded())}
            >
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <ChevronRight size={14} color="#888" style={{ transform: lightExpanded() ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                <span style={{ 'font-weight': '700', 'font-size': '11px', color: '#e0e0e0', 'text-transform': 'uppercase', 'letter-spacing': '1px' }}>Light</span>
              </div>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
                <button onClick={(e) => { e.stopPropagation(); setLightState('enabled', e => !e); }} style={{ background: 'none', border: 'none', color: lightState.enabled ? '#aaa' : '#444', cursor: 'pointer', padding: '0', display: 'flex' }}>
                  {lightState.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); resetLightParams(); }} style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', padding: '0', display: 'flex' }}>
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>
            {lightExpanded() && (
              <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px', 'border-bottom': '1px solid #282828' }}>
                <Slider label="Exposure" value={lightState.exposure} disabled={!lightState.enabled} onChange={(v) => setLightState('exposure', v)} />
                <Slider label="Contrast" value={lightState.contrast} disabled={!lightState.enabled} onChange={(v) => setLightState('contrast', v)} />
                <Slider label="Highlights" value={lightState.highlights} disabled={!lightState.enabled} onChange={(v) => setLightState('highlights', v)} />
                <Slider label="Shadows" value={lightState.shadows} disabled={!lightState.enabled} onChange={(v) => setLightState('shadows', v)} />
                <Slider label="Whites" value={lightState.whites} disabled={!lightState.enabled} onChange={(v) => setLightState('whites', v)} />
                <Slider label="Blacks" value={lightState.blacks} disabled={!lightState.enabled} onChange={(v) => setLightState('blacks', v)} />
                <div style={{ 'font-weight': '600', 'font-size': '10px', color: '#777', 'text-transform': 'uppercase', 'letter-spacing': '0.5px', margin: '20px 0 12px 0' }}>Presence</div>
                <Slider label="Texture" value={lightState.texture} disabled={!lightState.enabled} onChange={(v) => setLightState('texture', v)} />
                <Slider label="Clarity" value={lightState.clarity} disabled={!lightState.enabled} onChange={(v) => setLightState('clarity', v)} />
                <Slider label="Dehaze" value={lightState.dehaze} disabled={!lightState.enabled} onChange={(v) => setLightState('dehaze', v)} />
                <div style={{ height: '1px', background: '#282828', margin: '16px 0' }}></div>
                <Slider label="Temperature" value={lightState.temp} disabled={!lightState.enabled} onChange={(v) => setLightState('temp', v)} />
                <Slider label="Tint" value={lightState.tint} disabled={!lightState.enabled} onChange={(v) => setLightState('tint', v)} />
                <Slider label="Vibrance" value={lightState.vibrance} disabled={!lightState.enabled} onChange={(v) => setLightState('vibrance', v)} />
                <Slider label="Saturation" value={lightState.saturation} disabled={!lightState.enabled} onChange={(v) => setLightState('saturation', v)} />
              </div>
            )}

            {/* --- TONE CURVE GROUP --- */}
            <div 
              style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '8px 14px', background: '#1e1e1e', 'border-bottom': '1px solid #282828', cursor: 'pointer' }} 
              onClick={() => setCurveExpanded(!curveExpanded())}
            >
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <ChevronRight size={14} color="#888" style={{ transform: curveExpanded() ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                <span style={{ 'font-weight': '700', 'font-size': '11px', color: '#e0e0e0', 'text-transform': 'uppercase', 'letter-spacing': '1px' }}>Tone Curve</span>
              </div>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
                <button onClick={(e) => { e.stopPropagation(); setCurveEnabled(!curveEnabled()); }} style={{ background: 'none', border: 'none', color: curveEnabled() ? '#aaa' : '#444', cursor: 'pointer', padding: '0', display: 'flex' }}>
                  {curveEnabled() ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setCurves(defaultCurves()); }} style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', padding: '0', display: 'flex' }}>
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>
            {curveExpanded() && (
              <div style={{ padding: '16px 14px', 'border-bottom': '1px solid #282828' }}>
                <ToneCurve curves={curves()} setCurves={setCurves} disabled={!curveEnabled()} />
              </div>
            )}
            
            <div style={{ height: '40px' }}></div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;
