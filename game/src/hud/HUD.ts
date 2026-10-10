import { SensorOutput } from '../wasm/PhysicsBridge';
import { MAP_CATALOG, MapDefinition } from '../gpu/CityMapRenderer';
import { Camera } from '../scene/Camera';
import { FocusTargetResult } from '../gameplay/WeaponSystem';
import { CameraStreamMetrics } from '../camera/CameraStreamer';
import { LiveKitMetrics, VisionDetection } from '../network/LiveKitRoboticsClient';

export class HUD {
    private container: HTMLElement;
    private altEl!: HTMLElement;
    private spdEl!: HTMLElement;
    private hdgEl!: HTMLElement;
    private batEl!: HTMLElement;
    private gpsEl!: HTMLElement;
    private modeEl!: HTMLElement;
    private stateEl!: HTMLElement;

    // Tactical Operations & Airframe Status
    private opsPanel!: HTMLElement;
    private airframeStatusEl!: HTMLElement;
    private missionDescEl!: HTMLElement;
    private notificationEl!: HTMLElement;

    // Crash Alert Modal
    private crashOverlayEl!: HTMLElement;
    private crashDetailsEl!: HTMLElement;
    private crashRecoverBtn!: HTMLButtonElement;

    // FPV Operator On-Screen Display (OSD)
    private fpvOsdContainer!: HTMLElement;
    private fpvPitchLadderEl!: SVGElement | null;
    private fpvHeadingTapeEl!: HTMLElement | null;
    private fpvAltLadderEl!: HTMLElement | null;
    private fpvClimbRateEl!: HTMLElement | null;
    private fpvSpdLadderEl!: HTMLElement | null;
    private fpvSpdKmhEl!: HTMLElement | null;
    private fpvRecTimerEl!: HTMLElement | null;
    private fpvGimbalTiltEl!: HTMLElement | null;
    private fpvGpsCoordsEl!: HTMLElement | null;

    // Map switcher & speed bar
    private mapToolbar!: HTMLElement;
    private mapButtons: Map<string, HTMLButtonElement> = new Map();
    private speedModeEl!: HTMLElement;
    private audioEl!: HTMLElement;
    private scopeGearEl!: HTMLElement;
    private lockStatusEl!: HTMLElement;
    private streamStatusEl!: HTMLElement;
    private livekitStatusEl!: HTMLElement;
    private aiVisionOverlayEl!: HTMLElement;

    // Callbacks
    public onLiveKitToggle?: () => void;

    // Precision Crosshair / Target Lock
    private reticleSvgEl!: SVGElement | null;
    private targetLockLabelEl!: HTMLElement | null;
    private hitMarkerEl!: HTMLElement | null;
    private pointerStatusEl!: HTMLElement | null;

    // Tactical Scope Gearing & ADS Overlay
    private scopeOverlayEl!: HTMLElement;
    private scopeGearLabelEl!: HTMLElement | null;
    private scopeWeaponModeEl!: HTMLElement | null;
    private scopeClosureEl!: HTMLElement | null;
    private scopeElevationEl!: HTMLElement | null;

    // Predictive Lead Pip
    private leadPipEl!: HTMLElement;

    // Map Loading UI
    private loadingOverlay!: HTMLElement;
    private loadingText!: HTMLElement;
    private loadingBarFill!: HTMLElement;

    // Callbacks
    public onMapSelect?: (map: MapDefinition) => void;
    public onCameraToggle?: () => void;
    public onSpeedModeToggle?: () => void;
    public onAudioToggle?: () => void;
    public onScopeToggle?: () => void;
    public onScopeGearToggle?: () => void;
    public onLockTargetToggle?: () => void;
    public onStreamToggle?: () => void;
    public onRecoverDrone?: () => void;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'hud-container';
        this.container.style.cssText = `
            position: absolute;
            inset: 0;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
            color: #00ffcc;
            text-shadow: 0 0 4px rgba(0, 255, 204, 0.6);
            overflow: hidden;
            user-select: none;
        `;
        document.body.appendChild(this.container);

