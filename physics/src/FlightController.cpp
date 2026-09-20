#include "FlightController.h"
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
    const Vec3& angVel = physics.getAngularVelocity();

    const float mass = 1.5f;
    const float hoverThrust = (mass * 9.81f) / 4.0f;
    const float hoverRPM = std::sqrt(hoverThrust / 1.0e-5f); // ~606 RPM base scale

    float targetRollDeg = 0.0f;
    float targetPitchDeg = 0.0f;
    float targetYawRateDeg = 0.0f;
    float baseThrottleRPM = hoverRPM;

    const float maxTiltDeg = 30.0f;
    const float maxYawRateDeg = 90.0f;

    if (mode == Mode::MANUAL) {
        targetPitchDeg = inPitch * maxTiltDeg;
        targetRollDeg  = inRoll  * maxTiltDeg;
        targetYawRateDeg = inYaw * maxYawRateDeg;
        baseThrottleRPM = hoverRPM + (inThrottle * hoverRPM * 0.6f);
    } else {
        // Autopilot
        float altError = targetPos.y - pos.y;
        float altCorrection = pidAltitude.update(altError, dt);
        baseThrottleRPM = hoverRPM + altCorrection * 400.0f;

        float xError = targetPos.x - pos.x;
        float zError = targetPos.z - pos.z;

        // Rotate error to body heading
        float yawRad = rot.z * (M_PI / 180.0f);
        float localX =  xError * std::cos(yawRad) + zError * std::sin(yawRad);
        float localZ = -xError * std::sin(yawRad) + zError * std::cos(yawRad);

        targetRollDeg  = std::clamp(pidPosX.update(localX, dt) * maxTiltDeg, -maxTiltDeg, maxTiltDeg);
        targetPitchDeg = std::clamp(pidPosZ.update(localZ, dt) * maxTiltDeg, -maxTiltDeg, maxTiltDeg);

        float headingError = targetHeading - rot.z;
        while (headingError > 180.0f) headingError -= 360.0f;
        while (headingError < -180.0f) headingError += 360.0f;
        targetYawRateDeg = pidYawAngle.update(headingError, dt);
    }

    // Outer angle loop -> target angular rate (deg/s)
    float errRoll  = targetRollDeg - rot.x;
    float errPitch = targetPitchDeg - rot.y;

    float desiredRollRate  = pidRollAngle.update(errRoll, dt);
    float desiredPitchRate = pidPitchAngle.update(errPitch, dt);

    // Inner rate loop -> motor adjustments
    float errRollRate  = desiredRollRate - angVel.x;
    float errPitchRate = desiredPitchRate - angVel.y;
    float errYawRate   = targetYawRateDeg - angVel.z;

    float rollAdj  = pidRollRate.update(errRollRate, dt) * 400.0f;
    float pitchAdj = pidPitchRate.update(errPitchRate, dt) * 400.0f;
    float yawAdj   = pidYawRate.update(errYawRate, dt) * 400.0f;

    // Motor mixer (X config)
    // 0: FR, 1: FL, 2: RR, 3: RL
    float m0 = baseThrottleRPM + pitchAdj - rollAdj + yawAdj;
    float m1 = baseThrottleRPM + pitchAdj + rollAdj - yawAdj;
    float m2 = baseThrottleRPM - pitchAdj - rollAdj - yawAdj;
    float m3 = baseThrottleRPM - pitchAdj + rollAdj + yawAdj;

    float minRPM = 1000.0f;
    float maxRPM = 12000.0f;

    outRPMs[0] = std::clamp(m0, minRPM, maxRPM);
    outRPMs[1] = std::clamp(m1, minRPM, maxRPM);
    outRPMs[2] = std::clamp(m2, minRPM, maxRPM);
    outRPMs[3] = std::clamp(m3, minRPM, maxRPM);
}
