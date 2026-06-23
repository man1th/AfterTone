struct LightParams {
    exposure: f32, contrast: f32, highlights: f32, shadows: f32, whites: f32, blacks: f32,
    texture_adj: f32, clarity: f32, dehaze: f32,
    temp: f32, tint: f32, vibrance: f32, saturation: f32,
    pad1: f32, pad2: f32, pad3: f32
};

@group(0) @binding(0) var<uniform> params: LightParams;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
    );
    var uv = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
    );
    var output: VertexOutput;
    output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
    output.uv = uv[vertexIndex];
    return output;
}

// Color Space Math Helper
fn getLuma(rgb: vec3<f32>) -> f32 {
    return dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(myTexture));
    let dx = 1.0 / dims.x;
    let dy = 1.0 / dims.y;

    // Center Pixel
    var color = textureSample(myTexture, mySampler, in.uv);
    var rgb = color.rgb;

    // --- 1. SPATIAL PROCESSING (Texture, Clarity, Dehaze) ---
    // Fast single-pass approximation using neighborhood sampling
    if (params.texture_adj != 0.0 || params.clarity != 0.0 || params.dehaze != 0.0) {
        // Texture samples tightly packed neighbors
        let t_offset = 1.0;
        let t_blur = (
            textureSample(myTexture, mySampler, in.uv + vec2<f32>(dx * t_offset, 0.0)).rgb +
            textureSample(myTexture, mySampler, in.uv - vec2<f32>(dx * t_offset, 0.0)).rgb +
            textureSample(myTexture, mySampler, in.uv + vec2<f32>(0.0, dy * t_offset)).rgb +
            textureSample(myTexture, mySampler, in.uv - vec2<f32>(0.0, dy * t_offset)).rgb
        ) / 4.0;
        
        // Clarity samples wider neighbors for mid-frequency contrast
        let c_offset = 4.0;
        let c_blur = (
            textureSample(myTexture, mySampler, in.uv + vec2<f32>(dx * c_offset, dy * c_offset)).rgb +
            textureSample(myTexture, mySampler, in.uv - vec2<f32>(dx * c_offset, dy * c_offset)).rgb +
            textureSample(myTexture, mySampler, in.uv + vec2<f32>(-dx * c_offset, dy * c_offset)).rgb +
            textureSample(myTexture, mySampler, in.uv + vec2<f32>(dx * c_offset, -dy * c_offset)).rgb
        ) / 4.0;

        // Apply Local Contrast (Unsharp Masking)
        rgb += (rgb - t_blur) * (params.texture_adj / 50.0);
        rgb += (rgb - c_blur) * (params.clarity / 50.0);

        // Dehaze approximation: subtracting low-frequency luma and lifting contrast
        let haze_amt = params.dehaze / 100.0;
        let dark_channel = min(min(rgb.r, rgb.g), rgb.b);
        rgb = mix(rgb, (rgb - vec3<f32>(dark_channel * 0.5)) * 1.2, haze_amt);
    }

    // --- 2. WHITE BALANCE (Temperature & Tint) ---
    // Temp: Adjusts Blue/Yellow axis. Tint: Adjusts Green/Magenta axis.
    let temp = params.temp / 200.0;
    let tint = params.tint / 200.0;
    rgb.r = rgb.r + temp + tint;
    rgb.g = rgb.g + tint;
    rgb.b = rgb.b - temp;

    // --- 3. BASE LIGHTING (V1 Logic) ---
    rgb = rgb * exp2(params.exposure / 50.0);
    let c = (params.contrast / 100.0) + 1.0;
    rgb = (rgb - vec3<f32>(0.5)) * c + vec3<f32>(0.5);

    let luma = getLuma(rgb);
    let shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);
    let highlightMask = smoothstep(0.5, 1.0, luma);
    rgb = rgb + (rgb * (params.shadows / 100.0) * shadowMask);
    rgb = rgb + (rgb * (params.highlights / 100.0) * highlightMask);
    
    let whitePoint = 1.0 - (params.whites / 200.0);
    let blackPoint = 0.0 - (params.blacks / 200.0);
    rgb = (rgb - vec3<f32>(blackPoint)) / vec3<f32>(whitePoint - blackPoint);

    // --- 4. COLOR GRADING (Vibrance & Saturation) ---
    let postLuma = getLuma(rgb);
    let current_saturation = max(max(rgb.r, rgb.g), rgb.b) - min(min(rgb.r, rgb.g), rgb.b);
    
    // Vibrance non-linearly protects already saturated pixels
    let vib_amt = (params.vibrance / 100.0) * (1.0 - current_saturation);
    let sat_amt = (params.saturation / 100.0);
    
    rgb = mix(vec3<f32>(postLuma), rgb, 1.0 + sat_amt + vib_amt);

    return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}
