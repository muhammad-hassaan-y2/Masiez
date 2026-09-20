import { SensorOutput } from '../wasm/PhysicsBridge';

export class HUD {
    private container: HTMLElement;
    private altEl!: HTMLElement;
    private spdEl!: HTMLElement;
    private hdgEl!: HTMLElement;
    private batEl!: HTMLElement;
    private gpsEl!: HTMLElement;
    private modeEl!: HTMLElement;
    private stateEl!: HTMLElement;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'hud-container';
        this.container.style.cssText = `
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none;
            font-family: 'Segoe UI', Roboto, sans-serif;
            color: #00ffcc;
            text-shadow: 0 0 5px rgba(0, 255, 204, 0.6);
            padding: 20px;
            box-sizing: border-box;
            display: flex;
            justify-content: space-between;
        `;

        const leftPanel = document.createElement('div');
        leftPanel.style.cssText = `
            background: rgba(10, 20, 30, 0.75);
            backdrop-filter: blur(8px);
            padding: 16px 24px;
            border-radius: 8px;
            border: 1px solid rgba(0, 255, 204, 0.3);
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 16px;
            font-weight: 600;
        `;

        this.altEl = document.createElement('div');
        this.spdEl = document.createElement('div');
        this.hdgEl = document.createElement('div');
        leftPanel.appendChild(this.altEl);
        leftPanel.appendChild(this.spdEl);
        leftPanel.appendChild(this.hdgEl);

        const rightPanel = document.createElement('div');
        rightPanel.style.cssText = `
            background: rgba(10, 20, 30, 0.75);
            backdrop-filter: blur(8px);
            padding: 16px 24px;
            border-radius: 8px;
            border: 1px solid rgba(0, 255, 204, 0.3);
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 16px;
            font-weight: 600;
        `;

        this.batEl = document.createElement('div');
        this.gpsEl = document.createElement('div');
        this.modeEl = document.createElement('div');
        this.stateEl = document.createElement('div');
        rightPanel.appendChild(this.batEl);
        rightPanel.appendChild(this.gpsEl);
        rightPanel.appendChild(this.modeEl);
        rightPanel.appendChild(this.stateEl);

        const controlsHint = document.createElement('div');
        controlsHint.id = 'hud-controls';
        controlsHint.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(10, 20, 30, 0.88);
            backdrop-filter: blur(8px);
            padding: 10px 24px;
            border-radius: 20px;
            border: 1px solid rgba(0, 255, 204, 0.4);
            font-size: 13px;
            color: #f0f0f0;
            display: flex;
            gap: 16px;
            align-items: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            white-space: nowrap;
        `;
        controlsHint.innerHTML = `
            <span style="color:#00ffcc;"><b>[CLICK]</b> MOUSE STEER</span>
            <span><b>[DRAG/WHEEL]</b> ORBIT & ZOOM</span>
            <span><b>[SPACE]</b> ARM</span>
            <span><b>[SHIFT/CTRL]</b> ALT</span>
            <span><b>[WASD]</b> MOVE</span>
            <span><b>[Q/E]</b> YAW</span>
            <span><b>[C]</b> CAM</span>
            <span><b>[TAB]</b> AUTOPILOT</span>
        `;

        this.container.appendChild(leftPanel);
        this.container.appendChild(controlsHint);
        this.container.appendChild(rightPanel);
        document.body.appendChild(this.container);
    }

    public update(
        sensors: SensorOutput,
        pos: [number, number, number],
        vel: [number, number, number],
        rot: [number, number, number],
        armed: boolean,
        mode: string
    ): void {
        const groundSpeed = Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]);
        this.altEl.innerText = `ALT (AGL): ${sensors.altitudeAGL.toFixed(1)} m`;
        this.spdEl.innerText = `SPD: ${groundSpeed.toFixed(1)} m/s`;
        this.hdgEl.innerText = `HDG: ${((rot[2] % 360 + 360) % 360).toFixed(0)}°`;

        this.batEl.innerText = `BAT: ${sensors.batteryPct.toFixed(0)}%`;
        this.gpsEl.innerText = `GPS: 3D FIX (12 sats)`;
        this.modeEl.innerText = `MODE: ${mode}`;
        this.stateEl.innerHTML = `STATE: <span style="color:${armed ? '#00ff66' : '#ff3333'}; font-weight: bold;">${armed ? '● ARMED' : '○ DISARMED'}</span>`;
    }
}
