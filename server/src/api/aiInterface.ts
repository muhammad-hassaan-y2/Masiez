export interface TelemetryResponse {
  position: any;
  attitude: any;
  battery: any;
  sensors: any;
  timestamp: number;
}
export interface SensorResponse {
  gps: boolean;
  imu: boolean;
  barometer: boolean;
  lidar: boolean;
}
export interface MissionStateResponse {
  state: string;
}
export interface GeofenceResponse {
  radius: number;
  centerLat: number;
  centerLon: number;
}
export interface CommandRequest {
  type: string;
  params?: any;
}
export interface CommandResponsePayload {
  status: 'ACCEPTED' | 'REJECTED';
  commandId?: string;
  reason?: string;
}
export interface ChatRequest {
  message: string;
  sender: string;
}
