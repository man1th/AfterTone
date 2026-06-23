struct LightParams {
    exposure: f32, contrast: f32, highlights: f32, shadows: f32, whites: f32, blacks: f32,
    texture_adj: f32, clarity: f32, dehaze: f32,
    temp: f32, tint: f32, vibrance: f32, saturation: f32,
    pad1: f32, pad2: f32, pad3: f32
};

@group(0) @binding(0) var<uniform> params: LightParams;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;
@group(0) @binding(3) var curveTex: texture_2d<f32>;
@group(0) @binding(4) var<storage, read_write> bins: array<atomic<u32>, 256>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let dims = vec2<f32>(textureDimensions(myTexture));
    let x = f32(id.x * 4u); let y = f32(id.y * 4u);
    if (x >= dims.x || y >= dims.y) { return; }

    var rgb = textureSampleLevel(myTexture, mySampler, vec2<f32>(x, y) / dims, 0.0).rgb;

    let t_val = params.temp / 100.0; let tint_val = params.tint / 100.0;
    rgb.r = rgb.r * (1.0 + (t_val * 0.18)) * (1.0 + (tint_val * 0.08));
    rgb.g = rgb.g * (1.0 - (tint_val * 0.14));
    rgb.b = rgb.b * (1.0 - (t_val * 0.18)) * (1.0 + (tint_val * 0.08));

    rgb = rgb * exp2(params.exposure / 50.0);
    rgb = (rgb - vec3<f32>(0.5)) * ((params.contrast / 100.0) + 1.0) + vec3<f32>(0.5);

    let luma = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    rgb = rgb + (rgb * (params.shadows / 100.0) * (1.0 - smoothstep(0.0, 0.5, luma)));
    rgb = rgb + (rgb * (params.highlights / 100.0) * smoothstep(0.5, 1.0, luma));
    
    let w_p = 1.0 - (params.whites / 200.0); let b_p = 0.0 - (params.blacks / 200.0);
    rgb = (rgb - vec3<f32>(b_p)) / vec3<f32>(w_p - b_p);
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));

    // Histogram accurately tracks the Tone Curve
    rgb.r = textureLoad(curveTex, vec2<i32>(i32(rgb.r * 255.0), 0), 0).a;
    rgb.g = textureLoad(curveTex, vec2<i32>(i32(rgb.g * 255.0), 0), 0).a;
    rgb.b = textureLoad(curveTex, vec2<i32>(i32(rgb.b * 255.0), 0), 0).a;

    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    rgb.r = textureLoad(curveTex, vec2<i32>(i32(rgb.r * 255.0), 0), 0).r;
    rgb.g = textureLoad(curveTex, vec2<i32>(i32(rgb.g * 255.0), 0), 0).g;
    rgb.b = textureLoad(curveTex, vec2<i32>(i32(rgb.b * 255.0), 0), 0).b;

    let finalLuma = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    atomicAdd(&bins[clamp(u32(finalLuma * 255.0), 0u, 255u)], 1u);
}
