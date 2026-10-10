import { CollisionSystem } from './CollisionSystem';
import { EntityManager, BaseEntity } from './EntityManager';
import { SoundManager } from './SoundManager';
import { MissionManager } from './MissionManager';
import { Camera } from '../scene/Camera';

export interface Projectile {
    pos: [number, number, number];
    vel: [number, number, number];
    prevPos: [number, number, number];
    life: number;
    color: [number, number, number, number];
    targetEntityId?: string;
    homingStrength?: number;
    isRailgun?: boolean;
}

export interface ImpactParticle {
    pos: [number, number, number];
    vel: [number, number, number];
    life: number;
    maxLife: number;
    color: [number, number, number, number];
}

export type LockState = 'OFF' | 'SEARCHING' | 'ACQUIRING' | 'LOCKED' | 'LOST';

export interface FocusTargetResult {
    targetPoint: [number, number, number];
    distance: number;
    lockedEntity: BaseEntity | null;
    candidateEntity: BaseEntity | null;
    lockState: LockState;
    acquireProgress: number; // 0.0 to 1.0
    predictedLeadPoint: [number, number, number] | null;
    targetClosureSpeed: number;
    weaponMode: 'DUAL_PLASMA' | 'SNIPER_RAILGUN';
}

export class WeaponSystem {
    public projectiles: Projectile[] = [];
    public particles: ImpactParticle[] = [];

    // Target Locking State
    public lockedEntity: BaseEntity | null = null;
    public candidateEntity: BaseEntity | null = null;
    public lockState: LockState = 'OFF';
    public acquireTimer: number = 0;
    public readonly acquireDuration: number = 0.20; // 0.20s hover on target to acquire hard lock
    public lockBreakTimer: number = 0;
    public readonly lockBreakGrace: number = 1.25; // 1.25s grace before lock is dropped
    public predictedLeadPoint: [number, number, number] | null = null;
    public targetClosureSpeed: number = 0;

    private lastShotTime: number = 0;
    public hitMarkerTimer: number = 0;
    public hitMarkerText: string = "";

    constructor() {}

    /**
     * Find best entity candidate aligned with camera crosshair within range
     */
    public findBestTargetUnderReticle(
        camera: Camera,
        entityManager: EntityManager,
        maxRange: number = 1200.0
    ): BaseEntity | null {
        const camPos = camera.position;
        const camFwd = camera.getForwardVector();
        let bestTarget: BaseEntity | null = null;
        let bestScore = Infinity;

        for (const ent of entityManager.entities) {
            if (!ent.isAlive) continue;
            const toEnt = [
                ent.pos[0] - camPos[0],
                (ent.pos[1] + ent.height * 0.5) - camPos[1],
                ent.pos[2] - camPos[2]
            ];
            const dist = Math.hypot(toEnt[0], toEnt[1], toEnt[2]);
            if (dist < 2.0 || dist > maxRange) continue;

            const dot = toEnt[0] * camFwd[0] + toEnt[1] * camFwd[1] + toEnt[2] * camFwd[2];
            if (dot <= 0) continue;

            const perpDist = Math.hypot(
                toEnt[0] - camFwd[0] * dot,
                toEnt[1] - camFwd[1] * dot,
                toEnt[2] - camFwd[2] * dot
            );

            // Seeker cone tolerance scales with distance and optical zoom
            const tolerance = Math.max(ent.radius * 2.2, dot * 0.065);
            if (perpDist <= tolerance) {
                // Score prioritizes targets closest to reticle center line
                const score = perpDist + dist * 0.05;
                if (score < bestScore) {
                    bestScore = score;
                    bestTarget = ent;
                }
            }
        }

        return bestTarget;
    }

