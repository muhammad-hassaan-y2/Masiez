// ============================================================
// Physics Constants, Safety Limits & Default Configuration
// ============================================================

// --- Physics ---

export const GRAVITY = 9.81; // m/s²
export const AIR_DENSITY = 1.225; // kg/m³ at sea level

// --- Drone Physical Properties (Generic Quadcopter) ---

export const DRONE = {
  mass: 1.5,           // kg (total with battery)
  armLength: 0.25,     // meters (center to motor)
  motorCount: 4,

  // Motor properties
  maxRPM: 12000,
  minRPM: 1000,        // idle RPM when armed
  thrustCoeff: 1.0e-5, // thrust = coeff * rpm² (Newtons)
  torqueCoeff: 1.0e-7, // reaction torque = coeff * rpm² (Nm)

  // Aerodynamics
  dragCoeffXY: 0.5,    // horizontal drag coefficient
  dragCoeffZ: 0.8,     // vertical drag coefficient
  dragArea: 0.04,      // frontal area (m²)

  // Inertia (kg·m²) — simplified diagonal
  inertiaX: 0.015,     // roll axis
  inertiaY: 0.015,     // pitch axis
  inertiaZ: 0.025,     // yaw axis

  // Propeller spin directions: CW = +1, CCW = -1
  // Standard X config: front-left CW, front-right CCW, rear-right CW, rear-left CCW
  motorDirections: [1, -1, 1, -1] as readonly number[],

  // Motor positions relative to center (x = forward, y = up, z = right)
  motorPositions: [
    { x:  0.25, y: 0, z: -0.25 }, // front-left
    { x:  0.25, y: 0, z:  0.25 }, // front-right
    { x: -0.25, y: 0, z:  0.25 }, // rear-right
    { x: -0.25, y: 0, z: -0.25 }, // rear-left
  ] as readonly { x: number; y: number; z: number }[],
} as const;

// --- PID Controller Defaults ---

export const PID = {
  // Angle controller (outer loop)
  angle: {
    kp: 5.0,
    ki: 0.0,
    kd: 0.3,
    maxOutput: 250, // max degrees/s rate command
  },
  // Rate controller (inner loop)
  rate: {
    kp: 0.15,
    ki: 0.05,
    kd: 0.002,
    maxOutput: 1.0, // normalized motor adjustment
  },
  // Altitude controller
  altitude: {
    kp: 1.5,
    ki: 0.3,
    kd: 0.8,
    maxOutput: 0.5, // max throttle adjustment
  },
  // Position controller (autopilot)
  position: {
    kp: 0.8,
    ki: 0.0,
    kd: 0.4,
    maxOutput: 25, // max tilt angle degrees
    maxSpeed: 10,  // m/s
  },
} as const;

// --- Safety Limits ---

export const SAFETY = {
  maxAltitudeAGL: 120,     // meters
  minAltitudeAGL: 1,       // meters (minimum hover)
  maxGroundSpeed: 15,      // m/s
  maxVerticalSpeed: 5,     // m/s
  maxTiltAngle: 35,        // degrees
  maxYawRate: 180,         // degrees/s

  battery: {
    warningPercent: 25,
    criticalPercent: 15,
    emergencyPercent: 10,
    rtlReservePercent: 20, // must have this much to execute any navigation command
  },

  geofence: {
    warningDistanceM: 20,  // alert when within 20m of boundary
    hardLimitDistanceM: 5, // reject commands within 5m of boundary
  },

  commandTimeout: 30000,  // ms — command must complete in this time or alert
  heartbeatTimeout: 5000, // ms — game must send heartbeat within this interval
  hoverTimeout: 30000,    // ms — alert if hovering with no command for this long
} as const;

// --- Simulation Defaults ---

export const SIMULATION = {
  physicsHz: 250,         // physics timestep frequency
  renderFPS: 60,          // target render framerate
  telemetryHz: 10,        // how often telemetry is sent to server
  cameraFPS: 30,          // FPV camera render-to-texture rate
  cameraCaptureHz: 1,     // how often JPEG snapshots are sent to AI

  terrain: {
    sizeMeters: 1000,     // 1km × 1km
    resolution: 512,      // heightmap grid resolution
    maxElevation: 80,     // max terrain height in meters
  },

  gps: {
    noiseMetersSigma: 1.5, // GPS horizontal noise std dev
    updateHz: 5,
  },

  imu: {
    noiseSigmaAccel: 0.05,  // m/s² noise
    noiseSigmaGyro: 0.002,  // rad/s noise
    updateHz: 100,
  },

  barometer: {
    noiseSigmaMeters: 0.5,
    updateHz: 10,
  },

  wind: {
    defaultSpeed: 2,        // m/s
    defaultDirection: 180,  // from south
    gustAmplitude: 1.5,     // m/s max gust delta
    gustFrequency: 0.3,     // Hz
  },
} as const;

// --- Camera ---

export const CAMERA = {
  fpv: {
    fovDegrees: 90,
    width: 640,
    height: 480,
    nearClip: 0.1,
    farClip: 1000,
  },
  observer: {
    fovDegrees: 60,
    followDistance: 10,  // meters behind drone
    followHeight: 5,    // meters above drone
    nearClip: 0.1,
    farClip: 5000,
  },
  minimap: {
    height: 200,    // meters above ground
    width: 256,     // render texture pixel size
    height_px: 256,
  },
} as const;

// --- Keyboard Bindings ---

export const KEY_BINDINGS = {
  throttleUp: 'ShiftLeft',
  throttleDown: 'ControlLeft',
  pitchForward: 'KeyW',
  pitchBackward: 'KeyS',
  rollLeft: 'KeyA',
  rollRight: 'KeyD',
  yawLeft: 'KeyQ',
  yawRight: 'KeyE',
  toggleArm: 'Space',
  autoLand: 'KeyL',
  returnHome: 'KeyH',
  toggleMode: 'Tab',
  cameraFollow: 'Digit1',
  cameraFree: 'Digit2',
  emergencyStop: 'Backquote', // tilde key
} as const;
