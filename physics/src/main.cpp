#include "DronePhysics.h"
#include "FlightController.h"
#include "Sensors.h"
#include "Collision.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define WASM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define WASM_EXPORT
#endif

static DronePhysics g_physics;
static FlightController g_controller;
static Sensors g_sensors;
static bool g_armed = false;
static float g_groundOffset = 0.0f;

static float groundCallback(float x, float z) {
    return Collision::getHeightAt(x, z) + g_groundOffset;
}

extern "C" {

WASM_EXPORT void physics_set_ground_offset(float offset) {
    g_groundOffset = offset;
}

WASM_EXPORT void physics_init(float x, float y, float z) {
    float groundY = groundCallback(x, z);
    if (y < groundY + 0.5f) {
        y = groundY + 0.5f;
    }
    g_physics.init(x, y, z);
    g_armed = false;
}

WASM_EXPORT void physics_arm(int arm) {
    g_armed = (arm != 0);
}

WASM_EXPORT int physics_is_armed() {
    return g_armed ? 1 : 0;
}

WASM_EXPORT void physics_set_wind(float speed, float dirDeg) {
    g_physics.setWind(speed, dirDeg);
}

WASM_EXPORT void fc_set_mode(int mode) {
    g_controller.setMode(static_cast<FlightController::Mode>(mode));
}

WASM_EXPORT int fc_get_mode() {
    return static_cast<int>(g_controller.getMode());
}

WASM_EXPORT void fc_set_manual_input(float throttle, float pitch, float roll, float yaw) {
    g_controller.setManualInput(throttle, pitch, roll, yaw);
}

WASM_EXPORT void fc_set_target(float x, float y, float z, float heading) {
    g_controller.setAutopilotTarget(x, y, z, heading);
}

WASM_EXPORT void physics_step(float dt) {
    float rpms[4];
    const Vec3& p = g_physics.getPosition();
    float currentGroundY = groundCallback(p.x, p.z);
    g_controller.update(dt, g_physics, g_armed, currentGroundY, rpms);
    g_physics.setMotorRPMs(rpms[0], rpms[1], rpms[2], rpms[3]);
    g_physics.step(dt, groundCallback);
    g_sensors.update(dt, g_physics, groundCallback);
}

WASM_EXPORT void physics_get_position(float* out3) {
    const Vec3& p = g_physics.getPosition();
    out3[0] = p.x; out3[1] = p.y; out3[2] = p.z;
}

WASM_EXPORT void physics_get_rotation(float* out3) {
    const Vec3& r = g_physics.getRotation();
    out3[0] = r.x; out3[1] = r.y; out3[2] = r.z;
}

WASM_EXPORT void physics_get_velocity(float* out3) {
    const Vec3& v = g_physics.getVelocity();
    out3[0] = v.x; out3[1] = v.y; out3[2] = v.z;
}

WASM_EXPORT void physics_get_angular_velocity(float* out3) {
    const Vec3& w = g_physics.getAngularVelocity();
    out3[0] = w.x; out3[1] = w.y; out3[2] = w.z;
}

WASM_EXPORT void physics_get_motor_rpms(float* out4) {
    const float* rpms = g_physics.getMotorRPMs();
    out4[0] = rpms[0]; out4[1] = rpms[1]; out4[2] = rpms[2]; out4[3] = rpms[3];
}

WASM_EXPORT void sensors_get_data(float* outFloat10, double* outDouble2) {
    const SensorData& s = g_sensors.getData();
    outFloat10[0] = s.accel.x;
    outFloat10[1] = s.accel.y;
    outFloat10[2] = s.accel.z;
    outFloat10[3] = s.gyro.x;
    outFloat10[4] = s.gyro.y;
    outFloat10[5] = s.gyro.z;
    outFloat10[6] = s.altitudeAMSL;
    outFloat10[7] = s.altitudeAGL;
    outFloat10[8] = s.batteryPct;
    outFloat10[9] = s.rangefinder;

    outDouble2[0] = s.latitude;
    outDouble2[1] = s.longitude;
}

WASM_EXPORT void collision_load_heightmap(const unsigned short* data, int width, int height, float sx, float sy, float sz) {
    Collision::setHeightmapData(data, width, height, sx, sy, sz);
}

WASM_EXPORT float collision_get_height(float x, float z) {
    return Collision::getHeightAt(x, z);
}

}
