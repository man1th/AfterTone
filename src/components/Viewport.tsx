import { Component, createSignal, createEffect } from 'solid-js';
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

  let device: GPUDevice;
  let context: GPUCanvasContext;
  let pipeline: GPURenderPipeline;
  let uniformBuffer: GPUBuffer;
  let bindGroup: GPUBindGroup;

  // Histogram WebGPU State
  let computePipeline: GPUComputePipeline;
  let computeBindGroup: GPUBindGroup;
  let histogramBuffer: GPUBuffer;
  let readbackBuffer: GPUBuffer;

  // Viewport Transform State
  const [scale, setScale] = createSignal(1);
  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  const [rotation, setRotation] = createSignal(0);
  const [flipX, setFlipX] = createSignal(1);
  const [flipY, setFlipY] = createSignal(1);
  
  let isDragging = false;
  let lastX = 0; let lastY = 0;

  const initWebGPU = async (imgBitmap: ImageBitmap) => {
    if (!navigator.gpu) { setError("WebGPU is not supported in this browser."); return; }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { setError("Failed to acquire WebGPU adapter."); return; }
    
    device = await adapter.requestDevice();
    context = canvasRef.getContext('webgpu') as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    
    context.configure({ device, format, alphaMode: 'premultiplied' });
    canvasRef.width = imgBitmap.width; canvasRef.height = imgBitmap.height;

    const texture = device.createTexture({
      size: [imgBitmap.width, imgBitmap.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.copyExternalImageToTexture({ source: imgBitmap }, { texture }, [imgBitmap.width, imgBitmap.height]);

    const module = device.createShaderModule({ code: shaderCode });
    pipeline = device.createRenderPipeline({
      layout: 'auto', vertex: { module, entryPoint: 'vs_main' },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' }
    });

    uniformBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() }
      ]
    });

    // --- INIT HISTOGRAM COMPUTE PASS ---
    const histModule = device.createShaderModule({ code: histShaderCode });
    computePipeline = device.createComputePipeline({
      layout: 'auto', compute: { module: histModule, entryPoint: 'main' }
    });

    histogramBuffer = device.createBuffer({
      size: 1024, // 256 buckets * 4 bytes (u32)
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });
    readbackBuffer = device.createBuffer({
      size: 1024,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

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
    const p = props.lightState;
    const active = p.enabled;
    const paramsArray = new Float32Array([
      active ? p.exposure : 0, active ? p.contrast : 0,
      active ? p.highlights : 0, active ? p.shadows : 0,
      active ? p.whites : 0, active ? p.blacks : 0, 0, 0
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, paramsArray);

    // Reset histogram buckets to 0
    device.queue.writeBuffer(histogramBuffer, 0, new Uint32Array(256));

    const commandEncoder = device.createCommandEncoder();

    // 1. Run Compute Pass (Histogram)
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil((canvasRef.width / 4) / 16), Math.ceil((canvasRef.height / 4) / 16));
    computePass.end();

    // 2. Run Render Pass (Visual Canvas)
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 }, loadOp: 'clear', storeOp: 'store',
      }]
    });
    passEncoder.setPipeline(pipeline); passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(6); passEncoder.end();

    // 3. Copy histogram memory to readable buffer
    commandEncoder.copyBufferToBuffer(histogramBuffer, 0, readbackBuffer, 0, 1024);

    device.queue.submit([commandEncoder.finish()]);

    // 4. Asynchronously map the memory back to JavaScript
    if (readbackBuffer.mapState === 'unmapped') {
      readbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const array = new Uint32Array(readbackBuffer.getMappedRange());
        props.onHistogramUpdate(Array.from(array));
        readbackBuffer.unmap();
      }).catch(() => {});
    }
  };

  createEffect(() => {
    const deps = [props.lightState.enabled, props.lightState.exposure, props.lightState.contrast, props.lightState.highlights, props.lightState.shadows, props.lightState.whites, props.lightState.blacks];
    renderFrame();
  });

  // --- THE EXPORT IMPLEMENTATION ---
  const exportImage = () => {
    if (!hasImage() || !canvasRef) return;
    
    // Force a full hardware rendering pass to ensure canvas state is pristine
    renderFrame();

    // Capture the WebGPU surface context using the browser standard HTML5 toBlob method
    canvasRef.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aftertone-export.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.95);
  };

  // Register this inner method cleanly with our parent component hook
  props.getExportFn(exportImage);

  const handleFileUpload = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const bmp = await createImageBitmap(file);
    initWebGPU(bmp);
  };

  // --- Interaction Controls ---
  const onWheel = (e: WheelEvent) => { if (!hasImage()) return; e.preventDefault(); setScale(s => Math.max(0.01, s * Math.exp(-e.deltaY * 0.002))); };
  const onMouseDown = (e: MouseEvent) => { if (!hasImage()) return; isDragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    setOffset(o => ({ x: o.x + (e.clientX - lastX), y: o.y + (e.clientY - lastY) }));
    lastX = e.clientX; lastY = e.clientY;
  };
  const onMouseUp = () => { isDragging = false; };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', 'align-items': 'center', 'justify-content': 'center', overflow: 'hidden', cursor: hasImage() ? (isDragging ? 'grabbing' : 'grab') : 'default' }} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
      
      {/* Viewport UI Controls Overlay */}
      <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(34, 34, 34, 0.85)', padding: '4px', 'border-radius': '6px', display: 'flex', gap: '4px', 'backdrop-filter': 'blur(8px)', 'z-index': 10, opacity: hasImage() ? 1 : 0.5, 'pointer-events': hasImage() ? 'auto' : 'none' }}>
        <button onClick={() => setScale(s => s * 1.25)} style={{ background: 'none', border: 'none', color: '#aaa', padding: '6px 10px', cursor: 'pointer' }}>Zoom +</button>
        <button onClick={() => setScale(s => s / 1.25)} style={{ background: 'none', border: 'none', color: '#aaa', padding: '6px 10px', cursor: 'pointer' }}>Zoom -</button>
        <button onClick={() => setOffset({ x: 0, y: 0 })} style={{ background: 'none', border: 'none', color: '#aaa', padding: '6px 10px', cursor: 'pointer' }}>Hand</button>
        <div style={{ width: '1px', background: '#444', margin: '4px' }}></div>
        <button onClick={() => setRotation(r => (r + 90) % 360)} style={{ background: 'none', border: 'none', color: '#aaa', padding: '6px 10px', cursor: 'pointer' }}>Rotate</button>
        <button onClick={() => setFlipX(x => x * -1)} style={{ background: 'none', border: 'none', color: '#aaa', padding: '6px 10px', cursor: 'pointer' }}>Flip H</button>
        <button onClick={() => setFlipY(y => y * -1)} style={{ background: 'none', border: 'none', color: '#aaa', padding: '6px 10px', cursor: 'pointer' }}>Flip V</button>
      </div>

      {error() && <div style={{ color: '#ff6b6b', position: 'absolute', top: '20px', 'z-index': 100 }}>{error()}</div>}
      
      <canvas 
        ref={canvasRef} 
        style={{ 
          position: 'absolute', 
          'transform-origin': 'center center',
          transform: `translate(${offset().x}px, ${offset().y}px) scale(${scale()}) rotate(${rotation()}deg) scaleX(${flipX()}) scaleY(${flipY()})`,
          display: hasImage() ? 'block' : 'none',
          'box-shadow': '0 10px 40px rgba(0,0,0,0.5)',
          transition: 'transform 0.1s cubic-bezier(0.2, 0, 0, 1)'
        }}
      />
      
      {!hasImage() && (
        <div style={{ 'z-index': 2, 'text-align': 'center' }}>
          <button onClick={() => fileInputRef.click()} style={{ background: '#0066cc', color: '#fff', border: 'none', padding: '8px 16px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '13px', 'font-weight': '600' }}>Import Photo</button>
          <input type="file" accept="image/jpeg, image/png, image/webp" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
        </div>
      )}
    </div>
  );
};
