import { Component, createSignal, createEffect } from 'solid-js';

interface HistogramProps {
  data: number[];
  hoverLuminance: number | null;
  metadata: { iso: string; shutter: string; fstop: string };
}

export const Histogram: Component<HistogramProps> = (props) => {
  const [paths, setPaths] = createSignal({ r: '', g: '', b: '', l: '' });

  // 5-point moving average window to smoothly interpolate frequency transitions
  const smoothBuffer = (buffer: number[], passes = 2): number[] => {
    let result = [...buffer];
    for (let p = 0; p < passes; p++) {
      const next = [...result];
      for (let i = 2; i < result.length - 2; i++) {
        next[i] = (result[i - 2] + result[i - 1] + result[i] + result[i + 1] + result[i + 2]) / 5;
      }
      result = next;
    }
    return result;
  };

  createEffect(() => {
    if (!props.data || props.data.length < 1024) return;

    // Isolate raw channel buffers
    const rawR = props.data.slice(0, 256);
    const rawG = props.data.slice(256, 512);
    const rawB = props.data.slice(512, 768);
    const rawL = props.data.slice(768, 1024);

    // Apply digital low-pass filtering to remove jagged signal noise
    const rData = smoothBuffer(rawR);
    const gData = smoothBuffer(rawG);
    const bData = smoothBuffer(rawB);
    const lData = smoothBuffer(rawL);

    const maxVal = Math.max(1, ...rData.slice(1, 254), ...gData.slice(1, 254), ...bData.slice(1, 254), ...lData.slice(1, 254));

    let lPath = 'M 0 100 ';
    let rPath = ''; let gPath = ''; let bPath = '';

    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 100;
      const ry = 100 - (rData[i] / maxVal) * 100;
      const gy = 100 - (gData[i] / maxVal) * 100;
      const by = 100 - (bData[i] / maxVal) * 100;
      const ly = 100 - (lData[i] / maxVal) * 100;

      lPath += `L ${x} ${Math.max(0, ly)} `;
      if (i === 0) {
        rPath = `M ${x} ${Math.max(0, ry)} `;
        gPath = `M ${x} ${Math.max(0, gy)} `;
        bPath = `M ${x} ${Math.max(0, by)} `;
      } else {
        rPath += `L ${x} ${Math.max(0, ry)} `;
        gPath += `L ${x} ${Math.max(0, gy)} `;
        bPath += `L ${x} ${Math.max(0, by)} `;
      }
    }
    lPath += 'L 100 100 Z';

    setPaths({ r: rPath, g: gPath, b: bPath, l: lPath });
  });

  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: '100%', height: '110px', background: '#141414', border: '1px solid #282828', 'border-radius': '4px', position: 'relative', overflow: 'hidden' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          {/* Solid Gray Spectrum Backing */}
          <path d={paths().l} fill="rgba(85, 85, 85, 0.35)" stroke="none" />
          
          {/* High-fidelity, ultra-thin multi-blend RGB Curves */}
          <path d={paths().r} fill="none" stroke="#ff4b4b" stroke-width="0.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.9" style={{ 'mix-blend-mode': 'screen' }} />
          <path d={paths().g} fill="none" stroke="#4ade80" stroke-width="0.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.9" style={{ 'mix-blend-mode': 'screen' }} />
          <path d={paths().b} fill="none" stroke="#60a5fa" stroke-width="0.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.9" style={{ 'mix-blend-mode': 'screen' }} />
          
          {/* Real-time Tracking Reticle Line */}
          {props.hoverLuminance !== null && (
            <line x1={props.hoverLuminance * 100} y1="0" x2={props.hoverLuminance * 100} y2="100" stroke="#D97757" stroke-width="1" />
          )}
        </svg>
      </div>
      
      {/* EXIF Metadata Strip */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-top': '8px', 'font-size': '10px', color: '#777', 'font-family': 'monospace', 'font-weight': '600', 'letter-spacing': '0.5px' }}>
        <span style={{ flex: 1, 'text-align': 'left' }}>{props.metadata.iso}</span>
        <span style={{ flex: 1, 'text-align': 'center' }}>{props.metadata.shutter}</span>
        <span style={{ flex: 1, 'text-align': 'right' }}>{props.metadata.fstop}</span>
      </div>
    </div>
  );
};
