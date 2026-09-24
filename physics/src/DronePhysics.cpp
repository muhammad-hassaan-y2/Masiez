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
        init(0.0f, 0.15f, 0.0f);
        return;
    }

    // Average motor RPM
    float avgRPM = (motorRPMs[0] + motorRPMs[1] + motorRPMs[2] + motorRPMs[3]) * 0.25f;

    // Ground height
    float groundY = 0.0f;
    if (groundHeightFn) {
        groundY = groundHeightFn(position.x, position.z);
    }
    float droneRadius = 0.15f;
    bool isOnGround = (position.y <= groundY + droneRadius + 0.05f);

    // Calculate individual motor thrusts
    float t0 = params.thrustCoeff * motorRPMs[0] * motorRPMs[0];
    float t1 = params.thrustCoeff * motorRPMs[1] * motorRPMs[1];
    float t2 = params.thrustCoeff * motorRPMs[2] * motorRPMs[2];
    float t3 = params.thrustCoeff * motorRPMs[3] * motorRPMs[3];
    float totalThrust = t0 + t1 + t2 + t3;

    // Convert rotation angles from deg to radians
    float rollRad  = rotation.x * (M_PI / 180.0f);
    float pitchRad = rotation.y * (M_PI / 180.0f);
    float yawRad   = rotation.z * (M_PI / 180.0f);

    float cy = std::cos(yawRad), sy = std::sin(yawRad);
    float cp = std::cos(pitchRad), sp = std::sin(pitchRad);
    float cr = std::cos(rollRad), sr = std::sin(rollRad);

    // World thrust acceleration vector
    Vec3 thrustWorld;
    thrustWorld.x = totalThrust * (cy * sr + sy * sp * cr);
    thrustWorld.y = totalThrust * (cp * cr);
    thrustWorld.z = totalThrust * (-sy * sr + cy * sp * cr);

    // Gravity force
    Vec3 gravity = {0.0f, -9.81f * params.mass, 0.0f};

    // Aerodynamic drag
    Vec3 drag = {
        -0.5f * params.dragCoeffXY * velocity.x * std::abs(velocity.x),
        -0.5f * params.dragCoeffZ  * velocity.y * std::abs(velocity.y),
        -0.5f * params.dragCoeffXY * velocity.z * std::abs(velocity.z)
    };

    Vec3 totalForce = thrustWorld + gravity + drag;
    Vec3 accel = totalForce * (1.0f / params.mass);

    // Linear damping when no thrust
    if (avgRPM < 250.0f && isOnGround) {
        velocity.x *= 0.8f;
        velocity.z *= 0.8f;
        velocity.y = 0.0f;
    } else {
        velocity += accel * dt;
    }

    position += velocity * dt;

    // Ground clamping & collision
    if (position.y < groundY + droneRadius) {
        position.y = groundY + droneRadius;
        if (velocity.y < 0.0f) velocity.y = 0.0f;
        velocity.x *= 0.9f;
        velocity.z *= 0.9f;
    }

    // Angular velocity & attitude integration
    rotation += angularVelocity * dt;

    // Normalize yaw to [-180, 180]
    while (rotation.z > 180.0f) rotation.z -= 360.0f;
    while (rotation.z < -180.0f) rotation.z += 360.0f;
}
