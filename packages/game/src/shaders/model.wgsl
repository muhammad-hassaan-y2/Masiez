struct Uniforms {
    viewProj: mat4x4<f32>,
    model: mat4x4<f32>,
    cameraPos: vec3<f32>,
    time: f32,
    sunDir: vec3<f32>,
    pad0: f32,
    sunColor: vec3<f32>,
    pad1: f32,
    baseColorFactor: vec4<f32>,
    hasTexture: u32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var albedoTex: texture_2d<f32>;
@group(0) @binding(2) var texSampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let worldPos4 = u.model * vec4<f32>(in.position, 1.0);
    out.worldPos = worldPos4.xyz;
    
    let normal4 = u.model * vec4<f32>(in.normal, 0.0);
    out.normal = normalize(normal4.xyz);
    out.uv = in.uv;
    out.clipPos = u.viewProj * worldPos4;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var baseColor = u.baseColorFactor;
    if (u.hasTexture == 1u) {
        let texColor = textureSample(albedoTex, texSampler, in.uv);
        baseColor = baseColor * texColor;
    }
    
    let N = normalize(in.normal);
    let L = normalize(u.sunDir);
    let V = normalize(u.cameraPos - in.worldPos);
    
    let NdotL = max(dot(N, L), 0.0);
    let ambient = vec3<f32>(0.3, 0.35, 0.45) * 0.6;
    let diffuse = u.sunColor * NdotL * 0.8;
    
    let H = normalize(L + V);
    let NdotH = max(dot(N, H), 0.0);
    let specular = pow(NdotH, 32.0) * vec3<f32>(0.6, 0.6, 0.6);
    
    let litColor = (ambient + diffuse) * baseColor.rgb + specular;
    return vec4<f32>(litColor, baseColor.a);
}
