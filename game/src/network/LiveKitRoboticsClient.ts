import { Room, RoomEvent, Track } from 'livekit-client';
import { VisionDetection } from '../ai/types';

export type { VisionDetection };

export interface VisionAnnotationsPayload {
    type: 'ai:vision_annotations';
    detections: VisionDetection[];
    width: number;
    height: number;
    timestamp: number;
}

export interface TeleopAxes {
    throttle: number; // -1.0 (descend) to +1.0 (climb)
    pitch: number;    // -1.0 (reverse) to +1.0 (forward)
    roll: number;     // -1.0 (strafe left) to +1.0 (strafe right)
    yaw: number;      // -1.0 (turn left) to +1.0 (turn right)
}

export interface LiveKitMetrics {
    status: 'disconnected' | 'connecting' | 'connected' | 'streaming' | 'error';
    room: string;
    identity: string;
    rttMs: number;
    videoTrackPublished: boolean;
    packetsSent: number;
    packetsReceived: number;
    detectionsCount: number;
    teleopActive: boolean;
    fps: number;
    url: string;
}

export class LiveKitRoboticsClient {
    public room: Room | null = null;
    public status: 'disconnected' | 'connecting' | 'connected' | 'streaming' | 'error' = 'disconnected';
    public roomName: string = 'drone';
    public identity: string = 'drone-sim';
    public livekitUrl: string = '';

    // Real-Time Teleoperation State (from DataChannel / WebRTC)
    public teleopAxes: TeleopAxes = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    public lastTeleopTimestamp: number = 0;

    private mainCanvas: HTMLCanvasElement | null = null;
    private videoTrack: MediaStreamTrack | null = null;
    private packetsSent: number = 0;
    private packetsReceived: number = 0;
    private lastRttMs: number = 0;
    private detectionsCount: number = 0;
    private latestDetections: VisionDetection[] = [];
    private detectionSourceDims: { width: number; height: number } = { width: 640, height: 360 };

    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    // Callbacks
    public onAiAnnotations: ((detections: VisionDetection[], width: number, height: number) => void) | null = null;
    public onRemoteCommand: ((command: any) => void) | null = null;
    public onTeleopAxes: ((axes: TeleopAxes) => void) | null = null;
    public onStatusChange: ((status: string) => void) | null = null;

    // Registered RPC Handlers for LiveKit Robotics RPC
    private registeredRpcHandlers: Map<string, (params: any) => Promise<any> | any> = new Map();

    constructor() {
        console.log('[LiveKit Robotics] Initializing client...');
    }

    public isTeleoperating(): boolean {
        return (performance.now() - this.lastTeleopTimestamp) < 1200;
    }

    /**
     * Registers a remote procedure call (RPC) method exposed to remote clients/Jupyter
     */
    public registerRpc(methodName: string, handler: (params: any) => Promise<any> | any): void {
        this.registeredRpcHandlers.set(methodName, handler);
        if (this.room && this.room.localParticipant) {
            try {
                this.room.localParticipant.registerRpcMethod(methodName, async (rpcData: any) => {
                    try {
                        let params = {};
                        if (rpcData.payload) {
                            try {
                                params = JSON.parse(rpcData.payload);
                            } catch {
                                params = { raw: rpcData.payload };
                            }
                        }
                        const result = await handler(params);
                        return JSON.stringify(result || { ok: true });
                    } catch (err: any) {
                        return JSON.stringify({ error: err.message || String(err) });
                    }
                });
                console.log(`[LiveKit Robotics RPC] Registered method: ${methodName}`);
            } catch (err) {
                console.warn(`[LiveKit Robotics RPC] Failed to register method ${methodName}:`, err);
            }
        }
    }

