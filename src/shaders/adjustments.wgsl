struct LightParams {
    exposure: f32, contrast: f32, highlights: f32, shadows: f32, whites: f32, blacks: f32,
    texture_adj: f32, clarity: f32, dehaze: f32, temp: f32, tint: f32, vibrance: f32, saturation: f32,
    hal_thresh: f32, hal_radius: f32, hal_r: f32, hal_g: f32, hal_b: f32, hal_intensity: f32,
    bloom_intensity: f32, show_hal_map: f32, is_interacting: f32,
    pad1: f32, pad2: f32, pad3: f32, pad4: f32, pad5: f32, pad6: f32, pad7: f32, pad8: f32, pad9: f32, pad10: f32
};

@group(0) @binding(0) var<uniform> params: LightParams;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;
@group(0) @binding(3) var curveTex: texture_2d<f32>;

struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, };

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0), vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0));
    var uv = array<vec2<f32>, 6>(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0), vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0));
    var output: VertexOutput; output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0); output.uv = uv[vertexIndex]; return output;
}

fn getLuma(rgb: vec3<f32>) -> f32 { return dot(rgb, vec3<f32>(0.299, 0.587, 0.114)); }

fn ign(v: vec2<f32>) -> f32 {
    var magic = vec3<f32>(0.06711056, 0.00583715, 52.9829189);
    return fract(magic.z * fract(dot(v, magic.xy)));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(myTexture));
    let dx = 1.0 / dims.x; let dy = 1.0 / dims.y;

    var color = textureSample(myTexture, mySampler, in.uv);
    var rgb = color.rgb;

    let t_val = params.temp / 100.0; let tint_val = params.tint / 100.0;
    let r_temp = 1.0 + (t_val * 0.18); let b_temp = 1.0 - (t_val * 0.18);
    let r_tint = 1.0 + (tint_val * 0.08); let g_tint = 1.0 - (tint_val * 0.14); let b_tint = 1.0 + (tint_val * 0.08);
    rgb.r = rgb.r * r_temp * r_tint; rgb.g = rgb.g * g_tint; rgb.b = rgb.b * b_temp * b_tint;

    let exp_mult = exp2(params.exposure / 50.0);
    rgb = rgb * exp_mult;
    
    if (params.show_hal_map > 0.5) {
        let thresh = params.hal_thresh / 100.0;
        let bw_mask = step(thresh, getLuma(rgb));
        return vec4<f32>(vec3<f32>(bw_mask), 1.0);
    }

    let c = (params.contrast / 100.0) + 1.0; rgb = (rgb - vec3<f32>(0.5)) * c + vec3<f32>(0.5);

    let luma = getLuma(rgb);
    let shadowMask = 1.0 - smoothstep(0.0, 0.5, luma); let highlightMask = smoothstep(0.5, 1.0, luma);
    rgb = rgb + (rgb * (params.shadows / 100.0) * shadowMask); rgb = rgb + (rgb * (params.highlights / 100.0) * highlightMask);
    let whitePoint = 1.0 - (params.whites / 200.0); let blackPoint = 0.0 - (params.blacks / 200.0);
    rgb = (rgb - vec3<f32>(blackPoint)) / vec3<f32>(whitePoint - blackPoint);
    
    if (params.texture_adj != 0.0 || params.clarity != 0.0 || params.dehaze != 0.0) {
        let t_offset = 1.2;
        let fine_blur = (textureSample(myTexture, mySampler, in.uv + vec2<f32>(dx * t_offset, 0.0)).rgb + textureSample(myTexture, mySampler, in.uv - vec2<f32>(dx * t_offset, 0.0)).rgb + textureSample(myTexture, mySampler, in.uv + vec2<f32>(0.0, dy * t_offset)).rgb + textureSample(myTexture, mySampler, in.uv - vec2<f32>(0.0, dy * t_offset)).rgb) * 0.25;
        if (params.texture_adj != 0.0) { rgb += (rgb - fine_blur) * (params.texture_adj / 40.0); }
        let center_luma = getLuma(rgb);
        var sigma_r = 0.15; if (params.clarity < 0.0) { sigma_r = 0.45; }
        let denom = 2.0 * sigma_r * sigma_r;
        var mid_blur = vec3<f32>(0.0); var mid_w = 0.0; var coarse_blur = vec3<f32>(0.0); var coarse_w = 0.0; var spatial_min_dark = min(min(rgb.r, rgb.g), rgb.b);
        let mid_offsets = array<vec2<f32>, 8>(vec2<f32>(-3.0, -3.0), vec2<f32>(0.0, -4.0), vec2<f32>(3.0, -3.0), vec2<f32>(-4.0,  0.0), vec2<f32>(4.0,  0.0), vec2<f32>(-3.0,  3.0), vec2<f32>(0.0,  4.0), vec2<f32>(3.0,  3.0));
        for (var i = 0; i < 8; i++) {
            let samp = textureSample(myTexture, mySampler, in.uv + mid_offsets[i] * vec2<f32>(dx, dy)).rgb;
            let l = getLuma(samp); let diff = center_luma - l; let w = exp(-(diff * diff) / denom); mid_blur += samp * w; mid_w += w;
        }
        let coarse_offsets = array<vec2<f32>, 8>(vec2<f32>(-8.0, -8.0), vec2<f32>(0.0, -11.0), vec2<f32>(8.0, -8.0), vec2<f32>(-11.0,  0.0), vec2<f32>(11.0,  0.0), vec2<f32>(-8.0,  8.0), vec2<f32>(0.0,  11.0), vec2<f32>(8.0,  8.0));
        for (var i = 0; i < 8; i++) {
            let samp = textureSample(myTexture, mySampler, in.uv + coarse_offsets[i] * vec2<f32>(dx, dy)).rgb;
            spatial_min_dark = min(spatial_min_dark, min(min(samp.r, samp.g), samp.b)); coarse_blur += samp; coarse_w += 1.0;
        }
        if (mid_w > 0.01) { rgb += (rgb - (mid_blur / mid_w)) * (params.clarity / 35.0); }
        if (params.dehaze > 0.0) {
            let transmission = clamp(1.0 - (0.85 * spatial_min_dark), 0.15, 1.0);
            let airlight = vec3<f32>(0.98, 0.99, 1.0); let dehazed = (rgb - airlight) / transmission + airlight;
            rgb = mix(rgb, mix(vec3<f32>(getLuma(dehazed)), dehazed, 1.15), params.dehaze / 100.0);
        } else if (params.dehaze < 0.0) {
            let haze_factor = abs(params.dehaze) / 100.0;
            rgb = mix(rgb, mix(vec3<f32>(0.94, 0.95, 0.97), (coarse_blur / coarse_w) * 1.25, 0.35), haze_factor * 0.65);
            rgb = mix(vec3<f32>(getLuma(rgb)), rgb, 1.0 - (haze_factor * 0.40)) + vec3<f32>(haze_factor * 0.06);
        }
    }

    let aspect_ratio = dims.y / dims.x;
    let GOLDEN_ANGLE = 2.3999632;
    let noise = ign(in.position.xy);
    let random_rotation = noise * 6.2831853; 

    // PHOTOSHOP HALATION WORKFLOW
    if (params.hal_intensity > 0.0 && params.hal_radius > 0.0) {
        var blur_accum = vec3<f32>(0.0);
        var weight_sum = 0.0;
        
        let H_TAPS = 32.0; 
        let h_stride = select(1.0, 3.0, params.is_interacting > 0.5);
        let thresh = params.hal_thresh / 100.0;
        let sigma = max(params.hal_radius, 1.0) / 3.0; 
        let two_sigma_sq = 2.0 * sigma * sigma;

        for (var i = 0.0; i < H_TAPS; i += h_stride) {
            let r_frac = sqrt(i + noise) / sqrt(H_TAPS);
            let theta = i * GOLDEN_ANGLE + random_rotation;
            let pt = vec2<f32>(cos(theta) * aspect_ratio, sin(theta)) * r_frac;
            
            let sample_uv = in.uv + pt * (params.hal_radius / dims.x);
            let s_rgb = textureSample(myTexture, mySampler, sample_uv).rgb * exp_mult;

            let s_luma = getLuma(s_rgb);
            let mask = smoothstep(thresh - 0.05, thresh + 0.05, s_luma);
            let thresh_color = s_rgb * mask;

            let dist_px = r_frac * params.hal_radius;
            let weight = exp(-(dist_px * dist_px) / two_sigma_sq);

            blur_accum += thresh_color * weight;
            weight_sum += weight;
        }
        
        let blurred_layer = blur_accum / weight_sum;
        let hal_color = vec3<f32>(params.hal_r, params.hal_g, params.hal_b);
        var overlay_res = vec3<f32>(0.0);
        
        for (var c = 0; c < 3; c++) {
            if (blurred_layer[c] < 0.5) {
                overlay_res[c] = 2.0 * blurred_layer[c] * hal_color[c];
            } else {
                overlay_res[c] = 1.0 - 2.0 * (1.0 - blurred_layer[c]) * (1.0 - hal_color[c]);
            }
        }
        
        let final_halation = overlay_res * (params.hal_intensity / 100.0);
        rgb = 1.0 - (1.0 - rgb) * (1.0 - final_halation);
    }

    // BLOOM WORKFLOW
    if (params.bloom_intensity > 0.0) {
        var bloom_accum = vec3<f32>(0.0);
        var b_weight_sum = 0.0;
        let B_TAPS = 24.0;
        let b_stride = select(1.0, 3.0, params.is_interacting > 0.5);
        
        for (var i = 0.0; i < B_TAPS; i += b_stride) {
            let r_frac = sqrt(i + noise) / sqrt(B_TAPS);
            let theta = i * GOLDEN_ANGLE + random_rotation;
            let pt = vec2<f32>(cos(theta) * aspect_ratio, sin(theta)) * r_frac;
            let sample_uv = in.uv + pt * 0.05;
            let s_rgb = textureSample(myTexture, mySampler, sample_uv).rgb * exp_mult;
            let b_weight = exp(-(r_frac * r_frac * 6.0));
            bloom_accum += s_rgb * b_weight;
            b_weight_sum += b_weight;
        }
        
        let bloom_layer = bloom_accum / b_weight_sum;
        let final_bloom = bloom_layer * (params.bloom_intensity / 100.0);
        rgb = 1.0 - (1.0 - rgb) * (1.0 - final_bloom);
    }

    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    rgb.r = textureLoad(curveTex, vec2<i32>(i32(rgb.r * 255.0), 0), 0).a; rgb.g = textureLoad(curveTex, vec2<i32>(i32(rgb.g * 255.0), 0), 0).a; rgb.b = textureLoad(curveTex, vec2<i32>(i32(rgb.b * 255.0), 0), 0).a;
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    rgb.r = textureLoad(curveTex, vec2<i32>(i32(rgb.r * 255.0), 0), 0).r; rgb.g = textureLoad(curveTex, vec2<i32>(i32(rgb.g * 255.0), 0), 0).g; rgb.b = textureLoad(curveTex, vec2<i32>(i32(rgb.b * 255.0), 0), 0).b;

    let current_saturation = clamp(max(max(rgb.r, rgb.g), rgb.b) - min(min(rgb.r, rgb.g), rgb.b), 0.0, 1.0);
    let v = params.vibrance / 100.0; var vib_scale: f32; if (v >= 0.0) { vib_scale = 1.0 + (v * (1.0 - current_saturation)); } else { vib_scale = 1.0 + (v * current_saturation); }
    rgb = mix(vec3<f32>(getLuma(rgb)), rgb, max(0.0, (1.0 + (params.saturation / 100.0)) * vib_scale));
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));

    // NOTE: Spatial compare logic is entirely stripped out of the shader for performance!

    return vec4<f32>(rgb, color.a);
}
