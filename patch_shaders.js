const fs = require('fs');

const injectToneCurve = (file, isHistogram) => {
    let code = fs.readFileSync(file, 'utf8');
    
    // Add the curve texture binding
    code = code.replace(
        /@group\(0\) @binding\(2\) var myTexture: texture_2d<f32>;/,
        `@group(0) @binding(2) var myTexture: texture_2d<f32>;\n@group(0) @binding(3) var curveTex: texture_2d<f32>;`
    );

    if (isHistogram) {
        code = code.replace(/binding\(3\) var<storage, read_write> bins/, `binding(4) var<storage, read_write> bins`);
    }

    // Insert the Tone Curve math after the Base Lighting block
    const target = `rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));`;
    const curveLogic = `
    // --- TONE CURVE ENGINE ---
    // 1. Master Curve (A channel)
    rgb.r = textureSampleLevel(curveTex, mySampler, vec2<f32>(rgb.r, 0.5), 0.0).a;
    rgb.g = textureSampleLevel(curveTex, mySampler, vec2<f32>(rgb.g, 0.5), 0.0).a;
    rgb.b = textureSampleLevel(curveTex, mySampler, vec2<f32>(rgb.b, 0.5), 0.0).a;
    
    // 2. RGB Individual Curves (R, G, B channels)
    rgb.r = textureSampleLevel(curveTex, mySampler, vec2<f32>(rgb.r, 0.5), 0.0).r;
    rgb.g = textureSampleLevel(curveTex, mySampler, vec2<f32>(rgb.g, 0.5), 0.0).g;
    rgb.b = textureSampleLevel(curveTex, mySampler, vec2<f32>(rgb.b, 0.5), 0.0).b;
    `;
    code = code.replace(target, `${target}\n${curveLogic}`);
    fs.writeFileSync(file, code);
};

injectToneCurve('src/shaders/adjustments.wgsl', false);
injectToneCurve('src/shaders/histogram.wgsl', true);
