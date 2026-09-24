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
        const shiftPressed = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        const ctrlPressed  = this.keys['ControlLeft'] || this.keys['ControlRight'];
        const spacePressed = this.keys['Space'];

        // Throttle / Altitude: Shift or Space to fly up, Ctrl or C to fly down
        let th = 0;
        if (shiftPressed || spacePressed) th += 1;
        if (ctrlPressed || this.keys['KeyC']) th -= 1;
        this.throttle = th;

        // Pitch: W or ArrowUp (Forward), S or ArrowDown (Backward)
        let p = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) p += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) p -= 1;
        this.pitch = p;

        // Roll: D or ArrowRight (Roll Right), A or ArrowLeft (Roll Left)
        let r = 0;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) r += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) r -= 1;
        this.roll = r;

        // Yaw: E (Turn Right), Q (Turn Left)
        let y = 0;
        if (this.keys['KeyE']) y += 1;
        if (this.keys['KeyQ']) y -= 1;
        this.yaw = y;

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

    public hasAnyFlightInput(): boolean {
        return !!(
            this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD'] ||
            this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight'] ||
            this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['Space'] ||
            this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyQ'] || this.keys['KeyE']
        );
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
