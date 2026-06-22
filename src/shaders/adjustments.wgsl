struct LightParams {
    exposure: f32,
    contrast: f32,
    highlights: f32,
    shadows: f32,
    whites: f32,
    blacks: f32,
    pad1: f32,
    pad2: f32,
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

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var color = textureSample(myTexture, mySampler, in.uv);
    var rgb = color.rgb;

    // 1. Exposure (Global luminance scaling)
    rgb = rgb * exp2(params.exposure / 50.0);
    
    // 2. Contrast (Center-pivot deviation)
    let c = (params.contrast / 100.0) + 1.0;
    rgb = (rgb - vec3<f32>(0.5)) * c + vec3<f32>(0.5);

    // 3. Tonal Masking for Shadows & Highlights
    // Calculate the perceptual luminance of the current pixel
    let luma = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    
    // Create isolation masks using smoothstep for organic blending
    // Shadows isolate the bottom 50% of the histogram
    let shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);
    // Highlights isolate the top 50% of the histogram
    let highlightMask = smoothstep(0.5, 1.0, luma);

    // Apply Shadows and Highlights based on their respective masks
    let shadowAdj = params.shadows / 100.0;
    rgb = rgb + (rgb * shadowAdj * shadowMask);

    let highlightAdj = params.highlights / 100.0;
    rgb = rgb + (rgb * highlightAdj * highlightMask);

    // 4. Whites & Blacks (Black/White Point Mapping)
    // Shifting the extremes of the histogram to crush blacks or blow out whites
    let whitePoint = 1.0 - (params.whites / 200.0);
    let blackPoint = 0.0 - (params.blacks / 200.0);
    
    rgb = (rgb - vec3<f32>(blackPoint)) / vec3<f32>(whitePoint - blackPoint);

    // Clamp output to strictly 0.0 -> 1.0 bounds to prevent display artifacts
    return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}
