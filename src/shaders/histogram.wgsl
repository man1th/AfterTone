struct LightParams {
    exposure: f32, contrast: f32, highlights: f32, shadows: f32, whites: f32, blacks: f32,
    texture_adj: f32, clarity: f32, dehaze: f32, temp: f32, tint: f32, vibrance: f32, saturation: f32,
    hal_thresh: f32, hal_radius: f32, hal_r: f32, hal_g: f32, hal_b: f32, hal_intensity: f32,
    bloom_intensity: f32, show_hal_map: f32, is_interacting: f32,
    grain_amount: f32, grain_size: f32, grain_roughness: f32, grain_color_variance: f32,
    cg_s_h: f32, cg_s_s: f32, cg_s_l: f32,
    cg_m_h: f32, cg_m_s: f32, cg_m_l: f32,
    cg_h_h: f32, cg_h_s: f32, cg_h_l: f32,
    cg_g_h: f32, cg_g_s: f32, cg_g_l: f32,
    cm_h_r: f32, cm_s_r: f32, cm_l_r: f32,
    cm_h_o: f32, cm_s_o: f32, cm_l_o: f32,
    cm_h_y: f32, cm_s_y: f32, cm_l_y: f32,
    cm_h_g: f32, cm_s_g: f32, cm_l_g: f32,
    cm_h_a: f32, cm_s_a: f32, cm_l_a: f32,
    cm_h_b: f32, cm_s_b: f32, cm_l_b: f32,
    cm_h_p: f32, cm_s_p: f32, cm_l_p: f32,
    cm_h_m: f32, cm_s_m: f32, cm_l_m: f32,
    vig_amount: f32, vig_midpoint: f32, vig_roundness: f32, vig_feather: f32,
    pad0: f32, pad1: f32, pad2: f32, pad3: f32, pad4: f32, pad5: f32
};

@group(0) @binding(0) var<uniform> params: LightParams;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;
@group(0) @binding(3) var curveTex: texture_2d<f32>;
@group(0) @binding(4) var<storage, read_write> histBuffer: array<atomic<u32>>;

fn getLuma(rgb: vec3<f32>) -> f32 { return dot(rgb, vec3<f32>(0.299, 0.587, 0.114)); }

fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    let p = select(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), c.b < c.g);
    let q = select(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), p.x < c.r);
    let d = q.x - min(q.w, q.y);
    let e = 1.0e-10;
    return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

