struct LightParams {
    exposure: f32, contrast: f32, highlights: f32, shadows: f32, whites: f32, blacks: f32, pad1: f32, pad2: f32,
};

@group(0) @binding(0) var<uniform> params: LightParams;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> bins: array<atomic<u32>, 256>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let dims = vec2<f32>(textureDimensions(myTexture));
    
    // Optimization: Process 1 in every 16 pixels. 
    let x = f32(id.x * 4u);
    let y = f32(id.y * 4u);
    if (x >= dims.x || y >= dims.y) { return; }

    var color = textureSampleLevel(myTexture, mySampler, vec2<f32>(x, y) / dims, 0.0);
    var rgb = color.rgb;

    // 1. Apply identical Light panel math
    rgb = rgb * exp2(params.exposure / 50.0);
    let c = (params.contrast / 100.0) + 1.0;
    rgb = (rgb - vec3<f32>(0.5)) * c + vec3<f32>(0.5);

    let luma = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    let shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);
    let highlightMask = smoothstep(0.5, 1.0, luma);
    
    rgb = rgb + (rgb * (params.shadows / 100.0) * shadowMask);
    rgb = rgb + (rgb * (params.highlights / 100.0) * highlightMask);
    
    let whitePoint = 1.0 - (params.whites / 200.0);
    let blackPoint = 0.0 - (params.blacks / 200.0);
    rgb = (rgb - vec3<f32>(blackPoint)) / vec3<f32>(whitePoint - blackPoint);
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));

    // 2. Calculate final luminance and drop into atomic bin
    let finalLuma = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    let bin = u32(finalLuma * 255.0);
    
    atomicAdd(&bins[clamp(bin, 0u, 255u)], 1u);
}
