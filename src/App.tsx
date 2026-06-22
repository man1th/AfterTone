import { Component, createEffect, onMount, createSignal, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Slider } from './components/Slider';
import { Viewport } from './components/Viewport';
import { Histogram } from './components/Histogram';

declare const window: any;

const App: Component = () => {
  const [lightState, setLightState] = createStore({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, enabled: true });
  const [isWasmReady, setIsWasmReady] = createSignal(false);
  
  // State to hold the incoming GPU compute data
  const [histogramData, setHistogramData] = createSignal<number[]>([]);

  onMount(() => {
    const initBackend = () => { setIsWasmReady(true); window.Module.ccall('init_backend', 'number', [], []); };
    if (typeof window.Module !== 'undefined' && window.Module.ccall) { initBackend(); } 
    else { window.addEventListener('wasm-ready', initBackend); onCleanup(() => window.removeEventListener('wasm-ready', initBackend)); }
  });

  createEffect(() => {
    if (!isWasmReady()) return;
    if (lightState.enabled) {
      window.Module.ccall('update_light_params', 'void', ['number', 'number', 'number', 'number', 'number', 'number'], [lightState.exposure, lightState.contrast, lightState.highlights, lightState.shadows, lightState.whites, lightState.blacks]);
    } else {
      window.Module.ccall('update_light_params', 'void', ['number', 'number', 'number', 'number', 'number', 'number'], [0, 0, 0, 0, 0, 0]);
    }
  });

  const resetLightParams = () => setLightState({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 });
  const toggleLightGroup = () => setLightState('enabled', e => !e);

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100vh', width: '100vw' }}>
      <header style={{ height: '44px', background: '#222', 'border-bottom': '1px solid #2d2d2d', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '0 16px' }}>
        <div style={{ 'font-weight': '700', 'letter-spacing': '0.5px', color: '#fff' }}>AFTERTONE</div>
        <div style={{ display: 'flex', gap: '12px', 'align-items': 'center' }}>
          <span style={{ 'font-size': '11px', color: isWasmReady() ? '#4ade80' : '#f87171' }}>{isWasmReady() ? 'CORE ONLINE' : 'BOOTING CORE...'}</span>
          <button style={{ background: '#333', color: '#e0e0e0', border: '1px solid #444', padding: '4px 12px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '13px' }}>Export</button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        <main style={{ flex: 1, background: '#111', position: 'relative' }}>
          {/* Wire the Viewport to emit the data up to the App state */}
          <Viewport lightState={lightState} onHistogramUpdate={setHistogramData} />
        </main>

        <aside style={{ width: '300px', background: '#1e1e1e', 'border-left': '1px solid #2d2d2d', display: 'flex', 'flex-direction': 'column' }}>
          
          {/* The Live GPU Histogram */}
          <div style={{ height: '150px', background: '#151515', 'border-bottom': '1px solid #2d2d2d' }}>
            <Histogram data={histogramData()} />
          </div>
          
          <div style={{ padding: '16px', flex: 1, 'overflow-y': 'auto' }}>
            <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-bottom': '16px', 'border-bottom': '1px solid #333', 'padding-bottom': '8px' }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <input type="checkbox" checked={lightState.enabled} onChange={toggleLightGroup} style={{ cursor: 'pointer' }} />
                <span style={{ 'font-weight': '600', 'font-size': '13px', color: '#ccc', 'text-transform': 'uppercase', 'letter-spacing': '1px' }}>Light</span>
              </div>
              <button onClick={resetLightParams} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', 'font-size': '11px', 'text-transform': 'uppercase' }}>Reset</button>
            </div>

            <Slider label="Exposure" value={lightState.exposure} disabled={!lightState.enabled} onChange={(v) => setLightState('exposure', v)} />
            <Slider label="Contrast" value={lightState.contrast} disabled={!lightState.enabled} onChange={(v) => setLightState('contrast', v)} />
            <Slider label="Highlights" value={lightState.highlights} disabled={!lightState.enabled} onChange={(v) => setLightState('highlights', v)} />
            <Slider label="Shadows" value={lightState.shadows} disabled={!lightState.enabled} onChange={(v) => setLightState('shadows', v)} />
            <Slider label="Whites" value={lightState.whites} disabled={!lightState.enabled} onChange={(v) => setLightState('whites', v)} />
            <Slider label="Blacks" value={lightState.blacks} disabled={!lightState.enabled} onChange={(v) => setLightState('blacks', v)} />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;
