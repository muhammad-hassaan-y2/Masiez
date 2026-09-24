import { GPUDeviceContext } from './gpu/Device';
import { PhysicsBridge } from './wasm/PhysicsBridge';
import { TerrainRenderer } from './gpu/TerrainRenderer';
import { StructuresRenderer } from './gpu/StructuresRenderer';
import { ModelRenderer } from './gpu/ModelRenderer';
import { SkyRenderer } from './gpu/SkyRenderer';
import { Camera } from './scene/Camera';
import { InputManager } from './input/InputManager';
import { HUD } from './hud/HUD';
import { Telemetry, DroneFlightState, FlightMode, GPSFixType, SensorStatus } from 'drone-autonomy-shared';

async function bootstrap() {
    console.log("=== Initializing Masiez C++ / WebGPU Drone Simulation ===");

    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    if (!canvas) throw new Error("renderCanvas element not found");

    // 1. Initialize WebGPU
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
    // Arm by default so user can fly immediately with WASD / Space
    physics.arm(true);

    // 3. Initialize Renderers
    const skyRenderer = new SkyRenderer(gpu);
    await skyRenderer.init();

    const terrainRenderer = new TerrainRenderer(gpu);
    await terrainRenderer.init();

    const structuresRenderer = new StructuresRenderer(gpu);
    await structuresRenderer.init();

    const modelRenderer = new ModelRenderer(gpu);
    await modelRenderer.init();
    await modelRenderer.loadGLB('/assets/models/drone.glb');

    // 4. Camera & Input & HUD
    const camera = new Camera();
    const input = new InputManager(canvas);
    const hud = new HUD();

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

    input.onEmergencyStop = () => {
        physics.arm(false);
        console.log("EMERGENCY STOP!");
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
                            physics.setAutopilotTarget(p[0], 0, p[2]);
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

    // 6. Game Loop: Fixed Timestep Physics (250Hz) + 60fps WebGPU Render
    let lastTime = performance.now();
    let physicsAccumulator = 0;
    const physicsDt = 1.0 / 250.0; // 4ms per physics step
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

        physics.setManualInput(input.throttle, input.pitch, input.roll, input.yaw);

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
        const sensors = physics.getSensors();
        const isArmed = physics.isArmed();
        const mode = physics.getMode();

        // Update Camera
        const aspect = canvas.width / canvas.height;
        camera.update(pos, rot[2], aspect);

        // Update HUD
        hud.update(sensors, pos, vel, rot, isArmed, mode);

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
                    groundSpeed: Math.sqrt(vel[0]*vel[0] + vel[2]*vel[2]),
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
                clearValue: { r: 0.5, g: 0.7, b: 0.9, a: 1.0 },
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

        // 2. Draw Airfield & PBR Terrain
        terrainRenderer.render(renderPass, camera, timeSec);

        // 3. Draw 3D Structures (Tower, Hangars, City Skyline, Runway Lights, Gates, Trees)
        structuresRenderer.render(renderPass, camera, timeSec);

        // 4. Draw Drone 3D Model
        modelRenderer.render(renderPass, camera, pos, rot, 1.5, timeSec);

        renderPass.end();
        gpu.device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

bootstrap().catch(err => console.error("Bootstrap error:", err));

