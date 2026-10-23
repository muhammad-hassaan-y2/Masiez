struct Uniforms {
    invViewProj: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) viewRay: vec3<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );

    var out: VertexOutput;
    let p = pos[vertexIndex];
    out.clipPos = vec4<f32>(p, 0.9999, 1.0);
    let worldP = u.invViewProj * vec4<f32>(p, 1.0, 1.0);
    out.viewRay = worldP.xyz;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dir = normalize(in.viewRay);
    let height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    let horizonColor = vec3<f32>(0.72, 0.78, 0.80);
    let zenithColor = vec3<f32>(0.45, 0.53, 0.62);
    let skyColor = mix(horizonColor, zenithColor, pow(height, 0.9));
    return vec4<f32>(skyColor, 1.0);
}
