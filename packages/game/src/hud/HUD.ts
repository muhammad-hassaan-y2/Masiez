import { SensorOutput } from '../wasm/PhysicsBridge';

const TEXT = 'rgba(255,255,255,0.92)';
const SHADOW = '0 1px 3px rgba(0,0,0,0.8)';
const TRACKING = 'letter-spacing:0.08em;';

export interface HudTelemetry {
    sensors: SensorOutput;
    armed: boolean;
    speedMode: string;
    muted: boolean;
    targetMode: boolean;
    frozen: boolean;
    throttle: number;
    pitch: number;
    roll: number;
    yaw: number;
    motorRpms: [number, number, number, number];
    position: [number, number, number];
    headingDeg: number;
    elapsedSec: number;
}

function formatTimer(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const CARDINALS: Record<number, string> = {
    0: 'N',
    45: 'NE',
    90: 'E',
    135: 'SE',
    180: 'S',
    225: 'SW',
    270: 'W',
    315: 'NW',
};

function compassLabel(angleDeg: number): string {
    const rounded = Math.round(normalizeHeading(angleDeg) / 5) * 5 % 360;
    const cardinal = CARDINALS[rounded];
    if (cardinal) return cardinal;
    return String(rounded).padStart(3, '0');
}

function normalizeHeading(angleDeg: number): number {
    return ((angleDeg % 360) + 360) % 360;
}

export class HUD {
    private container: HTMLElement;

    private linkQualityEl!: HTMLElement;
    private linkBars: SVGRectElement[] = [];
    private compassReadoutEl!: HTMLElement;
    private compassLabels: HTMLElement[] = [];
    private timeEl!: HTMLElement;
    private ampEl!: HTMLElement;
    private mahEl!: HTMLElement;
    private flightModeEl!: HTMLElement;
    private thrEl!: HTMLElement;
    private notificationEl!: HTMLElement;
    private signalLostEl!: HTMLElement;
    private mapClearedEl!: HTMLElement;

    private mahUsed = 0;
    private lastBatterySample = performance.now();

    public isMenuOpen = false;
    private userMenuOverlayEl!: HTMLElement;
    private menuAudioBtn!: HTMLButtonElement;
    private menuSpeedBtn!: HTMLButtonElement;
    private captureStatusEl!: HTMLElement;
    private leftStickDot!: HTMLElement;
    private rightStickDot!: HTMLElement;

    public onMenuOpenChange: (isOpen: boolean) => void = () => {};
    public onSpeedModeToggle: () => void = () => {};
    public onAudioToggle: () => void = () => {};
    public onRespawn: () => void = () => {};
    public onCaptureFrame: () => void = () => {};
    public onGenerateDataset: () => void = () => {};

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'hud-container';
        this.container.style.cssText = `
            position:absolute;inset:0;pointer-events:none;overflow:hidden;user-select:none;z-index:10;
            font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
            font-size:clamp(13px,1.15vw,20px);color:${TEXT};
            text-shadow:${SHADOW};${TRACKING}
        `;
        document.body.appendChild(this.container);
        this.initDOM();
    }

    private createFeedOverlay(): HTMLElement {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:absolute;inset:0;pointer-events:none;
            background:
                repeating-linear-gradient(to bottom, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 4px),
                radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.5) 100%);
            opacity:0.6;
        `;
        return overlay;
    }

    private createAirframe(): HTMLElement {
        const airframe = document.createElement('div');
        airframe.style.cssText = `
            position:absolute;left:50%;bottom:-4%;width:44%;height:18%;transform:translateX(-50%);
            background:radial-gradient(ellipse at 50% 100%, rgba(8,10,12,0.88) 0%, rgba(8,10,12,0.5) 45%, rgba(0,0,0,0) 72%);
            filter:blur(7px);pointer-events:none;
        `;
        return airframe;
    }

    private createLinkIcon(): HTMLElement {
        const icon = document.createElement('div');
        icon.style.cssText = 'display:flex;align-items:flex-end;color:inherit;';
        icon.innerHTML = `
            <svg width="18" height="15" viewBox="0 0 18 15" fill="currentColor" aria-hidden="true">
                <rect data-bar="0" x="0" y="10" width="3" height="5" opacity="0.22" />
                <rect data-bar="1" x="4.5" y="7.5" width="3" height="7.5" opacity="0.22" />
                <rect data-bar="2" x="9" y="5" width="3" height="10" opacity="0.22" />
                <rect data-bar="3" x="13.5" y="2.5" width="3" height="12.5" opacity="0.22" />
            </svg>
        `;
        const rects = icon.querySelectorAll('rect');
        this.linkBars = [];
        rects.forEach((rect) => this.linkBars.push(rect as SVGRectElement));
        return icon;
    }

    private createCompass(): HTMLElement {
        const compass = document.createElement('div');
        compass.style.cssText = `
            position:absolute;top:10px;left:50%;transform:translateX(-50%);
            width:380px;display:flex;flex-direction:column;align-items:center;
        `;

        this.compassReadoutEl = document.createElement('div');
        this.compassReadoutEl.style.cssText = `
            min-width:66px;padding:2px 10px;text-align:center;
            border:1px solid rgba(255,255,255,0.5);border-radius:2px;
            background:rgba(0,0,0,0.28);font-weight:700;letter-spacing:0.12em;
        `;

        const caret = document.createElement('div');
        caret.innerText = '▼';
        caret.style.cssText = 'font-size:0.55em;opacity:0.85;margin-top:1px;';

        const tape = document.createElement('div');
        tape.style.cssText = `
            position:relative;width:420px;height:20px;overflow:hidden;
            background:linear-gradient(to right,
                rgba(0,0,0,0) 0%,
                rgba(0,0,0,0.34) 24%,
                rgba(0,0,0,0.34) 76%,
                rgba(0,0,0,0) 100%);
            mask-image:linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%);
            -webkit-mask-image:linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%);
        `;
        this.compassLabels = [];
        for (let i = 0; i < 9; i++) {
            const label = document.createElement('span');
            label.style.cssText = `
                position:absolute;top:2px;left:0;width:38px;text-align:center;
                transform:translateX(-50%);white-space:nowrap;
            `;
            this.compassLabels.push(label);
            tape.appendChild(label);
        }

        const centerLine = document.createElement('div');
        centerLine.style.cssText = `
            position:absolute;bottom:1px;left:50%;width:2px;height:4px;transform:translateX(-50%);
            background:rgba(255,255,255,0.85);
        `;
        tape.appendChild(centerLine);

        compass.append(this.compassReadoutEl, caret, tape);
        return compass;
    }

    private createCornerBlock(lineOne: HTMLElement, lineTwo: HTMLElement, positionCss: string): HTMLElement {
        const block = document.createElement('div');
        block.style.cssText = `position:absolute;display:flex;flex-direction:column;gap:5px;${positionCss}`;
        block.append(lineOne, lineTwo);
        return block;
    }

    private initDOM(): void {
        const topLeft = document.createElement('div');
        topLeft.style.cssText = 'position:absolute;top:18px;left:22px;display:flex;align-items:flex-end;gap:10px;';
        this.linkQualityEl = document.createElement('span');
        topLeft.append(this.createLinkIcon(), this.linkQualityEl);

        this.timeEl = document.createElement('div');
        this.timeEl.style.cssText = 'position:absolute;top:18px;right:22px;';

        const ampLine = document.createElement('div');
        this.ampEl = document.createElement('span');
        ampLine.appendChild(this.ampEl);
        this.mahEl = document.createElement('div');
        const bottomLeft = this.createCornerBlock(ampLine, this.mahEl, 'left:22px;bottom:18px;');

        this.flightModeEl = document.createElement('div');
        this.flightModeEl.style.cssText = `
            position:absolute;left:50%;bottom:18px;transform:translateX(-50%);
            letter-spacing:0.24em;
        `;

        this.thrEl = document.createElement('div');
        this.thrEl.style.cssText = 'position:absolute;right:22px;bottom:18px;text-align:right;';

        this.notificationEl = document.createElement('div');
        this.notificationEl.style.cssText = `
            position:absolute;top:84px;left:50%;transform:translateX(-50%);
            font-weight:600;letter-spacing:0.14em;opacity:0;transition:opacity 0.2s;
        `;

        const noiseStyle = document.createElement('style');
        noiseStyle.textContent = `
            @keyframes hud-signal-roll {
                0% { background-position: 0 0, 0 0; }
                100% { background-position: 0 120px, 0 0; }
            }
        `;
        document.head.appendChild(noiseStyle);

        this.signalLostEl = document.createElement('div');
        this.signalLostEl.style.cssText = `
            position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;
            background:
                repeating-linear-gradient(to bottom, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 3px),
                radial-gradient(circle at 50% 50%, rgba(22,26,30,0.97) 0%, rgba(0,0,0,0.99) 72%);
            animation:hud-signal-roll 0.6s steps(6) infinite;
        `;
        const signalTitle = document.createElement('div');
        signalTitle.innerText = 'SIGNAL LOST';
        signalTitle.style.cssText = 'font-size:2.1em;font-weight:700;letter-spacing:0.34em;color:rgba(255,255,255,0.88);';
        const signalSub = document.createElement('div');
        signalSub.innerText = 'NEW DRONE INBOUND';
        signalSub.style.cssText = 'font-size:0.78em;letter-spacing:0.22em;color:rgba(255,255,255,0.45);';
        this.signalLostEl.append(signalTitle, signalSub);

        this.mapClearedEl = document.createElement('div');
        this.mapClearedEl.style.cssText = `
            position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;
            background:radial-gradient(circle at 50% 50%, rgba(12,26,16,0.94) 0%, rgba(0,0,0,0.96) 74%);
        `;
        const clearedTitle = document.createElement('div');
        clearedTitle.innerText = 'MAP CLEARED';
        clearedTitle.style.cssText = 'font-size:2.3em;font-weight:700;letter-spacing:0.34em;color:rgba(150,255,180,0.92);';
        const clearedSub = document.createElement('div');
        clearedSub.innerText = 'ALL TARGETS DESTROYED · SPACE TO REDEPLOY';
        clearedSub.style.cssText = 'font-size:0.78em;letter-spacing:0.2em;color:rgba(255,255,255,0.6);';
        this.mapClearedEl.append(clearedTitle, clearedSub);

        this.userMenuOverlayEl = document.createElement('div');
        this.userMenuOverlayEl.id = 'hud-user-menu-overlay';
        this.userMenuOverlayEl.style.cssText = `
            position:absolute;inset:0;display:none;align-items:center;justify-content:center;
            background:rgba(4,6,8,0.82);z-index:980;pointer-events:auto;
        `;
        this.buildUserMenu();

        this.container.append(
            this.createFeedOverlay(),
            this.createAirframe(),
            this.createCompass(),
            topLeft,
            this.timeEl,
            bottomLeft,
            this.flightModeEl,
            this.thrEl,
            this.notificationEl,
            this.signalLostEl,
            this.mapClearedEl,
            this.userMenuOverlayEl,
        );
    }

    private createStick(labelText: string): { root: HTMLElement; dot: HTMLElement } {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:7px;';

        const base = document.createElement('div');
        base.style.cssText = `
            position:relative;width:92px;height:92px;border-radius:50%;
            border:1px solid rgba(255,255,255,0.3);
            background:
                linear-gradient(to right, transparent calc(50% - 0.5px), rgba(255,255,255,0.12) calc(50% - 0.5px), rgba(255,255,255,0.12) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
                linear-gradient(to bottom, transparent calc(50% - 0.5px), rgba(255,255,255,0.12) calc(50% - 0.5px), rgba(255,255,255,0.12) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
                radial-gradient(circle at 50% 50%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 72%);
        `;

        const dot = document.createElement('div');
        dot.style.cssText = `
            position:absolute;left:50%;top:50%;width:22px;height:22px;border-radius:50%;
            background:rgba(255,255,255,0.85);box-shadow:0 0 8px rgba(255,255,255,0.4);
            transform:translate(-50%,-50%);
        `;
        base.appendChild(dot);

        const label = document.createElement('div');
        label.innerText = labelText;
        label.style.cssText = 'font-size:10px;letter-spacing:0.1em;color:rgba(255,255,255,0.65);';

        root.append(base, label);
        return { root, dot };
    }

    private createKeycap(label: string, width: number = 54): HTMLElement {
        const cap = document.createElement('div');
        cap.innerText = label;
        cap.style.cssText = `
            display:flex;align-items:center;justify-content:center;min-width:${width}px;height:26px;padding:0 8px;
            box-sizing:border-box;border:1px solid rgba(255,255,255,0.42);border-radius:3px;
            background:linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 100%);
            box-shadow:0 2px 0 rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.2);
            font-size:10px;font-weight:700;letter-spacing:0.12em;color:#f2f2f2;
        `;
        return cap;
    }

    private createArrow(glyph: string): HTMLElement {
        const arrow = document.createElement('div');
        arrow.innerText = glyph;
        arrow.style.cssText = 'font-size:14px;line-height:1;color:rgba(150,215,255,0.9);';
        return arrow;
    }

    private createStickCluster(
        stick: { root: HTMLElement; dot: HTMLElement },
        keys: { up: string; down: string; left: string; right: string },
    ): HTMLElement {
        const cluster = document.createElement('div');
        cluster.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;';

        const top = document.createElement('div');
        top.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;';
        top.append(this.createKeycap(keys.up), this.createArrow('↓'));

        const middle = document.createElement('div');
        middle.style.cssText = 'display:flex;align-items:flex-start;gap:7px;';
        const leftCap = this.createKeycap(keys.left, 38);
        const rightCap = this.createKeycap(keys.right, 38);
        const leftArrow = this.createArrow('→');
        const rightArrow = this.createArrow('←');
        leftCap.style.marginTop = '33px';
        rightCap.style.marginTop = '33px';
        leftArrow.style.marginTop = '39px';
        rightArrow.style.marginTop = '39px';
        middle.append(leftCap, leftArrow, stick.root, rightArrow, rightCap);

        const bottom = document.createElement('div');
        bottom.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;';
        bottom.append(this.createArrow('↑'), this.createKeycap(keys.down, 38));

        cluster.append(top, middle, bottom);
        return cluster;
    }

    private buildUserMenu(): void {
        const card = document.createElement('div');
        card.style.cssText = `
            width:560px;max-width:94vw;max-height:92vh;overflow-y:auto;background:rgba(10,12,14,0.96);
            border:1px solid rgba(255,255,255,0.35);border-radius:2px;padding:22px;
            display:flex;flex-direction:column;gap:16px;color:#e8e8e8;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:10px;';
        header.innerHTML = '<div style="font-size:16px;font-weight:700;letter-spacing:0.16em;">MENU</div>';
        const resumeBtn = document.createElement('button');
        resumeBtn.innerText = 'RESUME';
        resumeBtn.style.cssText = `
            background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.5);border-radius:2px;
            padding:6px 14px;font-size:12px;font-weight:700;letter-spacing:0.1em;cursor:pointer;font-family:inherit;
        `;
        resumeBtn.onclick = () => this.toggleUserMenu(false);
        header.appendChild(resumeBtn);
        card.appendChild(header);

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
        const button = (label: string, onClick: () => void): HTMLButtonElement => {
            const el = document.createElement('button');
            el.innerHTML = label;
            el.style.cssText = `
                background:rgba(255,255,255,0.06);color:#e8e8e8;border:1px solid rgba(255,255,255,0.25);
                border-radius:2px;padding:10px 12px;font-size:12px;font-weight:600;letter-spacing:0.06em;
                cursor:pointer;text-align:left;font-family:inherit;
            `;
            el.onclick = (e) => { e.stopPropagation(); onClick(); };
            return el;
        };

        this.menuSpeedBtn = button('SPEED: <b>TURBO</b>', () => this.onSpeedModeToggle());
        this.menuAudioBtn = button('AUDIO: <b>ACTIVE</b>', () => this.onAudioToggle());
        const captureBtn = button('CAPTURE FRAME + LABELS', () => this.onCaptureFrame());
        captureBtn.style.gridColumn = 'span 2';
        captureBtn.style.textAlign = 'center';
        const datasetBtn = button('GENERATE DATASET', () => this.onGenerateDataset());
        datasetBtn.style.gridColumn = 'span 2';
        datasetBtn.style.textAlign = 'center';
        const respawnBtn = button('RESPAWN DRONE', () => {
            this.onRespawn();
            this.toggleUserMenu(false);
        });
        respawnBtn.style.gridColumn = 'span 2';
        respawnBtn.style.textAlign = 'center';
        grid.append(this.menuSpeedBtn, this.menuAudioBtn, captureBtn, datasetBtn, respawnBtn);
        card.appendChild(grid);

        this.captureStatusEl = document.createElement('div');
        this.captureStatusEl.innerText = 'SAVES PNG + COCO JSON';
        this.captureStatusEl.style.cssText = 'font-size:10px;letter-spacing:0.12em;color:rgba(150,215,255,0.75);margin-top:-6px;';
        card.appendChild(this.captureStatusEl);

        const controllerTitle = document.createElement('div');
        controllerTitle.innerText = 'TRANSMITTER · MODE 2';
        controllerTitle.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:0.16em;color:rgba(255,255,255,0.6);';
        card.appendChild(controllerTitle);

        const controllerPanel = document.createElement('div');
        controllerPanel.style.cssText = `
            display:flex;justify-content:space-around;align-items:flex-start;
            border:1px solid rgba(255,255,255,0.2);border-radius:2px;
            background:rgba(255,255,255,0.03);padding:14px 12px;gap:8px;
        `;
        const leftStick = this.createStick('THROTTLE / YAW');
        const rightStick = this.createStick('PITCH / ROLL');
        this.leftStickDot = leftStick.dot;
        this.rightStickDot = rightStick.dot;
        controllerPanel.append(
            this.createStickCluster(leftStick, { up: 'SHIFT', down: 'C', left: 'Q', right: 'E' }),
            this.createStickCluster(rightStick, { up: 'W', down: 'S', left: 'A', right: 'D' }),
        );
        card.appendChild(controllerPanel);

        const opsRow = document.createElement('div');
        opsRow.style.cssText = `
            display:flex;flex-wrap:wrap;gap:10px 18px;border-top:1px solid rgba(255,255,255,0.2);
            padding-top:14px;font-size:10px;letter-spacing:0.06em;color:rgba(255,255,255,0.7);
        `;
        const addOp = (key: string, desc: string): void => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:7px;';
            const descEl = document.createElement('span');
            descEl.innerText = desc;
            row.append(this.createKeycap(key, key.length > 1 ? 52 : 30), descEl);
            opsRow.appendChild(row);
        };
        addOp('R', 'SPEED MODE');
        addOp('SPACE', 'ARM / DISARM');
        addOp('T', 'TARGET SELECT');
        addOp('M', 'AUDIO');
        addOp('`', 'MENU');
        card.appendChild(opsRow);

        this.userMenuOverlayEl.appendChild(card);
    }

    public toggleUserMenu(forceState?: boolean): boolean {
        this.isMenuOpen = forceState !== undefined ? forceState : !this.isMenuOpen;
        this.userMenuOverlayEl.style.display = this.isMenuOpen ? 'flex' : 'none';
        this.onMenuOpenChange(this.isMenuOpen);
        return this.isMenuOpen;
    }

    public setNotification(text: string): void {
        this.notificationEl.innerText = text;
        this.notificationEl.style.opacity = text ? '1' : '0';
    }

    public setCaptureStatus(text: string): void {
        this.captureStatusEl.innerText = text;
    }

    public setSignalLost(active: boolean): void {
        this.signalLostEl.style.display = active ? 'flex' : 'none';
    }

    public setMapCleared(active: boolean): void {
        this.mapClearedEl.style.display = active ? 'flex' : 'none';
    }

    public resetTrip(): void {
        this.mahUsed = 0;
        this.lastBatterySample = performance.now();
    }

    public update(t: HudTelemetry): void {
        const heading = normalizeHeading(t.headingDeg);
        const headingWhole = Math.round(heading) % 360;
        this.compassReadoutEl.innerText = `${String(headingWhole).padStart(3, '0')}°`;

        const stepDeg = 15;
        const spacingPx = 56;
        const baseIndex = Math.floor(heading / stepDeg);
        const centerPx = 210;
        for (let i = 0; i < this.compassLabels.length; i++) {
            const index = baseIndex + (i - 4);
            const label = this.compassLabels[i];
            label.innerText = compassLabel(index * stepDeg);
            label.style.left = `${centerPx + (index * stepDeg - heading) * (spacingPx / stepDeg)}px`;
            label.style.opacity = i === 4 ? '1' : '0.5';
            label.style.fontWeight = i === 4 ? '700' : '400';
        }

        const avgRpm = (t.motorRpms[0] + t.motorRpms[1] + t.motorRpms[2] + t.motorRpms[3]) / 4;
        const amps = t.armed ? 2 + 20 * (avgRpm / 1000) : 0;
        const now = performance.now();
        const dt = Math.min((now - this.lastBatterySample) / 1000, 0.5);
        this.lastBatterySample = now;
        if (t.armed && !t.frozen) this.mahUsed += amps * dt / 3.6;
        this.ampEl.innerText = `${amps.toFixed(1)}A`;
        this.mahEl.innerText = `${this.mahUsed.toFixed(0)}mAh`;

        const throttlePct = Math.round(Math.max(0, Math.min(1, (t.throttle + 1) * 0.5)) * 100);
        this.thrEl.innerText = `THR ▲ ${throttlePct}%`;

        const clampAxis = (value: number): number => Math.max(-1, Math.min(1, value));
        const leftX = clampAxis(t.yaw) * 30;
        const leftY = -clampAxis(t.throttle) * 30;
        const rightX = clampAxis(t.roll) * 30;
        const rightY = -clampAxis(t.pitch) * 30;
        this.leftStickDot.style.transform = `translate(calc(-50% + ${leftX.toFixed(1)}px), calc(-50% + ${leftY.toFixed(1)}px))`;
        this.rightStickDot.style.transform = `translate(calc(-50% + ${rightX.toFixed(1)}px), calc(-50% + ${rightY.toFixed(1)}px))`;

        this.timeEl.innerText = `FLY ${formatTimer(t.elapsedSec)}`;
        this.flightModeEl.innerText = t.armed ? 'AIR' : 'DISARMED';

        const dist = Math.hypot(t.position[0], t.position[1], t.position[2]);
        const rssi = Math.round(Math.max(-95, Math.min(-35, -40 - 20 * Math.log10(Math.max(1, dist)))));
        const quality = Math.round(Math.max(0, Math.min(100, 100 + (rssi + 40) * 0.9)));
        this.linkQualityEl.innerText = `${quality}`;
        const thresholds = [12, 38, 62, 86];
        this.linkBars.forEach((bar, i) => {
            bar.style.opacity = quality >= thresholds[i] ? '1' : '0.22';
        });

        this.menuAudioBtn.innerHTML = `AUDIO: <b>${t.muted ? 'MUTED' : 'ACTIVE'}</b>`;
        this.menuSpeedBtn.innerHTML = `SPEED: <b>${t.speedMode}</b>`;
    }
}
