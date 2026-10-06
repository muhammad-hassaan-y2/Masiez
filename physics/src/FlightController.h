#pragma once
#include "DronePhysics.h"

class PID {
public:
    PID(float kp = 1.0f, float ki = 0.0f, float kd = 0.0f, float maxI = 100.0f);
    void reset();
    float update(float error, float dt);

private:
    float kp, ki, kd, maxIntegral;
    float integral{0.0f};
    float prevError{0.0f};
    bool first{true};
};

class FlightController {
public:
    enum class Mode { MANUAL = 0, AUTOPILOT = 1 };

    FlightController();
    void setMode(Mode m);
    Mode getMode() const { return mode; }

    void setManualInput(float throttle, float pitch, float roll, float yaw);
    void setAutopilotTarget(float x, float y, float z, float heading);

    void update(float dt, const DronePhysics& physics, bool isArmed, float groundY, float outRPMs[4]);

private:
    Mode mode{Mode::MANUAL};

    // Inputs (-1.0 to 1.0)
    float inThrottle{0.0f};
    float inPitch{0.0f};
    float inRoll{0.0f};
    float inYaw{0.0f};

    // Autopilot Targets
    Vec3 targetPos{0.0f, 5.0f, 0.0f};
    float targetHeading{0.0f};

    // Cascaded PIDs
    PID pidPitchAngle{2.5f, 0.0f, 0.4f};
    PID pidRollAngle{2.5f, 0.0f, 0.4f};
    PID pidYawAngle{3.0f, 0.05f, 0.2f};

    PID pidPitchRate{0.4f, 0.02f, 0.005f};
    PID pidRollRate{0.4f, 0.02f, 0.005f};
    PID pidYawRate{0.4f, 0.02f, 0.005f};

    PID pidAltitude{1.8f, 0.2f, 0.9f};
    PID pidPosX{0.6f, 0.0f, 0.25f};
    PID pidPosZ{0.6f, 0.0f, 0.25f};
};
