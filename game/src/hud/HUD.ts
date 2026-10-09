import { SensorOutput } from '../wasm/PhysicsBridge';
import { MAP_CATALOG, MapDefinition } from '../gpu/CityMapRenderer';

export class HUD {
    private container: HTMLElement;
    private altEl!: HTMLElement;
    private spdEl!: HTMLElement;
    private hdgEl!: HTMLElement;
    private batEl!: HTMLElement;
    private gpsEl!: HTMLElement;
    private modeEl!: HTMLElement;
    private stateEl!: HTMLElement;

    // Mission & Racing HUD
    private missionPanel!: HTMLElement;
    private scoreEl!: HTMLElement;
    private ringProgressEl!: HTMLElement;
    private lapTimerEl!: HTMLElement;
    private notificationEl!: HTMLElement;

    // Map switcher & speed bar
    private mapToolbar!: HTMLElement;
    private mapButtons: Map<string, HTMLButtonElement> = new Map();
    private speedModeEl!: HTMLElement;
    private audioEl!: HTMLElement;
    private loadingOverlay!: HTMLElement;
    private loadingBarFill!: HTMLElement;
    private loadingText!: HTMLElement;
    private hitMarkerEl!: HTMLElement | null;
    private reticleSvgEl!: SVGElement | null;
    private targetLockLabelEl!: HTMLElement | null;
    private pointerStatusEl!: HTMLElement | null;

    public onMapSelect?: (mapDef: MapDefinition) => void;
    public onSpeedModeToggle?: () => void;
    public onAudioToggle?: () => void;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'hud-container';
        this.container.style.cssText = `
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none;
            font-family: 'Segoe UI', Roboto, -apple-system, sans-serif;
            color: #00ffcc;
            text-shadow: 0 0 6px rgba(0, 255, 204, 0.5);
            padding: 16px 20px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
            user-select: none;
        `;

        // 1. Top Section: Map Switcher Bar & Mission Tracker
        const topRow = document.createElement('div');
        topRow.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            width: 100%;
            gap: 16px;
        `;

        // Top Left: Flight Telemetry Panel
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
            min-width: 180px;
        `;

        this.altEl = document.createElement('div');
        this.spdEl = document.createElement('div');
        this.hdgEl = document.createElement('div');
        leftPanel.appendChild(this.altEl);
        leftPanel.appendChild(this.spdEl);
        leftPanel.appendChild(this.hdgEl);

        // Top Center: Map Switcher Toolbar & Race Dashboard
        const centerCol = document.createElement('div');
        centerCol.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            pointer-events: auto;
        `;

        this.mapToolbar = document.createElement('div');
        this.mapToolbar.style.cssText = `
            display: flex;
            gap: 8px;
            background: rgba(8, 16, 26, 0.88);
            backdrop-filter: blur(12px);
            padding: 6px 12px;
            border-radius: 24px;
            border: 1px solid rgba(0, 255, 204, 0.4);
            box-shadow: 0 4px 25px rgba(0, 0, 0, 0.6);
        `;

        MAP_CATALOG.forEach((m, idx) => {
            const btn = document.createElement('button');
            const shortNames: Record<string, string> = {
                'erangel': 'Erangel (PUBG)',
                'street_city': 'Pochinki Canyons',
                'tram_station': 'Tram Metropolis',
                'amsterdam': 'Amsterdam Terminal',
                'airfield': 'Airfield Runway'
            };
            const label = shortNames[m.id] || m.name;
            btn.innerHTML = `<span style="opacity:0.75;font-size:11px;margin-right:4px;">[${idx + 1}]</span>${label}`;
            btn.title = `${m.name}: ${m.description}`;
            btn.style.cssText = `
                background: ${idx === 0 ? 'rgba(0, 255, 204, 0.25)' : 'rgba(255, 255, 255, 0.05)'};
                color: ${idx === 0 ? '#00ffcc' : '#e0e0e0'};
                border: 1px solid ${idx === 0 ? '#00ffcc' : 'rgba(255, 255, 255, 0.15)'};
                border-radius: 16px;
                padding: 6px 14px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                outline: none;
            `;
            btn.onmouseenter = () => {
                btn.style.background = 'rgba(0, 255, 204, 0.35)';
                btn.style.color = '#ffffff';
            };
            btn.onmouseleave = () => {
                const isActive = this.mapButtons.get(m.id) === btn && btn.getAttribute('data-active') === 'true';
                btn.style.background = isActive ? 'rgba(0, 255, 204, 0.25)' : 'rgba(255, 255, 255, 0.05)';
                btn.style.color = isActive ? '#00ffcc' : '#e0e0e0';
            };
            btn.onclick = () => {
                this.onMapSelect?.(m);
            };
            this.mapButtons.set(m.id, btn);
            this.mapToolbar.appendChild(btn);
        });

        // Race / Checkpoint Display
        this.missionPanel = document.createElement('div');
        this.missionPanel.style.cssText = `
            display: flex;
            gap: 20px;
            background: rgba(10, 22, 34, 0.85);
            backdrop-filter: blur(10px);
            padding: 8px 24px;
            border-radius: 20px;
            border: 1px solid rgba(255, 204, 0, 0.5);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            font-size: 14px;
            font-weight: 700;
            color: #ffcc00;
        `;

        this.ringProgressEl = document.createElement('div');
        this.ringProgressEl.innerText = 'RINGS: 0 / 11';
        this.scoreEl = document.createElement('div');
        this.scoreEl.innerText = 'SCORE: 0';
        this.lapTimerEl = document.createElement('div');
        this.lapTimerEl.innerText = 'TIME: 00:00.0';

        this.missionPanel.appendChild(this.ringProgressEl);
        this.missionPanel.appendChild(this.scoreEl);
        this.missionPanel.appendChild(this.lapTimerEl);

        // Center on-screen banner for ring popups
        this.notificationEl = document.createElement('div');
        this.notificationEl.style.cssText = `
            font-size: 20px;
            font-weight: 800;
            color: #00ffcc;
            text-shadow: 0 0 15px rgba(0, 255, 204, 0.8);
            letter-spacing: 1px;
            min-height: 28px;
            text-align: center;
            opacity: 0;
            transition: opacity 0.25s ease;
        `;

        centerCol.appendChild(this.mapToolbar);
        centerCol.appendChild(this.missionPanel);
        centerCol.appendChild(this.notificationEl);

        // Top Right: Systems & Modes Panel
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
            font-size: 15px;
            font-weight: 600;
            min-width: 190px;
            pointer-events: auto;
        `;

