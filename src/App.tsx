import { Component, createEffect, onMount, createSignal, onCleanup, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Eye, EyeOff, RotateCcw, ChevronRight, GripHorizontal } from 'lucide-solid';
import { Slider } from './components/Slider';
import { Viewport } from './components/Viewport';
import { Histogram } from './components/Histogram';
import { ToneCurve, CurveState } from './components/ToneCurve';

declare const window: any;

type PanelId = 'histogram' | 'wb' | 'exposure' | 'hdr' | 'clarity' | 'dehaze' | 'curve' | 'texture';

// Sub-component for Toolbar Buttons handling dynamic CSS color filtering
const NavBtn: Component<{ icon: string, label: string, onClick?: () => void, active?: boolean }> = (props) => (
  <button onClick={props.onClick} style={{ background: props.active ? '#2a2a2a' : 'transparent', border: 'none', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', gap: '4px', cursor: 'pointer', padding: '6px 14px', 'border-radius': '6px', transition: 'background 0.15s ease' }}>
    <img src={props.icon} alt={props.label} style={{ width: '20px', height: '20px', filter: 'brightness(0) invert(67%)' }} />
    <span style={{ color: '#AAAAAA', 'font-size': '10px', 'text-transform': 'capitalize' }}>{props.label}</span>
  </button>
);

const App: Component = () => {
  const [lightState, setLightState] = createStore({ 
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, 
    texture: 0, clarity: 0, dehaze: 0, temp: 0, tint: 0, vibrance: 0, saturation: 0, 
    enabled: true 
  });
  
  const [isWasmReady, setIsWasmReady] = createSignal(false);
  const [isCompare, setIsCompare] = createSignal(false);
  const [histogramData, setHistogramData] = createSignal<number[]>(new Array(1024).fill(0));
  const [hoverLuminance, setHoverLuminance] = createSignal<number | null>(null);
  const [metadata, setMetadata] = createSignal({ iso: '---', shutter: '---', fstop: '---' });
  
  const [panelOrder, setPanelOrder] = createSignal<PanelId[]>(['histogram', 'wb', 'exposure', 'hdr', 'clarity', 'dehaze', 'curve', 'texture']);
  const [draggedIndex, setDraggedIndex] = createSignal<number | null>(null);

  const [expanded, setExpanded] = createStore<Record<PanelId, boolean>>({
    histogram: true, wb: true, exposure: false, hdr: false, clarity: false, dehaze: false, curve: false, texture: false
  });

  const [bypassed, setBypassed] = createStore<Record<string, boolean>>({
    wb: false, exposure: false, hdr: false, clarity: false, dehaze: false, curve: false, texture: false
  });
  
  const defaultCurves = (): CurveState => ({
    master: [{x:0,y:0}, {x:1,y:1}], red: [{x:0,y:0}, {x:1,y:1}],
    green: [{x:0,y:0}, {x:1,y:1}], blue: [{x:0,y:0}, {x:1,y:1}]
  });
  const [curves, setCurves] = createSignal<CurveState>(defaultCurves());

  let triggerExport: () => void = () => {};
  let triggerImport: () => void = () => {};

  onMount(() => {
    const initBackend = () => { setIsWasmReady(true); window.Module.ccall('init_backend', 'number', [], []); };
    if (typeof window.Module !== 'undefined' && window.Module.ccall) { initBackend(); } 
    else { window.addEventListener('wasm-ready', initBackend); onCleanup(() => window.removeEventListener('wasm-ready', initBackend)); }
  });

  const getProcessedLightState = () => ({
    exposure: bypassed.exposure ? 0 : lightState.exposure, contrast: bypassed.exposure ? 0 : lightState.contrast,
    highlights: bypassed.hdr ? 0 : lightState.highlights, shadows: bypassed.hdr ? 0 : lightState.shadows,
    whites: bypassed.hdr ? 0 : lightState.whites, blacks: bypassed.hdr ? 0 : lightState.blacks,
    texture: bypassed.texture ? 0 : lightState.texture, clarity: bypassed.clarity ? 0 : lightState.clarity,
    dehaze: bypassed.dehaze ? 0 : lightState.dehaze, temp: bypassed.wb ? 0 : lightState.temp,
    tint: bypassed.wb ? 0 : lightState.tint, vibrance: bypassed.exposure ? 0 : lightState.vibrance,
    saturation: bypassed.exposure ? 0 : lightState.saturation, enabled: lightState.enabled
  });

  createEffect(() => {
    if (!isWasmReady()) return;
    const p = getProcessedLightState();
    const params = [p.exposure, p.contrast, p.highlights, p.shadows, p.whites, p.blacks, p.texture, p.clarity, p.dehaze, p.temp, p.tint, p.vibrance, p.saturation];
    window.Module.ccall('update_light_params', 'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'], params);
  });

  const resetAllToOriginal = () => {
    setLightState({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, texture: 0, clarity: 0, dehaze: 0, temp: 0, tint: 0, vibrance: 0, saturation: 0 });
    setCurves(defaultCurves());
  };

  const panelMeta: Record<PanelId, { title: string, features: boolean, reset: () => void }> = {
    histogram: { title: 'Histogram', features: false, reset: () => {} },
    wb: { title: 'White balance', features: true, reset: () => setLightState({ temp: 0, tint: 0 }) },
    exposure: { title: 'Exposure', features: true, reset: () => setLightState({ exposure: 0, contrast: 0, saturation: 0, vibrance: 0 }) },
    hdr: { title: 'High dynamic range', features: true, reset: () => setLightState({ highlights: 0, shadows: 0, whites: 0, blacks: 0 }) },
    clarity: { title: 'Clarity', features: true, reset: () => setLightState({ clarity: 0 }) },
    dehaze: { title: 'Dehaze', features: true, reset: () => setLightState({ dehaze: 0 }) },
    curve: { title: 'Tone curve', features: true, reset: () => setCurves(defaultCurves()) },
    texture: { title: 'Texture', features: true, reset: () => setLightState({ texture: 0 }) },
  };

  const renderContent = (id: PanelId) => {
    switch (id) {
      case 'histogram': return <div style={{ padding: '16px 14px' }}><Histogram data={histogramData()} hoverLuminance={hoverLuminance()} metadata={metadata()} /></div>;
      case 'wb': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Temperature" value={lightState.temp} disabled={bypassed.wb} onChange={(v) => setLightState('temp', v)} /><Slider label="Tint" value={lightState.tint} disabled={bypassed.wb} onChange={(v) => setLightState('tint', v)} /></div>;
      case 'exposure': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Exposure" value={lightState.exposure} disabled={bypassed.exposure} onChange={(v) => setLightState('exposure', v)} /><Slider label="Contrast" value={lightState.contrast} disabled={bypassed.exposure} onChange={(v) => setLightState('contrast', v)} /><Slider label="Saturation" value={lightState.saturation} disabled={bypassed.exposure} onChange={(v) => setLightState('saturation', v)} /><Slider label="Vibrance" value={lightState.vibrance} disabled={bypassed.exposure} onChange={(v) => setLightState('vibrance', v)} /></div>;
      case 'hdr': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Highlights" value={lightState.highlights} disabled={bypassed.hdr} onChange={(v) => setLightState('highlights', v)} /><Slider label="Shadows" value={lightState.shadows} disabled={bypassed.hdr} onChange={(v) => setLightState('shadows', v)} /><Slider label="Whites" value={lightState.whites} disabled={bypassed.hdr} onChange={(v) => setLightState('whites', v)} /><Slider label="Blacks" value={lightState.blacks} disabled={bypassed.hdr} onChange={(v) => setLightState('blacks', v)} /></div>;
      case 'clarity': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Clarity" value={lightState.clarity} disabled={bypassed.clarity} onChange={(v) => setLightState('clarity', v)} /></div>;
      case 'dehaze': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Dehaze" value={lightState.dehaze} disabled={bypassed.dehaze} onChange={(v) => setLightState('dehaze', v)} /></div>;
      case 'curve': return <div style={{ padding: '16px 14px' }}><ToneCurve curves={curves()} setCurves={setCurves} disabled={bypassed.curve} /></div>;
      case 'texture': return <div style={{ padding: '16px 14px', display: 'flex', 'flex-direction': 'column', gap: '2px' }}><Slider label="Texture" value={lightState.texture} disabled={bypassed.texture} onChange={(v) => setLightState('texture', v)} /></div>;
    }
  };

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100vh', width: '100vw' }}>
      
      {/* PROFESSIONAL TOOLBAR NAV */}
      <header style={{ height: '64px', background: '#1c1c1c', 'border-bottom': '1px solid #282828', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '0 16px' }}>
        
        {/* LHS: Logo and Separator */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '16px' }}>
          <img src="/assets/brand/logo.svg" alt="Logo" style={{ height: '20px' }} />
          <div style={{ width: '1px', height: '28px', background: '#333' }}></div>
        </div>
        
        {/* RHS: Button Grouping */}
        <div style={{ display: 'flex', gap: '2px', 'align-items': 'center' }}>
          <span style={{ 'font-size': '10px', color: isWasmReady() ? '#4ade80' : '#f87171', 'text-transform': 'uppercase', 'letter-spacing': '1px', 'margin-right': '16px' }}>{isWasmReady() ? 'Core Online' : 'Booting...'}</span>

          <NavBtn icon="/assets/icons/import.svg" label="Import" onClick={() => triggerImport()} />
          <NavBtn icon="/assets/icons/export.svg" label="Export" onClick={() => triggerExport()} />
          
          <div style={{ width: '1px', height: '28px', background: '#333', margin: '0 12px' }}></div>
          
          <NavBtn icon="/assets/icons/original.svg" label="Reset" onClick={resetAllToOriginal} />
          <NavBtn icon="/assets/icons/undo.svg" label="Undo" />
          <NavBtn icon="/assets/icons/redo.svg" label="Redo" />
          
          <div style={{ width: '1px', height: '28px', background: '#333', margin: '0 12px' }}></div>
          
          <NavBtn icon="/assets/icons/compare.svg" label="Compare" active={isCompare()} onClick={() => setIsCompare(!isCompare())} />
        </div>

      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <main style={{ flex: 1, background: '#111' }}>
          <Viewport 
            lightState={getProcessedLightState()} curves={!bypassed.curve ? curves() : defaultCurves()} 
            isCompare={isCompare()}
            onHistogramUpdate={setHistogramData} onHoverLuminance={setHoverLuminance} onMetadataUpdate={setMetadata} 
            getExportFn={(fn) => triggerExport = fn} getImportFn={(fn) => triggerImport = fn} 
          />
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
                    <div draggable="true" onDragStart={() => setDraggedIndex(index())} onDragEnd={() => setDraggedIndex(null)} class="drag-handle" style={{ cursor: 'grab', color: '#555', display: 'flex', padding: '2px' }}><GripHorizontal size={14} /></div>
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
