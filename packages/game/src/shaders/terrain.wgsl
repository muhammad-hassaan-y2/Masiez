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

fn getTerrainHeight(px: f32, pz: f32) -> f32 {
    let distFromOrigin = length(vec2<f32>(px, pz));
    let airfieldBlend = clamp((distFromOrigin - 40.0) / 50.0, 0.0, 1.0);
    if (airfieldBlend <= 0.0) {
        return 0.0;
    }
    let h1 = sin(px * 0.012 + 0.4) * cos(pz * 0.012 + 0.6) * 22.0;
    let h2 = sin(px * 0.024 + pz * 0.016) * 10.0;
    let h3 = sin(px * 0.005 - 1.0) * cos(pz * 0.006 + 0.5) * 28.0;
    let h4 = sin(px * 0.05 + pz * 0.035) * 2.0;
    let rawHeight = h1 + h2 + h3 + h4 + 14.0;
    return max(0.0, rawHeight * airfieldBlend);
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    
    // Sample heightmap texture (keeps binding active)
    let hTex = textureSampleLevel(heightmapTex, texSampler, in.uv, 0.0).r;
    let baseHeight = getTerrainHeight(in.position.x, in.position.z);
    
    let worldY = baseHeight;
    let worldP = vec3<f32>(in.position.x, worldY, in.position.z);
    
    // Analytical gradient normals for hills
    let eps = 1.0;
    let hL = getTerrainHeight(in.position.x - eps, in.position.z);
    let hR = getTerrainHeight(in.position.x + eps, in.position.z);
    let hD = getTerrainHeight(in.position.x, in.position.z - eps);
    let hU = getTerrainHeight(in.position.x, in.position.z + eps);
    var geomNormal = normalize(vec3<f32>((hL - hR) / (2.0 * eps), 1.0, (hD - hU) / (2.0 * eps)));
    
    // Sample normalmap (keeps binding active)
    let nTex = textureSampleLevel(normalmapTex, texSampler, in.uv * 8.0, 0.0).rgb * 2.0 - 1.0;
    
    let distFromOrigin = length(in.position.xz);
    let hillBlend = clamp((distFromOrigin - 40.0) / 50.0, 0.0, 1.0);
    let finalNormal = normalize(mix(vec3<f32>(0.0, 1.0, 0.0), geomNormal + nTex * 0.2, hillBlend));
    
    out.worldPos = worldP;
    out.uv = in.uv;
    out.normal = finalNormal;
    out.clipPos = u.viewProj * vec4<f32>(worldP, 1.0);
    return out;
}

