struct FrameUniforms {
    viewProj: mat4x4<f32>,
    cameraPos: vec3<f32>,
    time: f32,
    sunDir: vec3<f32>,
    pad0: f32,
    sunColor: vec3<f32>,
    pad1: f32,
};

struct InstanceUniforms {
    model: mat4x4<f32>,
    baseColorFactor: vec4<f32>,
    hasTexture: u32,
    pad0: u32,
    pad1: u32,
    pad2: u32,
};

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(1) @binding(0) var<uniform> inst: InstanceUniforms;
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
    let world = inst.model * vec4<f32>(in.position, 1.0);
    out.worldPos = world.xyz;
    out.normal = normalize((inst.model * vec4<f32>(in.normal, 0.0)).xyz);
    out.uv = in.uv;
    out.clipPos = frame.viewProj * world;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var baseColor = inst.baseColorFactor;
    if (inst.hasTexture == 1u) {
        baseColor = baseColor * textureSample(albedoTex, texSampler, in.uv);
    }

    let N = normalize(in.normal);
    let L = normalize(frame.sunDir);
    let V = normalize(frame.cameraPos - in.worldPos);

    let NdotL = max(dot(N, L), 0.0);
    let ambient = vec3<f32>(0.3, 0.35, 0.45) * 0.6;
    let diffuse = frame.sunColor * NdotL * 0.8;

    let H = normalize(L + V);
    let specular = pow(max(dot(N, H), 0.0), 32.0) * vec3<f32>(0.35, 0.35, 0.35);

    let lit = (ambient + diffuse) * baseColor.rgb + specular;
    let dist = length(frame.cameraPos - in.worldPos);
    let fog = clamp((dist - 120.0) / 800.0, 0.0, 1.0);
    return vec4<f32>(mix(lit, vec3<f32>(0.72, 0.78, 0.80), fog), baseColor.a);
}
