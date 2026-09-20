import { GameToServerMsg, ServerToGameMsg, Telemetry, CameraFrameMetadata } from 'drone-autonomy-shared';

export class NetworkManager {
    public connected: boolean = false;
    private socket: WebSocket | null = null;
    private reconnectDelay: number = 1000;
    private maxReconnectDelay: number = 10000;
    private messageHandler: (msg: ServerToGameMsg) => void = () => {};
    private heartbeatInterval: number | null = null;

    constructor() {
        this.connect();
    }

    private connect(): void {
        this.socket = new WebSocket('ws://localhost:3001/ws/game');

        this.socket.onopen = () => {
            console.log('Connected to server');
            this.connected = true;
            this.reconnectDelay = 1000; // Reset delay

            this.heartbeatInterval = window.setInterval(() => {
                this.send({ type: 'PING', timestamp: Date.now() } as any);
            }, 3000);
        };

        this.socket.onmessage = (event) => {
            try {
                const msg: ServerToGameMsg = JSON.parse(event.data);
                this.messageHandler(msg);
            } catch (e) {
                console.error("Failed to parse message", e);
            }
        };

        this.socket.onclose = () => {
            console.log('Disconnected from server');
            this.connected = false;
            if (this.heartbeatInterval) {
                window.clearInterval(this.heartbeatInterval);
            }
            this.scheduleReconnect();
        };

        this.socket.onerror = (err) => {
            console.error('WebSocket error:', err);
            this.socket?.close();
        };
    }

    private scheduleReconnect(): void {
        setTimeout(() => {
            console.log(`Reconnecting in ${this.reconnectDelay}ms...`);
            this.connect();
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        }, this.reconnectDelay);
    }

    public onMessage(handler: (msg: ServerToGameMsg) => void): void {
        this.messageHandler = handler;
    }

    public send(msg: GameToServerMsg): void {
        if (this.connected && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(msg));
        }
    }

    public sendTelemetry(telemetry: Telemetry): void {
        this.send({
            type: 'TELEMETRY',
            telemetry
        } as any);
    }

    public sendCameraFrame(jpeg: string, metadata: CameraFrameMetadata): void {
        this.send({
            type: 'CAMERA_FRAME',
            frame: jpeg,
            metadata
        } as any);
    }
}
