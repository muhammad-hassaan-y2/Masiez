import { Engine } from './core/Engine';
import { InputManager } from './core/InputManager';
import { NetworkManager } from './core/NetworkManager';
import { Terrain } from './world/Terrain';
import { Environment } from './world/Environment';
import { SkyLighting } from './world/SkyLighting';
import { DroneManager } from './drone/DroneManager';
import { CameraSystem } from './camera/CameraSystem';
import { CameraStream } from './camera/CameraStream';
import { CanvasHUD } from './hud/CanvasHUD';

async function main() {
    console.log("Masiez Drone Simulation — Initializing...");

    // 1. Initialize Engine
    const engineWrapper = new Engine();
    await engineWrapper.initAsync();

    // 2. Create World
    const terrain = new Terrain(engineWrapper.scene);
    const environment = new Environment(engineWrapper.scene, terrain);
    const lighting = new SkyLighting(engineWrapper.scene);

    // 3. Create Drone
    const droneManager = new DroneManager(engineWrapper.scene, (x, z) => terrain.getHeightAtPoint(x, z));
    droneManager.mesh.getRootNode().getChildMeshes().forEach(m => lighting.addShadowCaster(m));
    environment.buildings.forEach(b => lighting.addShadowCaster(b));

    // 4. Create Cameras & HUD
    const cameraSystem = new CameraSystem(engineWrapper.scene, engineWrapper.canvas, droneManager.mesh.getGimbalNode());
    environment.buildings.forEach(b => cameraSystem.addMeshToRenderTargets(b));
    environment.trees.forEach(t => cameraSystem.addMeshToRenderTargets(t));
    cameraSystem.addMeshToRenderTargets(terrain.mesh);

    const hud = new CanvasHUD(cameraSystem.getFPVTexture(), cameraSystem.getMinimapTexture());
    
    // 5. Input & Network
    const inputManager = new InputManager(engineWrapper.canvas);
    const networkManager = new NetworkManager();
    const cameraStream = new CameraStream(cameraSystem.getFPVTexture(), engineWrapper.engine, networkManager);

    // Bind Network Commands
    networkManager.onMessage((msg) => {
        droneManager.executeCommand(msg);
    });

    // Main Game Loop
    let lastTime = performance.now();
    let telemetryTimer = 0;

    engineWrapper.runRenderLoop(() => {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        inputManager.update();
        
        // Fixed timestep for physics if needed, but for simplicity use dt (max 0.1s to avoid spiraling)
        const safeDt = Math.min(dt, 0.1);
        droneManager.update(safeDt, inputManager);
        
        cameraSystem.update(droneManager.getPhysicsState().position);
        
        const telemetry = droneManager.getTelemetry();
        hud.update(telemetry);

        // Send telemetry at 10Hz
        telemetryTimer += dt;
        if (telemetryTimer > 0.1 && telemetry && networkManager.connected) {
            networkManager.sendTelemetry(telemetry);
            telemetryTimer = 0;
        }
    });

    console.log("Masiez Drone Simulation — WebGPU initialized and running");
}

window.addEventListener('DOMContentLoaded', main);
