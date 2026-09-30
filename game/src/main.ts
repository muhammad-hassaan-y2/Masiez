import { GPUDeviceContext } from './gpu/Device';
import { PhysicsBridge } from './wasm/PhysicsBridge';
import { TerrainRenderer } from './gpu/TerrainRenderer';
import { StructuresRenderer } from './gpu/StructuresRenderer';
import { ModelRenderer } from './gpu/ModelRenderer';
import { SkyRenderer } from './gpu/SkyRenderer';
import { CityMapRenderer, MAP_CATALOG, MapDefinition } from './gpu/CityMapRenderer';
import { SoundManager } from './gameplay/SoundManager';
import { MissionManager } from './gameplay/MissionManager';
import { Camera } from './scene/Camera';
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

    // 4. Camera, Input, HUD
    const camera = new Camera();
    const input = new InputManager(canvas);
    const hud = new HUD();

    // Flight Speed Modes
    const speedModes: SpeedMode[] = ['CRUISE', 'SPORT', 'TURBO'];
    let speedModeIndex = 0;
    const speedMultipliers: Record<SpeedMode, number> = {
        'CRUISE': 1.0,
        'SPORT': 1.6,
        'TURBO': 2.4,
    };

    // Active Map Management: Start directly in Downtown Street Canyons with real buildings and streets
    let currentMapDef: MapDefinition = MAP_CATALOG[1];
    hud.setActiveMapButton(currentMapDef.id);
    missionManager.loadCourse(currentMapDef.id);
    physics.setGroundOffset(currentMapDef.groundElevation);
    physics.resetPosition(currentMapDef.spawnPos[0], currentMapDef.spawnPos[1], currentMapDef.spawnPos[2]);
    camera.baseDistance = currentMapDef.camDistance;

    // Stream the 3D city buildings immediately
    cityMapRenderer.loadMap(currentMapDef).catch(e => console.warn(e));

    async function switchMap(mapDef: MapDefinition) {
        hud.setActiveMapButton(mapDef.id);

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
        camera.baseDistance = mapDef.camDistance;

        // Load new course
        missionManager.loadCourse(mapDef.id);
        console.log(`[Game] Switched to map: ${mapDef.name}`);
    }

    // Input Handlers
    input.onArmToggle = () => {
        const nextArmed = !physics.isArmed();
        physics.arm(nextArmed);
        console.log(`Drone ${nextArmed ? 'ARMED' : 'DISARMED'}`);
    };

    input.onModeToggle = () => {
        const nextMode = physics.getMode() === 'MANUAL' ? 'AUTOPILOT' : 'MANUAL';
        physics.setMode(nextMode);
        console.log(`Flight Mode: ${nextMode}`);
    };

    input.onCameraToggle = () => {
        camera.mode = camera.mode === 'CHASE' ? 'FPV' : 'CHASE';
        console.log(`Camera Mode: ${camera.mode}`);
    };

    input.onSpeedToggle = () => {
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

    // 5. Connect to Backend 1 (WebSocket)
    let ws: WebSocket | null = null;
    function connectWS() {
        try {
            ws = new WebSocket('ws://localhost:3001/ws/game');
            ws.onopen = () => console.log("Connected to Backend 1 Game Server (ws://localhost:3001/ws/game)");
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

        // Auto-arm on any flight input
        if (input.hasAnyFlightInput() && !physics.isArmed()) {
            physics.arm(true);
        }

        const mouse = input.consumeMouseDelta();
        const zoom = input.consumeMouseZoom();
        camera.applyMouseDelta(mouse.dx, mouse.dy, zoom);

        // Smooth vehicle steering turn with A/D when not actively mouse dragging
        if (input.roll !== 0 && !input.isMouseDown && !input.isPointerLocked) {
            camera.mouseOrbitYaw += input.roll * 0.025;
        }

        // Apply Speed Mode multiplier to flight inputs
        const currentSpeedMode = speedModes[speedModeIndex];
        const speedMult = speedMultipliers[currentSpeedMode];
        const scaledPitch = input.pitch * speedMult;
        const scaledRoll = input.roll * speedMult;
        const scaledThrottle = input.throttle > 0 ? input.throttle * Math.min(1.5, speedMult) : input.throttle;

        // Direct master heading (in degrees) from camera mouse orientation
        const masterHeadingDeg = camera.mouseOrbitYaw * (180.0 / Math.PI);
        physics.setManualInput(scaledThrottle, scaledPitch, scaledRoll, masterHeadingDeg);

        // Fixed-timestep C++ simulation steps
        physicsAccumulator += deltaSec;
        while (physicsAccumulator >= physicsDt) {
            physics.step(physicsDt);
            physicsAccumulator -= physicsDt;
        }

        // Get updated physics state from WASM
        const pos = physics.getPosition();
        const rot = physics.getRotation();
        const vel = physics.getVelocity();
        const motorRPMs = physics.getMotorRPMs();
        const sensors = physics.getSensors();
        const isArmed = physics.isArmed();
        const mode = physics.getMode();

        const groundSpeed = Math.sqrt(vel[0]*vel[0] + vel[2]*vel[2]);

        // Update Mission checkpoints & racing timer
        missionManager.update(pos, deltaSec);

        // Update Sound Synthesizer
        soundManager.update(isArmed, motorRPMs, groundSpeed, vel[1]);

        // Update Camera
        const aspect = canvas.width / canvas.height;
        camera.update(pos, rot[2], aspect);

        // Update HUD
        hud.update(
            sensors,
            pos,
            vel,
            rot,
            isArmed,
            mode,
            currentSpeedMode,
            camera.mode,
            missionManager.score,
            missionManager.ringsPassed,
            missionManager.totalRings,
            missionManager.currentLapTime,
            missionManager.notificationText,
            soundManager.getMuted()
        );

        // Send telemetry to server at 10Hz
        if (now - lastTelemetrySend >= 100) {
            lastTelemetrySend = now;
            if (ws && ws.readyState === WebSocket.OPEN) {
                const telemetry: Telemetry = {
                    timestamp: Date.now(),
                    state: isArmed ? (sensors.altitudeAGL > 0.5 ? DroneFlightState.HOVERING : DroneFlightState.ARMED) : DroneFlightState.IDLE,
                    flightMode: mode === 'MANUAL' ? FlightMode.MANUAL : FlightMode.AUTOPILOT,
                    armed: isArmed,
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

                ws.send(JSON.stringify({
                    type: 'game:telemetry',
                    telemetry,
                }));
            }
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

        // 3. Draw Glowing Neon Race Checkpoints
        missionManager.render(renderPass, camera, timeSec);

        // 4. Draw Drone 3D Custom Model
        modelRenderer.render(renderPass, camera, pos, rot, 2.0, timeSec);

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
