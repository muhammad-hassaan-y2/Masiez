export class InputManager {
    public throttle: number = 0;
    public pitch: number = 0;
    public roll: number = 0;
    public yaw: number = 0;

    public onArmToggle: () => void = () => {};
    public onSpeedToggle: () => void = () => {};
    public onMuteToggle: () => void = () => {};
    public onUserMenuToggle: () => void = () => {};

    public isMenuOpen: boolean = false;
    public targetMode: boolean = false;

    private keys: { [key: string]: boolean } = {};
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.canvas.style.cursor = 'none';

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' || e.code === 'Backquote' || e.key === '`' || e.key === '~') {
                e.preventDefault();
                if (this.targetMode) {
                    this.setTargetMode(false);
                } else {
                    this.onUserMenuToggle();
                }
                return;
            }

            if (this.isMenuOpen) {
                this.keys[e.code] = true;
                return;
            }

            this.keys[e.code] = true;

            if (e.code === 'Space') {
                this.onArmToggle();
            } else if (e.code === 'KeyR') {
                this.onSpeedToggle();
            } else if (e.code === 'KeyM') {
                this.onMuteToggle();
            } else if (e.code === 'KeyT') {
                this.setTargetMode(!this.targetMode);
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        window.addEventListener('blur', () => {
            this.keys = {};
        });
    }

    public setTargetMode(active: boolean): void {
        if (this.targetMode === active) return;
        this.targetMode = active;
        this.canvas.style.cursor = active ? 'crosshair' : 'none';
    }

    public update(): void {
        const shiftPressed = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        const descendPressed = this.keys['KeyC'];

        let th = 0;
        if (shiftPressed) {
            th = 1.0;
        } else if (descendPressed) {
            th = -1.0;
        }
        this.throttle = th;

        let p = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) p += 1.0;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) p -= 1.0;
        this.pitch = p;

        let r = 0;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) r += 1.0;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) r -= 1.0;
        this.roll = r;

        let y = 0;
        if (this.keys['KeyE']) y += 1.0;
        if (this.keys['KeyQ']) y -= 1.0;
        this.yaw = y;

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
            this.keys['ShiftLeft'] || this.keys['ShiftRight'] ||
            this.keys['KeyC'] || this.keys['KeyQ'] || this.keys['KeyE']
        );
    }
}
