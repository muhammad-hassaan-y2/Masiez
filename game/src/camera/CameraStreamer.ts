import { Camera } from '../scene/Camera';

export interface CameraStreamMetrics {
    isStreaming: boolean;
    framesSent: number;
    fps: number;
    frameSizeKB: number;
    resolution: { width: number; height: number };
}

export class CameraStreamer {
    private mainCanvas: HTMLCanvasElement;
    private offscreenCanvas: HTMLCanvasElement;
    private ctx2d: CanvasRenderingContext2D | null;

    public isStreaming: boolean = true;
    public streamFps: number = 8; // 8 FPS for responsive, network-efficient transmission
    public quality: number = 0.65;
    public readonly width: number = 640;
    public readonly height: number = 360;

    private lastFrameTime: number = 0;
    private framesInLastSec: number = 0;
    private fpsTimer: number = 0;
    public currentFps: number = 0;
    public framesSent: number = 0;
    public lastFrameSizeKB: number = 0;

    constructor(mainCanvas: HTMLCanvasElement) {
        this.mainCanvas = mainCanvas;
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = this.width;
        this.offscreenCanvas.height = this.height;
        this.ctx2d = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }

    public toggleStreaming(): boolean {
        this.isStreaming = !this.isStreaming;
        return this.isStreaming;
    }

    public getMetrics(): CameraStreamMetrics {
        return {
            isStreaming: this.isStreaming,
            framesSent: this.framesSent,
            fps: this.currentFps,
            frameSizeKB: this.lastFrameSizeKB,
            resolution: { width: this.width, height: this.height }
        };
    }

    /**
     * Grabs current frame from render canvas, downscales, and broadcasts over WebSocket
     */
    public update(
        ws: WebSocket | null,
        camera: Camera,
        nowMs: number,
        dronePos: [number, number, number],
        droneRotDeg: [number, number, number],
        groundSpeed: number,
        altitudeAGL: number
    ): void {
        if (!this.isStreaming || !ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const intervalMs = 1000.0 / this.streamFps;
        if (nowMs - this.lastFrameTime < intervalMs) {
            return;
        }
        this.lastFrameTime = nowMs;

        // FPS counter tracking
        this.framesInLastSec++;
        if (nowMs - this.fpsTimer >= 1000) {
            this.currentFps = this.framesInLastSec;
            this.framesInLastSec = 0;
            this.fpsTimer = nowMs;
        }

        try {
            if (!this.ctx2d) return;

            // Downscale main WebGPU canvas to 640x360 streaming frame
            this.ctx2d.drawImage(
                this.mainCanvas,
                0, 0, this.mainCanvas.width, this.mainCanvas.height,
                0, 0, this.width, this.height
            );

            // Compress to JPEG
            const dataUrl = this.offscreenCanvas.toDataURL('image/jpeg', this.quality);
            this.lastFrameSizeKB = Math.round((dataUrl.length * 0.75) / 1024);

            const payload = {
                type: 'game:camera_frame',
                format: 'jpeg',
                data: dataUrl,
                metadata: {
                    timestamp: Date.now(),
                    resolution: { width: this.width, height: this.height },
                    fov: Math.round(camera.fovRad * (180.0 / Math.PI)),
                    gimbalPitch: Number((camera.mouseOrbitPitch * (180.0 / Math.PI)).toFixed(1)),
                    gimbalYaw: Number((camera.mouseOrbitYaw * (180.0 / Math.PI)).toFixed(1)),
                    cameraType: camera.mode === 'FPV' ? 'fpv_gimbal' : 'chase_cam',
                    isScoped: camera.isScoped,
                    scopeGear: camera.scopeGear,
                    telemetrySnapshot: {
                        position: [
                            Number(dronePos[0].toFixed(2)),
                            Number(dronePos[1].toFixed(2)),
                            Number(dronePos[2].toFixed(2))
                        ],
                        heading: Number((((droneRotDeg[2] % 360) + 360) % 360).toFixed(1)),
                        altitudeAGL: Number(altitudeAGL.toFixed(1)),
                        speed: Number(groundSpeed.toFixed(1))
                    }
                }
            };

            ws.send(JSON.stringify(payload));
            this.framesSent++;
        } catch (err) {
            // Non-blocking in case canvas is in transition
        }
    }
}