    /**
     * Toggle or engage Target Lock via keybinding [T] or Middle-Click
     */
    public toggleLock(camera: Camera, entityManager: EntityManager, soundManager: SoundManager): void {
        if (this.lockedEntity) {
            this.clearLock(soundManager);
            return;
        }

        const best = this.findBestTargetUnderReticle(camera, entityManager, 1200.0);
        if (best) {
            this.lockedEntity = best;
            this.candidateEntity = best;
            this.lockState = 'LOCKED';
            this.acquireTimer = this.acquireDuration;
            this.lockBreakTimer = 0;
            soundManager.playTargetLocked();
        } else {
            soundManager.playLockLost();
        }
    }

    /**
     * Cycle through available targets in the world
     */
    public cycleTarget(camera: Camera, entityManager: EntityManager, soundManager: SoundManager): void {
        const alive = entityManager.entities.filter(e => e.isAlive);
        if (alive.length === 0) {
            this.clearLock(soundManager);
            return;
        }

        if (!this.lockedEntity) {
            this.toggleLock(camera, entityManager, soundManager);
            return;
        }

        const currentIdx = alive.findIndex(e => e.id === this.lockedEntity?.id);
        const nextIdx = (currentIdx + 1) % alive.length;
        this.lockedEntity = alive[nextIdx];
        this.candidateEntity = this.lockedEntity;
        this.lockState = 'LOCKED';
        this.acquireTimer = this.acquireDuration;
        this.lockBreakTimer = 0;
        soundManager.playTargetLocked();
    }

    /**
     * Clears active target lock
     */
    public clearLock(soundManager?: SoundManager): void {
        if (this.lockedEntity && soundManager) {
            soundManager.playLockLost();
        }
        this.lockedEntity = null;
        this.candidateEntity = null;
        this.lockState = 'OFF';
        this.acquireTimer = 0;
        this.lockBreakTimer = 0;
        this.predictedLeadPoint = null;
        this.targetClosureSpeed = 0;
    }

