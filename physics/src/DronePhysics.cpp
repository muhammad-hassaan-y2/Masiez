#include "DronePhysics.h"
#include <algorithm>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

DronePhysics::DronePhysics() {
    init(0.0f, 0.0f, 0.0f);
}

void DronePhysics::init(float x, float y, float z) {
    position = {x, y, z};
    velocity = {0.0f, 0.0f, 0.0f};
    rotation = {0.0f, 0.0f, 0.0f};
    angularVelocity = {0.0f, 0.0f, 0.0f};
    for (int i = 0; i < 4; ++i) motorRPMs[i] = 0.0f;
    windSpeed = 0.0f;
    windDirectionDeg = 0.0f;
}

void DronePhysics::setMotorRPMs(float m1, float m2, float m3, float m4) {
    motorRPMs[0] = std::clamp(m1, 0.0f, params.maxRPM);
    motorRPMs[1] = std::clamp(m2, 0.0f, params.maxRPM);
    motorRPMs[2] = std::clamp(m3, 0.0f, params.maxRPM);
    motorRPMs[3] = std::clamp(m4, 0.0f, params.maxRPM);
}

void DronePhysics::setWind(float speed, float dirDeg) {
    windSpeed = speed;
    windDirectionDeg = dirDeg;
}

void DronePhysics::step(float dt, float (*groundHeightFn)(float x, float z)) {
    if (dt <= 0.0f) return;

    // Check NaN
    if (std::isnan(position.x) || std::isnan(position.y) || std::isnan(position.z)) {
        init(0.0f, 5.0f, 0.0f);
        return;
    }

    // Convert rotation angles from deg to radians
    float rollRad  = rotation.x * (M_PI / 180.0f);
    float pitchRad = rotation.y * (M_PI / 180.0f);
    float yawRad   = rotation.z * (M_PI / 180.0f);

    // Calculate individual motor thrusts: T = k * RPM^2 (N)
    float t0 = params.thrustCoeff * motorRPMs[0] * motorRPMs[0];
    float t1 = params.thrustCoeff * motorRPMs[1] * motorRPMs[1];
    float t2 = params.thrustCoeff * motorRPMs[2] * motorRPMs[2];
    float t3 = params.thrustCoeff * motorRPMs[3] * motorRPMs[3];
    float totalThrust = t0 + t1 + t2 + t3;

    // Body frame thrust points upwards along body Y axis
    // Transform body up vector [0, 1, 0] to world space via Euler angles (ZYX order)
    float cy = std::cos(yawRad);
    float sy = std::sin(yawRad);
    float cp = std::cos(pitchRad);
    float sp = std::sin(pitchRad);
    float cr = std::cos(rollRad);
    float sr = std::sin(rollRad);

    // World thrust components
    // Body up vector [sr, cp * cr, sp] rotated by yaw around vertical Y axis:
    // Forward (+Z) component when pitch > 0: (cy * sp - sy * sr) * totalThrust
    // Rightward (+X) component when roll > 0: (sy * sp + cy * sr) * totalThrust
    // Vertical (+Y) component: (cp * cr) * totalThrust
    Vec3 thrustWorld;
    thrustWorld.x = totalThrust * (cy * sr + sy * sp * cr);
    thrustWorld.y = totalThrust * (cp * cr);
    thrustWorld.z = totalThrust * (-sy * sr + cy * sp * cr);

    // Gravity: (0, -9.81 * mass, 0)
    Vec3 gravity = {0.0f, -9.81f * params.mass, 0.0f};

    // Wind force
    float windRad = windDirectionDeg * (M_PI / 180.0f);
    Vec3 windVec = {
        std::sin(windRad) * windSpeed,
        0.0f,
        std::cos(windRad) * windSpeed
    };

    // Relative airspeed
    Vec3 relAir = {velocity.x - windVec.x, velocity.y, velocity.z - windVec.z};
    Vec3 dragForce = {
        -0.5f * params.dragCoeffXY * relAir.x * std::abs(relAir.x),
        -0.5f * params.dragCoeffZ  * relAir.y * std::abs(relAir.y),
        -0.5f * params.dragCoeffXY * relAir.z * std::abs(relAir.z)
    };

    // Total linear force & acceleration
    Vec3 totalForce = thrustWorld + gravity + dragForce;
    Vec3 accel = totalForce * (1.0f / params.mass);

    // Integrate velocity & position (Euler step)
    velocity += accel * dt;
    position += velocity * dt;

    // Torques: Roll, Pitch, Yaw
    // Quad X-configuration:
    // M0: Front-Right (+X, +Z), M1: Front-Left (-X, +Z)
    // M2: Rear-Right (+X, -Z),  M3: Rear-Left (-X, -Z)
    float d = params.armLength * 0.7071f; // 45 deg arm offset
    // Left motors (M1, M3) pushing up -> roll right (+Roll)
    // Right motors (M0, M2) pushing up -> roll left (-Roll)
    float torqueRoll  = d * ((t1 + t3) - (t0 + t2));
    // Front motors (M0, M1) pushing up -> pitch up (+Pitch)
    // Rear motors (M2, M3) pushing up -> pitch down (-Pitch)
    float torquePitch = d * ((t0 + t1) - (t2 + t3));
    // Reaction torque for yaw (CW vs CCW pairs)
    float torqueYaw   = params.torqueCoeff * ((motorRPMs[0]*motorRPMs[0] + motorRPMs[3]*motorRPMs[3]) -
                                              (motorRPMs[1]*motorRPMs[1] + motorRPMs[2]*motorRPMs[2]));

    // Angular acceleration (rad/s^2) -> deg/s^2
    float alphaRoll  = (torqueRoll  / params.inertiaX) * (180.0f / M_PI);
    float alphaPitch = (torquePitch / params.inertiaY) * (180.0f / M_PI);
    float alphaYaw   = (torqueYaw   / params.inertiaZ) * (180.0f / M_PI);

    // Angular damping
    float angularDamping = 6.0f;
    angularVelocity.x += (alphaRoll  - angularVelocity.x * angularDamping) * dt;
    angularVelocity.y += (alphaPitch - angularVelocity.y * angularDamping) * dt;
    angularVelocity.z += (alphaYaw   - angularVelocity.z * angularDamping) * dt;

    rotation += angularVelocity * dt;

    // Normalize yaw to [-180, 180]
    while (rotation.z > 180.0f) rotation.z -= 360.0f;
    while (rotation.z < -180.0f) rotation.z += 360.0f;

    // Ground collision check
    float groundY = 0.0f;
    if (groundHeightFn) {
        groundY = groundHeightFn(position.x, position.z);
    }
    float droneRadius = 0.15f;
    if (position.y < groundY + droneRadius) {
        position.y = groundY + droneRadius;
        if (velocity.y < 0.0f) velocity.y = 0.0f;
        // High friction on ground
        velocity.x *= 0.85f;
        velocity.z *= 0.85f;
        angularVelocity.x *= 0.7f;
        angularVelocity.y *= 0.7f;
        angularVelocity.z *= 0.7f;
        rotation.x *= 0.9f;
        rotation.y *= 0.9f;
    }
}
