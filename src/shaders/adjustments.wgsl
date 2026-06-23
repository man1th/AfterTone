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

    // ==========================================================
    // 1. PROFESSIONAL WHITE BALANCE (Sensor Multiplicative Gain)
    // ==========================================================
    let t_val = params.temp / 100.0;
    let tint_val = params.tint / 100.0;

    let r_temp = 1.0 + (t_val * 0.18);
    let b_temp = 1.0 - (t_val * 0.18);

    let r_tint = 1.0 + (tint_val * 0.08);
    let g_tint = 1.0 - (tint_val * 0.14);
    let b_tint = 1.0 + (tint_val * 0.08);

    rgb.r = rgb.r * r_temp * r_tint;
    rgb.g = rgb.g * g_tint;
    rgb.b = rgb.b * b_temp * b_tint;

    // ==========================================================
    // 2. V1 BASE LIGHTING CORE (UNTOUCHED)
    // ==========================================================
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

    // ==========================================================
    // 3. ADVANCED PRESENCE (Multi-Scale 20-Tap Spatial Engine)
    // ==========================================================
    if (params.texture_adj != 0.0 || params.clarity != 0.0 || params.dehaze != 0.0) {
        
        let t_offset = 1.2;
        let ts0 = textureSample(myTexture, mySampler, in.uv + vec2<f32>(dx * t_offset, 0.0)).rgb;
        let ts1 = textureSample(myTexture, mySampler, in.uv - vec2<f32>(dx * t_offset, 0.0)).rgb;
        let ts2 = textureSample(myTexture, mySampler, in.uv + vec2<f32>(0.0, dy * t_offset)).rgb;
        let ts3 = textureSample(myTexture, mySampler, in.uv - vec2<f32>(0.0, dy * t_offset)).rgb;
        let fine_blur = (ts0 + ts1 + ts2 + ts3) * 0.25;
        
        if (params.texture_adj != 0.0) {
            let fine_detail = rgb - fine_blur;
            rgb += fine_detail * (params.texture_adj / 40.0);
        }

        let center_luma = getLuma(rgb);
        var sigma_r = 0.15;
        if (params.clarity < 0.0) { sigma_r = 0.45; }
        let denom = 2.0 * sigma_r * sigma_r;

        var mid_blur = vec3<f32>(0.0);    var mid_w = 0.0;
        var coarse_blur = vec3<f32>(0.0); var coarse_w = 0.0;
        var spatial_min_dark = min(min(rgb.r, rgb.g), rgb.b);

        let mid_offsets = array<vec2<f32>, 8>(
            vec2<f32>(-3.0, -3.0), vec2<f32>(0.0, -4.0), vec2<f32>(3.0, -3.0),
            vec2<f32>(-4.0,  0.0),                       vec2<f32>(4.0,  0.0),
            vec2<f32>(-3.0,  3.0), vec2<f32>(0.0,  4.0), vec2<f32>(3.0,  3.0)
        );

        for (var i = 0; i < 8; i++) {
            let s_uv = in.uv + mid_offsets[i] * vec2<f32>(dx, dy);
            let samp = textureSample(myTexture, mySampler, s_uv).rgb;
            let l = getLuma(samp);
            let diff = center_luma - l;
            let w = exp(-(diff * diff) / denom);
            mid_blur += samp * w;
            mid_w += w;
        }

        let coarse_offsets = array<vec2<f32>, 8>(
            vec2<f32>(-8.0, -8.0), vec2<f32>(0.0, -11.0), vec2<f32>(8.0, -8.0),
            vec2<f32>(-11.0,  0.0),                        vec2<f32>(11.0,  0.0),
            vec2<f32>(-8.0,  8.0), vec2<f32>(0.0,  11.0), vec2<f32>(8.0,  8.0)
        );

        for (var i = 0; i < 8; i++) {
            let s_uv = in.uv + coarse_offsets[i] * vec2<f32>(dx, dy);
            let samp = textureSample(myTexture, mySampler, s_uv).rgb;
            let d_chan = min(min(samp.r, samp.g), samp.b);
            spatial_min_dark = min(spatial_min_dark, d_chan);
            coarse_blur += samp;
            coarse_w += 1.0;
        }

        if (mid_w > 0.01) {
            let local_structure = mid_blur / mid_w;
            let clarity_detail = rgb - local_structure;
            rgb += clarity_detail * (params.clarity / 35.0);
        }

        if (params.dehaze > 0.0) {
            let transmission = clamp(1.0 - (0.85 * spatial_min_dark), 0.15, 1.0);
            let airlight = vec3<f32>(0.98, 0.99, 1.0);
            let dehazed = (rgb - airlight) / transmission + airlight;
            let d_luma = getLuma(dehazed);
            let saturated_dehazed = mix(vec3<f32>(d_luma), dehazed, 1.15);
            rgb = mix(rgb, saturated_dehazed, params.dehaze / 100.0);
        } else if (params.dehaze < 0.0) {
            let haze_factor = abs(params.dehaze) / 100.0;
            let low_freq_scene = coarse_blur / coarse_w;
            let mist_color = vec3<f32>(0.94, 0.95, 0.97); 
            let scattering_glow = mix(mist_color, low_freq_scene * 1.25, 0.35);
            rgb = mix(rgb, scattering_glow, haze_factor * 0.65);
            let current_luma = getLuma(rgb);
            rgb = mix(vec3<f32>(current_luma), rgb, 1.0 - (haze_factor * 0.40));
            rgb = rgb + vec3<f32>(haze_factor * 0.06);
        }
    }

    // ==========================================================
    // 4. COLOR GRADING (True Vibrance & Saturation)
    // ==========================================================
    let postLuma = getLuma(rgb);
    
    // Calculate how saturated the current pixel is (0.0 to 1.0)
    let current_saturation = clamp(max(max(rgb.r, rgb.g), rgb.b) - min(min(rgb.r, rgb.g), rgb.b), 0.0, 1.0);
    
    // Linear Saturation Multiplier
    let sat_scale = 1.0 + (params.saturation / 100.0);
    
    // Non-Linear Vibrance Multiplier
    let v = params.vibrance / 100.0;
    var vib_scale: f32;
    if (v >= 0.0) {
        // Positive Vibrance: Protects highly saturated pixels (skin tones/neon) by reducing the boost
        vib_scale = 1.0 + (v * (1.0 - current_saturation));
    } else {
        // Negative Vibrance: Desaturates highly saturated pixels much faster than pastels
        vib_scale = 1.0 + (v * current_saturation);
    }
    
    // STRICT ZERO CLAMP: Forbids the combined multiplier from dropping below 0.0.
    // This absolutely prevents the purple/sepia phase-inversion bug.
    let final_color_scale = max(0.0, sat_scale * vib_scale);
    
    rgb = mix(vec3<f32>(postLuma), rgb, final_color_scale);

    return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}
