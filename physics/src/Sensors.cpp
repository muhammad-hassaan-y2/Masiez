#include "Sensors.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

Sensors::Sensors() {
    data = {};
    data.batteryPct = 100.0f;
}

float Sensors::noise(float stdDev) {
    if (stdDev <= 0.0f) return 0.0f;
    float u = (float)std::rand() / (float)RAND_MAX;
    float v = (float)std::rand() / (float)RAND_MAX;
    if (u < 1e-6f) u = 1e-6f;
    return std::sqrt(-2.0f * std::log(u)) * std::cos(2.0f * M_PI * v) * stdDev;
}

void Sensors::update(float dt, const DronePhysics& physics, float (*groundHeightFn)(float x, float z)) {
    const Vec3& pos = physics.getPosition();
    const Vec3& vel = physics.getVelocity();
    const Vec3& angVel = physics.getAngularVelocity();
    const float* rpms = physics.getMotorRPMs();

    // IMU: accel + gyro
    data.accel = {
        vel.x * 0.1f + noise(0.05f),
        vel.y * 0.1f + 9.81f + noise(0.05f),
        vel.z * 0.1f + noise(0.05f)
    };
    data.gyro = {
        angVel.x + noise(0.02f),
        angVel.y + noise(0.02f),
        angVel.z + noise(0.02f)
    };

    // GPS: Islamabad origin 33.6 deg N, 72.9 deg E
    const double refLat = 33.6;
    const double refLon = 72.9;
    data.latitude = refLat + (-pos.z / 111320.0) + (double)noise(0.00001f);
    data.longitude = refLon + (pos.x / (111320.0 * std::cos(refLat * M_PI / 180.0))) + (double)noise(0.00001f);
    data.altitudeAMSL = pos.y + noise(0.2f);

    // Ground & rangefinder
    float groundY = groundHeightFn ? groundHeightFn(pos.x, pos.z) : 0.0f;
    data.altitudeAGL = pos.y - groundY;
    data.rangefinder = (data.altitudeAGL > 0.0f && data.altitudeAGL < 40.0f) ? data.altitudeAGL + noise(0.02f) : -1.0f;

    // Battery
    float totalRPM = rpms[0] + rpms[1] + rpms[2] + rpms[3];
    float load = totalRPM / (12000.0f * 4.0f);
    float drainPerSec = 0.015f * (0.4f + load);
    batteryPct = std::max(0.0f, batteryPct - drainPerSec * dt);

    data.batteryPct = batteryPct;
    data.batteryVoltage = 22.2f * (0.6f + 0.4f * (batteryPct / 100.0f));
    data.batteryCurrent = load * 25.0f;
}