    /**
     * Updates active target acquisition, line-of-sight tracking, and predictive lead calculation
     */
    public updateTargetLock(
        camera: Camera,
        collisionSystem: CollisionSystem,
        entityManager: EntityManager,
        soundManager: SoundManager,
        dt: number,
        activeMapId: string = 'airfield'
    ): FocusTargetResult {
        const camPos = camera.position;
        const camFwd = camera.getForwardVector();
        const maxRange = 1200.0;
        const rayEnd: [number, number, number] = [
            camPos[0] + camFwd[0] * maxRange,
            camPos[1] + camFwd[1] * maxRange,
            camPos[2] + camFwd[2] * maxRange
        ];

        let targetFocusPoint: [number, number, number] = rayEnd;
        let bestDist = maxRange;

        // 1. Maintain or check active hard-locked entity
        if (this.lockedEntity) {
            if (!this.lockedEntity.isAlive) {
                this.clearLock(soundManager);
            } else {
                const ent = this.lockedEntity;
                const toEnt = [
                    ent.pos[0] - camPos[0],
                    (ent.pos[1] + ent.height * 0.5) - camPos[1],
                    ent.pos[2] - camPos[2]
                ];
                const dist = Math.hypot(toEnt[0], toEnt[1], toEnt[2]);
                const dot = toEnt[0] * camFwd[0] + toEnt[1] * camFwd[1] + toEnt[2] * camFwd[2];

                // Check line of sight (LOS raycast vs structures)
                const losHit = collisionSystem.raycast(camPos, [ent.pos[0], ent.pos[1] + ent.height * 0.5, ent.pos[2]]);
                const losBlocked = losHit && losHit.dist < dist * 0.94;

                if (dist > maxRange || dot <= 0 || losBlocked) {
                    this.lockBreakTimer += dt;
                    if (this.lockBreakTimer > this.lockBreakGrace) {
                        this.clearLock(soundManager);
                    } else {
                        this.lockState = 'LOST';
                    }
                } else {
                    this.lockBreakTimer = 0;
                    this.lockState = 'LOCKED';
                }

                if (this.lockedEntity) {
                    bestDist = dist;
                    targetFocusPoint = [ent.pos[0], ent.pos[1] + ent.height * 0.5, ent.pos[2]];
                }
            }
        }

        // 2. If not locked, scan for candidate targets under reticle
        if (!this.lockedEntity) {
            const bestCandidate = this.findBestTargetUnderReticle(camera, entityManager, maxRange);
            if (bestCandidate) {
                if (this.candidateEntity?.id !== bestCandidate.id) {
                    this.candidateEntity = bestCandidate;
                    this.acquireTimer = 0;
                    this.lockState = 'SEARCHING';
                    soundManager.playTargetAcquired();
                } else {
                    this.acquireTimer += dt;
                    this.lockState = 'ACQUIRING';
                    if (this.acquireTimer >= this.acquireDuration) {
                        this.lockedEntity = bestCandidate;
                        this.lockState = 'LOCKED';
                        this.lockBreakTimer = 0;
                        soundManager.playTargetLocked();
                    }
                }
                const ent = bestCandidate;
                bestDist = Math.hypot(ent.pos[0] - camPos[0], (ent.pos[1] + ent.height * 0.5) - camPos[1], ent.pos[2] - camPos[2]);
                targetFocusPoint = [ent.pos[0], ent.pos[1] + ent.height * 0.5, ent.pos[2]];
            } else {
                if (this.candidateEntity) {
                    this.candidateEntity = null;
                    this.acquireTimer = 0;
                    this.lockState = 'OFF';
                }
            }
        }

        // 3. Fallback to building/obstacle raycast if no entity targeted
        if (!this.lockedEntity && !this.candidateEntity) {
            const colHit = collisionSystem.raycast(camPos, rayEnd);
            if (colHit && colHit.dist < bestDist) {
                bestDist = colHit.dist;
                targetFocusPoint = colHit.point;
            }

            // 4. Ground elevation raymarch
            let prevT = 0;
            let prevDiff = camPos[1] - collisionSystem.getGroundHeight(activeMapId, camPos[0], camPos[2], camera.currentGroundElevation);
            const stepDist = 5.0;
            for (let t = stepDist; t <= Math.min(bestDist, maxRange); t += stepDist) {
                const px = camPos[0] + camFwd[0] * t;
                const py = camPos[1] + camFwd[1] * t;
                const pz = camPos[2] + camFwd[2] * t;
                const gY = collisionSystem.getGroundHeight(activeMapId, px, pz, camera.currentGroundElevation);
                const diff = py - gY;
                if (diff <= 0) {
                    const span = (prevDiff - diff) || 1.0;
                    const frac = Math.max(0, Math.min(1, prevDiff / span));
                    const hitT = prevT + frac * (t - prevT);
                    if (hitT < bestDist) {
                        bestDist = hitT;
                        targetFocusPoint = [
                            camPos[0] + camFwd[0] * hitT,
                            camPos[1] + camFwd[1] * hitT,
                            camPos[2] + camFwd[2] * hitT
                        ];
                    }
                    break;
                }
                prevT = t;
                prevDiff = diff;
            }
        }

        // Determine active weapon mode based on scope magnification
        const weaponMode: 'DUAL_PLASMA' | 'SNIPER_RAILGUN' = (camera.isScoped && camera.scopeGear >= 4) ? 'SNIPER_RAILGUN' : 'DUAL_PLASMA';
        const bulletSpeed = weaponMode === 'SNIPER_RAILGUN' ? 460.0 : 280.0;

        // Compute predictive lead intercept point and relative closure velocity
        const activeEnt = this.lockedEntity || this.candidateEntity;
        if (activeEnt) {
            const headingRad = activeEnt.headingDeg * (Math.PI / 180.0);
            const entVx = Math.sin(headingRad) * activeEnt.speed;
            const entVz = Math.cos(headingRad) * activeEnt.speed;
            const flightTime = bestDist / bulletSpeed;

            this.predictedLeadPoint = [
                activeEnt.pos[0] + entVx * flightTime,
                activeEnt.pos[1] + activeEnt.height * 0.5,
                activeEnt.pos[2] + entVz * flightTime
            ];

            const toEntX = (activeEnt.pos[0] - camPos[0]) / (bestDist || 1);
            const toEntZ = (activeEnt.pos[2] - camPos[2]) / (bestDist || 1);
            this.targetClosureSpeed = -(entVx * toEntX + entVz * toEntZ);
        } else {
            this.predictedLeadPoint = null;
            this.targetClosureSpeed = 0;
        }

        return {
            targetPoint: targetFocusPoint,
            distance: bestDist,
            lockedEntity: this.lockedEntity,
            candidateEntity: this.candidateEntity,
            lockState: this.lockState,
            acquireProgress: Math.min(1.0, this.acquireTimer / this.acquireDuration),
            predictedLeadPoint: this.predictedLeadPoint,
            targetClosureSpeed: this.targetClosureSpeed,
            weaponMode
        };
    }

