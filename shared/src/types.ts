// ============================================================
// Drone Autonomy — Shared Type Definitions
// ============================================================

import type { SpeedMode } from './constants';

// --- Vector & Quaternion Primitives ---

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GeoPosition {
  latitude: number;   // degrees, WGS-84
  longitude: number;  // degrees, WGS-84
  altitude_amsl: number; // meters above mean sea level
  altitude_agl: number;  // meters above ground level
}

export interface Attitude {
  roll: number;   // degrees, positive = right wing down
  pitch: number;  // degrees, positive = nose up
  yaw: number;    // degrees, 0 = north, clockwise
  rollRate: number;  // deg/s
  pitchRate: number; // deg/s
  yawRate: number;   // deg/s
}

// --- Drone State Machine ---

export enum DroneFlightState {
  DISCONNECTED = 'DISCONNECTED',
  IDLE = 'IDLE',
  PREFLIGHT = 'PREFLIGHT',
  ARMED = 'ARMED',
  TAKING_OFF = 'TAKING_OFF',
  HOVERING = 'HOVERING',
  NAVIGATING = 'NAVIGATING',
  ORBITING = 'ORBITING',
  RETURNING = 'RETURNING',
  LANDING = 'LANDING',
  EMERGENCY_HOLD = 'EMERGENCY_HOLD',
  EMERGENCY_LANDING = 'EMERGENCY_LANDING',
}

export enum FlightMode {
  MANUAL = 'MANUAL',
  AUTOPILOT = 'AUTOPILOT',
}

// --- Sensor Data ---

export enum GPSFixType {
  NONE = 'NONE',
  FIX_2D = '2D',
  FIX_3D = '3D',
  RTK_FLOAT = 'RTK_FLOAT',
  RTK_FIXED = 'RTK_FIXED',
}

export interface GPSData {
  fix: GPSFixType;
  satellites: number;
  hdop: number; // horizontal dilution of precision
  vdop: number; // vertical dilution of precision
  position: GeoPosition;
}

export interface IMUData {
  acceleration: Vec3;  // m/s², body frame
  angularRate: Vec3;   // rad/s, body frame
}

export interface BatteryData {
  voltage: number;        // volts
  current: number;        // amps
  percentage: number;     // 0-100
  remainingTime: number;  // seconds of flight remaining (estimated)
  cellCount: number;
  temperature: number;    // celsius
}

export interface WindData {
  speed: number;     // m/s
  direction: number; // degrees, where the wind comes FROM (meteorological)
}

export enum SensorStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  FAILED = 'FAILED',
  NOT_PRESENT = 'NOT_PRESENT',
}

export interface SensorHealth {
  imu: SensorStatus;
  compass: SensorStatus;
  barometer: SensorStatus;
  gps: SensorStatus;
  rangefinder: SensorStatus;
  cameraForward: SensorStatus;
  cameraDown: SensorStatus;
}

// --- Telemetry (Full Snapshot) ---

export interface Telemetry {
  timestamp: number;          // unix ms
  state: DroneFlightState;
  flightMode: FlightMode;
  armed: boolean;
  position: GeoPosition;
  attitude: Attitude;
  groundSpeed: number;        // m/s
  verticalSpeed: number;      // m/s, positive = up
  heading: number;            // degrees, 0 = north
  battery: BatteryData;
  gps: GPSData;
  wind: WindData;
  sensors: SensorHealth;
  rangefinderAlt: number;     // meters, distance to ground
}

// --- Motor & Physics State ---

export interface MotorState {
  rpm: number[];     // RPM for each motor [M1, M2, M3, M4]
  thrust: number[];  // Newtons per motor [M1, M2, M3, M4]
}

export interface DronePhysicsState {
  position: Vec3;     // meters, world frame
  velocity: Vec3;     // m/s, world frame
  rotation: Vec3;     // euler degrees (roll, pitch, yaw)
  angularVelocity: Vec3; // rad/s, body frame
  motors: MotorState;
}

// --- Gimbal ---

export interface GimbalState {
  pitch: number; // degrees, -90 (straight down) to +20 (slightly up)
  yaw: number;   // degrees, -180 to +180 relative to drone heading
}

// --- Commands ---

