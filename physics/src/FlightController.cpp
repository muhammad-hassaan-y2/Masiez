#include "FlightController.h"
#include "Collision.h"
#include <algorithm>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif


PID::PID(float kp, float ki, float kd, float maxI)
    : kp(kp), ki(ki), kd(kd), maxIntegral(maxI) {}

void PID::reset() {
    integral = 0.0f;
    prevError = 0.0f;
    first = true;
}

float PID::update(float error, float dt) {
    if (dt <= 0.0f) return 0.0f;
    integral += error * dt;
    integral = std::clamp(integral, -maxIntegral, maxIntegral);

    float derivative = 0.0f;
    if (!first) {
        derivative = (error - prevError) / dt;
    } else {
        first = false;
    }
    prevError = error;

    return kp * error + ki * integral + kd * derivative;
}

FlightController::FlightController() {}

void FlightController::setMode(Mode m) {
    mode = m;
    pidPitchAngle.reset();
    pidRollAngle.reset();
    pidYawAngle.reset();
    pidAltitude.reset();
    pidPosX.reset();
    pidPosZ.reset();
}

void FlightController::setManualInput(float throttle, float pitch, float roll, float yaw) {
    inThrottle = std::clamp(throttle, -1.0f, 1.0f);
    inPitch = std::clamp(pitch, -1.0f, 1.0f);
    inRoll = std::clamp(roll, -1.0f, 1.0f);
    inYaw = std::clamp(yaw, -1.0f, 1.0f);
}

void FlightController::setAutopilotTarget(float x, float y, float z, float heading) {
    targetPos = {x, y, z};
    targetHeading = heading;
}

void FlightController::update(float dt, const DronePhysics& physics, bool isArmed, float outRPMs[4]) {
    if (!isArmed) {
        for (int i = 0; i < 4; ++i) outRPMs[i] = 0.0f;
        return;
    }

    const Vec3& pos = physics.getPosition();
    const Vec3& rot = physics.getRotation(); // x: roll, y: pitch, z: yaw (deg)

    const float mass = 1.5f;
    const float hoverThrust = (mass * 9.81f) / 4.0f; // ~3.68 N
    const float hoverRPM = std::sqrt(hoverThrust / 1.0e-5f); // ~606.5 RPM

    float targetRollDeg = 0.0f;
    float targetPitchDeg = 0.0f;
    float targetYawDeg = inYaw; // inYaw is the mouse-directed target heading
    float baseThrottleRPM = 0.0f;

    const float maxTiltDeg = 28.0f;

    if (mode == Mode::MANUAL) {
        // WASD flight: fast responsive tilt
        targetPitchDeg = inPitch * maxTiltDeg;
        targetRollDeg  = inRoll  * maxTiltDeg;

        bool hasMovement = (std::abs(inPitch) > 0.05f || std::abs(inRoll) > 0.05f);
        float groundY = Collision::getHeightAt(pos.x, pos.z);
        bool isOnGround = (pos.y <= groundY + 0.35f);

        if (isOnGround && inThrottle <= 0.0f && !hasMovement) {
            // Resting and landed on ground anywhere on the map!
            baseThrottleRPM = 0.0f;
        } else if (inThrottle > 0.0f) {
            // Shift pressed -> Fast climb!
            baseThrottleRPM = hoverRPM + 450.0f; // ~1050 RPM (>42 N thrust, fast climb!)
        } else {
            // Shift not pressed -> Smooth descent down towards ground!
            baseThrottleRPM = hoverRPM - 200.0f; // Rapid, controlled descent
        }

        // Direct smooth attitude tracking for snappy game-feel
        float blendAttitude = std::min(1.0f, dt * 14.0f);
        float errRoll  = targetRollDeg - rot.x;
        float errPitch = targetPitchDeg - rot.y;

        // Smooth yaw heading alignment with mouse view
        float errYaw = targetYawDeg - rot.z;
        while (errYaw > 180.0f) errYaw -= 360.0f;
        while (errYaw < -180.0f) errYaw += 360.0f;

        // Responsive PUBG-style WASD movement in the mouse-look heading
        if (hasMovement) {
            float yawRad = targetYawDeg * (M_PI / 180.0f);
            float fwdX = std::sin(yawRad);
            float fwdZ = std::cos(yawRad);
            float rgtX = std::cos(yawRad);
            float rgtZ = -std::sin(yawRad);

            // Fast flight speed: 20 m/s (~72 km/h)
            float targetVx = (fwdX * inPitch + rgtX * inRoll) * 20.0f;
            float targetVz = (fwdZ * inPitch + rgtZ * inRoll) * 20.0f;

            Vec3& mutableVel = const_cast<Vec3&>(physics.getVelocity());
            float blendVel = std::min(1.0f, dt * 7.0f);
            mutableVel.x += (targetVx - mutableVel.x) * blendVel;
            mutableVel.z += (targetVz - mutableVel.z) * blendVel;
        }

        const_cast<DronePhysics&>(physics).setMotorRPMs(
            baseThrottleRPM, baseThrottleRPM, baseThrottleRPM, baseThrottleRPM
        );

        // Update rotation directly via controller for instant response
        Vec3& mutableRot = const_cast<Vec3&>(physics.getRotation());
        mutableRot.x += errRoll * blendAttitude;
        mutableRot.y += errPitch * blendAttitude;
        mutableRot.z += errYaw * std::min(1.0f, dt * 20.0f);

        outRPMs[0] = baseThrottleRPM;
        outRPMs[1] = baseThrottleRPM;
        outRPMs[2] = baseThrottleRPM;
        outRPMs[3] = baseThrottleRPM;
        return;
    }

    // Autopilot Mode
    float altError = targetPos.y - pos.y;
    float altCorrection = pidAltitude.update(altError, dt);
    baseThrottleRPM = hoverRPM + std::clamp(altCorrection * 150.0f, -300.0f, 400.0f);

    float xError = targetPos.x - pos.x;
    float zError = targetPos.z - pos.z;

    float yawRad = rot.z * (M_PI / 180.0f);
    float localX =  xError * std::cos(yawRad) + zError * std::sin(yawRad);
    float localZ = -xError * std::sin(yawRad) + zError * std::cos(yawRad);

    targetRollDeg  = std::clamp(pidPosX.update(localX, dt) * maxTiltDeg, -maxTiltDeg, maxTiltDeg);
    targetPitchDeg = std::clamp(pidPosZ.update(localZ, dt) * maxTiltDeg, -maxTiltDeg, maxTiltDeg);

    float headingError = targetHeading - rot.z;
    while (headingError > 180.0f) headingError -= 360.0f;
    while (headingError < -180.0f) headingError += 360.0f;

    Vec3& mutableRot = const_cast<Vec3&>(physics.getRotation());
    mutableRot.x += (targetRollDeg - rot.x) * std::min(1.0f, dt * 8.0f);
    mutableRot.y += (targetPitchDeg - rot.y) * std::min(1.0f, dt * 8.0f);
    mutableRot.z += headingError * std::min(1.0f, dt * 8.0f);

    outRPMs[0] = baseThrottleRPM;
    outRPMs[1] = baseThrottleRPM;
    outRPMs[2] = baseThrottleRPM;
    outRPMs[3] = baseThrottleRPM;
}
