struct LightParams {
    exposure: f32, contrast: f32, highlights: f32, shadows: f32, whites: f32, blacks: f32,
    texture_adj: f32, clarity: f32, dehaze: f32, temp: f32, tint: f32, vibrance: f32, saturation: f32,
    pad1: f32, pad2: f32, pad3: f32
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

    rgb = rgb * exp2(params.exposure / 50.0);
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

    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    rgb.r = textureLoad(curveTex, vec2<i32>(i32(rgb.r * 255.0), 0), 0).a; rgb.g = textureLoad(curveTex, vec2<i32>(i32(rgb.g * 255.0), 0), 0).a; rgb.b = textureLoad(curveTex, vec2<i32>(i32(rgb.b * 255.0), 0), 0).a;
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    rgb.r = textureLoad(curveTex, vec2<i32>(i32(rgb.r * 255.0), 0), 0).r; rgb.g = textureLoad(curveTex, vec2<i32>(i32(rgb.g * 255.0), 0), 0).g; rgb.b = textureLoad(curveTex, vec2<i32>(i32(rgb.b * 255.0), 0), 0).b;

    let current_saturation = clamp(max(max(rgb.r, rgb.g), rgb.b) - min(min(rgb.r, rgb.g), rgb.b), 0.0, 1.0);
    let v = params.vibrance / 100.0; var vib_scale: f32; if (v >= 0.0) { vib_scale = 1.0 + (v * (1.0 - current_saturation)); } else { vib_scale = 1.0 + (v * current_saturation); }
    rgb = mix(vec3<f32>(getLuma(rgb)), rgb, max(0.0, (1.0 + (params.saturation / 100.0)) * vib_scale));
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));

    // DYNAMIC SPLIT SCREEN
    if (params.pad1 > 0.5) {
        let split_pos = params.pad2;
        if (in.uv.x < split_pos) {
            rgb = color.rgb; 
        } else if (abs(in.uv.x - split_pos) < dx * 1.5) {
            rgb = vec3<f32>(0.85); 
        }
    }

    return vec4<f32>(rgb, color.a);
}
