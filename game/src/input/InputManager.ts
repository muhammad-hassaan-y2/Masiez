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
        let lastX = 0;
        let lastY = 0;

        canvas.addEventListener('click', () => {
            if (!document.pointerLockElement) {
                canvas.requestPointerLock?.();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === canvas;
        });

        window.addEventListener('mousedown', (e) => {
            if (e.target === canvas || (e.target as HTMLElement).tagName === 'CANVAS') {
                this.isMouseDown = true;
                lastX = e.clientX;
                lastY = e.clientY;
            }
        });

        window.addEventListener('mouseup', () => {
            this.isMouseDown = false;
        });

        window.addEventListener('mousemove', (e) => {
            let dx = 0;
            let dy = 0;

            // Only rotate view and steer when user clicks and moves, or when pointer locked
            if (this.isPointerLocked || this.isMouseDown) {
                if (this.isPointerLocked) {
                    dx = e.movementX || 0;
                    dy = e.movementY || 0;
                } else {
                    if (lastX !== 0 && lastY !== 0) {
                        const rawDx = (e.movementX !== undefined && Math.abs(e.movementX) < 120) ? e.movementX : (e.clientX - lastX);
                        const rawDy = (e.movementY !== undefined && Math.abs(e.movementY) < 120) ? e.movementY : (e.clientY - lastY);
                        dx = rawDx;
                        dy = rawDy;
                    }
                    lastX = e.clientX;
                    lastY = e.clientY;
                }

                this.mouseDeltaX += dx;
                this.mouseDeltaY += dy;
            } else {
                lastX = e.clientX;
                lastY = e.clientY;
            }
        });

        window.addEventListener('mouseleave', () => {
            this.isMouseDown = false;
            lastX = 0;
            lastY = 0;
        });

        window.addEventListener('wheel', (e) => {
            // Smooth zoom: positive delta zooms out, negative zooms in
            this.mouseZoom += Math.sign(e.deltaY) * 0.5;
        }, { passive: true });

        // Prevent context menu on right click drag
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    public update(): void {
        const shiftPressed = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['Space'];
        const ctrlPressed  = this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyC'];

        // Shift (or Space) = flying up, Ctrl (or C) = flying down, released = 0
        let th = 0;
        if (shiftPressed) {
            th = 1.0;
        } else if (ctrlPressed) {
            th = -1.0;
        }
        this.throttle = th;

        // Pitch: W or ArrowUp (Forward), S or ArrowDown (Backward)
        let p = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) p += 1.0;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) p -= 1.0;
        this.pitch = p;

        // Roll: D or ArrowRight (Rightward), A or ArrowLeft (Leftward)
        let r = 0;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) r += 1.0;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) r -= 1.0;
        this.roll = r;

        // Yaw: E (Turn Right), Q (Turn Left)
        let y = 0;
        if (this.keys['KeyE']) y += 1.0;
        if (this.keys['KeyQ']) y -= 1.0;
        this.yaw = y;

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