        this.initDOM();
    }

    private initDOM(): void {
        // 1. Top Bar Container
        const topRow = document.createElement('div');
        topRow.style.cssText = `
            position: absolute;
            top: 16px;
            left: 20px;
            right: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            pointer-events: none;
        `;

        // Top Left: Flight Telemetry
        const leftPanel = document.createElement('div');
        leftPanel.style.cssText = `
            background: rgba(10, 22, 34, 0.82);
            backdrop-filter: blur(10px);
            padding: 14px 20px;
            border-radius: 10px;
            border: 1px solid rgba(0, 255, 204, 0.35);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 15px;
            font-weight: 600;
            min-width: 170px;
            pointer-events: auto;
        `;
        this.altEl = document.createElement('div');
        this.spdEl = document.createElement('div');
        this.hdgEl = document.createElement('div');
        leftPanel.appendChild(this.altEl);
        leftPanel.appendChild(this.spdEl);
        leftPanel.appendChild(this.hdgEl);

        // Top Center: Map Switcher & Mission Objective
        const centerCol = document.createElement('div');
        centerCol.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            pointer-events: auto;
        `;

        // Map Selection Toolbar
        this.mapToolbar = document.createElement('div');
        this.mapToolbar.style.cssText = `
            display: flex;
            gap: 8px;
            background: rgba(8, 18, 28, 0.9);
            backdrop-filter: blur(12px);
            padding: 6px 12px;
            border-radius: 20px;
            border: 1px solid rgba(0, 255, 204, 0.45);
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
        `;

        for (let i = 0; i < MAP_CATALOG.length; i++) {
            const mapDef = MAP_CATALOG[i];
            const btn = document.createElement('button');
            btn.innerText = `[${i + 1}] ${mapDef.name.toUpperCase()}`;
            btn.style.cssText = `
                background: ${i === 0 ? 'rgba(0, 255, 204, 0.35)' : 'rgba(255, 255, 255, 0.08)'};
                color: ${i === 0 ? '#fff' : '#00ffcc'};
                border: 1px solid ${i === 0 ? '#00ffcc' : 'rgba(0, 255, 204, 0.25)'};
                border-radius: 12px;
                padding: 5px 12px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            btn.onclick = () => {
                this.setActiveMapButton(mapDef.id);
                this.onMapSelect?.(mapDef);
            };
            btn.onmouseenter = () => {
                btn.style.background = 'rgba(0, 255, 204, 0.4)';
            };
            btn.onmouseleave = () => {
                const isActive = this.mapButtons.get(mapDef.id)?.classList.contains('active');
                btn.style.background = isActive ? 'rgba(0, 255, 204, 0.35)' : 'rgba(255, 255, 255, 0.08)';
            };
            this.mapButtons.set(mapDef.id, btn);
            this.mapToolbar.appendChild(btn);
        }

        // Tactical Airframe & Operations Card
        this.opsPanel = document.createElement('div');
        this.opsPanel.style.cssText = `
            background: rgba(10, 22, 34, 0.88);
            backdrop-filter: blur(12px);
            padding: 8px 20px;
            border-radius: 14px;
            border: 1px solid rgba(0, 255, 204, 0.4);
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6);
            display: flex;
            gap: 20px;
            font-size: 13px;
            font-weight: 700;
            color: #00ffcc;
            align-items: center;
        `;
        this.airframeStatusEl = document.createElement('div');
        this.airframeStatusEl.innerHTML = `AIRFRAME: <b style="color:#00ff88;">● INTACT (100%)</b>`;
        this.missionDescEl = document.createElement('div');
        this.missionDescEl.innerHTML = `<span style="color:#88ddff;">MISSION:</span> TACTICAL RECON & AIRSPACE PATROL`;
        this.opsPanel.appendChild(this.airframeStatusEl);
        this.opsPanel.appendChild(this.missionDescEl);

        // Notification Banner
        this.notificationEl = document.createElement('div');
        this.notificationEl.style.cssText = `
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 1px;
            color: #00ff88;
            text-shadow: 0 0 10px rgba(0, 255, 136, 0.9);
            opacity: 0;
            transition: opacity 0.25s ease;
        `;

        centerCol.appendChild(this.mapToolbar);
        centerCol.appendChild(this.opsPanel);
        centerCol.appendChild(this.notificationEl);

        // Top Right: Systems, Modes & Combat Targeting Panel
        const rightPanel = document.createElement('div');
        rightPanel.style.cssText = `
            background: rgba(10, 22, 34, 0.82);
            backdrop-filter: blur(10px);
            padding: 14px 20px;
            border-radius: 10px;
            border: 1px solid rgba(0, 255, 204, 0.35);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 14px;
            font-weight: 600;
            min-width: 200px;
            pointer-events: auto;
        `;

        this.batEl = document.createElement('div');
        this.gpsEl = document.createElement('div');
        this.modeEl = document.createElement('div');
        this.modeEl.style.cssText = `
            cursor: pointer;
            color: #00ffcc;
            padding: 2px 0;
        `;
        this.modeEl.title = "Click to toggle view (FPV / CHASE)";
        this.modeEl.onclick = () => this.onCameraToggle?.();
        this.stateEl = document.createElement('div');

        this.speedModeEl = document.createElement('div');
        this.speedModeEl.style.cssText = `
            color: #ffaa33;
            cursor: pointer;
            padding: 2px 0;
        `;
        this.speedModeEl.onclick = () => this.onSpeedModeToggle?.();

        this.scopeGearEl = document.createElement('div');
        this.scopeGearEl.style.cssText = `
            color: #ff55cc;
            cursor: pointer;
            padding: 2px 0;
        `;
        this.scopeGearEl.onclick = () => this.onScopeGearToggle?.();

        this.lockStatusEl = document.createElement('div');
        this.lockStatusEl.style.cssText = `
            color: #ff3366;
            cursor: pointer;
            padding: 2px 0;
        `;
        this.lockStatusEl.onclick = () => this.onLockTargetToggle?.();

        this.streamStatusEl = document.createElement('div');
        this.streamStatusEl.style.cssText = `
            color: #00ff88;
            cursor: pointer;
            padding: 2px 0;
        `;
        this.streamStatusEl.onclick = () => this.onStreamToggle?.();

        this.livekitStatusEl = document.createElement('div');
        this.livekitStatusEl.style.cssText = `
            color: #00e5ff;
            cursor: pointer;
            padding: 2px 0;
            font-size: 13px;
        `;
        this.livekitStatusEl.onclick = () => this.onLiveKitToggle?.();

        this.audioEl = document.createElement('div');
        this.audioEl.style.cssText = `
            color: #00ffcc;
            cursor: pointer;
            padding: 2px 0;
        `;
        this.audioEl.onclick = () => this.onAudioToggle?.();

        rightPanel.appendChild(this.batEl);
        rightPanel.appendChild(this.gpsEl);
        rightPanel.appendChild(this.modeEl);
        rightPanel.appendChild(this.stateEl);
        rightPanel.appendChild(this.speedModeEl);
        rightPanel.appendChild(this.scopeGearEl);
        rightPanel.appendChild(this.lockStatusEl);
        rightPanel.appendChild(this.streamStatusEl);
        rightPanel.appendChild(this.livekitStatusEl);
        rightPanel.appendChild(this.audioEl);

        // AI Computer Vision Object Detection Overlay
        this.aiVisionOverlayEl = document.createElement('div');
        this.aiVisionOverlayEl.id = 'hud-ai-vision-overlay';
        this.aiVisionOverlayEl.style.cssText = `
            position: absolute;
            inset: 0;
            pointer-events: none;
            overflow: hidden;
            z-index: 10;
        `;
        this.container.appendChild(this.aiVisionOverlayEl);

        topRow.appendChild(leftPanel);
        topRow.appendChild(centerCol);
        topRow.appendChild(rightPanel);

        // 2. Bottom Controls Bar
        const controlsHint = document.createElement('div');
        controlsHint.id = 'hud-controls';
        controlsHint.style.cssText = `
            position: absolute;
            bottom: 16px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(8, 16, 26, 0.92);
            backdrop-filter: blur(10px);
            padding: 10px 24px;
            border-radius: 24px;
            border: 1px solid rgba(0, 255, 204, 0.45);
            font-size: 13px;
            color: #f0f0f0;
            display: flex;
            gap: 16px;
            align-items: center;
            box-shadow: 0 4px 25px rgba(0, 0, 0, 0.6);
            white-space: nowrap;
            pointer-events: auto;
        `;
        controlsHint.innerHTML = `
            <span id="hud-pointer-status" style="color:#00ffcc; font-weight:bold;">[CLICK TO LOCK AIM]</span>
            <span style="color:#ff3366;"><b>[LEFT-CLICK / F]</b> FIRE LASER</span>
            <span style="color:#ff55cc;"><b>[RIGHT-CLICK / Z]</b> SCOPE GEAR</span>
            <span style="color:#ffcc00;"><b>[T / MMB]</b> LOCK TARGET</span>
            <span style="color:#00ff88;"><b>[K]</b> CAM STREAM</span>
            <span style="color:#00ffff; cursor:pointer;" id="hud-cam-toggle"><b>[V]</b> FPV/CHASE</span>
            <span style="color:#ffaa66;"><b>[W / S / A / D]</b> MOVE FLIGHT</span>
            <span style="color:#33ffdd;"><b>[Q / E]</b> TURN HEADING</span>
            <span style="color:#33ff99;"><b>[SHIFT]</b> CLIMB</span>
            <span style="color:#66ccff;"><b>[CTRL]</b> DESCEND</span>
            <span style="color:#ff99bb;"><b>[R]</b> SPEED MODE</span>
        `;
        this.pointerStatusEl = controlsHint.querySelector('#hud-pointer-status');
        const camToggleBtn = controlsHint.querySelector('#hud-cam-toggle') as HTMLElement;
        if (camToggleBtn) camToggleBtn.onclick = () => this.onCameraToggle?.();

        // 3. Holographic Precision Reticle / Dynamic Lock Readout
        const crosshairContainer = document.createElement('div');
        crosshairContainer.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        `;
        crosshairContainer.innerHTML = `
            <svg id="hud-reticle-svg" width="64" height="64" viewBox="0 0 64 64" style="transition: all 0.12s ease-out; opacity: 0.95;">
                <!-- Precision Boresight Crosshair -->
                <circle id="reticle-outer" cx="32" cy="32" r="20" fill="none" stroke="#00ffcc" stroke-width="1.8" stroke-dasharray="8 4" />
                <circle id="reticle-inner" cx="32" cy="32" r="10" fill="none" stroke="#00ffcc" stroke-width="1.2" />
                <line id="reticle-top" x1="32" y1="4" x2="32" y2="16" stroke="#00ffcc" stroke-width="2" />
                <line id="reticle-bot" x1="32" y1="48" x2="32" y2="60" stroke="#00ffcc" stroke-width="2" />
                <line id="reticle-left" x1="4" y1="32" x2="16" y2="32" stroke="#00ffcc" stroke-width="2" />
                <line id="reticle-right" x1="48" y1="32" x2="60" y2="32" stroke="#00ffcc" stroke-width="2" />
                <circle id="reticle-dot" cx="32" cy="32" r="2.5" fill="#00ffcc" />
            </svg>
            <div id="hud-target-lock-label" style="font-size:11px; font-weight:800; letter-spacing:1px; color:#00ffcc; text-shadow:0 0 8px rgba(0,255,204,0.8); margin-top:4px; white-space:nowrap;"></div>
            <div id="hud-hit-marker" style="font-size:13px; font-weight:800; color:#ff3333; opacity:0; transition:opacity 0.1s; margin-top:4px; text-shadow:0 0 10px rgba(255,0,0,0.8);">✕ HIT!</div>
        `;
        this.container.appendChild(crosshairContainer);
        this.reticleSvgEl = crosshairContainer.querySelector('#hud-reticle-svg');
        this.targetLockLabelEl = crosshairContainer.querySelector('#hud-target-lock-label');
        this.hitMarkerEl = crosshairContainer.querySelector('#hud-hit-marker');

        // 4. Tactical Optical Scope Overlay & Mil-dot Reticle
        this.scopeOverlayEl = document.createElement('div');
        this.scopeOverlayEl.id = 'hud-scope-overlay';
        this.scopeOverlayEl.style.cssText = `
            position: absolute;
            inset: 0;
            pointer-events: none;
            display: none;
            background: radial-gradient(circle at center, transparent 32%, rgba(2, 6, 12, 0.65) 45%, rgba(0, 0, 0, 0.95) 68%);
            z-index: 50;
        `;
        this.scopeOverlayEl.innerHTML = `
            <div style="position:absolute; top:28px; left:50%; transform:translateX(-50%); color:#00ffcc; font-family:monospace; font-size:13px; font-weight:bold; letter-spacing:2px; text-shadow:0 0 10px rgba(0,255,204,0.8); background:rgba(0,15,25,0.7); padding:4px 18px; border-radius:12px; border:1px solid rgba(0,255,204,0.4);">
                TACTICAL BALLISTIC OPTICS // <span id="scope-gear-label" style="color:#ffcc00;">SCOPE: 2X</span>
            </div>
            <div style="position:absolute; bottom:68px; left:50%; transform:translateX(-50%); display:flex; gap:20px; font-family:monospace; font-size:12px; font-weight:bold; color:#00ffcc; background:rgba(0,10,20,0.7); padding:6px 20px; border-radius:16px; border:1px solid rgba(0,255,204,0.3);">
                <span id="scope-weapon-mode" style="color:#ff55cc;">MODE: DUAL PLASMA</span>
                <span id="scope-closure-rate">CLOSURE: 0.0 m/s</span>
                <span id="scope-elevation-mil">ELEV: 0.0 MIL</span>
            </div>
            <svg width="100%" height="100%" style="position:absolute; inset:0;">
                <circle cx="50%" cy="50%" r="220" fill="none" stroke="rgba(0,255,204,0.45)" stroke-width="1.5" stroke-dasharray="12 6" />
                <circle cx="50%" cy="50%" r="140" fill="none" stroke="rgba(0,255,204,0.25)" stroke-width="1" />
                <line x1="50%" y1="calc(50% - 220px)" x2="50%" y2="calc(50% - 20px)" stroke="#00ffcc" stroke-width="1.5" />
                <line x1="50%" y1="calc(50% + 20px)" x2="50%" y2="calc(50% + 220px)" stroke="#00ffcc" stroke-width="1.5" />
                <line x1="calc(50% - 220px)" y1="50%" x2="calc(50% - 20px)" y2="50%" stroke="#00ffcc" stroke-width="1.5" />
                <line x1="calc(50% + 20px)" y1="50%" x2="calc(50% + 220px)" y2="50%" stroke="#00ffcc" stroke-width="1.5" />
                <circle cx="50%" cy="calc(50% - 60px)" r="2.5" fill="#00ffcc" />
                <circle cx="50%" cy="calc(50% - 120px)" r="2.5" fill="#00ffcc" />
                <circle cx="50%" cy="calc(50% - 180px)" r="2.5" fill="#00ffcc" />
                <circle cx="50%" cy="calc(50% + 60px)" r="2.5" fill="#00ffcc" />
                <circle cx="50%" cy="calc(50% + 120px)" r="2.5" fill="#00ffcc" />
                <circle cx="50%" cy="calc(50% + 180px)" r="2.5" fill="#00ffcc" />
                <circle cx="calc(50% - 60px)" cy="50%" r="2.5" fill="#00ffcc" />
                <circle cx="calc(50% - 120px)" cy="50%" r="2.5" fill="#00ffcc" />
                <circle cx="calc(50% - 180px)" cy="50%" r="2.5" fill="#00ffcc" />
                <circle cx="calc(50% + 60px)" cy="50%" r="2.5" fill="#00ffcc" />
                <circle cx="calc(50% + 120px)" cy="50%" r="2.5" fill="#00ffcc" />
                <circle cx="calc(50% + 180px)" cy="50%" r="2.5" fill="#00ffcc" />
            </svg>
        `;
        this.container.appendChild(this.scopeOverlayEl);
        this.scopeGearLabelEl = this.scopeOverlayEl.querySelector('#scope-gear-label');
        this.scopeWeaponModeEl = this.scopeOverlayEl.querySelector('#scope-weapon-mode');
        this.scopeClosureEl = this.scopeOverlayEl.querySelector('#scope-closure-rate');
        this.scopeElevationEl = this.scopeOverlayEl.querySelector('#scope-elevation-mil');

        // 5. Predictive Lead Pip Indicator
        this.leadPipEl = document.createElement('div');
        this.leadPipEl.id = 'hud-lead-pip';
        this.leadPipEl.style.cssText = `
            position: absolute;
            transform: translate(-50%, -50%);
            display: none;
            flex-direction: column;
            align-items: center;
            pointer-events: none;
            z-index: 60;
            transition: left 0.04s linear, top 0.04s linear;
        `;
        this.leadPipEl.innerHTML = `
            <svg width="40" height="40" viewBox="0 0 40 40">
                <polygon points="20,2 38,20 20,38 2,20" fill="none" stroke="#ffcc00" stroke-width="2" stroke-dasharray="4 2" />
                <circle cx="20" cy="20" r="3.5" fill="#ffcc00" />
            </svg>
            <div style="font-family:monospace; font-size:10px; font-weight:800; color:#ffcc00; text-shadow:0 0 8px rgba(255,204,0,0.9); margin-top:2px;">◎ LEAD</div>
        `;
        this.container.appendChild(this.leadPipEl);

        // 6. Loading Overlay for High-Res Maps
        this.loadingOverlay = document.createElement('div');
        this.loadingOverlay.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(5, 12, 20, 0.92);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(0, 255, 204, 0.6);
            border-radius: 16px;
            padding: 24px 36px;
            display: none;
            flex-direction: column;
            align-items: center;
            gap: 14px;
            box-shadow: 0 0 40px rgba(0, 255, 204, 0.4);
            z-index: 1000;
        `;
        this.loadingText = document.createElement('div');
        this.loadingText.style.cssText = `
            font-size: 16px;
            font-weight: 700;
            color: #00ffcc;
            letter-spacing: 1px;
        `;
        const barContainer = document.createElement('div');
        barContainer.style.cssText = `
            width: 240px;
            height: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            overflow: hidden;
            border: 1px solid rgba(0, 255, 204, 0.3);
        `;
        this.loadingBarFill = document.createElement('div');
        this.loadingBarFill.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #00ffcc, #ffaa00);
            transition: width 0.15s ease;
        `;
        barContainer.appendChild(this.loadingBarFill);
        this.loadingOverlay.appendChild(this.loadingText);
        this.loadingOverlay.appendChild(barContainer);

        // 7. Crash Alarm & Airframe Recovery Overlay
        this.crashOverlayEl = document.createElement('div');
        this.crashOverlayEl.id = 'hud-crash-overlay';
        this.crashOverlayEl.style.cssText = `
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at center, rgba(140, 10, 20, 0.5) 0%, rgba(30, 5, 10, 0.9) 70%, rgba(5, 0, 0, 0.98) 100%);
            box-shadow: inset 0 0 140px rgba(255, 30, 50, 0.85);
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            z-index: 950;
            pointer-events: auto;
            backdrop-filter: blur(8px);
        `;
        this.crashOverlayEl.innerHTML = `
            <div style="font-size: 34px; font-weight: 900; letter-spacing: 3px; color: #ff2244; text-shadow: 0 0 30px rgba(255, 34, 68, 0.95); text-align: center;">
                ⚠️ AIRFRAME DESTROYED — DRONE CRASHED ⚠️
            </div>
            <div id="hud-crash-details" style="font-size: 17px; font-weight: 700; color: #ffcc00; letter-spacing: 1.5px; background: rgba(0,0,0,0.7); padding: 8px 24px; border-radius: 8px; border: 1px solid rgba(255, 204, 0, 0.5); text-align:center;">
                COLLISION DETECTED
            </div>
            <div style="font-size: 14px; font-weight: 600; color: #bbbbbb; letter-spacing: 1px;">
                MOTORS CUT • AIRFRAME BREACHED • AUTONOMY HALTED
            </div>
        `;
        this.crashRecoverBtn = document.createElement('button');
        this.crashRecoverBtn.innerText = `[SPACE] OR [R] RECOVER DRONE TO BASE`;
        this.crashRecoverBtn.style.cssText = `
            background: linear-gradient(135deg, #00ffcc, #00aa88);
            color: #05141c;
            font-size: 15px;
            font-weight: 800;
            letter-spacing: 1.5px;
            padding: 12px 34px;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            box-shadow: 0 0 30px rgba(0, 255, 204, 0.7);
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            margin-top: 10px;
        `;
        this.crashRecoverBtn.onmouseenter = () => { this.crashRecoverBtn.style.transform = 'scale(1.05)'; };
        this.crashRecoverBtn.onmouseleave = () => { this.crashRecoverBtn.style.transform = 'scale(1.0)'; };
        this.crashRecoverBtn.onclick = () => this.onRecoverDrone?.();
        this.crashOverlayEl.appendChild(this.crashRecoverBtn);
        this.crashDetailsEl = this.crashOverlayEl.querySelector('#hud-crash-details') as HTMLElement;

        // 8. Drone Operator First Person View (FPV) OSD Interface
        this.fpvOsdContainer = document.createElement('div');
        this.fpvOsdContainer.id = 'hud-fpv-osd';
        this.fpvOsdContainer.style.cssText = `
            position: absolute;
            inset: 0;
            pointer-events: none;
            display: block;
            z-index: 15;
            font-family: monospace, -apple-system, sans-serif;
        `;
        this.fpvOsdContainer.innerHTML = `
            <!-- 4 Viewfinder Corner Brackets -->
            <div style="position:absolute; top:18px; left:18px; width:40px; height:40px; border-top:2px solid rgba(0,255,204,0.7); border-left:2px solid rgba(0,255,204,0.7);"></div>
            <div style="position:absolute; top:18px; right:18px; width:40px; height:40px; border-top:2px solid rgba(0,255,204,0.7); border-right:2px solid rgba(0,255,204,0.7);"></div>
            <div style="position:absolute; bottom:66px; left:18px; width:40px; height:40px; border-bottom:2px solid rgba(0,255,204,0.7); border-left:2px solid rgba(0,255,204,0.7);"></div>
            <div style="position:absolute; bottom:66px; right:18px; width:40px; height:40px; border-bottom:2px solid rgba(0,255,204,0.7); border-right:2px solid rgba(0,255,204,0.7);"></div>

            <!-- Top Left Live Feed & Sensor Spec -->
            <div style="position:absolute; top:78px; left:26px; font-size:12px; font-weight:700; color:#00ffcc; line-height:1.45; text-shadow:0 0 6px rgba(0,255,204,0.8);">
                <div><span style="color:#ff3344; animation:pulse 1.2s infinite;">● REC</span> <span id="fpv-rec-timer">00:01:24</span> // 4K 60FPS</div>
                <div style="color:#88ddff;">CAM SENSOR: ONBOARD GIMBAL FPV</div>
            </div>

            <!-- Top Right RF Link & Latency -->
            <div style="position:absolute; top:78px; right:26px; text-align:right; font-size:12px; font-weight:700; color:#00ffcc; line-height:1.45; text-shadow:0 0 6px rgba(0,255,204,0.8);">
                <div>RF LINK: <b style="color:#00ff88;">99% (5.8 GHz HD)</b></div>
                <div style="color:#88ddff;">GCS LATENCY: <b>14ms</b> | CH: 1</div>
            </div>

            <!-- Top Center Sliding Compass Tape -->
            <div style="position:absolute; top:78px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center;">
                <div id="fpv-heading-tape" style="background:rgba(5,15,25,0.75); border:1px solid rgba(0,255,204,0.45); border-radius:12px; padding:3px 18px; font-size:13px; font-weight:800; color:#00ffcc; letter-spacing:2px; box-shadow:0 0 10px rgba(0,255,204,0.3);">
                    [ 350 • N • 010 ]
                </div>
                <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:6px solid #00ffcc; margin-top:2px;"></div>
            </div>

            <!-- Central Artificial Horizon & Pitch Ladder -->
            <div id="fpv-horizon-group" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:280px; height:280px; pointer-events:none;">
                <svg width="280" height="280" viewBox="0 0 280 280" style="overflow:visible;">
                    <!-- Fixed Center Aircraft Reference (Amber Boresight) -->
                    <circle cx="140" cy="140" r="3" fill="#ffcc00" />
                    <line x1="108" y1="140" x2="128" y2="140" stroke="#ffcc00" stroke-width="2.5" />
                    <line x1="152" y1="140" x2="172" y2="140" stroke="#ffcc00" stroke-width="2.5" />
                    <line x1="140" y1="128" x2="140" y2="136" stroke="#ffcc00" stroke-width="2" />

                    <!-- Moving Pitch Ladder (Tilts with roll, moves vertically with pitch) -->
                    <g id="fpv-pitch-ladder">
                        <!-- +20 Deg -->
                        <line x1="90" y1="60" x2="120" y2="60" stroke="#00ffcc" stroke-width="1.8" />
                        <line x1="120" y1="60" x2="120" y2="68" stroke="#00ffcc" stroke-width="1.8" />
                        <line x1="160" y1="60" x2="190" y2="60" stroke="#00ffcc" stroke-width="1.8" />
                        <line x1="160" y1="60" x2="160" y2="68" stroke="#00ffcc" stroke-width="1.8" />
                        <text x="74" y="64" fill="#00ffcc" font-size="10" font-weight="bold">+20</text>

                        <!-- +10 Deg -->
                        <line x1="100" y1="100" x2="124" y2="100" stroke="#00ffcc" stroke-width="1.8" />
                        <line x1="124" y1="100" x2="124" y2="106" stroke="#00ffcc" stroke-width="1.8" />
                        <line x1="156" y1="100" x2="180" y2="100" stroke="#00ffcc" stroke-width="1.8" />
                        <line x1="156" y1="100" x2="156" y2="106" stroke="#00ffcc" stroke-width="1.8" />
                        <text x="84" y="104" fill="#00ffcc" font-size="10" font-weight="bold">+10</text>

                        <!-- 00 Deg Horizon Line -->
                        <line x1="80" y1="140" x2="114" y2="140" stroke="#00ffcc" stroke-width="2" />
                        <line x1="166" y1="140" x2="200" y2="140" stroke="#00ffcc" stroke-width="2" />

                        <!-- -10 Deg -->
                        <line x1="100" y1="180" x2="124" y2="180" stroke="#00ffcc" stroke-width="1.8" stroke-dasharray="6 3" />
                        <line x1="124" y1="180" x2="124" y2="174" stroke="#00ffcc" stroke-width="1.8" />
                        <line x1="156" y1="180" x2="180" y2="180" stroke="#00ffcc" stroke-width="1.8" stroke-dasharray="6 3" />
                        <line x1="156" y1="180" x2="156" y2="174" stroke="#00ffcc" stroke-width="1.8" />
                        <text x="84" y="184" fill="#00ffcc" font-size="10" font-weight="bold">-10</text>

                        <!-- -20 Deg -->
                        <line x1="90" y1="220" x2="120" y2="220" stroke="#00ffcc" stroke-width="1.8" stroke-dasharray="6 3" />
                        <line x1="120" y1="220" x2="120" y2="212" stroke="#00ffcc" stroke-width="1.8" />
                        <line x1="160" y1="220" x2="190" y2="220" stroke="#00ffcc" stroke-width="1.8" stroke-dasharray="6 3" />
                        <line x1="160" y1="220" x2="160" y2="212" stroke="#00ffcc" stroke-width="1.8" />
                        <text x="74" y="224" fill="#00ffcc" font-size="10" font-weight="bold">-20</text>
                    </g>
                </svg>
            </div>

            <!-- Left Instrument Tape: Altitude Ladder & Vertical Speed -->
            <div style="position:absolute; left:26px; top:44%; transform:translateY(-50%); background:rgba(5,15,25,0.75); border:1px solid rgba(0,255,204,0.35); border-radius:8px; padding:8px 12px; font-size:12px; font-weight:700; color:#00ffcc; text-shadow:0 0 6px rgba(0,255,204,0.8); min-width:115px;">
                <div style="font-size:10px; color:#88ddff; letter-spacing:1px; margin-bottom:2px;">ALTITUDE (AGL)</div>
                <div id="fpv-alt-ladder" style="font-size:16px; font-weight:900; color:#00ff88;">0.0 m</div>
                <div id="fpv-climb-rate" style="font-size:11px; color:#ffcc00; margin-top:2px;">▲ 0.0 m/s</div>
            </div>

            <!-- Right Instrument Tape: Airspeed Ladder -->
            <div style="position:absolute; right:26px; top:44%; transform:translateY(-50%); background:rgba(5,15,25,0.75); border:1px solid rgba(0,255,204,0.35); border-radius:8px; padding:8px 12px; font-size:12px; font-weight:700; color:#00ffcc; text-shadow:0 0 6px rgba(0,255,204,0.8); min-width:115px; text-align:right;">
                <div style="font-size:10px; color:#88ddff; letter-spacing:1px; margin-bottom:2px;">GROUND SPEED</div>
                <div id="fpv-spd-ladder" style="font-size:16px; font-weight:900; color:#00ff88;">0.0 m/s</div>
                <div id="fpv-spd-kmh" style="font-size:11px; color:#ffcc00; margin-top:2px;">0.0 km/h</div>
            </div>

            <!-- Bottom OSD Bar: Gimbal Pitch, GPS Coordinates & Mode -->
            <div style="position:absolute; bottom:68px; left:50%; transform:translateX(-50%); display:flex; gap:18px; background:rgba(5,15,25,0.82); border:1px solid rgba(0,255,204,0.4); border-radius:14px; padding:6px 20px; font-size:12px; font-weight:700; color:#00ffcc; text-shadow:0 0 6px rgba(0,255,204,0.8); white-space:nowrap;">
                <div id="fpv-gimbal-tilt" style="color:#ffcc00;">GIMBAL: 0°</div>
                <div id="fpv-gps-coords" style="color:#88ddff;">GPS: 33.6000° N, 72.9000° E</div>
                <div style="color:#00ff88;">OPERATOR FPV // [V] TOGGLE VIEW</div>
            </div>
        `;

        this.fpvPitchLadderEl = this.fpvOsdContainer.querySelector('#fpv-pitch-ladder');
        this.fpvHeadingTapeEl = this.fpvOsdContainer.querySelector('#fpv-heading-tape');
        this.fpvAltLadderEl = this.fpvOsdContainer.querySelector('#fpv-alt-ladder');
        this.fpvClimbRateEl = this.fpvOsdContainer.querySelector('#fpv-climb-rate');
        this.fpvSpdLadderEl = this.fpvOsdContainer.querySelector('#fpv-spd-ladder');
        this.fpvSpdKmhEl = this.fpvOsdContainer.querySelector('#fpv-spd-kmh');
        this.fpvRecTimerEl = this.fpvOsdContainer.querySelector('#fpv-rec-timer');
        this.fpvGimbalTiltEl = this.fpvOsdContainer.querySelector('#fpv-gimbal-tilt');
        this.fpvGpsCoordsEl = this.fpvOsdContainer.querySelector('#fpv-gps-coords');

        this.container.appendChild(topRow);
        this.container.appendChild(this.fpvOsdContainer);
        this.container.appendChild(controlsHint);
        this.container.appendChild(this.crashOverlayEl);
        this.container.appendChild(this.loadingOverlay);
    }

    public setActiveMapButton(mapId: string): void {
        this.mapButtons.forEach((btn, id) => {
            if (id === mapId) {
                btn.classList.add('active');
                btn.style.background = 'rgba(0, 255, 204, 0.35)';
                btn.style.color = '#fff';
                btn.style.borderColor = '#00ffcc';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'rgba(255, 255, 255, 0.08)';
                btn.style.color = '#00ffcc';
                btn.style.borderColor = 'rgba(0, 255, 204, 0.25)';
            }
        });
    }

    public showMapLoading(mapName: string, pct: number): void {
        this.loadingOverlay.style.display = 'flex';
        this.loadingText.innerText = `STREAMING 3D CITY ASSETS: ${mapName.toUpperCase()} [${pct}%]`;
        this.loadingBarFill.style.width = `${pct}%`;
        if (pct >= 100) {
            setTimeout(() => {
                this.loadingOverlay.style.display = 'none';
            }, 300);
        }
    }

    public update(
        sensors: SensorOutput,
        pos: [number, number, number],
        vel: [number, number, number],
        rot: [number, number, number],
        armed: boolean,
        flightMode: string,
        speedMode: string,
        camMode: string,
        notificationText: string,
        isMuted: boolean,
        isCrashed: boolean = false,
        crashReason: string = "",
        hitMarkerTimer: number = 0,
        hitMarkerText: string = "",
        targetFocus?: FocusTargetResult | null,
        isPointerLocked: boolean = false,
        camera?: Camera,
        camMetrics?: CameraStreamMetrics,
        livekitMetrics?: LiveKitMetrics,
        aiDetections?: { detections: VisionDetection[]; width: number; height: number }
    ): void {
        const groundSpeed = Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]);
        this.altEl.innerText = `ALT (AGL): ${sensors.altitudeAGL.toFixed(1)} m`;
        this.spdEl.innerText = `SPD: ${groundSpeed.toFixed(1)} m/s`;
        this.hdgEl.innerText = `HDG: ${((rot[2] % 360 + 360) % 360).toFixed(0)}°`;

        this.batEl.innerText = `BAT: ${sensors.batteryPct.toFixed(0)}%`;
        this.gpsEl.innerText = `GPS: 3D FIX (12 sats)`;
        this.modeEl.innerText = `FC: ${flightMode} | [V] ${camMode}`;

        if (isCrashed) {
            this.stateEl.innerHTML = `STATE: <span style="color:#ff2244; font-weight: bold;">● CRASHED</span>`;
            this.airframeStatusEl.innerHTML = `AIRFRAME: <b style="color:#ff2244;">✖ DESTROYED</b>`;
            this.crashOverlayEl.style.display = 'flex';
            this.crashDetailsEl.innerText = crashReason ? `COLLISION: ${crashReason.toUpperCase()}` : 'COLLISION WITH TERRAIN / STRUCTURE';
        } else {
            this.stateEl.innerHTML = `STATE: <span style="color:${armed ? '#00ff66' : '#ff3333'}; font-weight: bold;">${armed ? '● ARMED' : '○ DISARMED'}</span>`;
            this.airframeStatusEl.innerHTML = `AIRFRAME: <b style="color:#00ff88;">● INTACT (100%)</b>`;
            this.crashOverlayEl.style.display = 'none';
        }

        this.speedModeEl.innerHTML = `[R] SPEED: <b>${speedMode}</b>`;
        this.audioEl.innerHTML = `[M] AUDIO: <b>${isMuted ? '<span style="color:#ff6666">MUTED</span>' : 'ACTIVE'}</b>`;

        // Scope Gear & Target Lock Quick Status
        if (camera) {
            if (camera.isScoped) {
                this.scopeGearEl.innerHTML = `[Z] SCOPE: <b style="color:#00ffcc">${camera.scopeGear}X [ACTIVE]</b>`;
            } else {
                this.scopeGearEl.innerHTML = `[Z] SCOPE: <b>${camera.scopeGear}X [OFF]</b>`;
            }
        }

        if (targetFocus?.lockedEntity) {
            this.lockStatusEl.innerHTML = `[T] LOCK: <b style="color:#ff3355;">${targetFocus.lockedEntity.roleName.toUpperCase()}</b>`;
        } else if (targetFocus?.candidateEntity) {
            this.lockStatusEl.innerHTML = `[T] ACQUIRING: <b style="color:#ffcc00;">${targetFocus.candidateEntity.roleName}</b>`;
        } else {
            this.lockStatusEl.innerHTML = `[T] LOCK: <b>STANDBY</b>`;
        }

        // Camera Streaming Status
        if (this.streamStatusEl) {
            if (camMetrics?.isStreaming) {
                this.streamStatusEl.innerHTML = `[K] STREAM: <b style="color:#00ff88;">● LIVE (${camMetrics.fps} FPS)</b>`;
            } else {
                this.streamStatusEl.innerHTML = `[K] STREAM: <b style="color:#888888;">○ PAUSED</b>`;
            }
        }

        // LiveKit Robotics RTC Status
        if (this.livekitStatusEl) {
            if (livekitMetrics) {
                if (livekitMetrics.status === 'streaming') {
                    this.livekitStatusEl.innerHTML = `LIVEKIT RTC: <b style="color:#00ff88;">● STREAMING [${livekitMetrics.room}]</b>`;
                } else if (livekitMetrics.status === 'connected') {
                    this.livekitStatusEl.innerHTML = `LIVEKIT RTC: <b style="color:#00e5ff;">○ CONNECTED [${livekitMetrics.room}]</b>`;
                } else if (livekitMetrics.status === 'connecting') {
                    this.livekitStatusEl.innerHTML = `LIVEKIT RTC: <b style="color:#ffcc00;">CONNECTING...</b>`;
                } else if (livekitMetrics.status === 'error') {
                    this.livekitStatusEl.innerHTML = `LIVEKIT RTC: <b style="color:#ff4444;">ERROR / STANDBY</b>`;
                } else {
                    this.livekitStatusEl.innerHTML = `LIVEKIT RTC: <b style="color:#888888;">STANDBY</b>`;
                }
            } else {
                this.livekitStatusEl.innerHTML = `LIVEKIT RTC: <b style="color:#888888;">STANDBY</b>`;
            }
        }

        // Render AI Vision Detection Bounding Boxes from LiveKit DataChannel
        if (this.aiVisionOverlayEl) {
            if (aiDetections && aiDetections.detections && aiDetections.detections.length > 0) {
                const screenW = window.innerWidth;
                const screenH = window.innerHeight;
                const srcW = aiDetections.width || 640;
                const srcH = aiDetections.height || 360;
                const scaleX = screenW / srcW;
                const scaleY = screenH / srcH;

                let html = '';
                for (const det of aiDetections.detections) {
                    const [bx, by, bw, bh] = det.bbox;
                    const left = Math.round(bx * scaleX);
                    const top = Math.round(by * scaleY);
                    const width = Math.round(bw * scaleX);
                    const height = Math.round(bh * scaleY);
                    const confPct = Math.round(det.confidence * 100);

                    html += `
                        <div style="position:absolute; left:${left}px; top:${top}px; width:${width}px; height:${height}px; border:2px solid #00ff88; box-shadow:0 0 10px rgba(0,255,136,0.6); pointer-events:none;">
                            <div style="position:absolute; top:-22px; left:-2px; background:rgba(0,30,15,0.85); color:#00ff88; font-size:11px; font-weight:800; padding:2px 6px; border:1px solid #00ff88; border-radius:3px; letter-spacing:0.5px; white-space:nowrap;">
                                AI: ${det.label.toUpperCase()} [${confPct}%]
                            </div>
                            <div style="position:absolute; top:2px; left:2px; width:6px; height:6px; border-top:2px solid #00ffcc; border-left:2px solid #00ffcc;"></div>
                            <div style="position:absolute; top:2px; right:2px; width:6px; height:6px; border-top:2px solid #00ffcc; border-right:2px solid #00ffcc;"></div>
                            <div style="position:absolute; bottom:2px; left:2px; width:6px; height:6px; border-bottom:2px solid #00ffcc; border-left:2px solid #00ffcc;"></div>
                            <div style="position:absolute; bottom:2px; right:2px; width:6px; height:6px; border-bottom:2px solid #00ffcc; border-right:2px solid #00ffcc;"></div>
                        </div>
                    `;
                }
                this.aiVisionOverlayEl.innerHTML = html;
            } else {
                this.aiVisionOverlayEl.innerHTML = '';
            }
        }

        if (notificationText) {
            this.notificationEl.innerText = notificationText;
            this.notificationEl.style.opacity = '1';
        } else {
            this.notificationEl.style.opacity = '0';
        }

        // Pointer Lock status in controls hint bar
        if (this.pointerStatusEl) {
            if (isPointerLocked) {
                this.pointerStatusEl.innerHTML = `<span style="color:#00ff88; animation:none;">[MOUSE AIM ACTIVE | ESC TO UNLOCK]</span>`;
            } else {
                this.pointerStatusEl.innerHTML = `<span style="color:#ffcc00; animation:pulse 2s infinite;">[CLICK TO LOCK AIM]</span>`;
            }
        }

        // Tactical Scope Overlay Update
        if (camera && this.scopeOverlayEl) {
            if (camera.isScoped) {
                this.scopeOverlayEl.style.display = 'block';
                if (this.scopeGearLabelEl) {
                    this.scopeGearLabelEl.innerText = `SCOPE: ${camera.scopeGear}X MAG`;
                }
                if (this.scopeWeaponModeEl) {
                    this.scopeWeaponModeEl.innerText = targetFocus?.weaponMode === 'SNIPER_RAILGUN'
                        ? '⚡ HIGH-VELOCITY RAILGUN (460 m/s)'
                        : '✦ RAPID-FIRE DUAL PLASMA (280 m/s)';
                }
                if (this.scopeClosureEl) {
                    this.scopeClosureEl.innerText = `CLOSURE: ${(targetFocus?.targetClosureSpeed || 0).toFixed(1)} m/s`;
                }
                if (this.scopeElevationEl) {
                    this.scopeElevationEl.innerText = `ELEV: ${(camera.mouseOrbitPitch * (1000 / Math.PI)).toFixed(1)} MIL`;
                }
            } else {
                this.scopeOverlayEl.style.display = 'none';
            }
        }

        // Predictive Lead Intercept Reticle Update
        if (targetFocus?.predictedLeadPoint && camera && this.leadPipEl) {
            const screen = camera.projectToScreen(
                targetFocus.predictedLeadPoint,
                window.innerWidth,
                window.innerHeight
            );
            if (screen.visible) {
                this.leadPipEl.style.display = 'flex';
                this.leadPipEl.style.left = `${screen.x}px`;
                this.leadPipEl.style.top = `${screen.y}px`;
            } else {
                this.leadPipEl.style.display = 'none';
            }
        } else if (this.leadPipEl) {
            this.leadPipEl.style.display = 'none';
        }

        // Precision Crosshair / Target Lock Readout
        if (this.reticleSvgEl && this.targetLockLabelEl) {
            if (targetFocus && targetFocus.lockState === 'LOCKED' && targetFocus.lockedEntity) {
                const ent = targetFocus.lockedEntity;
                const entName = ent.roleName || ent.id || 'TARGET';
                const distStr = `${targetFocus.distance.toFixed(0)}m`;
                const hpPct = Math.max(0, Math.round((ent.health / ent.maxHealth) * 100));

                this.reticleSvgEl.querySelectorAll('circle, line').forEach(el => {
                    (el as SVGElement).setAttribute('stroke', '#ff2244');
                    if (el.tagName === 'circle' && el.getAttribute('fill') !== 'none') {
                        (el as SVGElement).setAttribute('fill', '#ff2244');
                    }
                });
                this.reticleSvgEl.style.transform = 'scale(1.24)';
                this.targetLockLabelEl.innerHTML = `🎯 LOCKED: <span style="color:#ff3355;">${entName.toUpperCase()}</span> [${distStr}] | HP: ${hpPct}%`;
                this.targetLockLabelEl.style.color = '#ff3355';
                this.targetLockLabelEl.style.textShadow = '0 0 10px rgba(255, 34, 68, 0.9)';
            } else if (targetFocus && targetFocus.lockState === 'ACQUIRING' && targetFocus.candidateEntity) {
                const ent = targetFocus.candidateEntity;
                const pct = (targetFocus.acquireProgress * 100).toFixed(0);

                this.reticleSvgEl.querySelectorAll('circle, line').forEach(el => {
                    (el as SVGElement).setAttribute('stroke', '#ffcc00');
                    if (el.tagName === 'circle' && el.getAttribute('fill') !== 'none') {
                        (el as SVGElement).setAttribute('fill', '#ffcc00');
                    }
                });
                this.reticleSvgEl.style.transform = 'scale(1.15)';
                this.targetLockLabelEl.innerHTML = `⟲ ACQUIRING TARGET [${pct}%]: <span style="color:#ffcc00;">${ent.roleName}</span> [${targetFocus.distance.toFixed(0)}m]`;
                this.targetLockLabelEl.style.color = '#ffcc00';
                this.targetLockLabelEl.style.textShadow = '0 0 8px rgba(255, 204, 0, 0.8)';
            } else if (targetFocus && targetFocus.lockState === 'LOST') {
                this.reticleSvgEl.querySelectorAll('circle, line').forEach(el => {
                    (el as SVGElement).setAttribute('stroke', '#ff8800');
                    if (el.tagName === 'circle' && el.getAttribute('fill') !== 'none') {
                        (el as SVGElement).setAttribute('fill', '#ff8800');
                    }
                });
                this.reticleSvgEl.style.transform = 'scale(1.1)';
                this.targetLockLabelEl.innerHTML = `⚠ LOCK INTERRUPTED [LOS MEMORY TRACK]`;
                this.targetLockLabelEl.style.color = '#ff8800';
                this.targetLockLabelEl.style.textShadow = '0 0 8px rgba(255, 136, 0, 0.8)';
            } else {
                // Standby / Terrain targeting
                this.reticleSvgEl.querySelectorAll('circle, line').forEach(el => {
                    (el as SVGElement).setAttribute('stroke', '#00ffcc');
                    if (el.tagName === 'circle' && el.getAttribute('fill') !== 'none') {
                        (el as SVGElement).setAttribute('fill', '#00ffcc');
                    }
                });
                this.reticleSvgEl.style.transform = 'scale(1.0)';
                if (targetFocus && targetFocus.distance < 1150) {
                    this.targetLockLabelEl.innerText = `RANGE: ${targetFocus.distance.toFixed(0)}m`;
                    this.targetLockLabelEl.style.color = '#00ffcc';
                    this.targetLockLabelEl.style.textShadow = '0 0 8px rgba(0, 255, 204, 0.7)';
                } else {
                    this.targetLockLabelEl.innerText = '';
                }
            }
        }

        // Hit marker
        if (this.hitMarkerEl) {
            if (hitMarkerTimer > 0) {
                this.hitMarkerEl.innerText = hitMarkerText || '✕ HIT!';
                this.hitMarkerEl.style.opacity = '1';
            } else {
                this.hitMarkerEl.style.opacity = '0';
            }
        }

        // 9. Update Drone Operator First-Person View (FPV) OSD Interface
        const isFpvMode = (camera?.mode === 'FPV');
        if (this.fpvOsdContainer) {
            this.fpvOsdContainer.style.display = isFpvMode ? 'block' : 'none';

            if (isFpvMode) {
                // Pitch Ladder & Horizon: tilts with roll (rot[0]), translates with pitch (rot[1])
                if (this.fpvPitchLadderEl) {
                    const ladderPitchY = Math.max(-90, Math.min(90, rot[1] * 2.8));
                    const ladderRollDeg = -rot[0];
                    this.fpvPitchLadderEl.setAttribute(
                        'transform',
                        `rotate(${ladderRollDeg}, 140, 140) translate(0, ${ladderPitchY})`
                    );
                }

                // Top Compass Ribbon Tape
                if (this.fpvHeadingTapeEl) {
                    const hdg = ((rot[2] % 360 + 360) % 360);
                    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
                    const cardIdx = Math.round(hdg / 45) % 8;
                    const cardStr = cardinals[cardIdx];
                    const leftHdg = ((hdg - 15 + 360) % 360).toFixed(0).padStart(3, '0');
                    const rightHdg = ((hdg + 15) % 360).toFixed(0).padStart(3, '0');
                    this.fpvHeadingTapeEl.innerText = `[ ${leftHdg}° • ${cardStr} ${hdg.toFixed(0)}° • ${rightHdg}° ]`;
                }

                // Left & Right Instrument Tapes
                if (this.fpvAltLadderEl) {
                    this.fpvAltLadderEl.innerText = `${sensors.altitudeAGL.toFixed(1)} m`;
                }
                if (this.fpvClimbRateEl) {
                    const vy = vel[1];
                    const sym = vy >= 0.05 ? '▲ +' : (vy <= -0.05 ? '▼ ' : '─ ');
                    this.fpvClimbRateEl.innerText = `${sym}${Math.abs(vy).toFixed(1)} m/s`;
                    this.fpvClimbRateEl.style.color = vy >= 0.05 ? '#00ff88' : (vy <= -0.05 ? '#ffaa00' : '#88ddff');
                }
                if (this.fpvSpdLadderEl) {
                    this.fpvSpdLadderEl.innerText = `${groundSpeed.toFixed(1)} m/s`;
                }
                if (this.fpvSpdKmhEl) {
                    this.fpvSpdKmhEl.innerText = `${(groundSpeed * 3.6).toFixed(0)} km/h`;
                }

                // Running Camera Recording Clock
                if (this.fpvRecTimerEl) {
                    const elapsedSec = Math.floor(performance.now() / 1000);
                    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
                    const ss = String(elapsedSec % 60).padStart(2, '0');
                    this.fpvRecTimerEl.innerText = `${mm}:${ss}`;
                }

                // Gimbal Pitch & GPS Coordinates
                if (this.fpvGimbalTiltEl && camera) {
                    const gimbalPitchDeg = -(camera.mouseOrbitPitch * (180 / Math.PI) - 16).toFixed(0);
                    this.fpvGimbalTiltEl.innerText = `GIMBAL: ${gimbalPitchDeg}°`;
                }
                if (this.fpvGpsCoordsEl) {
                    this.fpvGpsCoordsEl.innerText = `GPS: ${sensors.latitude.toFixed(4)}° N, ${sensors.longitude.toFixed(4)}° E`;
                }
            }
        }
    }
}
