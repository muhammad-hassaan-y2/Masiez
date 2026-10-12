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
import { EntityManager } from './gameplay/EntityManager';
import { WeaponSystem } from './gameplay/WeaponSystem';
import { CombatRenderer } from './gpu/CombatRenderer';
import { Camera } from './scene/Camera';
import { CameraStreamer } from './camera/CameraStreamer';
import { LiveKitRoboticsClient } from './network/LiveKitRoboticsClient';
import { InputManager } from './input/InputManager';
import { HUD } from './hud/HUD';
import { Telemetry, DroneFlightState, FlightMode, GPSFixType, SensorStatus } from 'drone-autonomy-shared';

type SpeedMode = 'CRUISE' | 'SPORT' | 'TURBO';

async function bootstrap() {
    console.log("=== Initializing Masiez C++ / WebGPU Drone Simulation ===");

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

    // 4. Combat Systems: Building Collisions, Moving Entities & Weapons
    const collisionSystem = new CollisionSystem();
    const entityManager = new EntityManager();
    const weaponSystem = new WeaponSystem();
    const combatRenderer = new CombatRenderer(gpu);
    await combatRenderer.init();

    // 5. Camera, Input, HUD, Streamer
    const camera = new Camera();
    camera.mode = 'FPV'; // Default to First Person Operator View
    const input = new InputManager(canvas);
    const hud = new HUD();
    const cameraStreamer = new CameraStreamer(canvas);
    const livekit = new LiveKitRoboticsClient();

    // Flight Speed Modes & Dynamic Performance Profiles
    const speedModes: SpeedMode[] = ['CRUISE', 'SPORT', 'TURBO'];
    let speedModeIndex = 0;

    interface SpeedProfile {
        maxSpeed: number;       // Top horizontal speed (m/s)
        climbSpeed: number;     // Vertical climb speed (m/s)
        descentSpeed: number;   // Controlled descent speed (m/s)
        accelRate: number;      // Acceleration sharpness (1/s)
        brakeRate: number;      // Air brake deceleration sharpness (1/s)
        maxTiltDeg: number;     // Visual banking and pitch tilt limit (degrees)
    }

    const speedProfiles: Record<SpeedMode, SpeedProfile> = {
        'CRUISE': {
            maxSpeed: 20.0,      // ~72 km/h: Smooth, stable, agile exploration & target aiming
            climbSpeed: 8.5,     // Responsive vertical climb
            descentSpeed: 6.0,   // Controlled descent
            accelRate: 20.0,     // 0.25s snappy response
            brakeRate: 16.0,     // Crisp stop without glide
            maxTiltDeg: 22.0,    // Stable tilt
        },
        'SPORT': {
            maxSpeed: 36.0,      // ~130 km/h: High-performance tactical fighter dogfighting
            climbSpeed: 16.0,    // Rapid evasive climb
            descentSpeed: 11.0,  // Fast dive descent
            accelRate: 25.0,     // Punchy instant acceleration
            brakeRate: 20.0,     // Instant air-brakes
            maxTiltDeg: 32.0,    // Aggressive racing banking
        },
        'TURBO': {
            maxSpeed: 55.0,      // ~198 km/h: Hypersonic dash across vast maps
            climbSpeed: 26.0,    // Rocket-like vertical burst
            descentSpeed: 16.0,  // High-speed descent
            accelRate: 30.0,     // Hypersonic racer throttle
            brakeRate: 24.0,     // Authoritative air-brakes
            maxTiltDeg: 42.0,    // Extreme high-g racing tilt
        },
    };

    let currentRollDeg = 0;
    let currentPitchDeg = 0;

    // Crash Detection & Recovery State
    let isCrashed = false;
    let crashReason = "";
    let crashTime = 0;

    function triggerCrash(reason: string, hitPos?: [number, number, number]) {
        if (isCrashed) return;
        isCrashed = true;
        crashReason = reason;
        crashTime = performance.now();
        physics.arm(false);

        soundManager.playCrash();

        const crashPt = hitPos || physics.getPosition();
        weaponSystem.spawnImpactParticles(crashPt, [0, 1, 0], [1.0, 0.35, 0.05, 1.0], 50);
        weaponSystem.spawnImpactParticles(crashPt, [0, 1, 0], [0.8, 0.8, 0.8, 1.0], 35);
        weaponSystem.spawnImpactParticles(crashPt, [0, 1, 0], [1.0, 0.85, 0.2, 1.0], 30);

        const curVel = physics.getVelocity();
        physics.setVelocity(curVel[0] * 0.15, Math.min(curVel[1], -1.5), curVel[2] * 0.15);
        currentRollDeg += (Math.random() - 0.5) * 80;
        currentPitchDeg += (Math.random() - 0.5) * 80;

        console.warn(`[CRASH] Drone crashed: ${reason}`);
        missionManager.showNotification(`CRITICAL FAILURE: ${reason.toUpperCase()}`);
    }

    function recoverDrone() {
        isCrashed = false;
        crashReason = "";
        physics.arm(false);
        physics.setMode('MANUAL');
        physics.resetPosition(currentMapDef.spawnPos[0], currentMapDef.spawnPos[1], currentMapDef.spawnPos[2]);
        physics.setVelocity(0, 0, 0);
        physics.setRotation(0, 0, 0);
        currentRollDeg = 0;
        currentPitchDeg = 0;
        camera.mouseOrbitYaw = 0;
        camera.mouseOrbitPitch = 0;
        soundManager.playTargetAcquired();
        missionManager.showNotification("DRONE RECOVERED & READY AT BASE");
        console.log("[Drone] Airframe recovered & restored at base");
    }

    // Active Map Management: Start directly on Tactical Airfield Runway (Original First Map)
    let currentMapDef: MapDefinition = MAP_CATALOG[0];
    hud.setActiveMapButton(currentMapDef.id);
    missionManager.loadCourse(currentMapDef.id);
    physics.setGroundOffset(currentMapDef.groundElevation);
    physics.resetPosition(currentMapDef.spawnPos[0], currentMapDef.spawnPos[1], currentMapDef.spawnPos[2]);
    camera.baseDistance = currentMapDef.camDistance;
    camera.currentGroundElevation = currentMapDef.groundElevation;
    physics.clearHeightmap();

    // Initialize colliders & entities immediately for Map 1 (Tactical Airfield)
    collisionSystem.clearColliders();
    collisionSystem.initAirfieldColliders();
    entityManager.initAirfieldEntities();

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

        // Load new course
        missionManager.loadCourse(mapDef.id);
        soundManager.playTargetAcquired();
        missionManager.showNotification(`SECTOR DEPLOYED: ${mapDef.name.toUpperCase()}`);

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

        console.log(`[Game] Switched to map: ${mapDef.name} (${collisionSystem['aabbs']?.length || 0} AABB colliders, ${collisionSystem['cylinders']?.length || 0} cylinders)`);
    }

    // Input Handlers
    input.onShoot = () => {
        if (isCrashed) return;
        const curPos = physics.getPosition();
        const curRot = physics.getRotation();
        const curVel = physics.getVelocity();
        weaponSystem.fire(
            curPos,
            curRot,
            curVel,
            camera,
            collisionSystem,
            entityManager,
            soundManager,
            performance.now() / 1000.0,
            currentMapDef.id
        );
    };

    input.onArmToggle = () => {
        if (isCrashed) {
            recoverDrone();
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
            recoverDrone();
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

    input.onMapSelectKey = (idx: number) => {
        if (idx >= 0 && idx < MAP_CATALOG.length) {
            switchMap(MAP_CATALOG[idx]);
        }
    };

    input.onScopeToggle = () => {
        camera.toggleScope();
        input.isScoped = camera.isScoped;
        soundManager.playScopeZoom(camera.scopeGear);
        missionManager.showNotification(camera.isScoped ? `SCOPE ACTIVE: ${camera.scopeGear}X` : "SCOPE DEACTIVATED");
    };

    input.onScopeGearChange = (forward: boolean) => {
        camera.cycleScopeGear(forward);
        input.isScoped = camera.isScoped;
        soundManager.playScopeZoom(camera.scopeGear);
        missionManager.showNotification(`SCOPE GEAR: ${camera.scopeGear}X`);
    };

    input.onLockTarget = () => {
        weaponSystem.toggleLock(camera, entityManager, soundManager);
        if (weaponSystem.lockedEntity) {
            missionManager.showNotification(`TARGET LOCKED: ${weaponSystem.lockedEntity.roleName.toUpperCase()}`);
        } else {
            missionManager.showNotification("TARGET LOCK DISENGAGED");
        }
    };

    input.onEmergencyStop = () => {
        physics.arm(false);
        console.log("EMERGENCY STOP!");
    };

    // HUD Button Handlers
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

    input.onStreamToggle = () => {
        const active = cameraStreamer.toggleStreaming();
        missionManager.showNotification(active ? "CAM STREAM ACTIVATED (LIVE)" : "CAM STREAM PAUSED");
    };

    hud.onStreamToggle = () => {
        input.onStreamToggle();
    };

    hud.onRecoverDrone = () => {
        recoverDrone();
    };

    hud.onCameraToggle = () => {
        input.onCameraToggle();
    };

    // 5. Connect to LiveKit Robotics SFU (WebRTC Video Streaming & Low-Latency Data Channels)
    livekit.connect(canvas).then(ok => {
        if (ok) {
            missionManager.showNotification("LIVEKIT ROBOTICS: STREAMING FPV [WEBRTC]");
        }
    }).catch(err => {
        console.warn("[LiveKit] Init notice:", err);
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
        }
    };

    hud.onLiveKitToggle = () => {
        if (livekit.status === 'streaming' || livekit.status === 'connected') {
            livekit.disconnect();
            missionManager.showNotification("LIVEKIT STREAM DISCONNECTED");
        } else {
            livekit.connect(canvas);
            missionManager.showNotification("CONNECTING TO LIVEKIT...");
        }
    };

    // 6. Connect to Backend 1 (WebSocket)
    let ws: WebSocket | null = null;
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
                    if (msg.type === 'server:command') {
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

    // 6. Game Loop: Fixed Timestep Physics (250Hz) + WebGPU Render
    let lastTime = performance.now();
    let physicsAccumulator = 0;
    const physicsDt = 1.0 / 250.0;
    let lastTelemetrySend = 0;

    function frame(now: number) {
        const deltaSec = Math.min((now - lastTime) / 1000.0, 0.1);
        lastTime = now;

        // Input update & Mouse Look / Zoom
        input.update();

        // Auto-arm on any flight input (only if not crashed)
        if (input.hasAnyFlightInput() && !physics.isArmed() && !isCrashed) {
            physics.arm(true);
        }

        const mouse = input.consumeMouseDelta();
        const zoom = input.consumeMouseZoom();
        camera.applyMouseDelta(mouse.dx, mouse.dy, zoom);

        // Q / E: Smoothly turn flight heading & camera view left/right
        if (input.yaw !== 0 && !isCrashed) {
            camera.mouseOrbitYaw += input.yaw * 0.035;
        }

        // Auto-fire while fire button/key is held down
        if (input.isShooting && !isCrashed) {
            weaponSystem.fire(
                physics.getPosition(),
                physics.getRotation(),
                physics.getVelocity(),
                camera,
                collisionSystem,
                entityManager,
                soundManager,
                now / 1000.0,
                currentMapDef.id
            );
        }

        // Emit residual smoke & sparks while airframe is crashed
        if (isCrashed && (now - crashTime < 4500) && Math.random() < 0.25) {
            const curPos = physics.getPosition();
            weaponSystem.spawnImpactParticles(curPos, [0, 1, 0], [0.4, 0.4, 0.4, 0.7], 2);
        }

        // Apply Speed Mode dynamic profile & performance controls
        const currentSpeedMode = speedModes[speedModeIndex];
        const profile = speedProfiles[currentSpeedMode];

        // Direct master heading (in degrees) from camera mouse orientation
        const masterHeadingDeg = camera.mouseOrbitYaw * (180.0 / Math.PI);
        if (!isCrashed) {
            physics.setManualInput(input.throttle, input.pitch, input.roll, masterHeadingDeg);
        } else {
            physics.setManualInput(0, 0, 0, masterHeadingDeg);
        }

        // Fixed-timestep C++ simulation steps (250Hz sub-stepping with high-agility movement, continuous collision & ground clamp)
        physicsAccumulator += deltaSec;

        while (physicsAccumulator >= physicsDt) {
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
                let inP = input.pitch;
                let inR = input.roll;
                const inputMag = Math.hypot(inP, inR);
                if (inputMag > 1.0) {
                    inP /= inputMag;
                    inR /= inputMag;
                }

                // 1. Horizontal Flight (WASD + Speed Mode Scaling)
                if (inputMag > 0.02) {
                    const targetVx = (fwdX * inP + rgtX * inR) * profile.maxSpeed;
                    const targetVz = (fwdZ * inP + rgtZ * inR) * profile.maxSpeed;
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

                // 2. Vertical Flight (Shift / Space for climb, Ctrl / C for descent)
                if (input.throttle > 0.05) {
                    const targetVy = profile.climbSpeed * input.throttle;
                    const blendClimb = Math.min(1.0, physicsDt * 18.0);
                    subVel[1] += (targetVy - subVel[1]) * blendClimb;
                } else if (input.throttle < -0.05) {
                    const targetVy = -profile.descentSpeed * Math.abs(input.throttle);
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
                const targetPitch = inP * profile.maxTiltDeg;
                let targetRoll = inR * profile.maxTiltDeg;
                if (input.yaw !== 0) {
                    targetRoll += input.yaw * 10.0;
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

            // 1. Strict Ground Height Clamp on EVERY sub-step
            const groundY = collisionSystem.getGroundHeight(
                currentMapDef.id,
                subPos[0],
                subPos[2],
                currentMapDef.groundElevation
            );
            const minGroundY = groundY + 0.28; // Drone landing clearance buffer
            if (subPos[1] < minGroundY) {
                subPos[1] = minGroundY;
                // Severe downward impact or extreme tilt into ground -> CRASH
                if (!isCrashed && (prevVelY < -4.2 || Math.abs(currentPitchDeg) > 52 || Math.abs(currentRollDeg) > 52)) {
                    triggerCrash("HIGH-SPEED GROUND IMPACT", [subPos[0], minGroundY, subPos[2]]);
                }
                if (subVel[1] < 0) subVel[1] = 0;
                // If landed on ground and neutral, stabilize upright
                if (!isCrashed && input.throttle <= 0 && Math.hypot(input.pitch, input.roll) <= 0.05) {
                    currentRollDeg *= 0.85;
                    currentPitchDeg *= 0.85;
                    physics.setRotation(currentRollDeg, currentPitchDeg, masterHeadingDeg);
                }
            }

            // 2. Strict Continuous Collision vs Buildings & Structures on EVERY sub-step -> CRASHES ON ANY TOUCH
            const col = collisionSystem.resolveDroneCollision(subPos, subVel, 0.45, prevPos, groundY);
            if (col.hit) {
                if (!isCrashed) {
                    triggerCrash(col.obstacleName || 'OBSTACLE / STRUCTURE', [subPos[0], subPos[1], subPos[2]]);
                }
            }

            // 3. Collision vs Moving Entities (Tanks, Military Craft, Soldier Battalions, Patrol Rovers, Target Drones)
            if (!isCrashed) {
                for (const ent of entityManager.entities) {
                    if (!ent.isAlive) continue;
                    const entMinY = ent.pos[1] - (ent.type === 'FIGHTER_JET' || ent.type === 'ATTACK_HELI' ? ent.height * 0.5 : 0);
                    const entMaxY = ent.pos[1] + ent.height;
                    if (subPos[1] >= entMinY - 0.35 && subPos[1] <= entMaxY + 0.35) {
                        const dXZ = Math.hypot(subPos[0] - ent.pos[0], subPos[2] - ent.pos[2]);
                        if (dXZ < 0.45 + ent.radius) {
                            triggerCrash(ent.roleName.toUpperCase(), [subPos[0], subPos[1], subPos[2]]);
                            break;
                        }
                    }
                }
            }

            physics.setPosition(subPos[0], subPos[1], subPos[2]);
            physics.setVelocity(subVel[0], subVel[1], subVel[2]);
        }

        // Get updated physics state from WASM
        const pos = physics.getPosition();
        const rot = physics.getRotation();
        const vel = physics.getVelocity();
        const motorRPMs = physics.getMotorRPMs();
        const sensors = physics.getSensors();
        const isArmed = physics.isArmed();
        const mode = physics.getMode();

        // 2. Update Moving Entities (Tanks, SAM Trucks, Soldier Battalions, Military Craft, Rovers, Target Drones)
        entityManager.update(deltaSec, pos, (x, z) =>
            collisionSystem.getGroundHeight(currentMapDef.id, x, z, currentMapDef.groundElevation)
        );

        // 3. Update Drone Weapon System (Plasma Lasers & Explosive Impacts)
        weaponSystem.update(
            deltaSec,
            collisionSystem,
            entityManager,
            missionManager,
            soundManager,
            currentMapDef.id,
            currentMapDef.groundElevation
        );

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

        // Aim Focus, Lock-On Tracking & Predictive Lead Intercept Calculation
        const aimFocus = weaponSystem.updateTargetLock(
            camera,
            collisionSystem,
            entityManager,
            soundManager,
            deltaSec,
            currentMapDef.id
        );

        // Update HUD with Tactical Reticle, Scope Overlay & Lead Pip
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
            cameraStreamer.getMetrics(),
            livekit.getMetrics(),
            livekit.getLatestDetections()
        );

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
                    voltage: 22.2 * (0.6 + 0.4 * (sensors.batteryPct / 100)),
                    current: 5.0,
                    percentage: sensors.batteryPct,
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
                ws.send(JSON.stringify({
                    type: 'game:telemetry',
                    telemetry,
                }));
            }

            // 2. LiveKit Robotics Data Channel (Sub-100ms Telemetry Transport)
            livekit.publishTelemetry(telemetry);
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

        // 5. Draw Combat Elements: Moving Persons, Patrol Rover, Target Drones, Lasers & Explosions
        combatRenderer.render(renderPass, camera, entityManager, weaponSystem, timeSec);

        renderPass.end();
        gpu.device.queue.submit([commandEncoder.finish()]);

        // Camera Frame Streaming to Backend 1 & AI Agents
        cameraStreamer.update(
            ws,
            camera,
            now,
            pos,
            rot,
            groundSpeed,
            sensors.altitudeAGL
        );

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
