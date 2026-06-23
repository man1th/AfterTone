const fs = require('fs');

// 1. Viewport Update
if (fs.existsSync('src/components/Viewport.tsx')) {
  let file = fs.readFileSync('src/components/Viewport.tsx', 'utf8');
  
  if (!file.includes('curveTexture')) {
    // Inject interface extension safely
    file = file.replace(/interface ViewportProps\s*\{/, 'interface ViewportProps {\n  curves: any;');
    
    // Inject local device hardware binding references
    file = file.replace(/let uniformBuffer:\s*GPUBuffer;/, 'let uniformBuffer: GPUBuffer;\n  let curveTexture: GPUTexture;\n  let curveTextureView: GPUTextureView;');
    
    // Inject physical instantiation steps
    file = file.replace(
      /(uniformBuffer = device\.createBuffer[\s\S]*?\}\);)/,
      `$1\n    curveTexture = device.createTexture({\n      size: [256, 1, 1],\n      format: 'rgba8unorm',\n      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST\n    });\n    curveTextureView = curveTexture.createView();`
    );

    // Append Texture Array write cycle to requestAnimationFrame execution loop
    file = file.replace(
      /(device\.queue\.writeBuffer\(uniformBuffer[\s\S]*?;\s*\}\s*\}\);)/,
      `$1\n    createEffect(() => {\n      if (!device || !props.curves) return;\n      import('../utils/spline').then(({ generateToneCurveLUT }) => {\n        const lut = generateToneCurveLUT(props.curves.master, props.curves.red, props.curves.green, props.curves.blue);\n        device.queue.writeTexture({ texture: curveTexture }, lut, { bytesPerRow: 1024 }, [256, 1, 1]);\n      });\n    });`
    );

    // Dynamically insert into pipeline binding arrays
    file = file.replace(
      /(entries:\s*\[\s*\{\s*binding:\s*0[\s\S]*?\}\s*\])/g,
      (match) => match.replace(/\{\s*binding:\s*2,\s*resource:\s*texture\.createView\(\)\s*\}/g, `{ binding: 2, resource: texture.createView() }, { binding: 3, resource: curveTextureView }`)
    );
    
    fs.writeFileSync('src/components/Viewport.tsx', file);
    console.log("✔ Viewport.tsx updated successfully.");
  }
}

// 2. Fragment & Compute Shader Bindings Updates
['src/shaders/adjustments.wgsl', 'src/shaders/histogram.wgsl'].forEach(path => {
  if (fs.existsSync(path)) {
    let shader = fs.readFileSync(path, 'utf8');
    if (!shader.includes('curveTex')) {
      shader = shader.replace(
        /@group\(0\)\s*@binding\(2\)\s*var\s*myTexture\s*:\s*texture_2d<f32>;/,
        `@group(0) @binding(2) var myTexture : texture_2d<f32>;\n@group(0) @binding(3) var curveTex : texture_2d<f32>;`
      );
      
      if (path.includes('histogram')) {
        shader = shader.replace(/@binding\(3\)\s*var<storage,\s*read_write>/, '@binding(4) var<storage, read_write>');
      }

      // 10X Lookup optimization via textureLoad (No linear interpolation artifacts)
      const lookupFormula = `
  // Hardware Lookup Engine Implementation
  let crd_r = vec2<i32>(i32(clamp(rgb.r, 0.0, 1.0) * 255.0), 0);
  let crd_g = vec2<i32>(i32(clamp(rgb.g, 0.0, 1.0) * 255.0), 0);
  let crd_b = vec2<i32>(i32(clamp(rgb.b, 0.0, 1.0) * 255.0), 0);

  rgb.r = textureLoad(curveTex, crd_r, 0).a;
  rgb.g = textureLoad(curveTex, crd_g, 0).a;
  rgb.b = textureLoad(curveTex, crd_b, 0).a;

  let crd_r2 = vec2<i32>(i32(clamp(rgb.r, 0.0, 1.0) * 255.0), 0);
  let crd_g2 = vec2<i32>(i32(clamp(rgb.g, 0.0, 1.0) * 255.0), 0);
  let crd_b2 = vec2<i32>(i32(clamp(rgb.b, 0.0, 1.0) * 255.0), 0);

  rgb.r = textureLoad(curveTex, crd_r2, 0).r;
  rgb.g = textureLoad(curveTex, crd_g2, 0).g;
  rgb.b = textureLoad(curveTex, crd_b2, 0).b;
  
  rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));`;

      shader = shader.replace(/rgb\s*=\s*clamp\(rgb,\s*vec3<f32>\(0\.0\),\s*vec3<f32>\(1\.0\)\);/, lookupFormula);
      fs.writeFileSync(path, shader);
      console.log(`✔ ${path} pipeline shaders updated.`);
    }
  }
});
