import { GPUDeviceContext } from './gpu/Device';
import { PhysicsBridge } from './wasm/PhysicsBridge';
import { TerrainRenderer } from './gpu/TerrainRenderer';
import { StructuresRenderer } from './gpu/StructuresRenderer';
import { ModelRenderer } from './gpu/ModelRenderer';
import { SkyRenderer } from './gpu/SkyRenderer';
import { CityMapRenderer, MAP_CATALOG, MapDefinition } from './gpu/CityMapRenderer';
import { SoundManager } from './gameplay/SoundManager';
import { MissionManager } from './gameplay/MissionManager';
import { CollisionSystem } from './gameplay/CollisionSystem';
import { EntityManager, BaseEntity } from './gameplay/EntityManager';
import { WeaponSystem } from './gameplay/WeaponSystem';
import { CombatRenderer } from './gpu/CombatRenderer';
import { Camera } from './scene/Camera';
import { LiveKitRoboticsClient } from './network/LiveKitRoboticsClient';
import { BrowserAIController } from './ai/BrowserAIController';
import { AiMode } from './ai/types';
import { InputManager } from './input/InputManager';
import { HUD } from './hud/HUD';
import { Telemetry, DroneFlightState, FlightMode, GPSFixType, SensorStatus } from 'drone-autonomy-shared';
import { REALTIME, SPEED_MODES, SPEED_PROFILES, SERVER } from 'drone-autonomy-shared';
import type { SpeedMode, WorldStateMsg, WorldTargetState } from 'drone-autonomy-shared';

