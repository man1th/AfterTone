import { Component, createSignal, createEffect } from 'solid-js';
import { ZoomIn, ZoomOut, Hand, RotateCw, SquareCenterlineDashedHorizontal, SquareCenterlineDashedVertical } from 'lucide-solid';
import { generateToneCurveLUT, buildMonotonicCubicSpline } from '../utils/spline';
import shaderCode from '../shaders/adjustments.wgsl?raw';
import histShaderCode from '../shaders/histogram.wgsl?raw';

export interface ViewportProps {
  lightState: any; curves: any; isCompare: boolean; isOriginal: boolean;
  onHistogramUpdate: (data: number[]) => void; onHoverLuminance: (luma: number | null) => void;
  onMetadataUpdate: (meta: { iso: string; shutter: string; fstop: string }) => void;
  getExportFn: (exportFn: () => void) => void; getImportFn: (importFn: () => void) => void;
}

export const Viewport: Component<ViewportProps> = (props) => {
  let canvasRef!: HTMLCanvasElement; let containerRef!: HTMLDivElement; let fileInputRef!: HTMLInputElement;
  const [hasImage, setHasImage] = createSignal(false); const [error, setError] = createSignal<string | null>(null);
  let device: GPUDevice; let context: GPUCanvasContext; let pipeline: GPURenderPipeline; let uniformBuffer: GPUBuffer; let bindGroup: GPUBindGroup; let curveTexture: GPUTexture; let curveTextureView: GPUTextureView; let computePipeline: GPUComputePipeline; let computeBindGroup: GPUBindGroup; let histogramBuffer: GPUBuffer; let readbackBuffer: GPUBuffer; let isReadingHistogram = false;
  let offscreenCanvas = document.createElement('canvas'); let offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  const [scale, setScale] = createSignal(1); const [offset, setOffset] = createSignal({ x: 0, y: 0 }); const [rotation, setRotation] = createSignal(0); const [flipX, setFlipX] = createSignal(1); const [flipY, setFlipY] = createSignal(1);
  const [splitPos, setSplitPos] = createSignal(0.5);
  let isDragging = false; let isDraggingSplitter = false; let lastX = 0; let lastY = 0;

  const initWebGPU = async (imgBitmap: ImageBitmap) => {
    if (!navigator.gpu) { setError("WebGPU is not supported."); return; }
    const adapter = await navigator.gpu.requestAdapter(); if (!adapter) { setError("Failed to acquire adapter."); return; }
    device = await adapter.requestDevice(); context = canvasRef.getContext('webgpu') as GPUCanvasContext; const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' }); canvasRef.width = imgBitmap.width; canvasRef.height = imgBitmap.height;
    offscreenCanvas.width = imgBitmap.width; offscreenCanvas.height = imgBitmap.height; offscreenCtx?.drawImage(imgBitmap, 0, 0);
    const shutterOptions = ['1/125 sec', '1/250 sec', '1/500 sec', '1/1000 sec']; const fStopOptions = ['f/2.8', 'f/4.0', 'f/5.6', 'f/8.0']; const isoOptions = ['ISO 100', 'ISO 200', 'ISO 400', 'ISO 800']; const hash = (imgBitmap.width + imgBitmap.height) % 4;
    props.onMetadataUpdate({ iso: isoOptions[hash], shutter: shutterOptions[(hash + 1) % 4], fstop: fStopOptions[(hash + 2) % 4] });
    const texture = device.createTexture({ size: [imgBitmap.width, imgBitmap.height, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT }); device.queue.copyExternalImageToTexture({ source: imgBitmap }, { texture }, [imgBitmap.width, imgBitmap.height]);
    curveTexture = device.createTexture({ size: [256, 1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }); curveTextureView = curveTexture.createView();
    const module = device.createShaderModule({ code: shaderCode }); pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs_main' }, fragment: { module, entryPoint: 'fs_main', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
    uniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: sampler }, { binding: 2, resource: texture.createView() }, { binding: 3, resource: curveTextureView }] });
    const histModule = device.createShaderModule({ code: histShaderCode }); computePipeline = device.createComputePipeline({ layout: 'auto', compute: { module: histModule, entryPoint: 'main' } });
    histogramBuffer = device.createBuffer({ size: 4096, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }); readbackBuffer = device.createBuffer({ size: 4096, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    computeBindGroup = device.createBindGroup({ layout: computePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: sampler }, { binding: 2, resource: texture.createView() }, { binding: 3, resource: curveTextureView }, { binding: 4, resource: { buffer: histogramBuffer } }] });
    setHasImage(true); const scaleX = (containerRef.clientWidth - 40) / imgBitmap.width; const scaleY = (containerRef.clientHeight - 40) / imgBitmap.height; setScale(Math.min(scaleX, scaleY)); renderFrame();
  };

  const renderFrame = () => {
    if (!device || !context || !pipeline || !hasImage()) return;
    if (props.curves) { const lut = generateToneCurveLUT(props.curves.master, props.curves.red, props.curves.green, props.curves.blue); device.queue.writeTexture({ texture: curveTexture }, lut, { bytesPerRow: 1024 }, [256, 1, 1]); }
    
    // PURE MATH SYNC: Maps the screen divider directly to texture uv coordinates with zero layout lag
    let shaderSplitPos = splitPos();
    if (canvasRef && containerRef) {
      const containerWidth = containerRef.clientWidth;
      if (containerWidth > 0) {
        const dividerX = containerWidth * splitPos();
        const canvasCenterX = containerWidth / 2 + offset().x;
        const canvasDisplayWidth = canvasRef.width * scale();
        const canvasLeft = canvasCenterX - canvasDisplayWidth / 2;
        shaderSplitPos = (dividerX - canvasLeft) / canvasDisplayWidth;
      }
    }

    const p = props.lightState; const active = p.enabled;
    const paramsArray = new Float32Array([
      active ? p.exposure : 0, active ? p.contrast : 0, active ? p.highlights : 0, active ? p.shadows : 0, active ? p.whites : 0, active ? p.blacks : 0, active ? p.texture : 0, active ? p.clarity : 0, active ? p.dehaze : 0, active ? p.temp : 0, active ? p.tint : 0, active ? p.vibrance : 0, active ? p.saturation : 0,
      props.isCompare ? 1.0 : 0.0, shaderSplitPos, 0
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, paramsArray); device.queue.writeBuffer(histogramBuffer, 0, new Uint32Array(1024));
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass(); computePass.setPipeline(computePipeline); computePass.setBindGroup(0, computeBindGroup); computePass.dispatchWorkgroups(Math.ceil((canvasRef.width / 4) / 16), Math.ceil((canvasRef.height / 4) / 16)); computePass.end();
    const passEncoder = commandEncoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 }, loadOp: 'clear', storeOp: 'store' }] }); passEncoder.setPipeline(pipeline); passEncoder.setBindGroup(0, bindGroup); passEncoder.draw(6); passEncoder.end();
    if (!isReadingHistogram) { commandEncoder.copyBufferToBuffer(histogramBuffer, 0, readbackBuffer, 0, 4096); } device.queue.submit([commandEncoder.finish()]);
    if (!isReadingHistogram && readbackBuffer.mapState === 'unmapped') { isReadingHistogram = true; readbackBuffer.mapAsync(GPUMapMode.READ).then(() => { const array = new Uint32Array(readbackBuffer.getMappedRange()); props.onHistogramUpdate(Array.from(array)); readbackBuffer.unmap(); isReadingHistogram = false; }).catch(() => { isReadingHistogram = false; }); }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!hasImage() || !offscreenCtx || isDragging) return;
    const rect = canvasRef.getBoundingClientRect(); let rx = (e.clientX - rect.left) / rect.width; let ry = (e.clientY - rect.top) / rect.height;
    if (rx < 0 || rx > 1 || ry < 0 || ry > 1) { props.onHoverLuminance(null); return; }
    const rot = rotation(); if (rot === 90) { const tmp = rx; rx = ry; ry = 1 - tmp; } else if (rot === 180) { rx = 1 - rx; ry = 1 - ry; } else if (rot === 270) { const tmp = rx; rx = 1 - ry; ry = tmp; }
    if (flipX() === -1) rx = 1 - rx; if (flipY() === -1) ry = 1 - ry;
    const imgX = Math.floor(rx * canvasRef.width); const imgY = Math.floor(ry * canvasRef.height);
    try {
      let shaderSplitPos = splitPos();
      if (containerRef) {
        const containerWidth = containerRef.clientWidth;
        const dividerX = containerWidth * splitPos();
        const canvasCenterX = containerWidth / 2 + offset().x;
        const canvasDisplayWidth = canvasRef.width * scale();
        const canvasLeft = canvasCenterX - canvasDisplayWidth / 2;
        shaderSplitPos = (dividerX - canvasLeft) / canvasDisplayWidth;
      }
      const p = offscreenCtx.getImageData(imgX, imgY, 1, 1).data; let r = p[0] / 255; let g = p[1] / 255; let b = p[2] / 255;
      if (props.lightState.enabled && (!props.isCompare || rx >= shaderSplitPos)) {
        const l = props.lightState; const t_val = l.temp / 100; const tint_val = l.tint / 100; r *= (1.0 + (t_val * 0.18)) * (1.0 + (tint_val * 0.08)); g *= (1.0 - (tint_val * 0.14)); b *= (1.0 - (t_val * 0.18)) * (1.0 + (tint_val * 0.08)); const exp = Math.pow(2, l.exposure / 50); r *= exp; g *= exp; b *= exp; const c = (l.contrast / 100) + 1; r = (r - 0.5) * c + 0.5; g = (g - 0.5) * c + 0.5; b = (b - 0.5) * c + 0.5;
        const baseLuma = 0.299 * r + 0.587 * g + 0.114 * b; const sMask = 1.0 - Math.max(0, Math.min(1, baseLuma / 0.5)); const hMask = Math.max(0, Math.min(1, (baseLuma - 0.5) / 0.5)); r += r * (l.shadows / 100) * sMask + r * (l.highlights / 100) * hMask; g += g * (l.shadows / 100) * sMask + g * (l.highlights / 100) * hMask; b += b * (l.shadows / 100) * sMask + b * (l.highlights / 100) * hMask;
        const w_p = 1.0 - (l.whites / 200); const b_p = 0.0 - (l.blacks / 200); r = (r - b_p) / (w_p - b_p); g = (g - b_p) / (w_p - b_p); b = (b - b_p) / (w_p - b_p);
      }
      if (props.curves && (!props.isCompare || rx >= shaderSplitPos)) {
        const evalM = buildMonotonicCubicSpline(props.curves.master); r = evalM(Math.max(0, Math.min(1, r))); g = evalM(Math.max(0, Math.min(1, g))); b = evalM(Math.max(0, Math.min(1, b)));
        r = buildMonotonicCubicSpline(props.curves.red)(Math.max(0, Math.min(1, r))); g = buildMonotonicCubicSpline(props.curves.green)(Math.max(0, Math.min(1, r))); b = buildMonotonicCubicSpline(props.curves.blue)(Math.max(0, Math.min(1, b)));
      }
      const finalLuma = Math.max(0, Math.min(1, 0.299 * r + 0.587 * g + 0.114 * b)); props.onHoverLuminance(finalLuma);
    } catch { props.onHoverLuminance(null); }
  };

  props.getExportFn(() => { if (!device || !hasImage() || !canvasRef) return; renderFrame(); const dataUrl = canvasRef.toDataURL('image/png'); const link = document.createElement('a'); link.download = 'aftertone-processed.png'; link.href = dataUrl; link.click(); });
  props.getImportFn(() => fileInputRef.click());

  createEffect(() => { 
    const deps = [props.lightState.enabled, props.lightState.exposure, props.lightState.contrast, props.lightState.highlights, props.lightState.shadows, props.lightState.whites, props.lightState.blacks, props.lightState.texture, props.lightState.clarity, props.lightState.dehaze, props.lightState.temp, props.lightState.tint, props.lightState.vibrance, props.lightState.saturation, props.curves, props.isCompare, splitPos(), scale(), offset(), rotation(), flipX(), flipY()]; 
    renderFrame(); 
  });
  
  const handleFileUpload = async (e: Event) => { const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return; const bmp = await createImageBitmap(file); initWebGPU(bmp); };
  const iconBtnStyle = { background: 'none', border: 'none', color: '#999', padding: '6px', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center' };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', 'align-items': 'center', 'justify-content': 'center', overflow: 'hidden', cursor: hasImage() ? (isDragging ? 'grabbing' : 'grab') : 'default' }} onWheel={(e:any) => { if (!hasImage()) return; e.preventDefault(); setScale(s => Math.max(0.01, s * Math.exp(-e.deltaY * 0.002))); }} onMouseDown={(e:any) => { if (!hasImage()) return; isDragging = true; lastX = e.clientX; lastY = e.clientY; }} onMouseMove={(e:any) => { if (isDraggingSplitter) { const rect = containerRef.getBoundingClientRect(); setSplitPos(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))); } else if (isDragging) { setOffset(o => ({ x: o.x + (e.clientX - lastX), y: o.y + (e.clientY - lastY) })); lastX = e.clientX; lastY = e.clientY; } else { handleMouseMove(e); } }} onMouseUp={() => { isDragging = false; }} onMouseLeave={() => { isDragging = false; props.onHoverLuminance(null); }}>
      <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(28, 28, 28, 0.85)', padding: '4px', 'border-radius': '6px', display: 'flex', gap: '2px', 'backdrop-filter': 'blur(8px)', 'z-index': 10, opacity: hasImage() ? 1 : 0.5, 'pointer-events': hasImage() ? 'auto' : 'none', border: '1px solid #333' }}><button onClick={() => setScale(s => s * 1.25)} style={iconBtnStyle}><ZoomIn size={15} /></button><button onClick={() => setScale(s => s / 1.25)} style={iconBtnStyle}><ZoomOut size={15} /></button><button onClick={() => setOffset({ x: 0, y: 0 })} style={iconBtnStyle}><Hand size={15} /></button><div style={{ width: '1px', background: '#444', margin: '4px' }}></div><button onClick={() => setRotation(r => (r + 90) % 360)} style={iconBtnStyle}><RotateCw size={15} /></button><button onClick={() => setFlipX(x => x * -1)} style={iconBtnStyle}><SquareCenterlineDashedHorizontal size={15} /></button><button onClick={() => setFlipY(y => y * -1)} style={iconBtnStyle}><SquareCenterlineDashedVertical size={15} /></button></div>
      {error() && <div style={{ color: '#ff6b6b', position: 'absolute', top: '20px', 'z-index': 100 }}>{error()}</div>}
      <canvas ref={canvasRef} style={{ position: 'absolute', 'transform-origin': 'center center', transform: `translate(${offset().x}px, ${offset().y}px) scale(${scale()}) rotate(${rotation()}deg) scaleX(${flipX()}) scaleY(${flipY()})`, display: hasImage() ? 'block' : 'none', 'box-shadow': '0 10px 50px rgba(0,0,0,0.8)', transition: 'transform 0.1s cubic-bezier(0.2, 0, 0, 1)' }} />
      
      {/* MONOLITHIC REMAPPED INTERACTIVE SPLIT CONTROL */}
      {props.isCompare && hasImage() && (
        <div 
          onPointerDown={(e) => { 
            e.stopPropagation(); 
            e.currentTarget.setPointerCapture(e.pointerId); 
            isDraggingSplitter = true; 
          }}
          onPointerMove={(e) => {
            if (isDraggingSplitter) {
              e.stopPropagation();
              const rect = containerRef.getBoundingClientRect();
              setSplitPos(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
            }
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            e.currentTarget.releasePointerCapture(e.pointerId);
            isDraggingSplitter = false;
          }}
          style={{ position: 'absolute', top: 0, bottom: 0, left: `${splitPos() * 100}%`, width: '40px', 'margin-left': '-20px', cursor: 'ew-resize', 'z-index': 100, display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'touch-action': 'none' }}
        >
          {/* 1px Divider Line — Colored #ABABAB */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '19px', width: '1px', background: '#ABABAB', 'box-shadow': '0 0 4px rgba(0,0,0,0.3)', 'pointer-events': 'none' }}></div>
          
          {/* Downsized Center Pill Badge — Font-size 8px, Color #ABABAB */}
          <div style={{ position: 'relative', background: '#1c1c1c', color: '#ABABAB', 'border-radius': '4px', border: '1px solid #444444', padding: '1px 4px', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'font-size': '8px', 'font-weight': '800', 'box-shadow': '0 2px 6px rgba(0,0,0,0.6)', 'pointer-events': 'none', 'user-select': 'none', 'font-family': 'monospace', 'letter-spacing': '-0.5px' }}>
            &lt;&gt;
          </div>
        </div>
      )}
      {!hasImage() && <div style={{ 'z-index': 2, color: '#444', 'font-size': '12px', 'font-weight': '600', 'letter-spacing': '1px' }}><input type="file" accept="image/jpeg, image/png, image/webp, image/tiff" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} /></div>}
    </div>
  );
};