    public async connect(canvas: HTMLCanvasElement, customUrl?: string, customToken?: string): Promise<boolean> {
        this.mainCanvas = canvas;
        this.setStatus('connecting');

        try {
            let token = customToken;
            let targetRoom = 'drone';
            let targetIdentity = 'drone-sim';

            if (!token) {
                // 1. Fetch JWT Access Token from Backend 1
                const apiHost = window.location.port === '5173'
                    ? `${window.location.hostname || 'localhost'}:3001`
                    : (window.location.host || 'localhost:3001');
                const apiProtocol = window.location.protocol;
                const tokenUrl = `${apiProtocol}//${apiHost}/api/v1/livekit/token?identity=drone-sim&room=drone`;

                console.log(`[LiveKit Robotics] Requesting token from ${tokenUrl}...`);
                const res = await fetch(tokenUrl);
                if (!res.ok) {
                    throw new Error(`Token fetch failed: ${res.status} ${res.statusText}`);
                }

                const data = await res.json();
                token = data.token;
                targetRoom = data.room || 'drone';
                targetIdentity = data.identity || 'drone-sim';
            }

            this.roomName = targetRoom;
            this.identity = targetIdentity;

            // Determine appropriate LiveKit WebSocket URL
            if (customUrl) {
                this.livekitUrl = customUrl;
            } else if (window.location.protocol === 'https:' && window.location.hostname === 'game.local') {
                this.livekitUrl = `wss://${window.location.host}/rtc`;
            } else {
                const lkHost = window.location.hostname || 'localhost';
                this.livekitUrl = `ws://${lkHost}:7880`;
            }

            console.log(`[LiveKit Robotics] Connecting to ${this.livekitUrl} in room '${this.roomName}' as '${this.identity}'...`);

            // 2. Initialize LiveKit Room
            this.room = new Room({
                adaptiveStream: true,
                dynacast: true,
            });

            // 3. Setup Room Event Listeners
            this.setupRoomEvents();

            // 4. Connect to SFU
            await this.room.connect(this.livekitUrl, token!);
            console.log(`[LiveKit Robotics] Connected to LiveKit SFU room: ${this.roomName}`);
            this.setStatus('connected');

            // 5. Re-register any pre-registered RPC handlers on localParticipant
            this.rebindRpcHandlers();

            // 6. Publish Drone Camera Stream (Robotics FPV Track)
            await this.publishDroneCamera();

            return true;
        } catch (err: any) {
            console.warn('[LiveKit Robotics] Connection notice:', err.message || err);
            this.setStatus('error');
            return false;
        }
    }

    private rebindRpcHandlers(): void {
        if (!this.room || !this.room.localParticipant) return;
        for (const [methodName, handler] of this.registeredRpcHandlers.entries()) {
            try {
                this.room.localParticipant.registerRpcMethod(methodName, async (rpcData: any) => {
                    try {
                        let params = {};
                        if (rpcData.payload) {
                            try {
                                params = JSON.parse(rpcData.payload);
                            } catch {
                                params = { raw: rpcData.payload };
                            }
                        }
                        const result = await handler(params);
                        return JSON.stringify(result || { ok: true });
                    } catch (err: any) {
                        return JSON.stringify({ error: err.message || String(err) });
                    }
                });
                console.log(`[LiveKit Robotics RPC] Bound method: ${methodName}`);
            } catch (err) {
                console.warn(`[LiveKit Robotics RPC] Error binding method ${methodName}:`, err);
            }
        }
    }

