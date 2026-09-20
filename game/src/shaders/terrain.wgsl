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
@group(0) @binding(1) var heightmapTex: texture_2d<f32>;
@group(0) @binding(2) var normalmapTex: texture_2d<f32>;
@group(0) @binding(3) var grassAlbedoTex: texture_2d<f32>;
@group(0) @binding(4) var rockAlbedoTex: texture_2d<f32>;
@group(0) @binding(5) var texSampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    
    // Sample heightmap centered at (0,0) reference elevation = 0m
    let hCenter = textureSampleLevel(heightmapTex, texSampler, vec2<f32>(0.5, 0.5), 0.0).r;
    let hSample = textureSampleLevel(heightmapTex, texSampler, in.uv, 0.0).r;
    let worldY = (hSample - hCenter) * 60.0;
    let worldP = vec3<f32>(in.position.x, worldY, in.position.z);
    
    let nSample = textureSampleLevel(normalmapTex, texSampler, in.uv, 0.0).rgb * 2.0 - 1.0;
    
    out.worldPos = worldP;
    out.uv = in.uv;
    out.normal = normalize(nSample);
    out.clipPos = u.viewProj * vec4<f32>(worldP, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uvScaled = in.uv * 50.0;
    let grassColor = textureSample(grassAlbedoTex, texSampler, uvScaled).rgb;
    let rockColor = textureSample(rockAlbedoTex, texSampler, uvScaled).rgb;
    
    let slope = 1.0 - clamp(in.normal.y, 0.0, 1.0);
    let blend = clamp((slope - 0.15) * 3.0, 0.0, 1.0);
    let albedo = mix(grassColor, rockColor, blend);
    
    let N = normalize(in.normal);
    let L = normalize(u.sunDir);
    let NdotL = max(dot(N, L), 0.0);
    
    let ambient = vec3<f32>(0.35, 0.45, 0.55) * 0.5;
    let diffuse = u.sunColor * NdotL * 0.85;
    
    let dist = length(u.cameraPos - in.worldPos);
    let fogFactor = clamp((dist - 200.0) / 800.0, 0.0, 0.6);
    let fogColor = vec3<f32>(0.7, 0.85, 0.98);
    
    let litColor = mix((ambient + diffuse) * albedo, fogColor, fogFactor);
    return vec4<f32>(litColor, 1.0);
}