async function bootstrap() {
    console.log("=== Initializing Masiez C++ / WebGPU Kamikaze FPV Drone Simulation ===");

    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    if (!canvas) throw new Error("renderCanvas element not found");

    // 1. Initialize WebGPU Context
    const gpu = new GPUDeviceContext(canvas);
    const okGPU = await gpu.init();
    if (!okGPU) {
        document.body.innerHTML = `
            <div style="color:white;padding:40px;font-family:sans-serif;">
                <h2>WebGPU Not Supported</h2>
                <p>Please use a modern browser with WebGPU enabled (Chrome 113+, Edge 113+, Firefox Nightly).</p>
            </div>
        `;
        return;
    }

    // 2. Initialize C++ WebAssembly Physics Engine
    const physics = new PhysicsBridge();
    const okWasm = await physics.init();
    if (!okWasm) {
        console.warn("WASM physics failed to load, check console.");
    }
    physics.arm(true);

    // 3. Audio & Mission & Renderers
    const soundManager = new SoundManager();
    const missionManager = new MissionManager(gpu, soundManager);
    await missionManager.init();

    const skyRenderer = new SkyRenderer(gpu);
    await skyRenderer.init();

    const terrainRenderer = new TerrainRenderer(gpu);
    await terrainRenderer.init();

    const structuresRenderer = new StructuresRenderer(gpu);
    await structuresRenderer.init();

    const modelRenderer = new ModelRenderer(gpu);
    await modelRenderer.init();
    await modelRenderer.loadGLB('/assets/models/drone_custom.glb');

    const cityMapRenderer = new CityMapRenderer(gpu);
    await cityMapRenderer.init();

    // 4. Combat Systems: Building Collisions, Moving Entities & Kamikaze Warhead System
    const collisionSystem = new CollisionSystem();
    const entityManager = new EntityManager();
    const weaponSystem = new WeaponSystem();
    const combatRenderer = new CombatRenderer(gpu);
    await combatRenderer.init();

    // 5. Camera, Input, HUD, LiveKit Robot Link
    const camera = new Camera();
    camera.mode = 'FPV'; // Default to First Person Operator View
    const input = new InputManager(canvas);
    const hud = new HUD();
    const livekit = new LiveKitRoboticsClient();
    const browserAI = new BrowserAIController();

    // Flight Speed Modes & Dynamic Performance Profiles (shared with the authoritative backend sim)
    const speedModes = SPEED_MODES as unknown as SpeedMode[];
    let speedModeIndex = 0;
    const speedProfiles = SPEED_PROFILES;

    let currentRollDeg = 0;
    let currentPitchDeg = 0;

    // Kamikaze Detonation & Multi-Drone Fleet State
    const DEFAULT_DRONE_FLEET = 8;
    let isCrashed = false;
    let crashReason = "";
    let crashTime = 0;

    function triggerKamikazeDetonation(
        reason: string,
        hitPos?: [number, number, number],
        directHitEntity?: BaseEntity | null
    ) {
        if (isCrashed) return;
        isCrashed = true;
        crashReason = reason;
        crashTime = performance.now();
        physics.arm(false);

        const crashPt = hitPos || physics.getPosition();

        // Detonate onboard explosive warhead & evaluate blast radius against hostile targets
        const destroyedTargets = weaponSystem.detonateWarhead(
            crashPt,
            entityManager,
            soundManager,
            directHitEntity
        );

        // Update kamikaze mission scoring & remaining drone count
        const stats = missionManager.recordKamikazeStrike(
            destroyedTargets,
            entityManager.getDestroyedHostileCount(),
            reason
        );

        if (destroyedTargets.length > 0) {
            weaponSystem.hitMarkerTimer = 1.6;
            weaponSystem.hitMarkerText = `💥 TARGET HIT (+${destroyedTargets.length * 1000} PTS) — ${stats.targetsHit}/${stats.totalTargets} DESTROYED`;
        } else {
            weaponSystem.hitMarkerTimer = 1.0;
            weaponSystem.hitMarkerText = `WARHEAD DETONATED — NO TARGET HIT`;
        }

        // Publish reliable strike outcome over LiveKit Robotics DataChannel
        livekit.publishStrikeEvent({
            reason,
            hitTarget: destroyedTargets.length > 0,
            destroyedTargets: destroyedTargets.map(t => t.roleName),
            mission: stats,
        });

        // Report strike to the authoritative backend world (mission mirror + replay/leaderboard feed)
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'game:world_cmd',
                action: 'strike',
                strike: {
                    reason,
                    pos: [crashPt[0], crashPt[1], crashPt[2]],
                    destroyedTargets: destroyedTargets.map(t => ({ id: t.id, roleName: t.roleName })),
                    mission: stats,
                },
            }));
        }

        const curVel = physics.getVelocity();
        physics.setVelocity(curVel[0] * 0.12, Math.min(curVel[1], -1.5), curVel[2] * 0.12);
        currentRollDeg += (Math.random() - 0.5) * 80;
        currentPitchDeg += (Math.random() - 0.5) * 80;

        console.log(
            `[KAMIKAZE DETONATION] Reason: ${reason} | Hit: ${destroyedTargets.length} target(s) | ` +
            `Targets: ${stats.targetsHit}/${stats.totalTargets} | Drones Left: ${stats.dronesRemaining}/${stats.totalDrones}`
        );
    }

    function deployNextDrone() {
        isCrashed = false;
        crashReason = "";
        poseA = null;
        poseB = null; // fresh airframe: accept the new authoritative pose cleanly
        physics.setMode('MANUAL');
        physics.resetPosition(currentMapDef.spawnPos[0], currentMapDef.spawnPos[1], currentMapDef.spawnPos[2]);
        physics.setVelocity(0, 0, 0);
        physics.setRotation(0, 0, 0);
        physics.arm(true);
        currentRollDeg = 0;
        currentPitchDeg = 0;
        camera.mouseOrbitYaw = 0;
        camera.mouseOrbitPitch = 0;
        weaponSystem.lockedEntity = null;
        soundManager.playTargetAcquired();
        const droneNum = Math.min(
            missionManager.totalDrones,
            missionManager.totalDrones - missionManager.dronesRemaining + 1
        );
        missionManager.showNotification(
            `🚀 FPV DRONE #${droneNum} ARMED (${missionManager.dronesRemaining}/${missionManager.totalDrones} LEFT) — TARGETS: ${missionManager.targetsHit}/${missionManager.totalTargets}`
        );
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'game:world_cmd', action: 'deploy' }));
        }
        console.log(`[Drone] Deployed FPV Drone #${droneNum} at base (${missionManager.dronesRemaining} remaining)`);
    }

    function restartMission() {
        if (currentMapDef.id === 'airfield') {
            entityManager.initAirfieldEntities();
        } else {
            entityManager.initMapEntities(currentMapDef.id, currentMapDef.spawnPos, currentMapDef.groundElevation);
        }
        missionManager.startMission(entityManager.getTotalHostileCount(), DEFAULT_DRONE_FLEET);
        deployNextDrone();
        missionManager.showNotification(
            `🎯 NEW MISSION: DESTROY ${missionManager.totalTargets} HOSTILE TARGETS (${missionManager.totalDrones} KAMIKAZE DRONES)`
        );
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'game:world_cmd', action: 'reset' }));
        }
    }

    function handleRecoverOrRestart() {
        if (
            missionManager.missionStatus === 'SUCCESS' ||
            missionManager.missionStatus === 'FAILED' ||
            missionManager.dronesRemaining <= 0
        ) {
            restartMission();
        } else {
            deployNextDrone();
        }
    }

    // Backend WebSocket (connected below, referenced by world commands above)
    let ws: WebSocket | null = null;

    // ============================================================
    // Backend Authoritative Realtime Drone Link
    // The server integrates the drone flight model at REALTIME.simTickHz
    // from streamed control axes. When enabled, this client reconciles its
    // physics to the authoritative pose each snapshot and extrapolates
    // locally between them, so the rendered drone IS the backend drone.
    // ============================================================
    let realtimeEnabled = (localStorage.getItem('masiez.realtime') ?? '1') === '1';
    let worldSnap: WorldStateMsg | null = null;
    let lastSnapServerTime = 0;
    let snapLatencyMs = 0;
    let lastAxesSend = 0;
    let lastRealtimeDisplay = 0;
    let poseA: { pos: [number, number, number]; vel: [number, number, number]; t: number } | null = null;
    let poseB: { pos: [number, number, number]; vel: [number, number, number]; t: number; serverCrashed?: boolean } | null = null;
    let worldSnapReceiveMs = 0;

    function realtimeActive(): boolean {
        return realtimeEnabled && worldSnap !== null && performance.now() - worldSnapReceiveMs < 1500;
    }

    function applyWorldSnapshot(msg: WorldStateMsg) {
        const fresh = msg.serverTime > lastSnapServerTime;
        if (!fresh) return;
        lastSnapServerTime = msg.serverTime;
        snapLatencyMs = Math.max(0, Date.now() - msg.serverTime);
        worldSnap = msg;
        worldSnapReceiveMs = performance.now();

        // Server-side redeploy (crash resolved authoritatively): re-seed local crash visuals
        const wasServerCrashed = poseB?.serverCrashed === true;
        if (!msg.drone.crashed) {
            // Fresh authoritative pose (new drone or recovery): drop stale interpolation buffers
            poseA = null;
        }
        poseB = { pos: [...msg.drone.pos] as [number, number, number], vel: [...msg.drone.vel] as [number, number, number], t: performance.now(), serverCrashed: msg.drone.crashed };
        if (wasServerCrashed && !msg.drone.crashed && !isCrashed) {
            deployNextDrone();
        }

        const serverIdx = speedModes.indexOf(msg.drone.speedMode);
        if (serverIdx >= 0 && !isCrashed) speedModeIndex = serverIdx;
    }

    /** Interpolated authoritative pose, or null to fall back to local physics. */
    function realtimePose(): { pos: [number, number, number]; vel: [number, number, number]; headingRad: number; rollDeg: number; pitchDeg: number; batteryPct: number } | null {
        // Local physics keeps control while the airframe is a wreck (fall animation)
        // or while the onboard C++ autopilot is flying.
        if (isCrashed || physics.getMode() !== 'MANUAL') return null;
        if (!realtimeActive() || !poseB) return null;
        if (!poseA) {
            return {
                pos: poseB.pos, vel: poseB.vel,
                headingRad: worldSnap!.drone.headingRad,
                rollDeg: worldSnap!.drone.rollDeg,
                pitchDeg: worldSnap!.drone.pitchDeg,
                batteryPct: worldSnap!.drone.batteryPct,
            };
        }
        const ageSec = (performance.now() - poseB.t) / 1000;
        const clampedAge = Math.min(ageSec, 0.25); // light extrapolation cap for smoothness
        const p: [number, number, number] = [
            poseB.pos[0] + poseB.vel[0] * clampedAge,
            poseB.pos[1] + poseB.vel[1] * clampedAge,
            poseB.pos[2] + poseB.vel[2] * clampedAge,
        ];
        return {
            pos: p, vel: poseB.vel,
            headingRad: worldSnap!.drone.headingRad,
            rollDeg: worldSnap!.drone.rollDeg,
            pitchDeg: worldSnap!.drone.pitchDeg,
            batteryPct: worldSnap!.drone.batteryPct,
        };
    }

    // Active Map Management: Start directly on Tactical Airfield Runway (Original First Map)
    let currentMapDef: MapDefinition = MAP_CATALOG[0];
    hud.setActiveMapButton(currentMapDef.id);
    physics.setGroundOffset(currentMapDef.groundElevation);
    physics.resetPosition(currentMapDef.spawnPos[0], currentMapDef.spawnPos[1], currentMapDef.spawnPos[2]);
    camera.baseDistance = currentMapDef.camDistance;
    camera.currentGroundElevation = currentMapDef.groundElevation;
    physics.clearHeightmap();

    // Initialize colliders, entities & kamikaze mission for Map 1 (Tactical Airfield)
    collisionSystem.clearColliders();
    collisionSystem.initAirfieldColliders();
    entityManager.initAirfieldEntities();
    missionManager.startMission(entityManager.getTotalHostileCount(), DEFAULT_DRONE_FLEET);

    // Stream map GLB if applicable
    if (currentMapDef.url) {
        cityMapRenderer.loadMap(currentMapDef).catch(e => console.warn(e));
    }

    async function switchMap(mapDef: MapDefinition) {
        hud.setActiveMapButton(mapDef.id);

        if (mapDef.id === 'erangel') {
            try {
                const res = await fetch('/assets/maps/erangel_heightmap.bin');
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    const u16 = new Uint16Array(buf);
                    physics.loadHeightmap(u16, 256, 256, 20000.0, 800.0, 20000.0);
                    collisionSystem.loadHeightmap(u16, 256, 256, 20000.0, 800.0, 20000.0, mapDef.groundElevation);
                }
            } catch (e) {
                console.warn("Heightmap load skipped:", e);
            }
        } else {
            physics.clearHeightmap();
            collisionSystem.clearHeightmap();
        }

        if (mapDef.url) {
            hud.showMapLoading(mapDef.name, 10);
            try {
                const ok = await cityMapRenderer.loadMap(mapDef, (pct) => {
                    hud.showMapLoading(mapDef.name, pct);
                });
                if (!ok) {
                    console.warn(`Failed to load ${mapDef.name}`);
                    hud.showMapLoading(mapDef.name, 100);
                    return;
                }
            } catch (err) {
                console.error(`Error loading map ${mapDef.name}:`, err);
                hud.showMapLoading(mapDef.name, 100);
                return;
            }
        }

        currentMapDef = mapDef;
        // Configure physics for new map
        physics.setGroundOffset(mapDef.groundElevation);
        physics.resetPosition(mapDef.spawnPos[0], mapDef.spawnPos[1], mapDef.spawnPos[2]);
        physics.setVelocity(0, 0, 0);
        physics.setRotation(0, 0, 0);
        physics.arm(true);
        physics.setMode('MANUAL');
        isCrashed = false;
        crashReason = "";
        currentRollDeg = 0;
        currentPitchDeg = 0;
        camera.mouseOrbitYaw = 0;
        camera.mouseOrbitPitch = 0;
        camera.baseDistance = mapDef.camDistance;
        camera.currentGroundElevation = mapDef.groundElevation;
        weaponSystem.lockedEntity = null;

        // Populate solid building colliders & moving entities for this map
        collisionSystem.clearColliders();
        if (mapDef.id === 'airfield') {
            collisionSystem.initAirfieldColliders();
            entityManager.initAirfieldEntities();
        } else if (mapDef.id === 'erangel') {
            collisionSystem.initErangelColliders(mapDef.groundElevation);
            entityManager.initMapEntities(mapDef.id, mapDef.spawnPos, mapDef.groundElevation);
        } else {
            const glbColliders = cityMapRenderer.getMapColliders(mapDef.id);
            for (const b of glbColliders) {
                collisionSystem.addAABB(b.min, b.max, b.name || b.id);
            }
            entityManager.initMapEntities(mapDef.id, mapDef.spawnPos, mapDef.groundElevation);
        }

        // Start fresh kamikaze mission for this sector
        missionManager.startMission(entityManager.getTotalHostileCount(), DEFAULT_DRONE_FLEET);
        soundManager.playTargetAcquired();
        missionManager.showNotification(
            `SECTOR DEPLOYED: ${mapDef.name.toUpperCase()} — DESTROY ${missionManager.totalTargets} TARGETS (${missionManager.totalDrones} DRONES)`
        );

        console.log(`[Game] Switched to map: ${mapDef.name} (${collisionSystem.colliderCount} colliders)`);

        // Reconfigure the authoritative backend world for this sector
        const apiBase = window.location.port === '5173'
            ? `${window.location.protocol}//${window.location.hostname || 'localhost'}:3001`
            : window.location.origin;
        fetch(`${apiBase}${SERVER.apiBasePath}/world/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mapId: mapDef.id,
                spawn: mapDef.spawnPos,
                groundElevation: mapDef.groundElevation,
                worldRadius: 950,
            }),
        }).catch(() => {});
    }

    // Input Handlers
    input.onArmToggle = () => {
        if (isCrashed) {
            handleRecoverOrRestart();
            return;
        }
        const nextArmed = !physics.isArmed();
        physics.arm(nextArmed);
        console.log(`Drone ${nextArmed ? 'ARMED' : 'DISARMED'}`);
    };

    input.onModeToggle = () => {
        if (isCrashed) return;
        const nextMode = physics.getMode() === 'MANUAL' ? 'AUTOPILOT' : 'MANUAL';
        physics.setMode(nextMode);
        console.log(`Flight Mode: ${nextMode}`);
    };

    input.onCameraToggle = () => {
        camera.mode = camera.mode === 'FPV' ? 'CHASE' : 'FPV';
        soundManager.playTargetAcquired();
        missionManager.showNotification(camera.mode === 'FPV' ? "VIEW: OPERATOR FPV (FIRST-PERSON)" : "VIEW: THIRD-PERSON CHASE");
        console.log(`Camera Mode: ${camera.mode}`);
    };

    input.onSpeedToggle = () => {
        if (isCrashed) {
            handleRecoverOrRestart();
            return;
        }
        speedModeIndex = (speedModeIndex + 1) % speedModes.length;
        const mode = speedModes[speedModeIndex];
        soundManager.playSpeedModeChime(mode);
        missionManager.showNotification(`SPEED MODE: ${mode}`);
    };

    input.onMuteToggle = () => {
        const isMuted = soundManager.toggleMute();
        missionManager.showNotification(isMuted ? "AUDIO MUTED" : "AUDIO ACTIVE");
    };

    input.onUserMenuToggle = () => {
        hud.toggleUserMenu();
    };

    hud.onMenuOpenChange = (isOpen: boolean) => {
        input.isMenuOpen = isOpen;
        if (isOpen && document.pointerLockElement) {
            try {
                document.exitPointerLock();
            } catch (err) {}
        }
    };

    input.onScopeToggle = () => {
        camera.toggleScope();
        input.isScoped = camera.isScoped;
        soundManager.playScopeZoom(camera.scopeGear);
        missionManager.showNotification(camera.isScoped ? `OPTICAL ZOOM ACTIVE: ${camera.scopeGear}X` : "OPTICAL ZOOM DEACTIVATED");
    };

    input.onScopeGearChange = (forward: boolean) => {
        camera.cycleScopeGear(forward);
        input.isScoped = camera.isScoped;
        soundManager.playScopeZoom(camera.scopeGear);
        missionManager.showNotification(`OPTICAL ZOOM: ${camera.scopeGear}X`);
    };

    input.onLockTarget = () => {
        weaponSystem.toggleLock(camera, entityManager, soundManager);
        if (weaponSystem.lockedEntity) {
            missionManager.showNotification(`KAMIKAZE TARGET LOCKED: ${weaponSystem.lockedEntity.roleName.toUpperCase()}`);
        } else {
            missionManager.showNotification("TARGET LOCK DISENGAGED");
        }
    };

    input.onEmergencyStop = () => {
        physics.arm(false);
        console.log("EMERGENCY STOP!");
    };

    // HUD & User Menu Button Handlers
    hud.onMapSelect = (mapDef) => {
        switchMap(mapDef);
    };

    hud.onSpeedModeToggle = () => {
        input.onSpeedToggle();
    };

    hud.onAudioToggle = () => {
        input.onMuteToggle();
    };

    hud.onScopeToggle = () => {
        input.onScopeToggle();
    };

    hud.onScopeGearToggle = () => {
        input.onScopeGearChange(true);
    };

    hud.onLockTargetToggle = () => {
        input.onLockTarget();
    };

    hud.onRecoverDrone = () => {
        handleRecoverOrRestart();
    };

    hud.onRestartMission = () => {
        restartMission();
    };

    hud.onCameraToggle = () => {
        input.onCameraToggle();
    };

    // LiveKit is an ALTERNATIVE transport (models run in-browser by default).
    // It never auto-connects; operators enable it from the User Menu, and the
    // RPC methods below become live the moment a connection is established.
    hud.onAiModeToggle = () => {
        const order: AiMode[] = ['OFF', 'DETECT', 'FOLLOW'];
        const next = order[(order.indexOf(browserAI.getMode()) + 1) % order.length];
        browserAI.setMode(next);
        missionManager.showNotification(
            next === 'OFF'
                ? "IN-BROWSER AI: OFF (MANUAL FLIGHT)"
                : `IN-BROWSER AI: ${next}${next === 'FOLLOW' ? ' — DETECT & PURSUE TARGETS' : ' — DETECTION OVERLAY ONLY'}`
        );
        soundManager.playTargetAcquired();
    };

    hud.onRealtimeToggle = () => {
        realtimeEnabled = !realtimeEnabled;
        localStorage.setItem('masiez.realtime', realtimeEnabled ? '1' : '0');
        if (!realtimeEnabled) {
            worldSnap = null;
            poseA = null;
            poseB = null;
        }
        missionManager.showNotification(
            realtimeEnabled
                ? "🛰 BACKEND DRONE: REALTIME — server 50Hz authoritative flight model"
                : "🖥 BACKEND DRONE: LOCAL — client-side physics only"
        );
        soundManager.playTargetAcquired();
    };

    // Register Full Suite of LiveKit Robotics RPC Methods (for Jupyter / Kaggle / Remote Operators)
    livekit.registerRpc('teleop.takeoff', async (params) => {
        physics.arm(true);
        physics.setMode('AUTOPILOT');
        const p = physics.getPosition();
        const alt = Number(params?.altitude || 15);
        physics.setAutopilotTarget(p[0], p[1] + alt, p[2]);
        missionManager.showNotification(`LIVEKIT RPC: TAKEOFF TO ${alt}M`);
        return { ok: true, altitude: alt };
    });

    livekit.registerRpc('teleop.land', async () => {
        physics.setMode('AUTOPILOT');
        const p = physics.getPosition();
        physics.setAutopilotTarget(p[0], currentMapDef.groundElevation + 0.1, p[2]);
        missionManager.showNotification("LIVEKIT RPC: AUTOLAND INITIATED");
        return { ok: true };
    });

    livekit.registerRpc('teleop.emergency_stop', async () => {
        physics.arm(false);
        missionManager.showNotification("LIVEKIT RPC: EMERGENCY MOTOR CUT");
        return { ok: true };
    });

    livekit.registerRpc('teleop.arm', async (params) => {
        const armState = params?.armed !== false;
        physics.arm(armState);
        missionManager.showNotification(`LIVEKIT RPC: ${armState ? 'ARMED' : 'DISARMED'}`);
        return { ok: true, armed: armState };
    });

    livekit.registerRpc('teleop.set_speed_mode', async (params) => {
        const mode = (params?.mode || 'CRUISE').toUpperCase() as SpeedMode;
        if (speedModes.includes(mode)) {
            speedModeIndex = speedModes.indexOf(mode);
            soundManager.playSpeedModeChime(mode);
            missionManager.showNotification(`LIVEKIT RPC: SPEED ${mode}`);
            return { ok: true, mode };
        }
        return { ok: false, error: 'Invalid speed mode' };
    });

    livekit.registerRpc('teleop.set_flight_mode', async (params) => {
        const mode = params?.mode === 'AUTOPILOT' ? 'AUTOPILOT' : 'MANUAL';
        physics.setMode(mode);
        missionManager.showNotification(`LIVEKIT RPC: MODE ${mode}`);
        return { ok: true, mode };
    });

    livekit.registerRpc('teleop.deploy_next_drone', async () => {
        handleRecoverOrRestart();
        return { ok: true, dronesRemaining: missionManager.dronesRemaining };
    });

    livekit.registerRpc('teleop.restart_mission', async () => {
        restartMission();
        return { ok: true, totalTargets: missionManager.totalTargets, totalDrones: missionManager.totalDrones };
    });

    livekit.registerRpc('teleop.select_map', async (params) => {
        const mapId = params?.id || params?.mapId;
        const mapDef = MAP_CATALOG.find(m => m.id === mapId);
        if (mapDef) {
            await switchMap(mapDef);
            return { ok: true, mapId: mapDef.id, mapName: mapDef.name };
        }
        return { ok: false, error: `Map '${mapId}' not found` };
    });

    livekit.registerRpc('teleop.get_state', async () => {
        return {
            armed: physics.isArmed(),
            mode: physics.getMode(),
            speedMode: speedModes[speedModeIndex],
            position: physics.getPosition(),
            rotation: physics.getRotation(),
            velocity: physics.getVelocity(),
            mission: missionManager.getStats(),
            aliveHostiles: entityManager.getAliveHostileTargets().length,
        };
    });

    livekit.onRemoteCommand = (cmd: any) => {
        console.log("[LiveKit Robotics Teleop] Received command:", cmd);
        if (cmd.type === 'arm_and_takeoff') {
            physics.arm(true);
            physics.setMode('AUTOPILOT');
            const p = physics.getPosition();
            const alt = (cmd.params as any)?.altitude || 15;
            physics.setAutopilotTarget(p[0], p[1] + alt, p[2]);
        } else if (cmd.type === 'land') {
            physics.setMode('AUTOPILOT');
            const p = physics.getPosition();
            physics.setAutopilotTarget(p[0], currentMapDef.groundElevation + 0.1, p[2]);
        } else if (cmd.type === 'emergency_stop') {
            physics.arm(false);
        } else if (cmd.type === 'deploy_next_drone') {
            handleRecoverOrRestart();
        } else if (cmd.type === 'restart_mission') {
            restartMission();
        }
    };

    hud.onLiveKitToggle = (customUrl?: string) => {
        if (livekit.status === 'streaming' || livekit.status === 'connected') {
            livekit.disconnect();
            missionManager.showNotification("LIVEKIT STREAM DISCONNECTED");
        } else {
            livekit.connect(canvas, customUrl);
            missionManager.showNotification("CONNECTING TO LIVEKIT...");
        }
    };

    // 6. Connect to Backend 1 (WebSocket)
    function connectWS() {
        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsHost = window.location.port === '5173'
                ? `${window.location.hostname || 'localhost'}:3001`
                : (window.location.host || 'localhost:3001');
            const wsUrl = `${wsProtocol}//${wsHost}/ws/game`;
            ws = new WebSocket(wsUrl);
            ws.onopen = () => console.log(`Connected to Backend 1 Game Server (${wsUrl})`);
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'world:state') {
                        applyWorldSnapshot(msg as WorldStateMsg);
                    } else if (msg.type === 'world:event') {
                        if (msg.kind === 'GEOFENCE_CLAMP' || msg.kind === 'INPUT_LOST' || msg.kind === 'BATTERY_CRITICAL') {
                            missionManager.showNotification(`⚠ BACKEND: ${msg.message}`);
                        }
                    } else if (msg.type === 'server:command') {
                        const cmd = msg.command;
                        console.log("Received server command:", cmd);
                        if (cmd.type === 'arm_and_takeoff') {
                            physics.arm(true);
                            physics.setMode('AUTOPILOT');
                            const p = physics.getPosition();
                            const alt = (cmd.params as any)?.altitude || 15;
                            physics.setAutopilotTarget(p[0], p[1] + alt, p[2]);
                        } else if (cmd.type === 'land') {
                            physics.setMode('AUTOPILOT');
                            const p = physics.getPosition();
                            physics.setAutopilotTarget(p[0], currentMapDef.groundElevation + 0.1, p[2]);
                        } else if (cmd.type === 'emergency_stop') {
                            physics.arm(false);
                        }
                    }
                } catch (err) {}
            };
            ws.onclose = () => {
                setTimeout(connectWS, 3000);
            };
        } catch (e) {
            setTimeout(connectWS, 3000);
        }
    }
    connectWS();

    // Configure the authoritative backend world for the initial sector
    {
        const apiBase = window.location.port === '5173'
            ? `${window.location.protocol}//${window.location.hostname || 'localhost'}:3001`
            : window.location.origin;
        fetch(`${apiBase}/api/v1/world/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mapId: currentMapDef.id,
                spawn: currentMapDef.spawnPos,
                groundElevation: currentMapDef.groundElevation,
                worldRadius: 950,
            }),
        }).catch(() => {});
    }

    // 6. Game Loop: Fixed Timestep Physics (250Hz) + WebGPU Render
    let lastTime = performance.now();
    let physicsAccumulator = 0;
    const physicsDt = 1.0 / 250.0;
    let lastTelemetrySend = 0;

    // War AI effect callbacks are allocated once, not per frame
    const warCallbacks = weaponSystem.createWarCallbacks(soundManager);

    // Ground clamp, structure collision & entity strike passes, shared by the
    // local 250Hz path and the backend-authoritative single-pass path.
    function runCollisionPass(
        subPos: [number, number, number],
        subVel: [number, number, number],
        prevPos: [number, number, number],
        prevVelY: number,
        axes: { throttle: number; pitch: number; roll: number },
        masterHeadingDeg: number
    ): void {
        const groundY = collisionSystem.getGroundHeight(
            currentMapDef.id,
            subPos[0],
            subPos[2],
            currentMapDef.groundElevation
        );
        const minGroundY = groundY + REALTIME.landingClearanceM; // Drone landing clearance buffer
        if (subPos[1] < minGroundY) {
            subPos[1] = minGroundY;
            // Severe downward impact or extreme tilt into ground -> Kamikaze Detonation
            if (!isCrashed && (prevVelY < REALTIME.impactVelY || Math.abs(currentPitchDeg) > REALTIME.impactTiltDeg || Math.abs(currentRollDeg) > REALTIME.impactTiltDeg)) {
                triggerKamikazeDetonation("HIGH-SPEED GROUND IMPACT", [subPos[0], minGroundY, subPos[2]], null);
            }
            if (subVel[1] < 0) subVel[1] = 0;
            // If landed on ground and neutral, stabilize upright
            if (!isCrashed && axes.throttle <= 0 && Math.hypot(axes.pitch, axes.roll) <= 0.05) {
                currentRollDeg *= 0.85;
                currentPitchDeg *= 0.85;
                physics.setRotation(currentRollDeg, currentPitchDeg, masterHeadingDeg);
            }
        }

        // Strict Continuous Collision vs Buildings & Structures -> DETONATES ON IMPACT
        const col = collisionSystem.resolveDroneCollision(subPos, subVel, 0.45, prevPos, groundY);
        if (col.hit && !isCrashed) {
            triggerKamikazeDetonation(col.obstacleName || 'OBSTACLE / STRUCTURE', [subPos[0], subPos[1], subPos[2]], null);
        }

        // Collision vs Moving Entities (Hostile Tanks & Soldiers) -> DIRECT KAMIKAZE STRIKE
        if (!isCrashed) {
            for (const ent of entityManager.entities) {
                if (!ent.isAlive) continue;
                const entMinY = ent.pos[1];
                const entMaxY = ent.pos[1] + ent.height;
                if (subPos[1] >= entMinY - 0.45 && subPos[1] <= entMaxY + 0.45) {
                    const dXZ = Math.hypot(subPos[0] - ent.pos[0], subPos[2] - ent.pos[2]);
                    if (dXZ < 0.55 + ent.radius) {
                        triggerKamikazeDetonation(ent.roleName.toUpperCase(), [subPos[0], subPos[1], subPos[2]], ent);
                        break;
                    }
                }
            }
        }
    }

    // Vertical velocity from the previous authoritative pose, used to detect
    // lethal descent (impact) while the backend owns the airframe.
    let lastAuthVelY = 0;

    function frame(now: number) {
        const deltaSec = Math.min((now - lastTime) / 1000.0, 0.1);
        lastTime = now;

        // Input update & Mouse Look / Zoom
        input.update();

        // Control arbitration: remote LiveKit teleop > in-browser AI follow > human keyboard
        const isRemoteTeleoperating = livekit.isTeleoperating();
        const aiAxes = browserAI.update(deltaSec, {
            canvas,
            camera,
            physics,
            entityManager,
            isCrashed,
            humanInputActive: input.hasAnyFlightInput(),
        });

        let inThrottle = input.throttle;
        let inPitch = input.pitch;
        let inRoll = input.roll;
        let inYaw = input.yaw;

        if (isRemoteTeleoperating) {
            // Apply remote continuous teleoperation axes directly from LiveKit
            inThrottle = livekit.teleopAxes.throttle;
            inPitch = livekit.teleopAxes.pitch;
            inRoll = livekit.teleopAxes.roll;
            inYaw = livekit.teleopAxes.yaw;

            if (!physics.isArmed() && !isCrashed && (Math.abs(inThrottle) > 0.05 || Math.abs(inPitch) > 0.05 || Math.abs(inRoll) > 0.05)) {
                physics.arm(true);
            }
        } else if (aiAxes && !isCrashed) {
            // In-browser autonomy (RT-DETR + PPO over ONNX Runtime Web) is flying
            inThrottle = aiAxes.throttle;
            inPitch = aiAxes.pitch;
            inRoll = aiAxes.roll;
            inYaw = aiAxes.yaw;

            if (!physics.isArmed() && (Math.abs(inThrottle) > 0.05 || Math.abs(inPitch) > 0.05 || Math.abs(inRoll) > 0.05)) {
                physics.arm(true);
            }
        } else if (input.hasAnyFlightInput() && !physics.isArmed() && !isCrashed) {
            physics.arm(true);
        }

        // Stream resolved control axes to the authoritative backend sim (30Hz)
        if (realtimeEnabled && ws && ws.readyState === WebSocket.OPEN && now - lastAxesSend >= 1000 / REALTIME.axesStreamHz) {
            lastAxesSend = now;
            if (!isCrashed) {
                ws.send(JSON.stringify({
                    type: 'game:axes',
                    axes: { throttle: inThrottle, pitch: inPitch, roll: inRoll, yaw: inYaw, headingDeg: camera.mouseOrbitYaw * (180.0 / Math.PI) },
                    timestamp: Date.now(),
                }));
            }
        }

        const mouse = input.consumeMouseDelta();
        const zoom = input.consumeMouseZoom();
        camera.applyMouseDelta(mouse.dx, mouse.dy, zoom);

        // Turn flight heading & camera view left/right (supports both local Q/E and remote LiveKit yaw)
        if (inYaw !== 0 && !isCrashed) {
            camera.mouseOrbitYaw += inYaw * 0.035;
        }

        // Auto-deploy next drone after 2.2s detonation inspection when mission is active and drones remain
        if (isCrashed && missionManager.missionStatus === 'ACTIVE' && missionManager.dronesRemaining > 0 && (now - crashTime >= 2200)) {
            deployNextDrone();
        }

        // Emit residual smoke & sparks while airframe is crashed
        if (isCrashed && (now - crashTime < 4500) && Math.random() < 0.25) {
            const curPos = physics.getPosition();
            weaponSystem.spawnImpactParticles(curPos, [0, 1, 0], [0.4, 0.4, 0.4, 0.7], 2);
        }

        // Apply Speed Mode dynamic profile & performance controls
        const currentSpeedMode = speedModes[speedModeIndex];
        const profile = speedProfiles[currentSpeedMode];

        // Authoritative backend pose overrides local integration when realtime link is healthy
        const rtPose = realtimePose();

        // Direct master heading (in degrees) from camera mouse orientation
        const masterHeadingDeg = camera.mouseOrbitYaw * (180.0 / Math.PI);
        if (rtPose) {
            physics.setPosition(rtPose.pos[0], rtPose.pos[1], rtPose.pos[2]);
            physics.setVelocity(rtPose.vel[0], rtPose.vel[1], rtPose.vel[2]);
            physics.setRotation(rtPose.rollDeg, rtPose.pitchDeg, masterHeadingDeg);
            currentRollDeg = rtPose.rollDeg;
            currentPitchDeg = rtPose.pitchDeg;
        } else if (!isCrashed) {
            physics.setManualInput(inThrottle, inPitch, inRoll, masterHeadingDeg);
        } else {
            physics.setManualInput(0, 0, 0, masterHeadingDeg);
        }

        // Two simulation paths:
        //  • backend-authoritative — the server's 50Hz flight model owns pos/vel;
        //    WASM is stepped once per frame only to derive sensors & motor RPMs,
        //    then authority is restored so the rendered drone IS the backend drone.
        //  • local — the C++ WASM engine substeps at 250Hz with JS dynamics assist.
        physicsAccumulator += deltaSec;

        if (rtPose) {
            const prevPos = physics.getPosition();
            const prevVelY = lastAuthVelY;
            physics.step(Math.min(deltaSec, 0.05)); // sensor + RPM derivation only
            const subPos: [number, number, number] = [rtPose.pos[0], rtPose.pos[1], rtPose.pos[2]];
            const subVel: [number, number, number] = [rtPose.vel[0], rtPose.vel[1], rtPose.vel[2]];

            runCollisionPass(subPos, subVel, prevPos, prevVelY, { throttle: inThrottle, pitch: inPitch, roll: inRoll }, masterHeadingDeg);

            physics.setPosition(subPos[0], subPos[1], subPos[2]);
            physics.setVelocity(subVel[0], subVel[1], subVel[2]);
            lastAuthVelY = subVel[1];
            physicsAccumulator = 0;
        } else {
            let substepGuard = 40; // anti-spin guard on frame hiccups
            while (physicsAccumulator >= physicsDt && substepGuard-- > 0) {
                const prevPos = physics.getPosition();
                const prevVelY = physics.getVelocity()[1];
                physics.step(physicsDt);
                physicsAccumulator -= physicsDt;

                const subPos = physics.getPosition();
                const subVel = physics.getVelocity();

                // When armed, NOT crashed, and in MANUAL flight mode: apply responsive flight dynamics assist
                if (!isCrashed && physics.isArmed() && physics.getMode() === 'MANUAL') {
                    const masterYawRad = camera.mouseOrbitYaw;
                    const fwdX = Math.sin(masterYawRad);
                    const fwdZ = Math.cos(masterYawRad);
                    const rgtX = Math.cos(masterYawRad);
                    const rgtZ = -Math.sin(masterYawRad);

                    // Equal authority for forward/back (pitch) and strafe left/right (roll)
                    let subInP = inPitch;
                    let subInR = inRoll;
                    const inputMag = Math.hypot(subInP, subInR);
                    if (inputMag > 1.0) {
                        subInP /= inputMag;
                        subInR /= inputMag;
                    }

                    // 1. Horizontal Flight (WASD + Remote Teleop + Speed Mode Scaling)
                    if (inputMag > 0.02) {
                        const targetVx = (fwdX * subInP + rgtX * subInR) * profile.maxSpeed;
                        const targetVz = (fwdZ * subInP + rgtZ * subInR) * profile.maxSpeed;
                        const blendH = Math.min(1.0, physicsDt * profile.accelRate);
                        subVel[0] += (targetVx - subVel[0]) * blendH;
                        subVel[2] += (targetVz - subVel[2]) * blendH;
                    } else {
                        // Crisp Air-Brakes: halts horizontal drift smoothly and instantly
                        const blendBrake = Math.min(1.0, physicsDt * profile.brakeRate);
                        subVel[0] += (0.0 - subVel[0]) * blendBrake;
                        subVel[2] += (0.0 - subVel[2]) * blendBrake;
                        if (Math.hypot(subVel[0], subVel[2]) < 0.10) {
                            subVel[0] = 0;
                            subVel[2] = 0;
                        }
                    }

                    // 2. Vertical Flight (Shift / Space for climb, Ctrl / C for descent, or remote teleop)
                    if (inThrottle > 0.05) {
                        const targetVy = profile.climbSpeed * inThrottle;
                        const blendClimb = Math.min(1.0, physicsDt * 18.0);
                        subVel[1] += (targetVy - subVel[1]) * blendClimb;
                    } else if (inThrottle < -0.05) {
                        const targetVy = -profile.descentSpeed * Math.abs(inThrottle);
                        const blendDescend = Math.min(1.0, physicsDt * 18.0);
                        subVel[1] += (targetVy - subVel[1]) * blendDescend;
                    } else {
                        // Active Altitude Hold when vertical input is neutral
                        const blendHover = Math.min(1.0, physicsDt * 14.0);
                        subVel[1] += (0.0 - subVel[1]) * blendHover;
                        if (Math.abs(subVel[1]) < 0.05) subVel[1] = 0;
                    }

                    // Integrate position accurately with enhanced subVel
                    subPos[0] = prevPos[0] + subVel[0] * physicsDt;
                    subPos[1] = prevPos[1] + subVel[1] * physicsDt;
                    subPos[2] = prevPos[2] + subVel[2] * physicsDt;

                    // 3. Dynamic Visual Banking & Pitch Tilt
                    const targetPitch = subInP * profile.maxTiltDeg;
                    let targetRoll = subInR * profile.maxTiltDeg;
                    if (inYaw !== 0) {
                        targetRoll += inYaw * 10.0;
                    }
                    const blendTilt = Math.min(1.0, physicsDt * 22.0);
                    currentRollDeg += (targetRoll - currentRollDeg) * blendTilt;
                    currentPitchDeg += (targetPitch - currentPitchDeg) * blendTilt;
                    physics.setRotation(currentRollDeg, currentPitchDeg, masterHeadingDeg);
                } else if (isCrashed) {
                    // When crashed: zero propulsion, friction on ground, gravity pulls down
                    subVel[0] *= 0.90;
                    subVel[2] *= 0.90;
                    subVel[1] -= 9.81 * physicsDt;
                    subPos[0] = prevPos[0] + subVel[0] * physicsDt;
                    subPos[1] = prevPos[1] + subVel[1] * physicsDt;
                    subPos[2] = prevPos[2] + subVel[2] * physicsDt;
                }

                runCollisionPass(subPos, subVel, prevPos, prevVelY, { throttle: inThrottle, pitch: inPitch, roll: inRoll }, masterHeadingDeg);

                physics.setPosition(subPos[0], subPos[1], subPos[2]);
                physics.setVelocity(subVel[0], subVel[1], subVel[2]);
            }
        }

        // Get updated physics state from WASM
        const pos = physics.getPosition();
        const rot = physics.getRotation();
        const vel = physics.getVelocity();
        const motorRPMs = physics.getMotorRPMs();
        const sensors = physics.getSensors();
        const isArmed = physics.isArmed();
        const mode = physics.getMode();

        // Authoritative battery from the backend sim replaces the local WASM gauge
        const authBatteryPct = rtPose ? rtPose.batteryPct : sensors.batteryPct;

        // 2. Update Real-Time Battlefield War AI (Tanks & Soldier Battalions)
        entityManager.update(
            deltaSec,
            pos,
            (x, z) => collisionSystem.getGroundHeight(currentMapDef.id, x, z, currentMapDef.groundElevation),
            warCallbacks
        );

        // 3. Update Drone Explosive Warhead & Battlefield Ordnance (Tank Shells, Tracers, Artillery)
        weaponSystem.update(
            deltaSec,
            collisionSystem,
            entityManager,
            missionManager,
            soundManager,
            currentMapDef.id,
            currentMapDef.groundElevation,
            pos
        );

        // Check if a Hostile Tank Shell directly struck the player's drone
        if (!isCrashed) {
            for (let i = weaponSystem.projectiles.length - 1; i >= 0; --i) {
                const pr = weaponSystem.projectiles[i];
                if (pr.faction === 'HOSTILE' && (pr.kind === 'SAM_MISSILE' || pr.kind === 'TANK_SHELL')) {
                    const dDrone = Math.hypot(pr.pos[0] - pos[0], pr.pos[1] - pos[1], pr.pos[2] - pos[2]);
                    if (dDrone < 1.65) {
                        weaponSystem.projectiles.splice(i, 1);
                        triggerKamikazeDetonation(`INTERCEPTED BY HOSTILE ${pr.kind === 'SAM_MISSILE' ? 'MISSILE' : 'TANK SHELL'}`, [pos[0], pos[1], pos[2]], null);
                        break;
                    }
                }
            }
        }

        const groundSpeed = Math.sqrt(vel[0]*vel[0] + vel[2]*vel[2]);

        // Update Mission checkpoints & racing timer
        missionManager.update(pos, deltaSec);

        // Update Sound Synthesizer
        soundManager.update(isArmed, motorRPMs, groundSpeed, vel[1]);

        // Update Camera (strictly clamped above local terrain/ground elevation)
        const aspect = canvas.width / canvas.height;
        const groundAtCam = collisionSystem.getGroundHeight(
            currentMapDef.id,
            camera.position[0],
            camera.position[2],
            currentMapDef.groundElevation
        );
        camera.update(pos, rot[2], aspect, groundAtCam, rot[0]);

        // Aim Focus, Lock-On Tracking & Kamikaze Closure Speed Calculation
        const aimFocus = weaponSystem.updateTargetLock(
            camera,
            collisionSystem,
            entityManager,
            soundManager,
            deltaSec,
            currentMapDef.id,
            vel
        );

        // Update HUD with Kamikaze Reticle, Target Markers, Fleet Counter & Score
        hud.update(
            sensors,
            pos,
            vel,
            rot,
            isArmed && !isCrashed,
            isCrashed ? 'CRASHED' : mode,
            currentSpeedMode,
            camera.mode,
            missionManager.notificationText,
            soundManager.getMuted(),
            isCrashed,
            crashReason,
            weaponSystem.hitMarkerTimer,
            weaponSystem.hitMarkerText,
            aimFocus,
            input.isPointerLocked,
            camera,
            livekit.getMetrics(),
            browserAI.getDetectionsForHud() ?? livekit.getLatestDetections(),
            missionManager.getStats(),
            entityManager.getAliveHostileTargets()
        );

        hud.setAiDisplay(browserAI.getMode(), browserAI.getStatus());
        if (now - lastRealtimeDisplay >= 200) {
            lastRealtimeDisplay = now;
            hud.setRealtimeDisplay(realtimeEnabled, worldSnap, snapLatencyMs);
        }

        // Send telemetry to server & LiveKit DataChannel at 10Hz
        if (now - lastTelemetrySend >= 100) {
            lastTelemetrySend = now;
            const telemetry: Telemetry = {
                timestamp: Date.now(),
                state: isCrashed ? DroneFlightState.EMERGENCY_LANDING : (isArmed ? (sensors.altitudeAGL > 0.5 ? DroneFlightState.HOVERING : DroneFlightState.ARMED) : DroneFlightState.IDLE),
                flightMode: mode === 'MANUAL' ? FlightMode.MANUAL : FlightMode.AUTOPILOT,
                armed: isArmed && !isCrashed,
                position: {
                    latitude: sensors.latitude,
                    longitude: sensors.longitude,
                    altitude_amsl: sensors.altitudeAMSL,
                    altitude_agl: sensors.altitudeAGL,
                },
                attitude: {
                    roll: rot[0],
                    pitch: rot[1],
                    yaw: rot[2],
                    rollRate: sensors.gyro[0],
                    pitchRate: sensors.gyro[1],
                    yawRate: sensors.gyro[2],
                },
                groundSpeed: groundSpeed,
                verticalSpeed: vel[1],
                heading: ((rot[2] % 360) + 360) % 360,
                battery: {
                    voltage: 22.2 * (0.6 + 0.4 * (authBatteryPct / 100)),
                    current: 5.0,
                    percentage: authBatteryPct,
                    remainingTime: 1200,
                    cellCount: 4,
                    temperature: 30,
                },
                gps: {
                    fix: GPSFixType.FIX_3D,
                    satellites: 12,
                    hdop: 0.9,
                    vdop: 1.1,
                    position: {
                        latitude: sensors.latitude,
                        longitude: sensors.longitude,
                        altitude_amsl: sensors.altitudeAMSL,
                        altitude_agl: sensors.altitudeAGL,
                    }
                },
                wind: { speed: 1.5, direction: 180 },
                sensors: {
                    imu: SensorStatus.HEALTHY,
                    compass: SensorStatus.HEALTHY,
                    barometer: SensorStatus.HEALTHY,
                    gps: SensorStatus.HEALTHY,
                    rangefinder: SensorStatus.HEALTHY,
                    cameraForward: SensorStatus.HEALTHY,
                    cameraDown: SensorStatus.NOT_PRESENT,
                },
                rangefinderAlt: sensors.rangefinder,
            };

            // 1. WebSocket Telemetry (Backend 1)
            if (ws && ws.readyState === WebSocket.OPEN) {
                const targetStates: WorldTargetState[] = entityManager.entities
                    .filter(e => e.faction === 'HOSTILE')
                    .map(e => ({
                        id: e.id,
                        roleName: e.roleName,
                        type: e.type,
                        pos: [e.pos[0], e.pos[1], e.pos[2]],
                        radius: e.radius,
                        height: e.height,
                        isAlive: e.isAlive,
                    }));
                ws.send(JSON.stringify({
                    type: 'game:telemetry',
                    telemetry,
                    mission: missionManager.getStats(),
                    targets: targetStates,
                }));
            }

            // 2. LiveKit Robotics Data Channel (Sub-100ms Telemetry Transport)
            livekit.publishTelemetry(telemetry, missionManager.getStats());
        }

        // WebGPU Render Pass
        const commandEncoder = gpu.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: gpu.context.getCurrentTexture().createView(),
                clearValue: { r: 0.45, g: 0.65, b: 0.88, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: gpu.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });

        const timeSec = now / 1000.0;

        // 1. Draw Atmospheric Sky
        skyRenderer.render(renderPass, camera, timeSec);

        // 2. Draw Active Map
        if (currentMapDef.id === 'airfield') {
            terrainRenderer.render(renderPass, camera, timeSec);
            structuresRenderer.render(renderPass, camera, timeSec);
        } else {
            cityMapRenderer.render(renderPass, camera, timeSec);
        }

        // 3. Draw Drone 3D Custom Model (only when in external CHASE mode)
        if (camera.mode === 'CHASE') {
            modelRenderer.render(renderPass, camera, pos, [-rot[0], rot[1], rot[2]], 2.0, timeSec);
        }

        // 4. Draw Combat Elements: Simple Box Tanks, Soldiers, Ordnance & Explosions
        combatRenderer.render(renderPass, camera, entityManager, weaponSystem, timeSec);

        renderPass.end();
        gpu.device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

bootstrap().catch(err => {
    console.error("Bootstrap error:", err);
    const errEl = document.getElementById('error-console');
    if (errEl) {
        errEl.style.display = 'block';
        errEl.innerHTML = `<div><b>Bootstrap Error:</b> ${err.stack || err.message || err}</div>`;
    }
});