export enum CommandType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  PREFLIGHT_CHECK = 'preflight_check',
  ARM_AND_TAKEOFF = 'arm_and_takeoff',
  LAND = 'land',
  RETURN_TO_LAUNCH = 'return_to_launch',
  GOTO_LOCATION = 'goto_location',
  GOTO_RELATIVE = 'goto_relative',
  ORBIT_POINT = 'orbit_point',
  SET_HEADING = 'set_heading',
  PAUSE = 'pause',
  RESUME = 'resume',
  SET_GIMBAL = 'set_gimbal',
  CAPTURE_IMAGE = 'capture_image',
  EMERGENCY_STOP = 'emergency_stop',
  EMERGENCY_LAND = 'emergency_land',
  SET_FLIGHT_MODE = 'set_flight_mode',
}

export interface CommandParams {
  [CommandType.ARM_AND_TAKEOFF]: { altitude: number };
  [CommandType.LAND]: {};
  [CommandType.RETURN_TO_LAUNCH]: {};
  [CommandType.GOTO_LOCATION]: {
    latitude: number;
    longitude: number;
    altitude_amsl: number;
    speed?: number;
  };
  [CommandType.GOTO_RELATIVE]: {
    forward: number;
    right: number;
    up: number;
    speed?: number;
  };
  [CommandType.ORBIT_POINT]: {
    latitude: number;
    longitude: number;
    radius: number;
    altitude: number;
    direction: 'clockwise' | 'counterclockwise';
    orbits?: number;
  };
  [CommandType.SET_HEADING]: { heading: number };
  [CommandType.PAUSE]: {};
  [CommandType.RESUME]: {};
  [CommandType.SET_GIMBAL]: { pitch: number; yaw: number };
  [CommandType.CAPTURE_IMAGE]: {};
  [CommandType.EMERGENCY_STOP]: {};
  [CommandType.EMERGENCY_LAND]: {};
  [CommandType.SET_FLIGHT_MODE]: { mode: FlightMode };
  [CommandType.CONNECT]: { address?: string };
  [CommandType.DISCONNECT]: {};
  [CommandType.PREFLIGHT_CHECK]: {};
}

export interface DroneCommand<T extends CommandType = CommandType> {
  id: string;
  type: T;
  params: T extends keyof CommandParams ? CommandParams[T] : Record<string, unknown>;
  timestamp: number;
  source: 'manual' | 'ai' | 'system';
}

// --- Command Response ---

export enum CommandStatus {
  SUCCESS = 'success',
  REJECTED = 'rejected',
  FAILED = 'failed',
  IN_PROGRESS = 'in_progress',
}

export interface CommandResponse {
  commandId: string;
  status: CommandStatus;
  message: string;
  data?: Record<string, unknown>;
  errors?: Array<{ code: string; detail: string }>;
}

// --- Geofence ---

export interface GeofenceConfig {
  polygon: Array<{ latitude: number; longitude: number }>; // vertices
  maxAltitude: number; // meters AMSL
  minAltitude: number; // meters AGL
}

// --- Alerts ---

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  source: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

// --- Mission ---

export interface MissionState {
  state: DroneFlightState;
  activeCommand: string | null;
  progressPercent: number;
  elapsedTime: number; // seconds
  subGoals: Array<{
    label: string;
    status: 'pending' | 'active' | 'complete' | 'skipped';
  }>;
}

// --- Camera ---

export interface CameraFrameMetadata {
  timestamp: number;
  position: GeoPosition;
  attitude: Attitude;
  gimbal: GimbalState;
  width: number;
  height: number;
}

// --- Realtime Authoritative World ---

export interface DroneAxes {
  throttle: number; // -1..1 (climb/descend)
  pitch: number;    // -1..1 (forward/back along heading)
  roll: number;     // -1..1 (strafe left/right)
  yaw: number;      // -1..1 (turn rate)
  headingDeg: number; // master heading driving the horizontal axis frame
}

export interface WorldTargetState {
  id: string;
  roleName: string;
  type: 'SOLDIER' | 'TANK';
  pos: [number, number, number];
  radius: number;
  height: number;
  isAlive: boolean;
}

export interface WorldMissionSummary {
  score: number;
  targetsHit: number;
  totalTargets: number;
  dronesRemaining: number;
  totalDrones: number;
  missionStatus: 'ACTIVE' | 'SUCCESS' | 'FAILED' | 'IDLE';
}

export interface WorldDroneState {
  pos: [number, number, number];
  vel: [number, number, number];
  headingRad: number;
  rollDeg: number;
  pitchDeg: number;
  armed: boolean;
  crashed: boolean;
  batteryPct: number;
  speedMode: SpeedMode;
  agl: number;
}

export type WorldEventKind =
  | 'GROUND_IMPACT'
  | 'GEOFENCE_CLAMP'
  | 'INPUT_LOST'
  | 'DEPLOY'
  | 'MISSION_END'
  | 'STRIKE'
  | 'BATTERY_CRITICAL';
