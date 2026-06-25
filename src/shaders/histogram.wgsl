struct LightParams {
    exposure: f32, contrast: f32, highlights: f32, shadows: f32, whites: f32, blacks: f32,
    texture_adj: f32, clarity: f32, dehaze: f32, temp: f32, tint: f32, vibrance: f32, saturation: f32,
    hal_thresh: f32, hal_radius: f32, hal_r: f32, hal_g: f32, hal_b: f32, hal_intensity: f32,
    bloom_intensity: f32, show_hal_map: f32, is_interacting: f32,
    grain_amount: f32, grain_size: f32, grain_roughness: f32, grain_color_variance: f32,
    pad0: f32, pad1: f32, pad2: f32, pad3: f32, pad4: f32, pad5: f32
};

@group(0) @binding(0) var<uniform> params: LightParams;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;
@group(0) @binding(3) var curveTex: texture_2d<f32>;
@group(0) @binding(4) var<storage, read_write> histBuffer: array<atomic<u32>>;

fn getLuma(rgb: vec3<f32>) -> f32 { return dot(rgb, vec3<f32>(0.299, 0.587, 0.114)); }

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
