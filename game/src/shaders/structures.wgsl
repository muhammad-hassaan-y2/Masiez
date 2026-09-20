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
    @location(3) extra: vec4<f32>, // extra.x: emissive/beacon flag, extra.y: object type (0: building, 1: glass, 2: ring, 3: tree, 4: light)
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) extra: vec4<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.worldPos = in.position;
    out.normal = in.normal;
    out.color = in.color;
    out.extra = in.extra;
    out.clipPos = u.viewProj * vec4<f32>(in.position, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.normal);
    let L = normalize(u.sunDir);
    let V = normalize(u.cameraPos - in.worldPos);
    let H = normalize(L + V);
    
    let NdotL = max(dot(N, L), 0.0);
    let NdotH = max(dot(N, H), 0.0);
    
    var baseCol = in.color.rgb;
    let objType = in.extra.y;
    
    // Type 0: Skyscraper / City building with procedural window grid
    if (objType < 0.5) {
        let uvFloor = in.worldPos.y * 0.35;
        let uvWall = (in.worldPos.x + in.worldPos.z) * 0.35;
        let winY = fract(uvFloor);
        let winX = fract(uvWall);
        
        // Window framing
        if (winY > 0.25 && winY < 0.75 && winX > 0.25 && winX < 0.75) {
            let isLit = fract(sin(floor(uvFloor) * 12.9898 + floor(uvWall) * 78.233) * 43758.5453);
            if (isLit > 0.5) {
                baseCol = mix(baseCol, vec3<f32>(0.95, 0.9, 0.65), 0.7); // Warm office lighting
            } else {
                baseCol = baseCol * 0.35; // Tinted dark glass
            }
        }
    }
    // Type 1: Observation deck glass
    else if (objType >= 0.5 && objType < 1.5) {
        let fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        baseCol = mix(baseCol, vec3<f32>(0.6, 0.85, 1.0), fresnel * 0.8);
    }
    // Type 2: Glowing waypoint ring
    else if (objType >= 1.5 && objType < 2.5) {
        let pulse = sin(u.time * 4.0 + in.worldPos.x * 0.1) * 0.3 + 0.7;
        let glow = in.color.rgb * pulse * 1.8;
        return vec4<f32>(glow, 0.85);
    }
    // Type 4: Runway / Beacon LED Light
    else if (objType >= 3.5) {
        let flash = sin(u.time * 6.0 + in.worldPos.z * 0.5) * 0.5 + 0.5;
        let beacon = in.color.rgb * (1.2 + flash * 1.5);
        return vec4<f32>(beacon, 1.0);
    }
    
    let ambient = vec3<f32>(0.35, 0.45, 0.58) * 0.55;
    let diffuse = u.sunColor * NdotL * 0.8;
    let specular = pow(NdotH, 32.0) * vec3<f32>(0.4, 0.4, 0.4) * u.sunColor;
    
    // Distance Fog
    let dist = length(u.cameraPos - in.worldPos);
    let fogFactor = clamp((dist - 150.0) / 900.0, 0.0, 0.75);
    let fogColor = vec3<f32>(0.65, 0.80, 0.95);
    
    let litColor = mix((ambient + diffuse) * baseCol + specular, fogColor, fogFactor);
    return vec4<f32>(litColor, in.color.a);
}
