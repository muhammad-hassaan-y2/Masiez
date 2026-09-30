struct Uniforms {
    viewProj: mat4x4<f32>,
    cameraPos: vec3<f32>,
    time: f32,
    sunDir: vec3<f32>,
    pad0: f32,
    sunColor: vec3<f32>,
    pad1: f32,
};

struct MaterialUniforms {
    baseColorFactor: vec4<f32>,
    hasTexture: u32,
    roughness: f32,
    metallic: f32,
    pad: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var<uniform> matU: MaterialUniforms;
@group(1) @binding(1) var albedoTex: texture_2d<f32>;
@group(1) @binding(2) var texSampler: sampler;

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
    out.worldPos = in.position;
    out.normal = normalize(in.normal);
    out.uv = in.uv;
    out.clipPos = u.viewProj * vec4<f32>(in.position, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var color = matU.baseColorFactor;
    if (matU.hasTexture == 1u) {
        let tex = textureSample(albedoTex, texSampler, in.uv);
        color = color * tex;
    }
    
    // Discard fully transparent pixels
    if (color.a < 0.1) {
        discard;
    }
    
    let N = normalize(in.normal);
    let L = normalize(u.sunDir);
    let V = normalize(u.cameraPos - in.worldPos);
    
    // Sunlight diffuse
    let NdotL = max(dot(N, L), 0.0);
    let ambient = vec3<f32>(0.35, 0.42, 0.55) * 0.7;
    let diffuse = u.sunColor * NdotL * 0.85;
    
    // Specular highlight on roofs, glass, and roads
    let H = normalize(L + V);
    let NdotH = max(dot(N, H), 0.0);
    let specular = pow(NdotH, 24.0) * vec3<f32>(0.2, 0.25, 0.3) * (1.0 - matU.roughness * 0.7);
    
    // Soft atmospheric distance haze
    let dist = length(u.cameraPos - in.worldPos);
    let fog = clamp((dist - 120.0) / 800.0, 0.0, 0.55);
    let skyHaze = vec3<f32>(0.52, 0.70, 0.90);
    
    let litColor = mix((ambient + diffuse) * color.rgb + specular, skyHaze, fog);
    return vec4<f32>(litColor, color.a);
}