    private setupRoomEvents(): void {
        if (!this.room) return;

        this.room.on(RoomEvent.Connected, () => {
            console.log('[LiveKit Robotics] RoomEvent: Connected');
            this.setStatus('connected');
        });

        this.room.on(RoomEvent.Disconnected, () => {
            console.log('[LiveKit Robotics] RoomEvent: Disconnected');
            this.setStatus('disconnected');
        });

        this.room.on(RoomEvent.Reconnecting, () => {
            console.log('[LiveKit Robotics] RoomEvent: Reconnecting...');
            this.setStatus('connecting');
        });

        this.room.on(RoomEvent.Reconnected, () => {
            console.log('[LiveKit Robotics] RoomEvent: Reconnected');
            this.setStatus('streaming');
        });

        // Robotics Data Channel: Receive AI Vision Annotations, Continuous Teleoperation Axes & Commands
        this.room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant, kind, topic) => {
            this.packetsReceived++;
            try {
                const text = this.decoder.decode(payload);
                const msg = JSON.parse(text);

                // 1. Continuous Teleoperation Control (Sub-50ms Joystick/Axis flight inputs)
                if (topic === 'teleop' || msg.type === 'teleop:control' || msg.axes) {
                    const axes: TeleopAxes = {
                        throttle: Number(msg.axes?.throttle ?? msg.throttle ?? 0),
                        pitch: Number(msg.axes?.pitch ?? msg.pitch ?? 0),
                        roll: Number(msg.axes?.roll ?? msg.roll ?? 0),
                        yaw: Number(msg.axes?.yaw ?? msg.yaw ?? 0),
                    };
                    // Support standard ROS Twist linear/angular conventions if provided
                    if (msg.linear || msg.angular) {
                        axes.throttle = Number(msg.linear?.z ?? axes.throttle);
                        axes.pitch = Number(msg.linear?.x ?? axes.pitch);
                        axes.roll = Number(msg.linear?.y ?? axes.roll);
                        axes.yaw = Number(msg.angular?.z ?? axes.yaw);
                    }
                    this.teleopAxes = axes;
                    this.lastTeleopTimestamp = performance.now();
                    if (this.onTeleopAxes) {
                        this.onTeleopAxes(axes);
                    }
                    return;
                }

                // 2. Discrete Teleoperation Commands / State Toggles
                if (msg.type === 'teleop:command' || msg.type === 'server:command') {
                    console.log('[LiveKit Robotics] Received teleop command via DataChannel:', msg);
                    if (this.onRemoteCommand) {
                        this.onRemoteCommand(msg.command || msg);
                    }
                    return;
                }

                // 3. AI Computer Vision Annotations (Bounding Boxes from Vision / Kaggle model)
                if (msg.type === 'ai:vision_annotations' || topic === 'vision') {
                    const ann = msg as VisionAnnotationsPayload;
                    this.latestDetections = ann.detections || [];
                    this.detectionsCount = this.latestDetections.length;
                    this.detectionSourceDims = { width: ann.width || 640, height: ann.height || 360 };

                    if (this.onAiAnnotations) {
                        this.onAiAnnotations(this.latestDetections, this.detectionSourceDims.width, this.detectionSourceDims.height);
                    }
                    return;
                }
            } catch (e) {
                // Non-blocking for high-frequency packets
            }
        });
    }

    private async publishDroneCamera(): Promise<void> {
        if (!this.room || !this.mainCanvas) return;

        try {
            // Capture WebRTC stream directly from render canvas at 30 FPS
            const stream = (this.mainCanvas as any).captureStream
                ? (this.mainCanvas as any).captureStream(30)
                : null;

            if (!stream) {
                console.warn('[LiveKit Robotics] canvas.captureStream not supported in this browser environment');
                return;
            }

            const tracks = stream.getVideoTracks();
            if (tracks.length === 0) {
                console.warn('[LiveKit Robotics] No video tracks found on canvas stream');
                return;
            }

            const track = tracks[0];
            if (!track) {
                console.warn('[LiveKit Robotics] No video track available');
                return;
            }
            this.videoTrack = track;

            console.log('[LiveKit Robotics] Publishing WebRTC canvas video track with maintain-framerate...');
            await this.room.localParticipant.publishTrack(track, {
                name: 'drone-fpv',
                source: Track.Source.Camera,
                simulcast: false,
                degradationPreference: 'maintain-framerate',
            });

            this.setStatus('streaming');
            console.log('[LiveKit Robotics] Successfully published drone-fpv camera stream to room!');
        } catch (err: any) {
            console.error('[LiveKit Robotics] Failed to publish camera track:', err);
        }
    }

    /**
     * Publishes drone telemetry & kamikaze mission state via low-latency LiveKit Data Channel
     */
    public publishTelemetry(telemetry: any, mission?: any): void {
        if (!this.room || (this.status !== 'streaming' && this.status !== 'connected')) {
            return;
        }

        try {
            const payload = {
                type: 'drone:telemetry',
                telemetry,
                mission,
                timestamp: Date.now(),
            };
            const bytes = this.encoder.encode(JSON.stringify(payload));
            this.room.localParticipant.publishData(bytes, {
                reliable: false, // lossy/low-latency for high-rate continuous telemetry
                topic: 'telemetry',
            });
            this.packetsSent++;
        } catch (e) {
            // Non-blocking
        }
    }

    /**
     * Publishes a reliable kamikaze strike / mission event over LiveKit Data Channel
     */
    public publishStrikeEvent(strikeEvent: any): void {
        if (!this.room || (this.status !== 'streaming' && this.status !== 'connected')) {
            return;
        }

        try {
            const payload = {
                type: 'drone:kamikaze_strike',
                ...strikeEvent,
                timestamp: Date.now(),
            };
            const bytes = this.encoder.encode(JSON.stringify(payload));
            this.room.localParticipant.publishData(bytes, {
                reliable: true, // reliable delivery for discrete mission/scoring events
                topic: 'mission',
            });
            this.packetsSent++;
        } catch (e) {
            // Non-blocking
        }
    }

    public getLatestDetections(): { detections: VisionDetection[]; width: number; height: number } {
        return {
            detections: this.latestDetections,
            width: this.detectionSourceDims.width,
            height: this.detectionSourceDims.height,
        };
    }

    public getMetrics(): LiveKitMetrics {
        return {
            status: this.status,
            room: this.roomName,
            identity: this.identity,
            rttMs: this.lastRttMs,
            videoTrackPublished: this.videoTrack !== null,
            packetsSent: this.packetsSent,
            packetsReceived: this.packetsReceived,
            detectionsCount: this.detectionsCount,
            teleopActive: this.isTeleoperating(),
            fps: 30,
            url: this.livekitUrl,
        };
    }

    private setStatus(status: 'disconnected' | 'connecting' | 'connected' | 'streaming' | 'error'): void {
        this.status = status;
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
    }

    public disconnect(): void {
        if (this.videoTrack) {
            this.videoTrack.stop();
            this.videoTrack = null;
        }
        if (this.room) {
            this.room.disconnect();
            this.room = null;
        }
        this.setStatus('disconnected');
    }
}
