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
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.worldPos = in.position;
    out.normal = in.normal;
    out.clipPos = u.viewProj * vec4<f32>(in.position, 1.0);
    return out;
}

fn hash2(p: vec2<f32>) -> f32 {
    let q = fract(p * vec2<f32>(127.1, 311.7));
    return fract(sin(dot(q, vec2<f32>(41.3, 289.7))) * 43758.5453);
}

fn valueNoise(p: vec2<f32>) -> f32 {
    let cell = floor(p);
    let f = fract(p);
    let w = f * f * (3.0 - 2.0 * f);
    let a = hash2(cell);
    let b = hash2(cell + vec2<f32>(1.0, 0.0));
    let c = hash2(cell + vec2<f32>(0.0, 1.0));
    let d = hash2(cell + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dist = length(u.cameraPos - in.worldPos);
    let detailFade = 1.0 - smoothstep(25.0, 170.0, dist);

    let large = valueNoise(in.worldPos.xz * 0.012);
    let medium = valueNoise(in.worldPos.xz * 0.06);
    let fine = valueNoise(in.worldPos.xz * 0.5);

    var grass = mix(vec3<f32>(0.22, 0.33, 0.14), vec3<f32>(0.33, 0.45, 0.20), large);
    grass = mix(grass, vec3<f32>(0.30, 0.40, 0.19), medium * 0.5);
    grass += vec3<f32>((fine - 0.5) * 0.035 * detailFade);
    grass = mix(grass, vec3<f32>(0.35, 0.43, 0.23), smoothstep(1.0, 11.0, in.worldPos.y) * 0.35);

    let N = normalize(in.normal);
    let slope = 1.0 - N.y;
    grass = mix(grass, vec3<f32>(0.36, 0.34, 0.26), smoothstep(0.10, 0.30, slope));

    let L = normalize(u.sunDir);
    let NdotL = max(dot(N, L), 0.0);
    let ambient = vec3<f32>(0.40, 0.46, 0.52);
    let lit = grass * (ambient + u.sunColor * NdotL * 0.60);

    let fog = clamp((dist - 120.0) / 800.0, 0.0, 0.92);
    let fogColor = vec3<f32>(0.72, 0.78, 0.80);
    return vec4<f32>(mix(lit, fogColor, fog), 1.0);
}