    public fire(
        dronePos: [number, number, number],
        droneRotDeg: [number, number, number],
        droneVel: [number, number, number],
        camera: Camera,
        collisionSystem: CollisionSystem,
        entityManager: EntityManager,
        soundManager: SoundManager,
        nowSec: number,
        activeMapId: string = 'airfield'
    ): boolean {
        const weaponMode: 'DUAL_PLASMA' | 'SNIPER_RAILGUN' = (camera.isScoped && camera.scopeGear >= 4) ? 'SNIPER_RAILGUN' : 'DUAL_PLASMA';
        const cooldown = weaponMode === 'SNIPER_RAILGUN' ? 0.38 : 0.14;

        if (nowSec - this.lastShotTime < cooldown) {
            return false;
        }
        this.lastShotTime = nowSec;

        const focus = this.updateTargetLock(camera, collisionSystem, entityManager, soundManager, 0.016, activeMapId);
        // If locked target has predictive lead, aim precisely along lead point
        const aimTarget = (focus.predictedLeadPoint && focus.lockState === 'LOCKED')
            ? focus.predictedLeadPoint
            : focus.targetPoint;

        const rollRad = droneRotDeg[0] * (Math.PI / 180.0);
        const pitchRad = droneRotDeg[1] * (Math.PI / 180.0);
        const yawRad = droneRotDeg[2] * (Math.PI / 180.0);

        const cy = Math.cos(yawRad), sy = Math.sin(yawRad);
        const cp = Math.cos(pitchRad), sp = Math.sin(pitchRad);
        const rightX = cy, rightZ = -sy;
        const fwdX = sy * cp, fwdY = -sp, fwdZ = cy * cp;

        const bulletSpeed = weaponMode === 'SNIPER_RAILGUN' ? 460.0 : 280.0;

        const computeVel = (muzzle: [number, number, number]): [number, number, number] => {
            const dx = aimTarget[0] - muzzle[0];
            const dy = aimTarget[1] - muzzle[1];
            const dz = aimTarget[2] - muzzle[2];
            const len = Math.hypot(dx, dy, dz) || 1.0;
            return [
                (dx / len) * bulletSpeed,
                (dy / len) * bulletSpeed,
                (dz / len) * bulletSpeed
            ];
        };

        const targetId = focus.lockedEntity ? focus.lockedEntity.id : undefined;
        const homing = targetId ? 0.16 : 0.0;

        if (weaponMode === 'SNIPER_RAILGUN') {
            // Concentrated Sniper Railgun shot with electric purple beam
            const centerMuzzle: [number, number, number] = [
                dronePos[0] + fwdX * 0.60,
                dronePos[1] + fwdY * 0.60 - 0.02,
                dronePos[2] + fwdZ * 0.60
            ];

            this.projectiles.push({
                pos: [...centerMuzzle],
                prevPos: [...centerMuzzle],
                vel: computeVel(centerMuzzle),
                life: 3.5,
                color: [0.75, 0.45, 1.0, 1.0], // Electric Ultraviolet
                targetEntityId: targetId,
                homingStrength: homing,
                isRailgun: true
            });

            soundManager.playRailgunShot();
        } else {
            // Dual Rapid-Fire Plasma Cannons
            const sideOffset = 0.40;
            const m1Pos: [number, number, number] = [
                dronePos[0] + fwdX * 0.45 - rightX * sideOffset,
                dronePos[1] + fwdY * 0.45 - 0.05,
                dronePos[2] + fwdZ * 0.45 - rightZ * sideOffset
            ];
            const m2Pos: [number, number, number] = [
                dronePos[0] + fwdX * 0.45 + rightX * sideOffset,
                dronePos[1] + fwdY * 0.45 - 0.05,
                dronePos[2] + fwdZ * 0.45 + rightZ * sideOffset
            ];

            this.projectiles.push({
                pos: [...m1Pos],
                prevPos: [...m1Pos],
                vel: computeVel(m1Pos),
                life: 4.5,
                color: [0.0, 1.0, 0.85, 1.0], // Neon Cyan Plasma
                targetEntityId: targetId,
                homingStrength: homing
            });

            this.projectiles.push({
                pos: [...m2Pos],
                prevPos: [...m2Pos],
                vel: computeVel(m2Pos),
                life: 4.5,
                color: [0.0, 1.0, 0.85, 1.0],
                targetEntityId: targetId,
                homingStrength: homing
            });

            soundManager.playLaserShot();
        }

        return true;
    }

