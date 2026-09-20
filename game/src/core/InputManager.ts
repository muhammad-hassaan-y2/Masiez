import { KEY_BINDINGS } from 'drone-autonomy-shared';

export class InputManager {
    public throttle: number = 0;
    public pitch: number = 0;
    public roll: number = 0;
    public yaw: number = 0;

    public armToggle: boolean = false;
    public toggleMode: boolean = false;
    public emergencyStop: boolean = false;

    public onArmToggle: () => void = () => {};
    public onModeToggle: () => void = () => {};
    public onEmergencyStop: () => void = () => {};

    private keys: { [key: string]: boolean } = {};

    constructor(_canvas: HTMLCanvasElement) {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            if (e.code === KEY_BINDINGS.toggleArm) {
                this.onArmToggle();
            }
            if (e.code === KEY_BINDINGS.toggleMode) {
                this.onModeToggle();
            }
            if (e.code === KEY_BINDINGS.emergencyStop) {
                this.onEmergencyStop();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    public update(): void {
        // Keyboard mapping using correct camelCase KEY_BINDINGS keys
        this.throttle = (this.keys[KEY_BINDINGS.throttleUp] ? 1 : 0) - (this.keys[KEY_BINDINGS.throttleDown] ? 1 : 0);
        this.yaw     = (this.keys[KEY_BINDINGS.yawRight]    ? 1 : 0) - (this.keys[KEY_BINDINGS.yawLeft]      ? 1 : 0);
        this.pitch   = (this.keys[KEY_BINDINGS.pitchForward] ? 1 : 0) - (this.keys[KEY_BINDINGS.pitchBackward] ? 1 : 0);
        this.roll    = (this.keys[KEY_BINDINGS.rollRight]    ? 1 : 0) - (this.keys[KEY_BINDINGS.rollLeft]     ? 1 : 0);

        // Gamepad mapping (standard Mode 2 layout)
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        if (gamepads[0]) {
            const gp = gamepads[0];
            // Left stick: Y = throttle (invert — down is positive on gamepad), X = yaw
            if (Math.abs(gp.axes[1]) > 0.1) this.throttle = -gp.axes[1];
            if (Math.abs(gp.axes[0]) > 0.1) this.yaw      =  gp.axes[0];
            // Right stick: Y = pitch (invert), X = roll
            if (Math.abs(gp.axes[3]) > 0.1) this.pitch = -gp.axes[3];
            if (Math.abs(gp.axes[2]) > 0.1) this.roll  =  gp.axes[2];
        }

        // Clamp to [-1, 1]
        this.throttle = Math.max(-1, Math.min(1, this.throttle));
        this.yaw      = Math.max(-1, Math.min(1, this.yaw));
        this.pitch    = Math.max(-1, Math.min(1, this.pitch));
        this.roll     = Math.max(-1, Math.min(1, this.roll));
    }
}