fn softlight(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let limit = step(vec3<f32>(0.5), blend);
    let a = 2.0 * base * blend + base * base * (1.0 - 2.0 * blend);
    let b = sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend);
    return mix(a, b, limit);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let dims = textureDimensions(myTexture);
    let coords = vec2<u32>(global_id.x * 4u, global_id.y * 4u);
    if (coords.x >= dims.x || coords.y >= dims.y) { return; }

    let uv = vec2<f32>(coords) / vec2<f32>(dims);
    var color = textureSampleLevel(myTexture, mySampler, uv, 0.0);
    var rgb = color.rgb;

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

    var cm_h = array<f32, 8>(params.cm_h_r, params.cm_h_o, params.cm_h_y, params.cm_h_g, params.cm_h_a, params.cm_h_b, params.cm_h_p, params.cm_h_m);
    var cm_s = array<f32, 8>(params.cm_s_r, params.cm_s_o, params.cm_s_y, params.cm_s_g, params.cm_s_a, params.cm_s_b, params.cm_s_p, params.cm_s_m);
    var cm_l = array<f32, 8>(params.cm_l_r, params.cm_l_o, params.cm_l_y, params.cm_l_g, params.cm_l_a, params.cm_l_b, params.cm_l_p, params.cm_l_m);
    let centers = array<f32, 8>(0.0, 0.0833, 0.1666, 0.3333, 0.5, 0.6666, 0.7916, 0.9166);
    let widths = array<f32, 8>(0.0833, 0.0833, 0.1666, 0.1666, 0.1666, 0.125, 0.125, 0.0833);
    var hsv = rgb2hsv(rgb);
    var h_shift = 0.0; var s_mul = 1.0; var v_mul = 1.0;
    for (var i = 0u; i < 8u; i = i + 1u) {
        var dist = abs(hsv.x - centers[i]);
        dist = min(dist, 1.0 - dist);
        let w = smoothstep(widths[i], 0.0, dist);
        h_shift += (cm_h[i] / 360.0) * w; s_mul *= (1.0 + (cm_s[i] / 100.0) * w); v_mul *= (1.0 + (cm_l[i] / 100.0) * w);
    }
    hsv.x = fract(hsv.x + h_shift); if (hsv.x < 0.0) { hsv.x += 1.0; }
    hsv.y = clamp(hsv.y * s_mul, 0.0, 1.0); hsv.z = clamp(hsv.z * v_mul, 0.0, 1.0);
    rgb = hsv2rgb(hsv);

    let cg_luma = getLuma(rgb);
    let m_shadows = 1.0 - smoothstep(0.0, 0.45, cg_luma);
    let m_highlights = smoothstep(0.55, 1.0, cg_luma);
    let m_midtones = 1.0 - m_shadows - m_highlights;
    let tint_s = hsv2rgb(vec3<f32>(params.cg_s_h / 360.0, 1.0, 1.0));
    let tint_m = hsv2rgb(vec3<f32>(params.cg_m_h / 360.0, 1.0, 1.0));
    let tint_h = hsv2rgb(vec3<f32>(params.cg_h_h / 360.0, 1.0, 1.0));
    let tint_g = hsv2rgb(vec3<f32>(params.cg_g_h / 360.0, 1.0, 1.0));
    let s_color = mix(vec3<f32>(0.5), mix(vec3<f32>(0.5), tint_s, params.cg_s_s / 100.0), m_shadows);
    let m_color = mix(vec3<f32>(0.5), mix(vec3<f32>(0.5), tint_m, params.cg_m_s / 100.0), m_midtones);
    let h_color = mix(vec3<f32>(0.5), mix(vec3<f32>(0.5), tint_h, params.cg_h_s / 100.0), m_highlights);
    let g_color = mix(vec3<f32>(0.5), tint_g, params.cg_g_s / 100.0);
    let total_blend = s_color + m_color + h_color - vec3<f32>(1.0);
    let final_blend = total_blend + g_color - vec3<f32>(0.5);
    rgb = softlight(rgb, clamp(final_blend, vec3<f32>(0.0), vec3<f32>(1.0)));
    let lum_shift = (params.cg_s_l / 100.0 * m_shadows) + (params.cg_m_l / 100.0 * m_midtones) + (params.cg_h_l / 100.0 * m_highlights) + (params.cg_g_l / 100.0);
    rgb = clamp(rgb + lum_shift * 0.5, vec3<f32>(0.0), vec3<f32>(1.0));

    // VIGNETTE MAPPING TO HISTOGRAM LUMINOSITY
    if (params.vig_amount != 0.0) {
        var coord = uv * 2.0 - 1.0;
        let roundness = params.vig_roundness / 100.0; 
        let aspect = f32(dims.x) / f32(dims.y);
        let scale_x = mix(aspect, 1.0, max(roundness, 0.0));
        coord.x *= scale_x;
        let power = mix(2.0, 8.0, -min(roundness, 0.0));
        let dist = pow(pow(abs(coord.x), power) + pow(abs(coord.y), power), 1.0 / power);
        let mid = params.vig_midpoint / 100.0;
        let radius = mix(0.1, 1.2, mid);
        let feather = params.vig_feather / 100.0;
        let f_width = mix(0.01, 1.2, feather);
        let mask = smoothstep(max(0.0, radius - f_width), radius + f_width, dist);
        let amount = params.vig_amount / 100.0;
        if (amount < 0.0) { rgb *= mix(1.0, 1.0 + amount, mask); } 
        else { rgb = mix(rgb, vec3<f32>(1.0) - (vec3<f32>(1.0) - rgb) * (1.0 - amount), mask); }
    }

    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    rgb.r = textureLoad(curveTex, vec2<i32>(i32(rgb.r * 255.0), 0), 0).a;
    rgb.g = textureLoad(curveTex, vec2<i32>(i32(rgb.g * 255.0), 0), 0).a;
    rgb.b = textureLoad(curveTex, vec2<i32>(i32(rgb.b * 255.0), 0), 0).a;
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    rgb.r = textureLoad(curveTex, vec2<i32>(i32(rgb.r * 255.0), 0), 0).r;
    rgb.g = textureLoad(curveTex, vec2<i32>(i32(rgb.g * 255.0), 0), 0).g;
    rgb.b = textureLoad(curveTex, vec2<i32>(i32(rgb.b * 255.0), 0), 0).b;

    let final_luma = getLuma(rgb);
    let r_idx = min(u32(rgb.r * 255.0), 255u);
    let g_idx = min(u32(rgb.g * 255.0), 255u) + 256u;
    let b_idx = min(u32(rgb.b * 255.0), 255u) + 512u;
    let l_idx = min(u32(final_luma * 255.0), 255u) + 768u;

    atomicAdd(&histBuffer[r_idx], 1u); atomicAdd(&histBuffer[g_idx], 1u);
    atomicAdd(&histBuffer[b_idx], 1u); atomicAdd(&histBuffer[l_idx], 1u);
}