        this.batEl = document.createElement('div');
        this.gpsEl = document.createElement('div');
        this.modeEl = document.createElement('div');
        this.stateEl = document.createElement('div');

        this.speedModeEl = document.createElement('div');
        this.speedModeEl.style.cssText = `
            color: #ffaa33;
            cursor: pointer;
            padding: 2px 0;
        `;
        this.speedModeEl.onclick = () => this.onSpeedModeToggle?.();

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
        rightPanel.appendChild(this.audioEl);

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
            <span style="color:#ff3366;"><b>[LEFT-CLICK / F]</b> FIRE LASERS</span>
            <span style="color:#ffcc00;"><b>[W / S]</b> FORWARD / BACK</span>
            <span style="color:#ff9999;"><b>[A / D]</b> STRAFE</span>
            <span style="color:#33ff99;"><b>[HOLD SHIFT]</b> CLIMB</span>
            <span style="color:#ffaa66;"><b>[CTRL]</b> DESCEND / LAND</span>
            <span style="color:#66ccff;"><b>[R]</b> SPEED MODE</span>
            <span style="color:#ff66cc;"><b>[V]</b> CAMERA</span>
            <span style="color:#ffff66;"><b>[1 - 5]</b> MAPS</span>
        `;
        this.pointerStatusEl = controlsHint.querySelector('#hud-pointer-status');

        // 3. Holographic Precision Reticle / Crosshair & Dynamic Target Lock Readout
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
            <svg id="hud-reticle-svg" width="56" height="56" viewBox="0 0 56 56" style="transition: all 0.15s ease-out; opacity: 0.9;">
                <circle id="reticle-circle" cx="28" cy="28" r="16" fill="none" stroke="#00ffcc" stroke-width="1.8" stroke-dasharray="6 4" />
                <line id="reticle-top" x1="28" y1="4" x2="28" y2="15" stroke="#00ffcc" stroke-width="2" />
                <line id="reticle-bot" x1="28" y1="41" x2="28" y2="52" stroke="#00ffcc" stroke-width="2" />
                <line id="reticle-left" x1="4" y1="28" x2="15" y2="28" stroke="#00ffcc" stroke-width="2" />
                <line id="reticle-right" x1="41" y1="28" x2="52" y2="28" stroke="#00ffcc" stroke-width="2" />
                <circle id="reticle-dot" cx="28" cy="28" r="2.5" fill="#00ffcc" />
            </svg>
            <div id="hud-target-lock-label" style="font-size:11px; font-weight:800; letter-spacing:1px; color:#00ffcc; text-shadow:0 0 8px rgba(0,255,204,0.8); margin-top:4px; white-space:nowrap;"></div>
            <div id="hud-hit-marker" style="font-size:13px; font-weight:800; color:#ff3333; opacity:0; transition:opacity 0.1s; margin-top:4px; text-shadow:0 0 10px rgba(255,0,0,0.8);">✕ HIT!</div>
        `;
        this.container.appendChild(crosshairContainer);
        this.reticleSvgEl = crosshairContainer.querySelector('#hud-reticle-svg');
        this.targetLockLabelEl = crosshairContainer.querySelector('#hud-target-lock-label');
        this.hitMarkerEl = crosshairContainer.querySelector('#hud-hit-marker');

