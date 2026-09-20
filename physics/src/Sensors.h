#pragma once
#include "DronePhysics.h"

struct SensorData {
    Vec3 accel;
    Vec3 gyro;
    double latitude;
    double longitude;
    float altitudeAMSL;
    float altitudeAGL;
    float batteryPct;
    float batteryVoltage;
    float batteryCurrent;
    float rangefinder;
};

class Sensors {
public:
    Sensors();
    void update(float dt, const DronePhysics& physics, float (*groundHeightFn)(float x, float z));
    const SensorData& getData() const { return data; }

private:
    SensorData data;
    float batteryPct{100.0f};

    float noise(float stdDev);
};
