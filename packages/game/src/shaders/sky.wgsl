struct Uniforms {
    invViewProj: mat4x4<f32>,
    sunDir: vec3<f32>,
    time: f32,
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
    let upDot = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    
    let horizonColor = vec3<f32>(0.72, 0.85, 0.98);
    let zenithColor  = vec3<f32>(0.2, 0.48, 0.88);
    let skyColor = mix(horizonColor, zenithColor, pow(upDot, 0.8));
    
    let L = normalize(u.sunDir);
    let sunDot = max(dot(dir, L), 0.0);
    let sunDisc = pow(sunDot, 256.0) * 1.5;
    let sunGlow = pow(sunDot, 12.0) * vec3<f32>(1.0, 0.92, 0.75) * 0.45;
    
    return vec4<f32>(skyColor + sunGlow + vec3<f32>(sunDisc), 1.0);
}
