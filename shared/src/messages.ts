// ============================================================
// WebSocket Message Types — Discriminated Union
// ============================================================

import type {
  Telemetry,
  DroneCommand,
  CommandResponse,
  Alert,
  DronePhysicsState,
  GimbalState,
  CameraFrameMetadata,
  DroneFlightState,
  GeofenceConfig,
  MissionState,
} from './types';

// --- Browser Game → Server ---

export interface GameTelemetryMsg {
  type: 'game:telemetry';
  telemetry: Telemetry;
}

export interface GamePhysicsMsg {
  type: 'game:physics';
  physics: DronePhysicsState;
}

export interface GameCameraFrameMsg {
  type: 'game:camera_frame';
  format: 'jpeg' | 'webp';
  data: string; // base64
  metadata: CameraFrameMetadata;
}

export interface UserChatMsg {
  type: 'user:chat';
  content: string;
  timestamp: number;
}

export interface UserOverrideMsg {
  type: 'user:override';
  action: 'pause' | 'resume' | 'rtl' | 'land' | 'emergency_stop';
}

export interface UserConfigMsg {
  type: 'user:config';
  geofence?: GeofenceConfig;
  maxAltitude?: number;
  maxSpeed?: number;
  batteryReserve?: number;
}

// --- Server → Browser Game ---

export interface ServerCommandMsg {
  type: 'server:command';
  command: DroneCommand;
}

export interface ServerCommandResponseMsg {
  type: 'server:command_response';
  response: CommandResponse;
}

export interface ServerAlertMsg {
  type: 'server:alert';
  alert: Alert;
}

export interface ServerChatMsg {
  type: 'server:chat';
  content: string;
  sender: 'ai' | 'system';
  toolCalls?: Array<{
    tool: string;
    params: Record<string, unknown>;
    status: string;
  }>;
  annotations?: Array<{
    label: string;
    bbox: [number, number, number, number]; // x, y, w, h
    confidence: number;
  }>;
}

export interface ServerStateChangeMsg {
  type: 'server:state_change';
  from: DroneFlightState;
  to: DroneFlightState;
  reason: string;
}

export interface ServerGimbalMsg {
  type: 'server:gimbal';
  gimbal: GimbalState;
}

export interface ServerConnectionMsg {
  type: 'server:connection';
  status: 'connected' | 'disconnected';
  sessionId: string;
}

// --- AI Server → Backend 1 (forwarded to game) ---

export interface AIVisionAnnotationsMsg {
  type: 'ai:vision_annotations';
  detections: Array<{
    label: string;
    bbox: [number, number, number, number];
    confidence: number;
  }>;
  timestamp: number;
}

// --- Union Types ---

export type GameToServerMsg =
  | GameTelemetryMsg
  | GamePhysicsMsg
  | GameCameraFrameMsg
  | UserChatMsg
  | UserOverrideMsg
  | UserConfigMsg;

export type ServerToGameMsg =
  | ServerCommandMsg
  | ServerCommandResponseMsg
  | ServerAlertMsg
  | ServerChatMsg
  | ServerStateChangeMsg
  | ServerGimbalMsg
  | ServerConnectionMsg
  | AIVisionAnnotationsMsg;

export type WSMessage = GameToServerMsg | ServerToGameMsg;
