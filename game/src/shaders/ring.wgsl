struct Uniforms {
    viewProj: mat4x4<f32>,
    cameraPos: vec3<f32>,
    time: f32,
    ringColor: vec4<f32>,
    activeRingIdx: u32,
    pad0: f32,
    pad1: f32,
    pad2: f32,
};

struct RingInstance {
    centerPos: vec3<f32>,
    radius: f32,
    color: vec4<f32>,
    isActive: u32,
    isPassed: u32,
    yawDeg: f32,
    pad: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> rings: array<RingInstance>;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) ringColor: vec4<f32>,
    @location(3) pulseGlow: f32,
};

@vertex
fn vs_main(in: VertexInput, @builtin(instance_index) instanceIdx: u32) -> VertexOutput {
    let ring = rings[instanceIdx];
    var out: VertexOutput;

    // Rotate ring by yawDeg
    let rad = ring.yawDeg * 0.0174532925;
    let cosY = cos(rad);
    let sinY = sin(rad);

    let localX = in.position.x * cosY + in.position.z * sinY;
    let localY = in.position.y;
    let localZ = -in.position.x * sinY + in.position.z * cosY;

    let worldPos = vec3<f32>(localX, localY, localZ) + ring.centerPos;
    out.worldPos = worldPos;
    out.normal = in.normal;
    out.ringColor = ring.color;

    // Active ring pulses with sine wave
    var pulse = 1.0;
    if (ring.isActive == 1u) {
        pulse = 1.0 + 0.35 * sin(u.time * 6.0);
    } else if (ring.isPassed == 1u) {
        pulse = 0.4;
    }
    out.pulseGlow = pulse;

    out.clipPos = u.viewProj * vec4<f32>(worldPos, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.normal);
    let V = normalize(u.cameraPos - in.worldPos);
    let rim = 1.0 - max(dot(N, V), 0.0);

    // Glowing neon look with bright core and pulsing rim
    let glow = in.ringColor.rgb * (1.2 + pow(rim, 2.5) * 2.0) * in.pulseGlow;
    return vec4<f32>(glow, in.ringColor.a);
}
