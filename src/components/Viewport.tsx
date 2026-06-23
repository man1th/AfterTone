import { Component, createSignal, createEffect } from 'solid-js';
import { ZoomIn, ZoomOut, Hand, RotateCw, SquareCenterlineDashedHorizontal, SquareCenterlineDashedVertical, Import } from 'lucide-solid';
import shaderCode from '../shaders/adjustments.wgsl?raw';
import histShaderCode from '../shaders/histogram.wgsl?raw';

interface ViewportProps {
  lightState: any;
  onHistogramUpdate: (data: number[]) => void;
  getExportFn: (exportFn: () => void) => void;
}

export const Viewport: Component<ViewportProps> = (props) => {
  let canvasRef!: HTMLCanvasElement;
  let containerRef!: HTMLDivElement;
  let fileInputRef!: HTMLInputElement;
  
  const [hasImage, setHasImage] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let device: GPUDevice; let context: GPUCanvasContext; let pipeline: GPURenderPipeline;
  let uniformBuffer: GPUBuffer; let bindGroup: GPUBindGroup;
  let computePipeline: GPUComputePipeline; let computeBindGroup: GPUBindGroup;
  let histogramBuffer: GPUBuffer; let readbackBuffer: GPUBuffer;
  let isReadingHistogram = false;

  const [scale, setScale] = createSignal(1);
  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  const [rotation, setRotation] = createSignal(0);
  const [flipX, setFlipX] = createSignal(1);
  const [flipY, setFlipY] = createSignal(1);
  
  let isDragging = false; let lastX = 0; let lastY = 0;

  const initWebGPU = async (imgBitmap: ImageBitmap) => {
    if (!navigator.gpu) { setError("WebGPU is not supported."); return; }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { setError("Failed to acquire adapter."); return; }
    device = await adapter.requestDevice();
    context = canvasRef.getContext('webgpu') as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    
    context.configure({ device, format, alphaMode: 'premultiplied' });
    canvasRef.width = imgBitmap.width; canvasRef.height = imgBitmap.height;

    const texture = device.createTexture({
      size: [imgBitmap.width, imgBitmap.height, 1], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.copyExternalImageToTexture({ source: imgBitmap }, { texture }, [imgBitmap.width, imgBitmap.height]);

    const module = device.createShaderModule({ code: shaderCode });
    pipeline = device.createRenderPipeline({
      layout: 'auto', vertex: { module, entryPoint: 'vs_main' },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' }
    });

    uniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() }
      ]
    });

    const histModule = device.createShaderModule({ code: histShaderCode });
    computePipeline = device.createComputePipeline({
      layout: 'auto', compute: { module: histModule, entryPoint: 'main' }
    });

    histogramBuffer = device.createBuffer({ size: 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    readbackBuffer = device.createBuffer({ size: 1024, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    computeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() },
        { binding: 3, resource: { buffer: histogramBuffer } }
      ]
    });

    setHasImage(true);
    const scaleX = (containerRef.clientWidth - 40) / imgBitmap.width;
    const scaleY = (containerRef.clientHeight - 40) / imgBitmap.height;
    setScale(Math.min(scaleX, scaleY));
    renderFrame();
  };

  const renderFrame = () => {
    if (!device || !context || !pipeline || !hasImage()) return;
    const p = props.lightState; const active = p.enabled;
    const paramsArray = new Float32Array([
      active ? p.exposure : 0, active ? p.contrast : 0, active ? p.highlights : 0, active ? p.shadows : 0, active ? p.whites : 0, active ? p.blacks : 0,
      active ? p.texture : 0, active ? p.clarity : 0, active ? p.dehaze : 0, active ? p.temp : 0, active ? p.tint : 0, active ? p.vibrance : 0, active ? p.saturation : 0, 0, 0, 0
    ]);
    
    device.queue.writeBuffer(uniformBuffer, 0, paramsArray);
    device.queue.writeBuffer(histogramBuffer, 0, new Uint32Array(256));

    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline); computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil((canvasRef.width / 4) / 16), Math.ceil((canvasRef.height / 4) / 16));
    computePass.end();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 }, loadOp: 'clear', storeOp: 'store' }]
    });
    passEncoder.setPipeline(pipeline); passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(6); passEncoder.end();

    if (!isReadingHistogram) { commandEncoder.copyBufferToBuffer(histogramBuffer, 0, readbackBuffer, 0, 1024); }
    device.queue.submit([commandEncoder.finish()]);

    if (!isReadingHistogram && readbackBuffer.mapState === 'unmapped') {
      isReadingHistogram = true;
      readbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const array = new Uint32Array(readbackBuffer.getMappedRange());
        props.onHistogramUpdate(Array.from(array));
        readbackBuffer.unmap(); isReadingHistogram = false;
      }).catch(() => { isReadingHistogram = false; });
    }
  };

  const exportImage = () => {
    if (!hasImage() || !canvasRef) return;
    renderFrame();
    canvasRef.toBlob((blob) => {
      if (!blob) return; const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'aftertone-export.jpg'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.95);
  };

  props.getExportFn(exportImage);

  createEffect(() => {
    const deps = [props.lightState.enabled, props.lightState.exposure, props.lightState.contrast, props.lightState.highlights, props.lightState.shadows, props.lightState.whites, props.lightState.blacks, props.lightState.texture, props.lightState.clarity, props.lightState.dehaze, props.lightState.temp, props.lightState.tint, props.lightState.vibrance, props.lightState.saturation];
    renderFrame();
  });

  const handleFileUpload = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
    const bmp = await createImageBitmap(file); initWebGPU(bmp);
  };

  const iconBtnStyle = { background: 'none', border: 'none', color: '#999', padding: '6px', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center' };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', 'align-items': 'center', 'justify-content': 'center', overflow: 'hidden', cursor: hasImage() ? (isDragging ? 'grabbing' : 'grab') : 'default' }} onWheel={(e:any) => { if (!hasImage()) return; e.preventDefault(); setScale(s => Math.max(0.01, s * Math.exp(-e.deltaY * 0.002))); }} onMouseDown={(e:any) => { if (!hasImage()) return; isDragging = true; lastX = e.clientX; lastY = e.clientY; }} onMouseMove={(e:any) => { if (!isDragging) return; setOffset(o => ({ x: o.x + (e.clientX - lastX), y: o.y + (e.clientY - lastY) })); lastX = e.clientX; lastY = e.clientY; }} onMouseUp={() => isDragging = false} onMouseLeave={() => isDragging = false}>
      
      <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(28, 28, 28, 0.85)', padding: '4px', 'border-radius': '6px', display: 'flex', gap: '2px', 'backdrop-filter': 'blur(8px)', 'z-index': 10, opacity: hasImage() ? 1 : 0.5, 'pointer-events': hasImage() ? 'auto' : 'none', border: '1px solid #333' }}>
        <button onClick={() => setScale(s => s * 1.25)} style={iconBtnStyle} title="Zoom In"><ZoomIn size={15} /></button>
        <button onClick={() => setScale(s => s / 1.25)} style={iconBtnStyle} title="Zoom Out"><ZoomOut size={15} /></button>
        <button onClick={() => setOffset({ x: 0, y: 0 })} style={iconBtnStyle} title="Reset Pan"><Hand size={15} /></button>
        <div style={{ width: '1px', background: '#444', margin: '4px' }}></div>
        <button onClick={() => setRotation(r => (r + 90) % 360)} style={iconBtnStyle} title="Rotate 90°"><RotateCw size={15} /></button>
        <button onClick={() => setFlipX(x => x * -1)} style={iconBtnStyle} title="Flip Horizontal"><SquareCenterlineDashedHorizontal size={15} /></button>
        <button onClick={() => setFlipY(y => y * -1)} style={iconBtnStyle} title="Flip Vertical"><SquareCenterlineDashedVertical size={15} /></button>
      </div>

      {error() && <div style={{ color: '#ff6b6b', position: 'absolute', top: '20px', 'z-index': 100 }}>{error()}</div>}
      
      <canvas 
        ref={canvasRef} 
        style={{ position: 'absolute', 'transform-origin': 'center center', transform: `translate(${offset().x}px, ${offset().y}px) scale(${scale()}) rotate(${rotation()}deg) scaleX(${flipX()}) scaleY(${flipY()})`, display: hasImage() ? 'block' : 'none', 'box-shadow': '0 10px 50px rgba(0,0,0,0.8)', transition: 'transform 0.1s cubic-bezier(0.2, 0, 0, 1)' }}
      />
      
      {!hasImage() && (
        <div style={{ 'z-index': 2, 'text-align': 'center' }}>
          <button onClick={() => fileInputRef.click()} style={{ background: '#2a2a2a', color: '#e0e0e0', border: '1px solid #444', padding: '10px 20px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '12px', 'font-weight': '600', display: 'flex', 'align-items': 'center', gap: '8px', transition: 'background 0.2s' }}>
            <Import size={16} color="#888" /> Import Photo
          </button>
          <input type="file" accept="image/jpeg, image/png, image/webp, image/tiff" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
        </div>
      )}
    </div>
  );
};