    public update(
        dt: number,
        collisionSystem: CollisionSystem,
        entityManager: EntityManager,
        missionManager: MissionManager,
        soundManager: SoundManager,
        activeMapId: string = 'airfield',
        groundElevation: number = 0.0
    ): void {
        if (this.hitMarkerTimer > 0) {
            this.hitMarkerTimer -= dt;
        }

        // 1. Guided Projectile Homing Steering (Smooth pursuit for locked targets)
        for (const p of this.projectiles) {
            if (p.targetEntityId && p.homingStrength) {
                const target = entityManager.entities.find(e => e.id === p.targetEntityId && e.isAlive);
                if (target) {
                    const toTarget = [
                        target.pos[0] - p.pos[0],
                        (target.pos[1] + target.height * 0.5) - p.pos[1],
                        target.pos[2] - p.pos[2]
                    ];
                    const dist = Math.hypot(toTarget[0], toTarget[1], toTarget[2]);
                    if (dist > 1.0) {
                        const curSpeed = Math.hypot(p.vel[0], p.vel[1], p.vel[2]);
                        const desiredVx = (toTarget[0] / dist) * curSpeed;
                        const desiredVy = (toTarget[1] / dist) * curSpeed;
                        const desiredVz = (toTarget[2] / dist) * curSpeed;
                        const steerRate = Math.min(1.0, dt * 12.0 * p.homingStrength);
                        p.vel[0] += (desiredVx - p.vel[0]) * steerRate;
                        p.vel[1] += (desiredVy - p.vel[1]) * steerRate;
                        p.vel[2] += (desiredVz - p.vel[2]) * steerRate;
                    }
                }
            }
        }

        // 2. Update Projectiles & Check Collisions
        for (let i = this.projectiles.length - 1; i >= 0; --i) {
            const p = this.projectiles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.projectiles.splice(i, 1);
                continue;
            }

            p.prevPos = [...p.pos];
            p.pos[0] += p.vel[0] * dt;
            p.pos[1] += p.vel[1] * dt;
            p.pos[2] += p.vel[2] * dt;

            // Check Ground Collision against true terrain height
            const pGroundY = collisionSystem.getGroundHeight(activeMapId, p.pos[0], p.pos[2], groundElevation);
            if (p.pos[1] <= pGroundY + 0.05) {
                p.pos[1] = pGroundY + 0.05;
                const pColor: [number, number, number, number] = p.isRailgun ? [0.8, 0.4, 1.0, 1.0] : [0.95, 0.7, 0.2, 1.0];
                this.spawnImpactParticles(p.pos, [0, 1, 0], pColor, p.isRailgun ? 16 : 8);
                soundManager.playImpact();
                this.projectiles.splice(i, 1);
                continue;
            }

            // Check Building / Obstacle Collision
            const rayHit = collisionSystem.raycast(p.prevPos, p.pos);
            if (rayHit) {
                const pColor: [number, number, number, number] = p.isRailgun ? [0.9, 0.5, 1.0, 1.0] : [0.4, 0.85, 1.0, 1.0];
                this.spawnImpactParticles(rayHit.point, rayHit.normal, pColor, p.isRailgun ? 20 : 12);
                soundManager.playImpact();
                this.projectiles.splice(i, 1);
                continue;
            }

            // Check Entity Collision (Moving persons, rovers, aerial target drones)
            const damage = p.isRailgun ? 120 : 45;
            const entHit = entityManager.checkHit(p.prevPos, p.pos, damage);
            if (entHit.hitEntity && entHit.hitPoint) {
                const ent = entHit.hitEntity;
                const wasKilled = !ent.isAlive;

                // Trigger Hit Marker
                this.hitMarkerTimer = 0.38;
                this.hitMarkerText = wasKilled ? `🎯 DESTROYED: ${ent.roleName.toUpperCase()}!` : (p.isRailgun ? `⚡ CRITICAL HIT: ${ent.roleName}` : `✕ HIT: ${ent.roleName}`);

                if (wasKilled) {
                    missionManager.showNotification(`TARGET NEUTRALIZED: ${ent.roleName.toUpperCase()}`);
                    this.spawnImpactParticles(entHit.hitPoint, [0, 1, 0], [1.0, 0.35, 0.1, 1.0], 28);
                    soundManager.playExplosion();
                    if (this.lockedEntity?.id === ent.id) {
                        this.clearLock(soundManager);
                    }
                } else {
                    this.spawnImpactParticles(entHit.hitPoint, [0, 1, 0], [1.0, 0.9, 0.2, 1.0], 14);
                    soundManager.playImpact();
                }

                this.projectiles.splice(i, 1);
                continue;
            }
        }