        // 3. Loading Overlay for High-Res Maps
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
            background: linear-gradient(90deg, #00ffcc, #ffcc00);
            transition: width 0.15s ease;
        `;
        barContainer.appendChild(this.loadingBarFill);
        this.loadingOverlay.appendChild(this.loadingText);
        this.loadingOverlay.appendChild(barContainer);

        this.container.appendChild(topRow);
        this.container.appendChild(controlsHint);
        this.container.appendChild(this.loadingOverlay);
        document.body.appendChild(this.container);

        this.setActiveMapButton('tram_station');
    }

    public setActiveMapButton(mapId: string): void {
        this.mapButtons.forEach((btn, id) => {
            const isActive = id === mapId;
            btn.setAttribute('data-active', isActive ? 'true' : 'false');
            btn.style.background = isActive ? 'rgba(0, 255, 204, 0.25)' : 'rgba(255, 255, 255, 0.05)';
            btn.style.color = isActive ? '#00ffcc' : '#e0e0e0';
            btn.style.borderColor = isActive ? '#00ffcc' : 'rgba(255, 255, 255, 0.15)';
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
        score: number,
        ringsPassed: number,
        totalRings: number,
        lapTime: number,
        notificationText: string,
        isMuted: boolean,
        hitMarkerTimer: number = 0,
        hitMarkerText: string = "",
        targetFocus?: { distance: number; lockedEntity: any } | null,
        isPointerLocked: boolean = false
    ): void {
        const groundSpeed = Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]);
        this.altEl.innerText = `ALT (AGL): ${sensors.altitudeAGL.toFixed(1)} m`;
        this.spdEl.innerText = `SPD: ${groundSpeed.toFixed(1)} m/s`;
        this.hdgEl.innerText = `HDG: ${((rot[2] % 360 + 360) % 360).toFixed(0)}°`;

        this.batEl.innerText = `BAT: ${sensors.batteryPct.toFixed(0)}%`;
        this.gpsEl.innerText = `GPS: 3D FIX (12 sats)`;
        this.modeEl.innerText = `FC: ${flightMode} | [V] ${camMode}`;
        this.stateEl.innerHTML = `STATE: <span style="color:${armed ? '#00ff66' : '#ff3333'}; font-weight: bold;">${armed ? '● ARMED' : '○ DISARMED'}</span>`;
        this.speedModeEl.innerHTML = `[R] SPEED: <b>${speedMode}</b>`;
        this.audioEl.innerHTML = `[M] AUDIO: <b>${isMuted ? '<span style="color:#ff6666">MUTED</span>' : 'ACTIVE'}</b>`;

        this.ringProgressEl.innerText = `RINGS: ${ringsPassed} / ${totalRings}`;
        this.scoreEl.innerText = `SCORE: ${score}`;

        const minutes = Math.floor(lapTime / 60);
        const seconds = (lapTime % 60).toFixed(1);
        this.lapTimerEl.innerText = `TIME: ${minutes < 10 ? '0' : ''}${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;

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

        // Precision Crosshair / Target Lock HUD
        if (this.reticleSvgEl && this.targetLockLabelEl) {
            if (targetFocus && targetFocus.lockedEntity) {
                const ent = targetFocus.lockedEntity;
                const entName = ent.name || ent.id || 'TARGET';
                const distStr = `${targetFocus.distance.toFixed(0)}m`;
                
                // Color shift to neon red/crimson on lock
                this.reticleSvgEl.querySelectorAll('circle, line').forEach(el => {
                    (el as SVGElement).setAttribute('stroke', '#ff2244');
                    if (el.tagName === 'circle' && el.getAttribute('fill') !== 'none') {
                        (el as SVGElement).setAttribute('fill', '#ff2244');
                    }
                });
                this.reticleSvgEl.style.transform = 'scale(1.22)';
                this.targetLockLabelEl.innerHTML = `🎯 LOCKED: <span style="color:#ff3355;">${entName.toUpperCase()}</span> [${distStr}]`;
                this.targetLockLabelEl.style.color = '#ff3355';
                this.targetLockLabelEl.style.textShadow = '0 0 10px rgba(255, 34, 68, 0.9)';
            } else {
                // Idle or terrain targeting (cyan / soft green)
                this.reticleSvgEl.querySelectorAll('circle, line').forEach(el => {
                    (el as SVGElement).setAttribute('stroke', '#00ffcc');
                    if (el.tagName === 'circle' && el.getAttribute('fill') !== 'none') {
                        (el as SVGElement).setAttribute('fill', '#00ffcc');
                    }
                });
                this.reticleSvgEl.style.transform = 'scale(1.0)';
                if (targetFocus && targetFocus.distance < 300) {
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
    }
}
