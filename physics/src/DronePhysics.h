#pragma once
#include <cmath>

struct Vec3 {
    float x{0.0f};
    float y{0.0f};
    float z{0.0f};

    Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
    Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
    Vec3 operator*(float s) const { return {x * s, y * s, z * s}; }
    Vec3& operator+=(const Vec3& o) { x += o.x; y += o.y; z += o.z; return *this; }
};

struct DroneParams {
    float mass{1.5f};          // kg
    float armLength{0.25f};     // m
    float thrustCoeff{1.0e-5f}; // N / RPM^2
    float torqueCoeff{1.0e-7f}; // Nm / RPM^2
    float dragCoeffXY{0.5f};
    float dragCoeffZ{0.8f};
    float inertiaX{0.015f};     // kg m^2
    float inertiaY{0.015f};
    float inertiaZ{0.025f};
    float minRPM{1000.0f};
    float maxRPM{12000.0f};
};

class DronePhysics {
public:
    DronePhysics();
    void init(float x, float y, float z);
    void setMotorRPMs(float m1, float m2, float m3, float m4);
    void setWind(float speed, float dirDeg);
    void step(float dt, float (*groundHeightFn)(float x, float z));

    const Vec3& getPosition() const { return position; }
    const Vec3& getVelocity() const { return velocity; }
    const Vec3& getRotation() const { return rotation; } // Roll, Pitch, Yaw (deg)
    const Vec3& getAngularVelocity() const { return angularVelocity; } // deg/s
    const float* getMotorRPMs() const { return motorRPMs; }

private:
    DroneParams params;
    Vec3 position{0.0f, 0.0f, 0.0f};
    Vec3 velocity{0.0f, 0.0f, 0.0f};
    Vec3 rotation{0.0f, 0.0f, 0.0f}; // roll (x), pitch (y), yaw (z) in deg
    Vec3 angularVelocity{0.0f, 0.0f, 0.0f}; // deg/s

    float motorRPMs[4]{0.0f, 0.0f, 0.0f, 0.0f};
    float windSpeed{0.0f};
    float windDirectionDeg{0.0f};
};
