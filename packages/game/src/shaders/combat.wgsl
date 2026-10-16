struct Uniforms {
    viewProj: mat4x4<f32>,
    cameraPos: vec3<f32>,
    time: f32,
    sunDir: vec3<f32>,
    pad0: f32,
    sunColor: vec3<f32>,
    pad1: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) extra: vec4<f32>, // extra.x: emissive (0..1), extra.y: type
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) emissive: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.worldPos = in.position;
    out.normal = in.normal;
    out.color = in.color;
    out.emissive = in.extra.x;
    out.clipPos = u.viewProj * vec4<f32>(in.position, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // If emissive (lasers, beacon lights, sparks), emit bright saturated color
    if (in.emissive > 0.5) {
        return in.color;
    }

    let N = normalize(in.normal);
    let L = normalize(u.sunDir);
    let V = normalize(u.cameraPos - in.worldPos);

    let NdotL = max(dot(N, L), 0.0);
    let ambient = vec3<f32>(0.35, 0.4, 0.5) * 0.5;
    let diffuse = u.sunColor * NdotL * 0.75;

    let H = normalize(L + V);
    let NdotH = max(dot(N, H), 0.0);
    let spec = pow(NdotH, 32.0) * 0.3;

    let lighting = ambient + diffuse + vec3<f32>(spec);
    let finalRgb = in.color.rgb * lighting;

    return vec4<f32>(finalRgb, in.color.a);
}
