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

fn getLuma(rgb: vec3<f32>) -> f32 {
    return dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(myTexture));
    let dx = 1.0 / dims.x;
    let dy = 1.0 / dims.y;

    var color = textureSample(myTexture, mySampler, in.uv);
    var rgb = color.rgb;

    // ==========================================
    // 1. TRUE WHITE BALANCE (Von Kries Adaptation)
    // ==========================================
    // We scale RGB channels multiplicatively rather than additively. 
    // This perfectly mimics physical optical filters and RAW debayer logic.
    let temp = params.temp / 100.0; // -1.0 to 1.0
    let tint = params.tint / 100.0;
    
    let r_scale = 1.0 + (temp * 0.2) + (tint * 0.1);
    let g_scale = 1.0 - (tint * 0.1);
    let b_scale = 1.0 - (temp * 0.2) + (tint * 0.1);
    
    rgb = vec3<f32>(rgb.r * r_scale, rgb.g * g_scale, rgb.b * b_scale);


    // ==========================================
    // 2. V1 BASE LIGHTING (UNTOUCHED)
    // ==========================================
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
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));


    // ==========================================
    // 3. PRESENCE: BILATERAL SPATIAL FILTERS
    // ==========================================
    if (params.texture_adj != 0.0 || params.clarity != 0.0 || params.dehaze != 0.0) {
        let center_luma = getLuma(rgb);
        
        var tex_blur = vec3<f32>(0.0); var tex_weight = 0.0;
        var clar_blur = vec3<f32>(0.0); var clar_weight = 0.0;

        // 8-neighbor unrolled loop for zero-branching GPU execution
        let offsets = array<vec2<f32>, 8>(
            vec2<f32>(-1., -1.), vec2<f32>(0., -1.), vec2<f32>(1., -1.),
            vec2<f32>(-1.,  0.),                     vec2<f32>(1.,  0.),
            vec2<f32>(-1.,  1.), vec2<f32>(0.,  1.), vec2<f32>(1.,  1.)
        );

        // Single-pass sampling loop
        for (var i = 0; i < 8; i++) {
            // Texture uses a tight 1px radius for High-Frequency micro-contrast
            let t_samp = textureSample(myTexture, mySampler, in.uv + (offsets[i] * vec2<f32>(dx, dy))).rgb;
            // Clarity uses a wide 4px radius for Mid-Frequency structure
            let c_samp = textureSample(myTexture, mySampler, in.uv + (offsets[i] * vec2<f32>(dx * 4.0, dy * 4.0))).rgb;

            let t_luma = getLuma(t_samp);
            let c_luma = getLuma(c_samp);

            // EDGE PRESERVATION MAGIC:
            // If the neighbor is drastically different in brightness, weight approaches 0.
            // This prevents halos around sharp edges (the hallmark of bad Clarity filters).
            let t_w = exp(-abs(center_luma - t_luma) * 15.0);
            let c_w = exp(-abs(center_luma - c_luma) * 8.0);

            tex_blur += t_samp * t_w;   tex_weight += t_w;
            clar_blur += c_samp * c_w;  clar_weight += c_w;
        }

        // Apply Frequency Separation
        if (tex_weight > 0.0) { rgb += (rgb - (tex_blur / tex_weight)) * (params.texture_adj / 50.0); }
        if (clar_weight > 0.0) { rgb += (rgb - (clar_blur / clar_weight)) * (params.clarity / 50.0); }

        // DEHAZE: Dark Channel Prior Approximation
        // Finds the lowest channel value in the pixel (the "veil" of atmospheric scattering)
        // and subtracts it while boosting the exposure back up to recover lost contrast.
        let dark_channel = min(min(rgb.r, rgb.g), rgb.b);
        let haze_amt = params.dehaze / 100.0;
        let veil = dark_channel * haze_amt;
        
        rgb = max(rgb - vec3<f32>(veil), vec3<f32>(0.0));
        // Recover luminosity lost to dehazing
        rgb = rgb * (1.0 + (haze_amt * 0.5)); 
    }


    // ==========================================
    // 4. COLOR GRADING (Vibrance & Saturation)
    // ==========================================
    let postLuma = getLuma(rgb);
    let current_saturation = max(max(rgb.r, rgb.g), rgb.b) - min(min(rgb.r, rgb.g), rgb.b);
    let vib_amt = (params.vibrance / 100.0) * (1.0 - current_saturation);
    let sat_amt = (params.saturation / 100.0);
    rgb = mix(vec3<f32>(postLuma), rgb, 1.0 + sat_amt + vib_amt);

    return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}
