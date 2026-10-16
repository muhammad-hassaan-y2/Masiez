export interface VisionDetection {
    label: string;
    bbox: [number, number, number, number]; // [x, y, w, h] in source-canvas pixels
    confidence: number;
}

export type AiMode = 'OFF' | 'DETECT' | 'FOLLOW';

export interface AiAxes {
    throttle: number; // -1 descend .. +1 climb
    pitch: number;    // -1 backward .. +1 forward
    roll: number;     // -1 strafe left .. +1 strafe right
    yaw: number;      // -1 turn left .. +1 turn right
}

export interface AiStatusInfo {
    detector: string;
    policy: string;
    inferenceMs: number;
    detections: number;
    following: boolean;
    error: string | null;
}

export const OBS_SIZE = 7; // [dx, dy, w, h, vf, vr, vu] normalized
export const ACTION_SIZE = 3; // [forward, strafe, climb] commands in [-1, 1]
export const OBS_NORMALIZE_SPEED = 20.0; // m/s used to normalize camera-frame velocity
