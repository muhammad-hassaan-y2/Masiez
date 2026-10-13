import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';

export interface VisionDetection {
    label: string;
    bbox: [number, number, number, number]; // [x, y, w, h] in image pixels
    confidence: number;
}

export interface VisionAnnotationsPayload {
    type: 'ai:vision_annotations';
    detections: VisionDetection[];
    width: number;
    height: number;
    timestamp: number;
}

export interface LiveKitMetrics {
    status: 'disconnected' | 'connecting' | 'connected' | 'streaming' | 'error';
    room: string;
    identity: string;
    rttMs: number;
    videoTrackPublished: boolean;
    packetsSent: number;
    detectionsCount: number;
    fps: number;
    url: string;
}

export class LiveKitRoboticsClient {
    public room: Room | null = null;
    public status: 'disconnected' | 'connecting' | 'connected' | 'streaming' | 'error' = 'disconnected';
    public roomName: string = 'drone';
    public identity: string = 'drone-sim';
    public livekitUrl: string = '';

    private mainCanvas: HTMLCanvasElement | null = null;
    private videoTrack: MediaStreamTrack | null = null;
    private isStreamingVideo: boolean = true;
    private packetsSent: number = 0;
    private lastRttMs: number = 0;
    private detectionsCount: number = 0;
    private latestDetections: VisionDetection[] = [];
    private detectionSourceDims: { width: number; height: number } = { width: 640, height: 360 };

    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    // Callbacks
    public onAiAnnotations: ((detections: VisionDetection[], width: number, height: number) => void) | null = null;
    public onRemoteCommand: ((command: any) => void) | null = null;
    public onStatusChange: ((status: string) => void) | null = null;

    constructor() {
        console.log('[LiveKit Robotics] Initializing client...');
    }

    public async connect(canvas: HTMLCanvasElement): Promise<boolean> {
        this.mainCanvas = canvas;
        this.setStatus('connecting');

        try {
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
            const token = data.token;
            this.roomName = data.room || 'drone';
            this.identity = data.identity || 'drone-sim';

            // Determine appropriate LiveKit WebSocket URL
            // Default to port 7880 on current host, or data.url
            if (window.location.protocol === 'https:' && window.location.hostname === 'game.local') {
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
            await this.room.connect(this.livekitUrl, token);
            console.log(`[LiveKit Robotics] Connected to LiveKit SFU room: ${this.roomName}`);
            this.setStatus('connected');

            // 5. Publish Drone Camera Stream (Robotics FPV Track)
            await this.publishDroneCamera();

            return true;
        } catch (err: any) {
            console.warn('[LiveKit Robotics] Connection notice:', err.message || err);
            this.setStatus('error');
            return false;
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

        // Robotics Data Channel: Receive AI Vision Annotations & Teleoperation Commands
        this.room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant, kind, topic) => {
            try {
                const text = this.decoder.decode(payload);
                const msg = JSON.parse(text);

                if (msg.type === 'ai:vision_annotations') {
                    const ann = msg as VisionAnnotationsPayload;
                    this.latestDetections = ann.detections || [];
                    this.detectionsCount = this.latestDetections.length;
                    this.detectionSourceDims = { width: ann.width || 640, height: ann.height || 360 };

                    if (this.onAiAnnotations) {
                        this.onAiAnnotations(this.latestDetections, this.detectionSourceDims.width, this.detectionSourceDims.height);
                    }
                } else if (msg.type === 'teleop:command' || msg.type === 'server:command') {
                    console.log('[LiveKit Robotics] Received teleop command via DataChannel:', msg);
                    if (this.onRemoteCommand) {
                        this.onRemoteCommand(msg.command || msg);
                    }
                }
            } catch (e) {
                // Ignore malformed packets
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

            console.log('[LiveKit Robotics] Publishing WebRTC canvas video track...');
            await this.room.localParticipant.publishTrack(track, {
                name: 'drone-fpv',
                source: Track.Source.Camera,
                simulcast: false,
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
                reliable: false, // lossy/low-latency for high-rate telemetry
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
            detectionsCount: this.detectionsCount,
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
