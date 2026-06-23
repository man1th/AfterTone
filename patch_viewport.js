const fs = require('fs');
let code = fs.readFileSync('src/components/Viewport.tsx', 'utf8');

// Add the curve state to props
code = code.replace(
  /export const Viewport: Component<ViewportProps> = \(props\) => {/,
  `export interface ViewportProps { lightState: any; curves: any; onHistogramUpdate: (data: number[]) => void; getExportFn: (exportFn: () => void) => void; }
export const Viewport: Component<ViewportProps> = (props) => {`
);

// Add the curve texture reference
code = code.replace(/let uniformBuffer: GPUBuffer; let bindGroup: GPUBindGroup;/, `let uniformBuffer: GPUBuffer; let bindGroup: GPUBindGroup; let curveTexture: GPUTexture;`);

// Initialize the Curve Texture
code = code.replace(
  /uniformBuffer = device.createBuffer.*?COPY_DST \}\);/,
  `uniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    curveTexture = device.createTexture({ size: [256, 1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });`
);

// Update BindGroups (Inject Binding 3)
code = code.replace(
  /\{ binding: 2, resource: texture\.createView\(\) \}/g,
  `{ binding: 2, resource: texture.createView() }, { binding: 3, resource: curveTexture.createView() }`
);

// Update Compute BindGroup (Shift histogram to binding 4)
code = code.replace(/\{ binding: 3, resource: \{ buffer: histogramBuffer \} \}/g, `{ binding: 4, resource: { buffer: histogramBuffer } }`);

// Sync the LUT during Render Frame
code = code.replace(
  /device\.queue\.writeBuffer\(histogramBuffer, 0, new Uint32Array\(256\)\);/,
  `device.queue.writeBuffer(histogramBuffer, 0, new Uint32Array(256));
    
    // Import and map LUT in real-time
    import('../utils/spline').then(({ generateToneCurveLUT }) => {
      const lut = generateToneCurveLUT(props.curves.master, props.curves.red, props.curves.green, props.curves.blue);
      device.queue.writeTexture({ texture: curveTexture }, lut, { bytesPerRow: 1024 }, [256, 1, 1]);
    });`
);

// Track the curves in the solidjs effect array
code = code.replace(/props.lightState.saturation\];/, `props.lightState.saturation, props.curves];`);

fs.writeFileSync('src/components/Viewport.tsx', code);
