import { RenderTargetTexture, Engine } from '@babylonjs/core';
import { NetworkManager } from '../core/NetworkManager';
import { CameraFrameMetadata } from 'drone-autonomy-shared';

export class CameraStream {
    private rtt: RenderTargetTexture;
    private engine: Engine;
    private network: NetworkManager;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    
    private captureIntervalId: number | null = null;
    private lastCaptureTime: number = 0;

    constructor(rtt: RenderTargetTexture, engine: Engine, network: NetworkManager) {
        this.rtt = rtt;
        this.engine = engine;
        this.network = network;

        const size = this.rtt.getSize();
        this.canvas = document.createElement('canvas');
        this.canvas.width = size.width;
        this.canvas.height = size.height;
        this.ctx = this.canvas.getContext('2d')!;
    }

    public async captureSnapshot(): Promise<{ data: string, metadata: CameraFrameMetadata }> {
        const size = this.rtt.getSize();
        const data = await this.rtt.readPixels();
        
        if (!data) {
            throw new Error("Failed to read pixels from RenderTargetTexture");
        }

        const imageData = new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer), size.width, size.height);
        
        // Flip image vertically (Babylon reads pixels upside down usually)
        const flippedCanvas = document.createElement('canvas');
        flippedCanvas.width = size.width;
        flippedCanvas.height = size.height;
        const flippedCtx = flippedCanvas.getContext('2d')!;
        
        this.ctx.putImageData(imageData, 0, 0);
        flippedCtx.translate(0, size.height);
        flippedCtx.scale(1, -1);
        flippedCtx.drawImage(this.canvas, 0, 0);

        return new Promise((resolve) => {
            flippedCanvas.toBlob((blob) => {
                if (!blob) return;
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    // Remove 'data:image/jpeg;base64,' prefix
                    const base64 = base64data.split(',')[1];
                    
                    resolve({
                        data: base64,
                        metadata: {
                            timestamp: Date.now(),
                            width: size.width,
                            height: size.height,
                            position: {
                                latitude: 33.6,
                                longitude: 72.9,
                                altitude_amsl: 0,
                                altitude_agl: 0,
                            },
                            attitude: {
                                roll: 0, pitch: 0, yaw: 0,
                                rollRate: 0, pitchRate: 0, yawRate: 0,
                            },
                            gimbal: { pitch: 0, yaw: 0 },
                        }
                    });
                };
            }, 'image/jpeg', 0.8);
        });
    }

    public startPeriodicCapture(intervalMs: number): void {
        this.stopCapture();
        this.captureIntervalId = window.setInterval(async () => {
            if (this.network.connected) {
                try {
                    const { data, metadata } = await this.captureSnapshot();
                    this.network.sendCameraFrame(data, metadata);
                } catch (e) {
                    console.error("Error capturing frame", e);
                }
            }
        }, intervalMs);
    }

    public stopCapture(): void {
        if (this.captureIntervalId !== null) {
            window.clearInterval(this.captureIntervalId);
            this.captureIntervalId = null;
        }
    }
}
