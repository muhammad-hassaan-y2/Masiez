import { GPUDeviceContext } from './gpu/Device';
import { PhysicsBridge } from './wasm/PhysicsBridge';
import { FieldRenderer } from './gpu/FieldRenderer';
import { TankRenderer } from './gpu/TankRenderer';
import { SkyRenderer } from './gpu/SkyRenderer';
import { SoundManager } from './gameplay/SoundManager';
import { CollisionSystem } from './gameplay/CollisionSystem';
import { Autopilot } from './gameplay/Autopilot';
import { terrainHeight } from './gameplay/Terrain';
import { Camera } from './scene/Camera';
import { InputManager } from './input/InputManager';
import { HUD } from './hud/HUD';
import { AnnotationOverlay } from './training/AnnotationOverlay';
import { buildCocoJson, projectTankBoxes } from './training/Annotations';

type SpeedMode = 'CRUISE' | 'SPORT' | 'TURBO';

interface SpeedProfile {
    maxSpeed: number;
    climbSpeed: number;
    descentSpeed: number;
    accelRate: number;
    brakeRate: number;
    maxTiltDeg: number;
}

const SPAWN_POSITION: [number, number, number] = [0, 8, 0];
const GROUND_HEIGHT = 0.0;

async function bootstrap() {
    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    if (!canvas) throw new Error("renderCanvas element not found");

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

    const physics = new PhysicsBridge();
    const okWasm = await physics.init();
    if (!okWasm) {
        console.warn("WASM physics failed to load, check console.");
    }
    physics.arm(true);

    const soundManager = new SoundManager();

    const skyRenderer = new SkyRenderer(gpu);
    await skyRenderer.init();

    const fieldRenderer = new FieldRenderer(gpu);
    await fieldRenderer.init();

    const tankRenderer = new TankRenderer(gpu);
    await tankRenderer.init();

    const collisionSystem = new CollisionSystem();
    for (const obstacle of tankRenderer.getObstacles()) {
        collisionSystem.addOBB(obstacle.center, obstacle.half, obstacle.yaw, obstacle.id);
    }

    const camera = new Camera();
    const input = new InputManager(canvas);
    const annotationOverlay = new AnnotationOverlay();
    const autopilot = new Autopilot();
    const hud = new HUD();

    const speedModes: SpeedMode[] = ['CRUISE', 'SPORT', 'TURBO'];
    let speedModeIndex = speedModes.length - 1;

    const speedProfiles: Record<SpeedMode, SpeedProfile> = {
        'CRUISE': {
            maxSpeed: 20.0,
            climbSpeed: 14.0,
            descentSpeed: 17.0,
            accelRate: 20.0,
            brakeRate: 16.0,
            maxTiltDeg: 22.0,
        },
        'SPORT': {
            maxSpeed: 36.0,
            climbSpeed: 24.0,
            descentSpeed: 29.0,
            accelRate: 25.0,
            brakeRate: 20.0,
            maxTiltDeg: 32.0,
        },
        'TURBO': {
            maxSpeed: 55.0,
            climbSpeed: 38.0,
            descentSpeed: 44.0,
            accelRate: 30.0,
            brakeRate: 24.0,
            maxTiltDeg: 42.0,
        },
    };

    let currentRollDeg = 0;
    let currentPitchDeg = 0;
    let headingRad = 0;
    let flightElapsedSec = 0;
    let simElapsedSec = 0;
    const YAW_RATE = 1.8;
    const RESPAWN_DELAY_SEC = 1.0;
    const BLAST_RADIUS = 5.5;
    let exploded = false;
    let explodedAt = 0;
    let destroyedThisLoss = 0;
    let mapCleared = false;
    let captureRequested = false;

    let notifyUntil = 0;
    function notify(text: string): void {
        hud.setNotification(text);
        notifyUntil = performance.now() + 2600;
    }

    function respawn(): void {
        physics.setGroundOffset(GROUND_HEIGHT);
        physics.resetPosition(SPAWN_POSITION[0], SPAWN_POSITION[1], SPAWN_POSITION[2]);
        physics.setVelocity(0, 0, 0);
        physics.setRotation(0, 0, 0);
        physics.arm(true);
        physics.setMode('MANUAL');
        physicsAccumulator = 0;
        currentRollDeg = 0;
        currentPitchDeg = 0;
        headingRad = 0;
        exploded = false;
        explodedAt = 0;
        autopilot.cancel();
        hud.setSignalLost(false);
        hud.setMapCleared(mapCleared);
        camera.currentGroundElevation = GROUND_HEIGHT;
        flightElapsedSec = 0;
        hud.resetTrip();
        const strike = destroyedThisLoss > 0
            ? ` · ${destroyedThisLoss} TARGET${destroyedThisLoss > 1 ? 'S' : ''} DESTROYED`
            : '';
        notify(`NEW DRONE READY${strike}`);
        destroyedThisLoss = 0;
    }

    physics.setGroundOffset(GROUND_HEIGHT);
    physics.setMode('MANUAL');
    camera.currentGroundElevation = GROUND_HEIGHT;

    function cycleSpeedMode(): void {
        speedModeIndex = (speedModeIndex + 1) % speedModes.length;
        notify(`SPEED MODE: ${speedModes[speedModeIndex]}`);
    }

    function toggleMute(): void {
        const isMuted = soundManager.toggleMute();
        notify(isMuted ? "AUDIO MUTED" : "AUDIO ACTIVE");
    }

    function downloadBlob(blob: Blob, fileName: string): void {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function captureFrame(): void {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = `drone_frame_${stamp}`;
        const imageWidth = canvas.width;
        const imageHeight = canvas.height;
        const boxes = projectTankBoxes(camera, tankRenderer.getTargets(), imageWidth, imageHeight);
        canvas.toBlob((blob) => {
            if (!blob) {
                hud.setCaptureStatus('CAPTURE FAILED');
                return;
            }
            downloadBlob(blob, `${baseName}.png`);
            downloadBlob(new Blob(
                [buildCocoJson(`${baseName}.png`, imageWidth, imageHeight, boxes)],
                { type: 'application/json' },
            ), `${baseName}.json`);
            hud.setCaptureStatus(`SAVED PNG + JSON · ${boxes.length} BOX${boxes.length === 1 ? '' : 'ES'}`);
        }, 'image/png');
    }

    function redeployMap(): void {
        mapCleared = false;
        hud.setMapCleared(false);
        tankRenderer.resetTanks();
        collisionSystem.clearColliders();
        for (const obstacle of tankRenderer.getObstacles()) {
            collisionSystem.addOBB(obstacle.center, obstacle.half, obstacle.yaw, obstacle.id);
        }
        respawn();
        syncPauseState();
    }

    input.onArmToggle = () => {
        if (exploded) return;
        if (mapCleared) {
            redeployMap();
            return;
        }
        const nextArmed = !physics.isArmed();
        physics.arm(nextArmed);
        notify(nextArmed ? "DRONE ARMED" : "DRONE DISARMED");
    };

    input.onSpeedToggle = cycleSpeedMode;
    input.onMuteToggle = toggleMute;
    input.onUserMenuToggle = () => {
        hud.toggleUserMenu();
    };
    input.onTargetSelect = (clientX: number, clientY: number) => {
        const index = annotationOverlay.hitTest(clientX, clientY);
        if (index === undefined) return;
        autopilot.setTarget(index);
    };
    input.onTargetModeChange = (active: boolean) => {
        if (!active) autopilot.cancel();
    };

    function syncPauseState(): void {
        soundManager.setPaused(hud.isMenuOpen || mapCleared);
    }

    hud.onMenuOpenChange = (isOpen: boolean) => {
        input.isMenuOpen = isOpen;
        syncPauseState();
        if (isOpen) {
            input.clearInputs();
        }
    };
    hud.onSpeedModeToggle = cycleSpeedMode;
    hud.onAudioToggle = toggleMute;
    hud.onRespawn = respawn;
    hud.onCaptureFrame = () => {
        captureRequested = true;
    };

    let lastTime = performance.now();
    let physicsAccumulator = 0;
    const physicsDt = 1.0 / 250.0;

    function frame(now: number) {
        const deltaSec = Math.min((now - lastTime) / 1000.0, 0.1);
        lastTime = now;

        if (captureRequested) {
            captureRequested = false;
            captureFrame();
        }

        const frozen = hud.isMenuOpen || (mapCleared && !exploded);

        if (!frozen) {
            simElapsedSec += deltaSec;
            flightElapsedSec += deltaSec;

            if (exploded && simElapsedSec - explodedAt >= RESPAWN_DELAY_SEC) {
                respawn();
            }

            input.update();
        }

        let inThrottle = input.throttle;
        let inPitch = input.pitch;
        let inRoll = input.roll;
        let inYaw = input.yaw;
        let headingDeg = headingRad * (180.0 / Math.PI);
        const speedProfile = speedProfiles[speedModes[speedModeIndex]];

        if (!frozen) {
            if (autopilot.isActive && input.hasAnyFlightInput()) {
                autopilot.cancel();
            }
            if (!exploded && (input.hasAnyFlightInput() || autopilot.isActive) && !physics.isArmed()) {
                physics.arm(true);
            }

            const command = autopilot.update(
                physics.getPosition(),
                headingRad,
                tankRenderer.getTargets(),
                speedProfile,
            );
            if (command) {
                inThrottle = command.throttle;
                inPitch = command.pitch;
                inRoll = command.roll;
                inYaw = command.yaw;
                if (command.reached) {
                    notify('TARGET REACHED');
                }
            }

            if (!exploded && inYaw !== 0) {
                headingRad += inYaw * YAW_RATE * deltaSec;
            }
            headingDeg = headingRad * (180.0 / Math.PI);

            physics.setManualInput(inThrottle, inPitch, inRoll, headingDeg);

            physicsAccumulator += deltaSec;

            while (!exploded && physicsAccumulator >= physicsDt) {
                const prevPos = physics.getPosition();
                const prevVel = physics.getVelocity();
                physics.step(physicsDt);
                physicsAccumulator -= physicsDt;

                const subPos = physics.getPosition();
                let subVel = physics.getVelocity();

                if (physics.isArmed() && physics.getMode() === 'MANUAL') {
                    subVel = [prevVel[0], prevVel[1], prevVel[2]];
                    const fwdX = -Math.sin(headingRad);
                    const fwdZ = Math.cos(headingRad);
                    const rgtX = -Math.cos(headingRad);
                    const rgtZ = -Math.sin(headingRad);

                    let subInP = inPitch;
                    let subInR = inRoll;
                    const inputMag = Math.hypot(subInP, subInR);
                    if (inputMag > 1.0) {
                        subInP /= inputMag;
                        subInR /= inputMag;
                    }

                    if (inputMag > 0.02) {
                        const targetVx = (fwdX * subInP + rgtX * subInR) * speedProfile.maxSpeed;
                        const targetVz = (fwdZ * subInP + rgtZ * subInR) * speedProfile.maxSpeed;
                        const blendH = Math.min(1.0, physicsDt * speedProfile.accelRate);
                        subVel[0] += (targetVx - subVel[0]) * blendH;
                        subVel[2] += (targetVz - subVel[2]) * blendH;
                    } else {
                        const blendBrake = Math.min(1.0, physicsDt * speedProfile.brakeRate);
                        subVel[0] += (0.0 - subVel[0]) * blendBrake;
                        subVel[2] += (0.0 - subVel[2]) * blendBrake;
                        if (Math.hypot(subVel[0], subVel[2]) < 0.10) {
                            subVel[0] = 0;
                            subVel[2] = 0;
                        }
                    }

                    if (inThrottle > 0.05) {
                        const targetVy = speedProfile.climbSpeed * inThrottle;
                        const blendClimb = Math.min(1.0, physicsDt * 24.0);
                        subVel[1] += (targetVy - subVel[1]) * blendClimb;
                    } else if (inThrottle < -0.05) {
                        const targetVy = -speedProfile.descentSpeed * Math.abs(inThrottle);
                        const blendDescend = Math.min(1.0, physicsDt * 24.0);
                        subVel[1] += (targetVy - subVel[1]) * blendDescend;
                    } else {
                        const blendHover = Math.min(1.0, physicsDt * 14.0);
                        subVel[1] += (0.0 - subVel[1]) * blendHover;
                        if (Math.abs(subVel[1]) < 0.05) subVel[1] = 0;
                    }

                    subPos[0] = prevPos[0] + subVel[0] * physicsDt;
                    subPos[1] = prevPos[1] + subVel[1] * physicsDt;
                    subPos[2] = prevPos[2] + subVel[2] * physicsDt;

                    const targetPitch = subInP * speedProfile.maxTiltDeg;
                    let targetRoll = subInR * speedProfile.maxTiltDeg;
                    if (inYaw !== 0) {
                        targetRoll += inYaw * 10.0;
                    }
                    const blendTilt = Math.min(1.0, physicsDt * 22.0);
                    currentRollDeg += (targetRoll - currentRollDeg) * blendTilt;
                    currentPitchDeg += (targetPitch - currentPitchDeg) * blendTilt;
                    physics.setRotation(currentRollDeg, currentPitchDeg, headingDeg);
                }

                let hardGroundImpact = false;
                const minGroundY = terrainHeight(subPos[0], subPos[2]) + 0.12;
                if (subPos[1] < minGroundY) {
                    hardGroundImpact = prevVel[1] < -4.2 ||
                        Math.abs(currentPitchDeg) > 52 ||
                        Math.abs(currentRollDeg) > 52;
                    subPos[1] = minGroundY;
                    if (subVel[1] < 0) subVel[1] = 0;
                    if (inThrottle <= 0 && Math.hypot(inPitch, inRoll) <= 0.05) {
                        currentRollDeg *= 0.85;
                        currentPitchDeg *= 0.85;
                        physics.setRotation(currentRollDeg, currentPitchDeg, headingDeg);
                    }
                }

                const groundAtDrone = terrainHeight(subPos[0], subPos[2]);
                const collision = collisionSystem.resolveDroneCollision(subPos, subVel, 0.25, prevPos, groundAtDrone);

                physics.setPosition(subPos[0], subPos[1], subPos[2]);
                physics.setVelocity(subVel[0], subVel[1], subVel[2]);

                if (hardGroundImpact || collision.hit) {
                    exploded = true;
                    explodedAt = simElapsedSec;
                    autopilot.cancel();

                    const blastX = subPos[0];
                    const blastY = subPos[1];
                    const blastZ = subPos[2];

                    let destroyedCount = 0;
                    for (const collider of tankRenderer.getColliders()) {
                        if (!collider.id.startsWith('tank_')) continue;
                        const tankIndex = Number(collider.id.slice(5));
                        const px = Math.max(collider.min[0], Math.min(blastX, collider.max[0]));
                        const py = Math.max(collider.min[1], Math.min(blastY, collider.max[1]));
                        const pz = Math.max(collider.min[2], Math.min(blastZ, collider.max[2]));
                        const dist = Math.hypot(px - blastX, py - blastY, pz - blastZ);
                        if (dist <= BLAST_RADIUS && tankRenderer.destroyTank(tankIndex)) {
                            collisionSystem.removeObstacle(collider.id);
                            destroyedCount++;
                        }
                    }

                    destroyedThisLoss = destroyedCount;
                    if (tankRenderer.destroyedCount >= tankRenderer.totalCount) {
                        mapCleared = true;
                    }
                    hud.setSignalLost(true);
                    physics.arm(false);
                    physics.setVelocity(0, 0, 0);
                    input.clearInputs();
                    syncPauseState();
                    break;
                }
            }
        }

        const pos = physics.getPosition();
        const rot = physics.getRotation();
        const motorRPMs = physics.getMotorRPMs();
        const sensors = physics.getSensors();
        const isArmed = physics.isArmed();

        soundManager.update(motorRPMs, !exploded);

        const aspect = canvas.width / canvas.height;
        const groundAtDrone = terrainHeight(pos[0], pos[2]);
        camera.currentGroundElevation = groundAtDrone;
        camera.update(pos, headingRad, aspect, groundAtDrone, rot[0]);
        annotationOverlay.setTargetMode(input.targetMode);
        annotationOverlay.setPointer(input.pointerX, input.pointerY, input.pointerActive);
        annotationOverlay.setSelectedIndex(autopilot.activeIndex);
        annotationOverlay.draw(camera, tankRenderer.getTargets());

        if (notifyUntil > 0 && now > notifyUntil) {
            hud.setNotification('');
            notifyUntil = 0;
        }

        hud.update({
            sensors,
            armed: isArmed,
            speedMode: speedModes[speedModeIndex],
            muted: soundManager.getMuted(),
            targetMode: input.targetMode,
            frozen,
            throttle: inThrottle,
            pitch: inPitch,
            roll: inRoll,
            yaw: inYaw,
            motorRpms: motorRPMs,
            position: pos,
            headingDeg,
            elapsedSec: flightElapsedSec,
        });

        const commandEncoder = gpu.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: gpu.context.getCurrentTexture().createView(),
                clearValue: { r: 0.72, g: 0.78, b: 0.8, a: 1.0 },
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

        skyRenderer.render(renderPass, camera);
        fieldRenderer.render(renderPass, camera);
        tankRenderer.render(renderPass, camera);

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
