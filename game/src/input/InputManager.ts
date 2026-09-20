import { KEY_BINDINGS } from 'drone-autonomy-shared';

export class InputManager {
    public throttle: number = 0;
    public pitch: number = 0;
    public roll: number = 0;
    public yaw: number = 0;

    // Mouse look / orbit
    public mouseDeltaX: number = 0;
    public mouseDeltaY: number = 0;
    public isPointerLocked: boolean = false;
    public isMouseDown: boolean = false;
    public mouseZoom: number = 0;

    public onArmToggle: () => void = () => {};
    public onModeToggle: () => void = () => {};
    public onCameraToggle: () => void = () => {};
    public onEmergencyStop: () => void = () => {};

    private keys: { [key: string]: boolean } = {};
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

        // Keyboard Controls
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            if (e.code === KEY_BINDINGS.toggleArm) {
                this.onArmToggle();
            } else if (e.code === KEY_BINDINGS.toggleMode) {
                this.onModeToggle();
            } else if (e.code === 'KeyC' || e.code === KEY_BINDINGS.cameraFollow) {
                this.onCameraToggle();
            } else if (e.code === KEY_BINDINGS.emergencyStop) {
                this.onEmergencyStop();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse Drag & Pointer Lock
        canvas.addEventListener('click', () => {
            if (!document.pointerLockElement) {
                canvas.requestPointerLock?.();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === canvas;
        });

        window.addEventListener('mousedown', (e) => {
            if (e.target === canvas) {
                this.isMouseDown = true;
            }
        });

        window.addEventListener('mouseup', () => {
            this.isMouseDown = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked || this.isMouseDown) {
                this.mouseDeltaX += e.movementX;
                this.mouseDeltaY += e.movementY;
            }
        });

        window.addEventListener('wheel', (e) => {
            // Smooth zoom: positive delta zooms out, negative zooms in
            this.mouseZoom += Math.sign(e.deltaY) * 0.8;
        }, { passive: true });

        // Prevent context menu on right click drag
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    public update(): void {
        this.throttle = (this.keys[KEY_BINDINGS.throttleUp] ? 1 : 0) - (this.keys[KEY_BINDINGS.throttleDown] ? 1 : 0);
        this.yaw      = (this.keys[KEY_BINDINGS.yawRight]    ? 1 : 0) - (this.keys[KEY_BINDINGS.yawLeft]      ? 1 : 0);
        this.pitch    = (this.keys[KEY_BINDINGS.pitchForward] ? 1 : 0) - (this.keys[KEY_BINDINGS.pitchBackward] ? 1 : 0);
        this.roll     = (this.keys[KEY_BINDINGS.rollRight]    ? 1 : 0) - (this.keys[KEY_BINDINGS.rollLeft]     ? 1 : 0);

        // Arrow keys support as secondary controls
        if (this.keys['ArrowUp'])    this.pitch = 1;
        if (this.keys['ArrowDown'])  this.pitch = -1;
        if (this.keys['ArrowLeft'])  this.roll  = -1;
        if (this.keys['ArrowRight']) this.roll  = 1;

        // Mouse steering when pointer locked
        if (this.isPointerLocked) {
            const mouseSteerX = this.mouseDeltaX * 0.08;
            if (Math.abs(mouseSteerX) > 0.01) {
                this.yaw += Math.max(-1, Math.min(1, mouseSteerX));
            }
        }

        // Gamepad support (Mode 2 standard)
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        if (gamepads[0]) {
            const gp = gamepads[0];
            if (Math.abs(gp.axes[1]) > 0.1) this.throttle = -gp.axes[1];
            if (Math.abs(gp.axes[0]) > 0.1) this.yaw      =  gp.axes[0];
            if (Math.abs(gp.axes[3]) > 0.1) this.pitch   = -gp.axes[3];
            if (Math.abs(gp.axes[2]) > 0.1) this.roll    =  gp.axes[2];
        }

        this.throttle = Math.max(-1, Math.min(1, this.throttle));
        this.yaw      = Math.max(-1, Math.min(1, this.yaw));
        this.pitch    = Math.max(-1, Math.min(1, this.pitch));
        this.roll     = Math.max(-1, Math.min(1, this.roll));
    }

    public consumeMouseDelta(): { dx: number; dy: number } {
        const res = { dx: this.mouseDeltaX, dy: this.mouseDeltaY };
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        return res;
    }

    public consumeMouseZoom(): number {
        const z = this.mouseZoom;
        this.mouseZoom = 0;
        return z;
    }
}
