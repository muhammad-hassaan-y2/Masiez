export interface VisionDetection {
    label: string;
    bbox: [number, number, number, number]; // [x, y, w, h] in source-canvas pixels
    confidence: number;
    /** World altitude of the target's base, when known (ground-truth projector). */
    altitudeM?: number;
    /** Physical height of this target, used to estimate range from box height. */
    realHeightM?: number;
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

export const OBS_SIZE = 9; // [dx, dy, w, h, vf, vr, vu, rangeEst, altDelta] normalized
export const OBS_LEGACY_SIZE = 7; // exports predating the range-aware layout
export const ACTION_SIZE = 3; // [forward, strafe, climb] commands in [-1, 1]
export const OBS_NORMALIZE_SPEED = 20.0; // m/s used to normalize camera-frame velocity
export const OBS_NORMALIZE_RANGE = 100.0; // metres used to normalize estimated range
export const OBS_NORMALIZE_ALT = 25.0; // metres used to normalize the altitude delta
export const TARGET_REAL_HEIGHT_M = 2.0; // assumed target height when the detector is unknown
export const FPV_VERTICAL_FOV = (84 * Math.PI) / 180; // radians, matches CAMERA.fpv and training
