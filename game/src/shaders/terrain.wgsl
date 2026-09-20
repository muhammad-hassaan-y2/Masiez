struct Uniforms {
    viewProj: mat4x4<f32>,
    cameraPos: vec3<f32>,
    time: f32,
    sunDir: vec3<f32>,
    sunColor: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var heightmapTex: texture_2d<f32>;
@group(0) @binding(2) var normalmapTex: texture_2d<f32>;
@group(0) @binding(3) var grassAlbedoTex: texture_2d<f32>;
@group(0) @binding(4) var rockAlbedoTex: texture_2d<f32>;
@group(0) @binding(5) var grassNormalTex: texture_2d<f32>;
@group(0) @binding(6) var rockNormalTex: texture_2d<f32>;
@group(0) @binding(7) var texSampler: sampler;

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
    
    // Sample heightmap
    let hSample = textureSampleLevel(heightmapTex, texSampler, in.uv, 0.0).r;
    let worldY = in.position.y + hSample * 200.0;
    let worldP = vec3<f32>(in.position.x, worldY, in.position.z);
    
    // Sample normalmap
    let nSample = textureSampleLevel(normalmapTex, texSampler, in.uv, 0.0).rgb * 2.0 - 1.0;
    
    out.worldPos = worldP;
    out.uv = in.uv;
    out.normal = normalize(nSample);
    out.clipPos = u.viewProj * vec4<f32>(worldP, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uvScaled = in.uv * 50.0; // Tile textures across terrain
    
    let grassColor = textureSample(grassAlbedoTex, texSampler, uvScaled).rgb;
    let rockColor = textureSample(rockAlbedoTex, texSampler, uvScaled).rgb;
    
    // Slope-based splatting (rock on steep slopes, grass on flat ground)
    let slope = 1.0 - in.normal.y;
    let blend = clamp((slope - 0.2) * 3.0, 0.0, 1.0);
    let albedo = mix(grassColor, rockColor, blend);
    
    // Lighting
    let N = normalize(in.normal);
    let L = normalize(u.sunDir);
    let V = normalize(u.cameraPos - in.worldPos);
    
    let NdotL = max(dot(N, L), 0.0);
    let ambient = vec3<f32>(0.25, 0.35, 0.45) * 0.4;
    let diffuse = u.sunColor * NdotL;
    
    // Specular
    let H = normalize(L + V);
    let NdotH = max(dot(N, H), 0.0);
    let specular = pow(NdotH, 16.0) * (1.0 - blend) * 0.1;
    
    // Distance atmospheric haze
    let dist = length(u.cameraPos - in.worldPos);
    let fogFactor = clamp((dist - 100.0) / 800.0, 0.0, 0.7);
    let fogColor = vec3<f32>(0.6, 0.75, 0.9);
    
    let finalColor = mix((ambient + diffuse) * albedo + specular, fogColor, fogFactor);
    return vec4<f32>(finalColor, 1.0);
}