// Procedural noise for asphalt texture grain
fn hash2(p: vec2<f32>) -> f32 {
    let q = fract(p * vec2<f32>(123.34, 456.21));
    return fract(dot(q, q + 45.32));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uvScaled = in.uv * 60.0;
    let grassColor = textureSample(grassAlbedoTex, texSampler, uvScaled).rgb;
    let rockColor = textureSample(rockAlbedoTex, texSampler, uvScaled).rgb;
    
    let slope = 1.0 - clamp(in.normal.y, 0.0, 1.0);
    let blend = clamp((slope - 0.18) * 3.5, 0.0, 1.0);
    var terrainColor = mix(grassColor, rockColor, blend);
    
    // Multi-octave micro detail
    let microNoise = (hash2(in.worldPos.xz * 4.0) - 0.5) * 0.06;
    terrainColor = clamp(terrainColor + vec3<f32>(microNoise), vec3<f32>(0.0), vec3<f32>(1.0));
    
    let x = in.worldPos.x;
    let z = in.worldPos.z;
    let r = length(vec2<f32>(x, z));
    
    var isAsphalt = 0.0;
    var markingColor = vec3<f32>(0.0);
    var hasMarking = 0.0;
    var roughness = 0.85;
    
    // --- 1. RUNWAY SYSTEM ---
    // Main Runway: X in [-10, 10], Z in [-160, 160]
    if (abs(x) < 11.0 && abs(z) < 170.0) {
        isAsphalt = 1.0;
        roughness = 0.55;
        
        // Runway side edge white lines
        if (abs(abs(x) - 9.2) < 0.35) {
            markingColor = vec3<f32>(0.95, 0.95, 0.95);
            hasMarking = 1.0;
        }
        
        // Runway centerline dashes (8m dash, 8m space)
        if (abs(x) < 0.3 && fract(z / 16.0) < 0.5) {
            markingColor = vec3<f32>(0.95, 0.95, 0.95);
            hasMarking = 1.0;
        }
        
        // Runway Threshold Piano Keys at ends
        if ((abs(z) > 145.0 && abs(z) < 162.0)) {
            let keyMod = fract((x + 8.5) / 2.0);
            if (keyMod < 0.6 && abs(x) < 8.5) {
                markingColor = vec3<f32>(0.95, 0.95, 0.95);
                hasMarking = 1.0;
            }
        }
    }
    
    // Taxiway connecting to Hangars: X in [-45, -10], Z in [20, 50]
    if (x >= -45.0 && x <= -9.0 && z >= 22.0 && z <= 48.0) {
        isAsphalt = 1.0;
        roughness = 0.6;
        // Taxiway yellow centerline
        if (abs(z - 35.0) < 0.3) {
            markingColor = vec3<f32>(0.95, 0.8, 0.1);
            hasMarking = 1.0;
        }
    }
    
    // Hangar Apron Tarmac: X in [-55, -35], Z in [-65, 75]
    if (x >= -58.0 && x <= -35.0 && z >= -65.0 && z <= 75.0) {
        isAsphalt = 1.0;
        roughness = 0.6;
    }
    
    // --- 2. MAIN HELIPAD AT ORIGIN ---
    if (r < 14.0) {
        isAsphalt = 1.0;
        roughness = 0.5;
        
        // Outer Yellow Warning Ring (r = 11.0 to 12.0)
        if (r >= 11.0 && r <= 12.0) {
            markingColor = vec3<f32>(0.95, 0.82, 0.1);
            hasMarking = 1.0;
        }
        
        // Dashed White Circle (r = 9.2 to 9.8)
        let angle = atan2(z, x);
        if (r >= 9.2 && r <= 9.8 && fract(angle * 3.183098) < 0.6) {
            markingColor = vec3<f32>(0.95, 0.95, 0.95);
            hasMarking = 1.0;
        }
        
        // Inner Solid White Helipad Circle (r = 5.8 to 6.4)
        if (r >= 5.8 && r <= 6.4) {
            markingColor = vec3<f32>(0.95, 0.95, 0.95);
            hasMarking = 1.0;
        }
        
        // Central "H" Helipad Marking (4m x 5m)
        let inLeftLeg  = (x >= -1.8 && x <= -1.0 && abs(z) <= 2.2);
        let inRightLeg = (x >= 1.0  && x <= 1.8  && abs(z) <= 2.2);
        let inCrossbar = (abs(x) <= 1.5 && abs(z) <= 0.4);
        
        if (inLeftLeg || inRightLeg || inCrossbar) {
            markingColor = vec3<f32>(0.98, 0.98, 0.98);
            hasMarking = 1.0;
        }
        
        // Orientation Chevron (North Heading indicator on Helipad)
        if (z >= 3.0 && z <= 4.5 && abs(x) <= (4.5 - z) * 1.2 && abs(x) >= (4.5 - z) * 0.4) {
            markingColor = vec3<f32>(0.95, 0.82, 0.1);
            hasMarking = 1.0;
        }
    }
    
    // Blend Asphalt & Markings onto Base Terrain
    let asphaltBaseColor = vec3<f32>(0.16, 0.17, 0.18) + (hash2(in.worldPos.xz * 10.0) - 0.5) * 0.03;
    var finalAlbedo = terrainColor;
    
    if (isAsphalt > 0.5) {
        finalAlbedo = mix(asphaltBaseColor, markingColor, hasMarking);
    }
    
    // Lighting & PBR calculations
    let N = normalize(in.normal);
    let L = normalize(u.sunDir);
    let V = normalize(u.cameraPos - in.worldPos);
    let H = normalize(L + V);
    
    let NdotL = max(dot(N, L), 0.0);
    let NdotH = max(dot(N, H), 0.0);
    
    let ambient = vec3<f32>(0.38, 0.48, 0.60) * 0.5;
    let diffuse = u.sunColor * NdotL * 0.85;
    
    // Specular highlight for asphalt and shiny surfaces
    let specPower = mix(16.0, 96.0, 1.0 - roughness);
    let specIntensity = mix(0.1, 0.45, 1.0 - roughness) * (isAsphalt * 0.7 + 0.3);
    let specular = pow(NdotH, specPower) * specIntensity * u.sunColor;
    
    // Distance Fog calculation
    let dist = length(u.cameraPos - in.worldPos);
    let fogFactor = clamp((dist - 150.0) / 900.0, 0.0, 0.75);
    let fogColor = vec3<f32>(0.65, 0.80, 0.95);
    
    let litColor = mix((ambient + diffuse) * finalAlbedo + specular, fogColor, fogFactor);
    return vec4<f32>(litColor, 1.0);
}