        // 3. Update Impact Particles
        for (let i = this.particles.length - 1; i >= 0; --i) {
            const part = this.particles[i];
            part.life -= dt;
            if (part.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            part.pos[0] += part.vel[0] * dt;
            part.pos[1] += part.vel[1] * dt;
            part.pos[2] += part.vel[2] * dt;

            // Gravity on particles
            part.vel[1] -= 9.8 * dt;

            // Fade out
            part.color[3] = Math.max(0, part.life / part.maxLife);
        }
    }

    public spawnImpactParticles(
        pos: [number, number, number],
        normal: [number, number, number],
        color: [number, number, number, number],
        count: number = 10
    ): void {
        for (let i = 0; i < count; ++i) {
            const speed = 4.0 + Math.random() * 8.0;
            const rx = (Math.random() - 0.5) * 1.5;
            const ry = (Math.random() - 0.5) * 1.5;
            const rz = (Math.random() - 0.5) * 1.5;

            const vx = (normal[0] + rx) * speed;
            const vy = (normal[1] + Math.abs(ry)) * speed;
            const vz = (normal[2] + rz) * speed;

            const life = 0.25 + Math.random() * 0.35;
            this.particles.push({
                pos: [...pos],
                vel: [vx, vy, vz],
                life,
                maxLife: life,
                color: [...color]
            });
        }
    }
}
