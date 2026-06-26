import { Component, createSignal, createEffect } from 'solid-js';
import { ZoomIn, ZoomOut, Hand, RotateCw, SquareCenterlineDashedHorizontal, SquareCenterlineDashedVertical, PaintBucket } from 'lucide-solid';
import { generateToneCurveLUT, buildMonotonicCubicSpline } from '../utils/spline';
import shaderCode from '../shaders/adjustments.wgsl?raw';
import histShaderCode from '../shaders/histogram.wgsl?raw';

export interface ViewportProps {
  lightState: any; curves: any; isCompare: boolean; isOriginal: boolean;
  onHistogramUpdate: (data: number[]) => void; onHoverLuminance: (luma: number | null) => void;
  onMetadataUpdate: (meta: { iso: string; shutter: string; fstop: string }) => void;
  getExportFn: (exportFn: () => void) => void; getImportFn: (importFn: () => void) => void;
  onImageChange?: (hasImage: boolean) => void;
}

export const Viewport: Component<ViewportProps> = (props) => {
  let canvasRef!: HTMLCanvasElement; let originalCanvasRef!: HTMLCanvasElement; let containerRef!: HTMLDivElement; let fileInputRef!: HTMLInputElement;
  const [hasImage, setHasImage] = createSignal(false); const [error, setError] = createSignal<string | null>(null);
  
  let device: GPUDevice; let context: GPUCanvasContext; let pipeline: GPURenderPipeline; let uniformBuffer: GPUBuffer; 
  let bindGroup: GPUBindGroup; let exportBindGroup: GPUBindGroup; let curveTexture: GPUTexture; let curveTextureView: GPUTextureView; 
  let computePipeline: GPUComputePipeline; let computeBindGroup: GPUBindGroup; let histogramBuffer: GPUBuffer; let readbackBuffer: GPUBuffer; 
  let isReadingHistogram = false;
  
  let imgBitmap: ImageBitmap; let pWidth = 0; let pHeight = 0;
  let previewTexture: GPUTexture; let fullResTexture: GPUTexture;
  let offscreenCanvas = document.createElement('canvas'); let offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  const [scale, setScale] = createSignal(1); const [offset, setOffset] = createSignal({ x: 0, y: 0 }); const [rotation, setRotation] = createSignal(0); const [flipX, setFlipX] = createSignal(1); const [flipY, setFlipY] = createSignal(1);
  const [splitPos, setSplitPos] = createSignal(0.5);
  const [bgColor, setBgColor] = createSignal('#111111'); const [showBgMenu, setShowBgMenu] = createSignal(false);
  let isDragging = false; let isDraggingSplitter = false; let lastX = 0; let lastY = 0;

  let renderTimeout: any = null;
  let lastRenderTime = 0;

  const hexToRgb = (hex: string) => {
    const cleanHex = hex.replace('#', '');
    return [parseInt(cleanHex.substring(0, 2), 16) / 255, parseInt(cleanHex.substring(2, 4), 16) / 255, parseInt(cleanHex.substring(4, 6), 16) / 255];
  };

  const initWebGPU = async (incomingBitmap: ImageBitmap) => {
    imgBitmap = incomingBitmap;
    if (!navigator.gpu) { setError("WebGPU is not supported."); return; }
    const adapter = await navigator.gpu.requestAdapter(); if (!adapter) { setError("Failed to acquire adapter."); return; }
    device = await adapter.requestDevice(); context = canvasRef.getContext('webgpu') as GPUCanvasContext; const format = navigator.gpu.getPreferredCanvasFormat();
    
    const MAX_PREVIEW_DIM = 2560; pWidth = imgBitmap.width; pHeight = imgBitmap.height;
    if (pWidth > MAX_PREVIEW_DIM || pHeight > MAX_PREVIEW_DIM) { const ratio = pWidth / pHeight; if (pWidth > pHeight) { pWidth = MAX_PREVIEW_DIM; pHeight = Math.round(MAX_PREVIEW_DIM / ratio); } else { pHeight = MAX_PREVIEW_DIM; pWidth = Math.round(MAX_PREVIEW_DIM * ratio); } }
    
    canvasRef.width = pWidth; canvasRef.height = pHeight;
    originalCanvasRef.width = pWidth; originalCanvasRef.height = pHeight;
    context.configure({ device, format, alphaMode: 'premultiplied' }); 
    
    offscreenCanvas.width = imgBitmap.width; offscreenCanvas.height = imgBitmap.height; offscreenCtx?.drawImage(imgBitmap, 0, 0);
    
    const shutterOptions = ['1/125 sec', '1/250 sec', '1/500 sec', '1/1000 sec']; const fStopOptions = ['f/2.8', 'f/4.0', 'f/5.6', 'f/8.0']; const isoOptions = ['ISO 100', 'ISO 200', 'ISO 400', 'ISO 800']; const hash = (imgBitmap.width + imgBitmap.height) % 4;
    props.onMetadataUpdate({ iso: isoOptions[hash], shutter: shutterOptions[(hash + 1) % 4], fstop: fStopOptions[(hash + 2) % 4] });
    
    fullResTexture = device.createTexture({ size: [imgBitmap.width, imgBitmap.height, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT }); device.queue.copyExternalImageToTexture({ source: imgBitmap }, { texture: fullResTexture }, [imgBitmap.width, imgBitmap.height]);
    previewTexture = device.createTexture({ size: [pWidth, pHeight, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    const previewBitmap = await createImageBitmap(imgBitmap, { resizeWidth: pWidth, resizeHeight: pHeight, resizeQuality: 'high' });
    device.queue.copyExternalImageToTexture({ source: previewBitmap }, { texture: previewTexture }, [pWidth, pHeight]);
    
    const origCtx = originalCanvasRef.getContext('2d');
    if (origCtx) { origCtx.drawImage(previewBitmap, 0, 0, pWidth, pHeight); }
    
    curveTexture = device.createTexture({ size: [256, 1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }); curveTextureView = curveTexture.createView();
    const module = device.createShaderModule({ code: shaderCode }); pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs_main' }, fragment: { module, entryPoint: 'fs_main', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
    
    // INCREASED TO 256 BYTES (64 FLOATS) FOR COLOR MIXER ARRAY
    uniformBuffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: sampler }, { binding: 2, resource: previewTexture.createView() }, { binding: 3, resource: curveTextureView }] });
    exportBindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: sampler }, { binding: 2, resource: fullResTexture.createView() }, { binding: 3, resource: curveTextureView }] });
    const histModule = device.createShaderModule({ code: histShaderCode }); computePipeline = device.createComputePipeline({ layout: 'auto', compute: { module: histModule, entryPoint: 'main' } });
    histogramBuffer = device.createBuffer({ size: 4096, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }); readbackBuffer = device.createBuffer({ size: 4096, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    computeBindGroup = device.createBindGroup({ layout: computePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: sampler }, { binding: 2, resource: previewTexture.createView() }, { binding: 3, resource: curveTextureView }, { binding: 4, resource: { buffer: histogramBuffer } }] });
    
    setHasImage(true); props.onImageChange?.(true);
    
    setTimeout(() => {
      const cWidth = containerRef?.clientWidth || window.innerWidth - 350;
      const cHeight = containerRef?.clientHeight || window.innerHeight - 100;
      const scaleX = (cWidth - 40) / pWidth;
      const scaleY = (cHeight - 40) / pHeight;
      setScale(Math.min(scaleX, scaleY));
      setOffset({ x: 0, y: 0 });
      renderFrame();
    }, 50);
  };

  const renderFrame = (isExport = false) => {
    if (!device || !context || !pipeline || !hasImage()) return;
    const now = performance.now();
    const isInteracting = (!isExport && (now - lastRenderTime < 100)) ? 1.0 : 0.0;
    lastRenderTime = now;

    if (isInteracting > 0.0 && !isExport) {
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => { renderFrame(false); }, 150);
    }

    if (props.curves) { const lut = generateToneCurveLUT(props.curves.master, props.curves.red, props.curves.green, props.curves.blue); device.queue.writeTexture({ texture: curveTexture }, lut, { bytesPerRow: 1024 }, [256, 1, 1]); }
    
    const p = props.lightState; const active = p.enabled;
    const [hr, hg, hb] = hexToRgb(p.hal_color || '#ff3300');

    // 64-FLOAT EXACT ARRAY MAPPING (INCLUDES ALL COLOR MIXER PARAMS)
    const paramsArray = new Float32Array([
      active ? p.exposure : 0, active ? p.contrast : 0, active ? p.highlights : 0, active ? p.shadows : 0, active ? p.whites : 0, active ? p.blacks : 0, active ? p.texture : 0, active ? p.clarity : 0, active ? p.dehaze : 0, active ? p.temp : 0, active ? p.tint : 0, active ? p.vibrance : 0, active ? p.saturation : 0,
      active ? p.hal_thresh : 80, active ? p.hal_radius : 10, hr, hg, hb, active ? p.hal_intensity : 0,
      active ? p.bloom_intensity : 0, p.show_hal_map ? 1.0 : 0.0, isInteracting,
      active ? (p.grain_amount || 0) / 100.0 : 0.0, (p.grain_size || 0) / 25.0 + 0.1, (p.grain_roughness || 0) / 100.0, (p.grain_color_variance || 0) / 100.0,
      active ? p.cg_s_h : 0, active ? p.cg_s_s : 0, active ? p.cg_s_l : 0,
      active ? p.cg_m_h : 0, active ? p.cg_m_s : 0, active ? p.cg_m_l : 0,
      active ? p.cg_h_h : 0, active ? p.cg_h_s : 0, active ? p.cg_h_l : 0,
      active ? p.cg_g_h : 0, active ? p.cg_g_s : 0, active ? p.cg_g_l : 0,
      active ? p.cm_h_r : 0, active ? p.cm_s_r : 0, active ? p.cm_l_r : 0,
      active ? p.cm_h_o : 0, active ? p.cm_s_o : 0, active ? p.cm_l_o : 0,
      active ? p.cm_h_y : 0, active ? p.cm_s_y : 0, active ? p.cm_l_y : 0,
      active ? p.cm_h_g : 0, active ? p.cm_s_g : 0, active ? p.cm_l_g : 0,
      active ? p.cm_h_a : 0, active ? p.cm_s_a : 0, active ? p.cm_l_a : 0,
      active ? p.cm_h_b : 0, active ? p.cm_s_b : 0, active ? p.cm_l_b : 0,
      active ? p.cm_h_p : 0, active ? p.cm_s_p : 0, active ? p.cm_l_p : 0,
      active ? p.cm_h_m : 0, active ? p.cm_s_m : 0, active ? p.cm_l_m : 0,
      0, 0 // 2 padding floats
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, paramsArray);
    
    const commandEncoder = device.createCommandEncoder();
    if (!isExport) { device.queue.writeBuffer(histogramBuffer, 0, new Uint32Array(1024)); const computePass = commandEncoder.beginComputePass(); computePass.setPipeline(computePipeline); computePass.setBindGroup(0, computeBindGroup); computePass.dispatchWorkgroups(Math.ceil((pWidth / 4) / 16), Math.ceil((pHeight / 4) / 16)); computePass.end(); }
    const passEncoder = commandEncoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, loadOp: 'clear', storeOp: 'store' }] }); passEncoder.setPipeline(pipeline); passEncoder.setBindGroup(0, isExport ? exportBindGroup : bindGroup); passEncoder.draw(6); passEncoder.end();
    if (!isExport && !isReadingHistogram) { commandEncoder.copyBufferToBuffer(histogramBuffer, 0, readbackBuffer, 0, 4096); } device.queue.submit([commandEncoder.finish()]);
    if (!isExport && !isReadingHistogram && readbackBuffer.mapState === 'unmapped') { isReadingHistogram = true; readbackBuffer.mapAsync(GPUMapMode.READ).then(() => { const array = new Uint32Array(readbackBuffer.getMappedRange()); props.onHistogramUpdate(Array.from(array)); readbackBuffer.unmap(); isReadingHistogram = false; }).catch(() => { isReadingHistogram = false; }); }
  };

  const getImageSplitPercentage = () => {
    if (!containerRef || !canvasRef || pWidth === 0) return splitPos() * 100;
    const containerWidth = containerRef.clientWidth || window.innerWidth - 350;
    const dividerX = containerWidth * splitPos();
    const canvasCenterX = containerWidth / 2 + offset().x;
    const canvasDisplayWidth = pWidth * scale();
    const canvasLeft = canvasCenterX - canvasDisplayWidth / 2;
    if (canvasDisplayWidth === 0) return splitPos() * 100;
    const uvX = (dividerX - canvasLeft) / canvasDisplayWidth;
    return Math.max(0, Math.min(100, uvX * 100));
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!hasImage() || !offscreenCtx || isDragging) return;
    const rect = canvasRef.getBoundingClientRect(); let rx = (e.clientX - rect.left) / rect.width; let ry = (e.clientY - rect.top) / rect.height;
    if (rx < 0 || rx > 1 || ry < 0 || ry > 1) { props.onHoverLuminance(null); return; }
    const rot = rotation(); if (rot === 90) { const tmp = rx; rx = ry; ry = 1 - tmp; } else if (rot === 180) { rx = 1 - rx; ry = 1 - ry; } else if (rot === 270) { const tmp = rx; rx = 1 - ry; ry = tmp; }
    if (flipX() === -1) rx = 1 - rx; if (flipY() === -1) ry = 1 - ry;
    
    const imgX = Math.floor(rx * imgBitmap.width); const imgY = Math.floor(ry * imgBitmap.height);
    try {
      const p = offscreenCtx.getImageData(imgX, imgY, 1, 1).data; let r = p[0] / 255; let g = p[1] / 255; let b = p[2] / 255;
      const uvSplit = getImageSplitPercentage() / 100;
      if (props.lightState.enabled && (!props.isCompare || rx >= uvSplit)) {
        const l = props.lightState; const t_val = l.temp / 100; const tint_val = l.tint / 100; r *= (1.0 + (t_val * 0.18)) * (1.0 + (tint_val * 0.08)); g *= (1.0 - (tint_val * 0.14)); b *= (1.0 - (t_val * 0.18)) * (1.0 + (tint_val * 0.08)); const exp = Math.pow(2, l.exposure / 50); r *= exp; g *= exp; b *= exp; const c = (l.contrast / 100) + 1; r = (r - 0.5) * c + 0.5; g = (g - 0.5) * c + 0.5; b = (b - 0.5) * c + 0.5;
        const baseLuma = 0.299 * r + 0.587 * g + 0.114 * b; const sMask = 1.0 - Math.max(0, Math.min(1, baseLuma / 0.5)); const hMask = Math.max(0, Math.min(1, (baseLuma - 0.5) / 0.5)); r += r * (l.shadows / 100) * sMask + r * (l.highlights / 100) * hMask; g += g * (l.shadows / 100) * sMask + g * (l.highlights / 100) * hMask; b += b * (l.shadows / 100) * sMask + b * (l.highlights / 100) * hMask;
        const w_p = 1.0 - (l.whites / 200); const b_p = 0.0 - (l.blacks / 200); r = (r - b_p) / (w_p - b_p); g = (g - b_p) / (w_p - b_p); b = (b - b_p) / (w_p - b_p);
      }
      if (props.curves && (!props.isCompare || rx >= uvSplit)) {
        const evalM = buildMonotonicCubicSpline(props.curves.master); r = evalM(Math.max(0, Math.min(1, r))); g = evalM(Math.max(0, Math.min(1, g))); b = evalM(Math.max(0, Math.min(1, b)));
        r = buildMonotonicCubicSpline(props.curves.red)(Math.max(0, Math.min(1, r))); g = buildMonotonicCubicSpline(props.curves.green)(Math.max(0, Math.min(1, r))); b = buildMonotonicCubicSpline(props.curves.blue)(Math.max(0, Math.min(1, b)));
      }
      const finalLuma = Math.max(0, Math.min(1, 0.299 * r + 0.587 * g + 0.114 * b)); props.onHoverLuminance(finalLuma);
    } catch { props.onHoverLuminance(null); }
  };

  props.getExportFn(async () => { 
    if (!device || !hasImage() || !canvasRef || !imgBitmap) return; 
    canvasRef.width = imgBitmap.width; canvasRef.height = imgBitmap.height; const format = navigator.gpu.getPreferredCanvasFormat(); context.configure({ device, format, alphaMode: 'premultiplied' }); 
    renderFrame(true); await device.queue.onSubmittedWorkDone();
    const dataUrl = canvasRef.toDataURL('image/png'); const link = document.createElement('a'); link.download = 'aftertone-processed.png'; link.href = dataUrl; link.click(); 
    canvasRef.width = pWidth; canvasRef.height = pHeight; context.configure({ device, format, alphaMode: 'premultiplied' }); renderFrame(false);
  });
  
  props.getImportFn(() => fileInputRef.click());

  createEffect(() => { 
      const deps = [props.lightState.enabled, props.lightState.exposure, props.lightState.contrast, props.lightState.highlights, props.lightState.shadows, props.lightState.whites, props.lightState.blacks, props.lightState.texture, props.lightState.clarity, props.lightState.dehaze, props.lightState.temp, props.lightState.tint, props.lightState.vibrance, props.lightState.saturation, props.lightState.hal_thresh, props.lightState.hal_radius, props.lightState.hal_color, props.lightState.hal_intensity, props.lightState.bloom_intensity, props.lightState.show_hal_map, props.lightState.grain_amount, props.lightState.grain_size, props.lightState.grain_roughness, props.lightState.grain_color_variance, props.lightState.cg_s_h, props.lightState.cg_s_s, props.lightState.cg_s_l, props.lightState.cg_m_h, props.lightState.cg_m_s, props.lightState.cg_m_l, props.lightState.cg_h_h, props.lightState.cg_h_s, props.lightState.cg_h_l, props.lightState.cg_g_h, props.lightState.cg_g_s, props.lightState.cg_g_l, props.lightState.cm_h_r, props.lightState.cm_s_r, props.lightState.cm_l_r, props.lightState.cm_h_o, props.lightState.cm_s_o, props.lightState.cm_l_o, props.lightState.cm_h_y, props.lightState.cm_s_y, props.lightState.cm_l_y, props.lightState.cm_h_g, props.lightState.cm_s_g, props.lightState.cm_l_g, props.lightState.cm_h_a, props.lightState.cm_s_a, props.lightState.cm_l_a, props.lightState.cm_h_b, props.lightState.cm_s_b, props.lightState.cm_l_b, props.lightState.cm_h_p, props.lightState.cm_s_p, props.lightState.cm_l_p, props.lightState.cm_h_m, props.lightState.cm_s_m, props.lightState.cm_l_m, props.curves]; 
      renderFrame(false); 
  });
  
  const handleFileUpload = async (e: Event) => { const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return; const bmp = await createImageBitmap(file); initWebGPU(bmp); };
  const iconBtnStyle = { background: 'none', border: 'none', color: '#999', padding: '6px', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center' };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', 'align-items': 'center', 'justify-content': 'center', overflow: 'hidden', background: bgColor(), transition: 'background 0.2s', cursor: hasImage() ? (isDragging ? 'grabbing' : 'grab') : 'default' }} onWheel={(e:any) => { if (!hasImage()) return; e.preventDefault(); setScale(s => Math.max(0.05, Math.min(30, s * Math.exp(-e.deltaY * 0.002)))); }} onMouseDown={(e:any) => { if (!hasImage()) return; isDragging = true; lastX = e.clientX; lastY = e.clientY; }} onMouseMove={(e:any) => { if (isDraggingSplitter) { const rect = containerRef.getBoundingClientRect(); setSplitPos(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))); } else if (isDragging) { setOffset(o => ({ x: o.x + (e.clientX - lastX), y: o.y + (e.clientY - lastY) })); lastX = e.clientX; lastY = e.clientY; } else { handleMouseMove(e); } }} onMouseUp={() => { isDragging = false; }} onMouseLeave={() => { isDragging = false; props.onHoverLuminance(null); }}>
      <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(28, 28, 28, 0.85)', padding: '4px', 'border-radius': '6px', display: 'flex', gap: '2px', 'backdrop-filter': 'blur(8px)', 'z-index': 10, opacity: hasImage() ? 1 : 0.5, 'pointer-events': hasImage() ? 'auto' : 'none', border: '1px solid #333' }}><button onClick={() => setScale(s => Math.min(30, s * 1.25))} style={iconBtnStyle}><ZoomIn size={15} /></button><button onClick={() => setScale(s => Math.max(0.05, s / 1.25))} style={iconBtnStyle}><ZoomOut size={15} /></button><button onClick={() => { setOffset({ x: 0, y: 0 }); const scaleX = ((containerRef?.clientWidth || window.innerWidth - 350) - 40) / pWidth; const scaleY = ((containerRef?.clientHeight || window.innerHeight - 100) - 40) / pHeight; setScale(Math.min(scaleX, scaleY)); }} style={iconBtnStyle}><Hand size={15} /></button><div style={{ width: '1px', background: '#444', margin: '4px' }}></div><button onClick={() => setRotation(r => (r + 90) % 360)} style={iconBtnStyle}><RotateCw size={15} /></button><button onClick={() => setFlipX(x => x * -1)} style={iconBtnStyle}><SquareCenterlineDashedHorizontal size={15} /></button><button onClick={() => setFlipY(y => y * -1)} style={iconBtnStyle}><SquareCenterlineDashedVertical size={15} /></button></div>
      {error() && <div style={{ color: '#ff6b6b', position: 'absolute', top: '20px', 'z-index': 100 }}>{error()}</div>}
      
      <canvas ref={originalCanvasRef} style={{ position: 'absolute', 'transform-origin': 'center center', transform: `translate(${offset().x}px, ${offset().y}px) scale(${scale()}) rotate(${rotation()}deg) scaleX(${flipX()}) scaleY(${flipY()})`, 'z-index': 1, display: props.isCompare && hasImage() ? 'block' : 'none' }} />
      <canvas ref={canvasRef} style={{ position: 'absolute', 'transform-origin': 'center center', transform: `translate(${offset().x}px, ${offset().y}px) scale(${scale()}) rotate(${rotation()}deg) scaleX(${flipX()}) scaleY(${flipY()})`, 'z-index': 2, display: hasImage() ? 'block' : 'none', 'clip-path': props.isCompare ? `inset(0 0 0 ${getImageSplitPercentage()}%)` : 'none', 'box-shadow': props.isCompare ? 'none' : '0 10px 50px rgba(0,0,0,0.8)' }} />
      
      {props.isCompare && hasImage() && (
        <div onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); isDraggingSplitter = true; }} onPointerMove={(e) => { if (isDraggingSplitter) { e.stopPropagation(); const rect = containerRef.getBoundingClientRect(); setSplitPos(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))); } }} onPointerUp={(e) => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); isDraggingSplitter = false; }} style={{ position: 'absolute', top: 0, bottom: 0, left: `${splitPos() * 100}%`, width: '40px', 'margin-left': '-20px', cursor: 'ew-resize', 'z-index': 100, display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'touch-action': 'none' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '19px', width: '1px', background: '#ABABAB', 'box-shadow': '0 0 4px rgba(0,0,0,0.3)', 'pointer-events': 'none' }}></div>
          <div style={{ position: 'relative', background: '#1c1c1c', color: '#ABABAB', 'border-radius': '4px', border: '1px solid #444444', padding: '1px 4px', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'font-size': '8px', 'font-weight': '800', 'box-shadow': '0 2px 6px rgba(0,0,0,0.6)', 'pointer-events': 'none', 'user-select': 'none', 'font-family': 'monospace', 'letter-spacing': '-0.5px' }}>&lt;&gt;</div>
        </div>
      )}
      
      <div style={{ position: 'absolute', bottom: '16px', right: '16px', 'z-index': 50 }}>
        {showBgMenu() && (
          <div style={{ position: 'absolute', bottom: '100%', right: '0', 'margin-bottom': '8px', background: '#1c1c1c', border: '1px solid #333', 'border-radius': '6px', padding: '8px', display: 'flex', 'flex-direction': 'column', gap: '6px', 'box-shadow': '0 4px 12px rgba(0,0,0,0.5)', width: '150px' }}>
            <div style={{ 'font-size': '10px', color: '#888', 'text-transform': 'uppercase', 'letter-spacing': '0.5px', 'margin-bottom': '4px', 'padding-left': '4px', 'font-weight': '700' }}>Canvas Backdrop</div>
            {[{ label: 'Dark (Default)', color: '#111111' }, { label: 'Medium Grey', color: '#3A3A3A' }, { label: 'Light Grey', color: '#A0A0A0' }, { label: 'White', color: '#FFFFFF' }].map(opt => (
              <button onClick={() => { setBgColor(opt.color); setShowBgMenu(false); }} style={{ display: 'flex', 'align-items': 'center', gap: '8px', background: 'none', border: 'none', padding: '4px', cursor: 'pointer', 'border-radius': '4px', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a2a'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}><div style={{ width: '12px', height: '12px', 'border-radius': '2px', background: opt.color, border: '1px solid #444' }}></div><span style={{ color: '#ccc', 'font-size': '11px', 'text-transform': 'capitalize' }}>{opt.label}</span></button>
            ))}
            <div style={{ height: '1px', background: '#333', margin: '2px 0' }}></div>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: '4px', cursor: 'pointer', 'border-radius': '4px', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a2a'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}><div style={{ width: '12px', height: '12px', 'border-radius': '2px', background: bgColor(), border: '1px solid #444', overflow: 'hidden', position: 'relative' }}><input type="color" value={bgColor()} onInput={(e) => setBgColor(e.currentTarget.value)} style={{ position: 'absolute', top: '-10px', left: '-10px', width: '30px', height: '30px', cursor: 'pointer', opacity: 0 }} /></div><span style={{ color: '#ccc', 'font-size': '11px', 'text-transform': 'capitalize' }}>Custom Wheel...</span></label>
          </div>
        )}
        <button onClick={() => setShowBgMenu(!showBgMenu())} style={{ background: 'none', border: 'none', color: '#AAAAAA', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center', padding: '6px', opacity: showBgMenu() ? 1 : 0.6, transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = showBgMenu() ? '1' : '0.6'} title="Canvas Background Color"><PaintBucket size={18} /></button>
      </div>
      {!hasImage() && <div style={{ 'z-index': 2, color: '#444', 'font-size': '12px', 'font-weight': '600', 'letter-spacing': '1px' }}><input type="file" accept="image/jpeg, image/png, image/webp, image/tiff" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} /></div>}
    </div>
  );
};
