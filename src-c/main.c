#include <stdio.h>
#include <emscripten.h>
#include <webgpu/webgpu.h>

// Expanded to exactly 16 floats (64 bytes) for strict WebGPU buffer alignment
typedef struct {
    float exposure; float contrast; float highlights; float shadows; float whites; float blacks;
    float texture; float clarity; float dehaze;
    float temp; float tint; float vibrance; float saturation;
    float pad1; float pad2; float pad3;
} LightParams;

LightParams current_params = {0};

EMSCRIPTEN_KEEPALIVE
int init_backend() {
    printf("[AFTERTONE] V2 Pipeline initialized. Spatial Processing Online.\n");
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void update_light_params(
    float exposure, float contrast, float highlights, float shadows, float whites, float blacks,
    float texture, float clarity, float dehaze,
    float temp, float tint, float vibrance, float saturation
) {
    current_params.exposure = exposure; current_params.contrast = contrast; 
    current_params.highlights = highlights; current_params.shadows = shadows; 
    current_params.whites = whites; current_params.blacks = blacks;
    current_params.texture = texture; current_params.clarity = clarity; current_params.dehaze = dehaze;
    current_params.temp = temp; current_params.tint = tint; 
    current_params.vibrance = vibrance; current_params.saturation = saturation;
}
