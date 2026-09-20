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
    // Full screen triangle
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );
    
    var out: VertexOutput;
    let p = pos[vertexIndex];
    out.clipPos = vec4<f32>(p, 0.99999, 1.0);
    
    // Unproject to world view ray
    let worldP = u.invViewProj * vec4<f32>(p, 1.0, 1.0);
    out.viewRay = worldP.xyz / worldP.w;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dir = normalize(in.viewRay);
    
    // Atmospheric Rayleigh/Mie scattering gradient
    let up = vec3<f32>(0.0, 1.0, 0.0);
    let upDot = clamp(dot(dir, up), 0.0, 1.0);
    
    let horizonColor = vec3<f32>(0.7, 0.82, 0.95);
    let zenithColor  = vec3<f32>(0.15, 0.4, 0.85);
    let skyColor = mix(horizonColor, zenithColor, pow(upDot, 0.6));
    
    // Sun disc
    let sunDot = max(dot(dir, normalize(u.sunDir)), 0.0);
    let sunDisc = pow(sunDot, 512.0) * 1.5;
    let sunGlow = pow(sunDot, 16.0) * vec3<f32>(1.0, 0.9, 0.7) * 0.4;
    
    let finalColor = skyColor + sunGlow + vec3<f32>(sunDisc, sunDisc, sunDisc);
    return vec4<f32>(finalColor, 1.0);
}
