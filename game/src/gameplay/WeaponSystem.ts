import { CollisionSystem } from './CollisionSystem';
import { EntityManager, BaseEntity, WarProjectileSpawn, WarEffectCallbacks } from './EntityManager';
import { SoundManager } from './SoundManager';
import { MissionManager } from './MissionManager';
import { Camera } from '../scene/Camera';

export type ProjectileKind =
    | 'PLAYER_PLASMA'
    | 'PLAYER_RAILGUN'
    | 'TANK_SHELL'
    | 'SAM_MISSILE'
    | 'RPG_ROCKET'
    | 'HELI_ROCKET'
    | 'TRACER'
    | 'ARTILLERY_SHELL';

export interface Projectile {
    pos: [number, number, number];
    vel: [number, number, number];
    prevPos: [number, number, number];
    life: number;
    color: [number, number, number, number];
    kind?: ProjectileKind;
    faction?: 'PLAYER' | 'ALLY' | 'HOSTILE';
    shooterId?: string;
    shooterName?: string;
    damage?: number;
    gravity?: number;
    smokeTrail?: boolean;
    targetEntityId?: string;
    targetsPlayerDrone?: boolean;
    homingStrength?: number;
    isRailgun?: boolean;
}

export interface ImpactParticle {
    pos: [number, number, number];
    vel: [number, number, number];
    life: number;
    maxLife: number;
    color: [number, number, number, number];
    size?: number;
    buoyancy?: number; // Positive rises like smoke, negative falls with gravity
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
    public readonly acquireDuration: number = 0.20;
    public lockBreakTimer: number = 0;
    public readonly lockBreakGrace: number = 1.25;
    public predictedLeadPoint: [number, number, number] | null = null;
    public targetClosureSpeed: number = 0;

    private lastShotTime: number = 0;
    public hitMarkerTimer: number = 0;
    public hitMarkerText: string = "";

    constructor() {}

    /**
     * Creates callbacks for EntityManager's real-time battlefield war engine
     */
    public createWarCallbacks(soundManager: SoundManager): WarEffectCallbacks {
        return {
            spawnWarProjectile: (proj: WarProjectileSpawn) => {
                if (this.projectiles.length > 260) return;
                this.projectiles.push({
                    pos: [...proj.pos],
                    prevPos: [...proj.pos],
                    vel: [...proj.vel],
                    life: proj.life,
                    color: [...proj.color],
                    kind: proj.kind,
                    faction: proj.faction,
                    shooterId: proj.shooterId,
                    shooterName: proj.shooterName,
                    damage: proj.damage,
                    gravity: proj.gravity,
                    smokeTrail: proj.smokeTrail,
                    targetEntityId: proj.targetEntityId,
                    targetsPlayerDrone: proj.targetsPlayerDrone,
                    homingStrength: proj.homingStrength
                });
            },
            spawnMuzzleFlash: (pos, dir, color, count) => {
                if (this.particles.length > 900) return;
                for (let i = 0; i < count; i++) {
                    const spd = 3.0 + Math.random() * 9.0;
                    const life = 0.14 + Math.random() * 0.18;
                    this.particles.push({
                        pos: [...pos],
                        vel: [
                            (dir[0] + (Math.random() - 0.5) * 0.8) * spd,
                            (dir[1] + (Math.random() - 0.5) * 0.8) * spd,
                            (dir[2] + (Math.random() - 0.5) * 0.8) * spd
                        ],
                        life,
                        maxLife: life,
                        color: [...color],
                        size: 0.32 + Math.random() * 0.28,
                        buoyancy: 1.5
                    });
                }
            },
            spawnWreckSmoke: (pos) => {
                if (this.particles.length > 900) return;
                // Flickering flame core
                const fireLife = 0.35 + Math.random() * 0.35;
                this.particles.push({
                    pos: [
                        pos[0] + (Math.random() - 0.5) * 1.6,
                        pos[1] + 0.6 + Math.random() * 0.6,
                        pos[2] + (Math.random() - 0.5) * 1.6
                    ],
                    vel: [(Math.random() - 0.5) * 1.2, 2.8 + Math.random() * 2.2, (Math.random() - 0.5) * 1.2],
                    life: fireLife,
                    maxLife: fireLife,
                    color: [1.0, 0.42 + Math.random() * 0.35, 0.08, 0.95],
                    size: 0.48 + Math.random() * 0.35,
                    buoyancy: 3.0
                });
                // Rising dark smoke column
                const smokeLife = 1.1 + Math.random() * 0.9;
                const shade = 0.14 + Math.random() * 0.12;
                this.particles.push({
                    pos: [
                        pos[0] + (Math.random() - 0.5) * 1.8,
                        pos[1] + 1.2 + Math.random() * 0.8,
                        pos[2] + (Math.random() - 0.5) * 1.8
                    ],
                    vel: [(Math.random() - 0.5) * 1.6, 4.2 + Math.random() * 2.5, (Math.random() - 0.5) * 1.6],
                    life: smokeLife,
                    maxLife: smokeLife,
                    color: [shade, shade, shade + 0.02, 0.85],
                    size: 0.65 + Math.random() * 0.45,
                    buoyancy: 2.5
                });
            },
            onGunfireAudio: (dist) => soundManager.playBattlefieldGunfire(dist),
            onExplosionAudio: (dist) => soundManager.playBattlefieldExplosion(dist),
            onMissileWarningAudio: () => soundManager.playMissileWarning()
        };
    }

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

            const tolerance = Math.max(ent.radius * 2.2, dot * 0.065);
            if (perpDist <= tolerance) {
                let score = perpDist + dist * 0.05;
                // Prioritize hostile units slightly when scanning
                if (ent.faction === 'HOSTILE') score *= 0.85;
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

        const weaponMode: 'DUAL_PLASMA' | 'SNIPER_RAILGUN' = (camera.isScoped && camera.scopeGear >= 4) ? 'SNIPER_RAILGUN' : 'DUAL_PLASMA';
        const bulletSpeed = weaponMode === 'SNIPER_RAILGUN' ? 460.0 : 280.0;

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
        const aimTarget = (focus.predictedLeadPoint && focus.lockState === 'LOCKED')
            ? focus.predictedLeadPoint
            : focus.targetPoint;

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
                color: [0.75, 0.45, 1.0, 1.0],
                kind: 'PLAYER_RAILGUN',
                faction: 'PLAYER',
                damage: 140,
                targetEntityId: targetId,
                homingStrength: homing,
                isRailgun: true
            });

            soundManager.playRailgunShot();
        } else {
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
                color: [0.0, 1.0, 0.85, 1.0],
                kind: 'PLAYER_PLASMA',
                faction: 'PLAYER',
                damage: 48,
                targetEntityId: targetId,
                homingStrength: homing
            });

            this.projectiles.push({
                pos: [...m2Pos],
                prevPos: [...m2Pos],
                vel: computeVel(m2Pos),
                life: 4.5,
                color: [0.0, 1.0, 0.85, 1.0],
                kind: 'PLAYER_PLASMA',
                faction: 'PLAYER',
                damage: 48,
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
        groundElevation: number = 0.0,
        dronePos?: [number, number, number]
    ): void {
        if (this.hitMarkerTimer > 0) {
            this.hitMarkerTimer -= dt;
        }

        let activeSamTargetingDrone = false;

        // 1. Guided Projectile Homing Steering & Ballistic Gravity
        for (const p of this.projectiles) {
            if (p.gravity) {
                p.vel[1] -= p.gravity * dt;
            }

            if (p.targetsPlayerDrone && dronePos && p.homingStrength) {
                activeSamTargetingDrone = true;
                const toDrone = [
                    dronePos[0] - p.pos[0],
                    dronePos[1] - p.pos[1],
                    dronePos[2] - p.pos[2]
                ];
                const dist = Math.hypot(toDrone[0], toDrone[1], toDrone[2]);
                if (dist > 1.5) {
                    const curSpeed = Math.hypot(p.vel[0], p.vel[1], p.vel[2]);
                    const desiredVx = (toDrone[0] / dist) * curSpeed;
                    const desiredVy = (toDrone[1] / dist) * curSpeed;
                    const desiredVz = (toDrone[2] / dist) * curSpeed;
                    const steerRate = Math.min(1.0, dt * 8.0 * p.homingStrength);
                    p.vel[0] += (desiredVx - p.vel[0]) * steerRate;
                    p.vel[1] += (desiredVy - p.vel[1]) * steerRate;
                    p.vel[2] += (desiredVz - p.vel[2]) * steerRate;
                }
            } else if (p.targetEntityId && p.homingStrength) {
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

            // Emit continuous smoke trails for SAM missiles, RPGs, Tank shells, and Artillery
            if (p.smokeTrail && this.particles.length < 950 && Math.random() < 0.75) {
                const isMissile = p.kind === 'SAM_MISSILE' || p.kind === 'RPG_ROCKET' || p.kind === 'HELI_ROCKET';
                const smokeLife = isMissile ? 0.55 : 0.35;
                this.particles.push({
                    pos: [
                        p.pos[0] + (Math.random() - 0.5) * 0.25,
                        p.pos[1] + (Math.random() - 0.5) * 0.25,
                        p.pos[2] + (Math.random() - 0.5) * 0.25
                    ],
                    vel: [
                        (Math.random() - 0.5) * 1.2,
                        0.8 + Math.random() * 1.2,
                        (Math.random() - 0.5) * 1.2
                    ],
                    life: smokeLife,
                    maxLife: smokeLife,
                    color: isMissile ? [0.78, 0.80, 0.84, 0.85] : [0.95, 0.55, 0.15, 0.9],
                    size: isMissile ? 0.36 : 0.28,
                    buoyancy: 1.5
                });
            }
        }

        entityManager.incomingSamWarning = activeSamTargetingDrone;

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

            const isHeavyOrdnance =
                p.kind === 'TANK_SHELL' ||
                p.kind === 'ARTILLERY_SHELL' ||
                p.kind === 'SAM_MISSILE' ||
                p.kind === 'RPG_ROCKET' ||
                p.kind === 'HELI_ROCKET';

            // Check Ground Collision against true terrain height
            const pGroundY = collisionSystem.getGroundHeight(activeMapId, p.pos[0], p.pos[2], groundElevation);
            if (p.pos[1] <= pGroundY + 0.08) {
                p.pos[1] = pGroundY + 0.08;
                if (isHeavyOrdnance) {
                    this.spawnHeavyExplosion(p.pos, 26);
                    if (dronePos) {
                        const d = Math.hypot(p.pos[0] - dronePos[0], p.pos[1] - dronePos[1], p.pos[2] - dronePos[2]);
                        soundManager.playBattlefieldExplosion(d);
                    }
                } else {
                    const pColor: [number, number, number, number] = p.isRailgun ? [0.8, 0.4, 1.0, 1.0] : [0.95, 0.7, 0.2, 1.0];
                    this.spawnImpactParticles(p.pos, [0, 1, 0], pColor, p.isRailgun ? 14 : 6);
                    if (p.faction === 'PLAYER') soundManager.playImpact();
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            // Check Building / Obstacle Collision
            const rayHit = collisionSystem.raycast(p.prevPos, p.pos);
            if (rayHit) {
                if (isHeavyOrdnance) {
                    this.spawnHeavyExplosion(rayHit.point, 24);
                } else {
                    const pColor: [number, number, number, number] = p.isRailgun ? [0.9, 0.5, 1.0, 1.0] : [0.4, 0.85, 1.0, 1.0];
                    this.spawnImpactParticles(rayHit.point, rayHit.normal, pColor, p.isRailgun ? 16 : 8);
                    if (p.faction === 'PLAYER') soundManager.playImpact();
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            // Check Entity Collision (Tanks, SAMs, Soldiers, Helicopters, Jets)
            const damage = p.damage ?? (p.isRailgun ? 120 : 45);
            const entHit = entityManager.checkHit(p.prevPos, p.pos, damage, p.faction || 'PLAYER', p.shooterId);
            if (entHit.hitEntity && entHit.hitPoint) {
                const ent = entHit.hitEntity;
                const wasKilled = !ent.isAlive;
                const isPlayerShot = !p.faction || p.faction === 'PLAYER';

                if (isPlayerShot) {
                    this.hitMarkerTimer = 0.38;
                    this.hitMarkerText = wasKilled
                        ? `🎯 DESTROYED: ${ent.roleName.toUpperCase()}!`
                        : (p.isRailgun ? `⚡ CRITICAL HIT: ${ent.roleName}` : `✕ HIT: ${ent.roleName}`);
                }

                if (wasKilled) {
                    if (isPlayerShot) {
                        missionManager.showNotification(`TARGET NEUTRALIZED: ${ent.roleName.toUpperCase()}`);
                        soundManager.playExplosion();
                    } else if (dronePos) {
                        const d = Math.hypot(entHit.hitPoint[0] - dronePos[0], entHit.hitPoint[1] - dronePos[1], entHit.hitPoint[2] - dronePos[2]);
                        soundManager.playBattlefieldExplosion(d);
                    }

                    const isHeavyVehicle = ent.type === 'TANK';
                    this.spawnHeavyExplosion(entHit.hitPoint, isHeavyVehicle ? 55 : 28);

                    if (this.lockedEntity?.id === ent.id) {
                        this.clearLock(soundManager);
                    }
                } else {
                    if (isHeavyOrdnance) {
                        this.spawnHeavyExplosion(entHit.hitPoint, 20);
                    } else {
                        this.spawnImpactParticles(entHit.hitPoint, [0, 1, 0], [1.0, 0.9, 0.2, 1.0], isPlayerShot ? 12 : 6);
                    }
                    if (isPlayerShot) soundManager.playImpact();
                }

                this.projectiles.splice(i, 1);
                continue;
            }
        }

        // 3. Update Impact & Battlefield Particles
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

            if (part.buoyancy !== undefined) {
                part.vel[1] += part.buoyancy * dt;
            } else {
                part.vel[1] -= 9.8 * dt;
            }

            part.color[3] = Math.max(0, part.life / part.maxLife);
        }
    }

    public spawnHeavyExplosion(pos: [number, number, number], count: number = 35): void {
        if (this.particles.length > 950) return;
        for (let i = 0; i < count; i++) {
            const speed = 5.0 + Math.random() * 14.0;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.65;
            const vx = Math.cos(theta) * Math.sin(phi) * speed;
            const vy = Math.cos(phi) * speed + 2.5;
            const vz = Math.sin(theta) * Math.sin(phi) * speed;

            const rRoll = Math.random();
            let color: [number, number, number, number];
            let size = 0.35;
            let buoyancy: number | undefined = undefined;
            let life = 0.35 + Math.random() * 0.45;

            if (rRoll < 0.45) {
                // Bright fiery orange/red blast
                color = [1.0, 0.38 + Math.random() * 0.3, 0.08, 1.0];
                size = 0.45 + Math.random() * 0.35;
            } else if (rRoll < 0.75) {
                // Rising dark warzone smoke
                color = [0.22, 0.22, 0.24, 0.9];
                size = 0.65 + Math.random() * 0.45;
                buoyancy = 3.5;
                life = 0.7 + Math.random() * 0.6;
            } else {
                // White-hot shrapnel sparks
                color = [1.0, 0.92, 0.35, 1.0];
                size = 0.24;
            }

            this.particles.push({
                pos: [pos[0], pos[1] + 0.2, pos[2]],
                vel: [vx, vy, vz],
                life,
                maxLife: life,
                color,
                size,
                buoyancy
            });
        }
    }

    public spawnImpactParticles(
        pos: [number, number, number],
        normal: [number, number, number],
        color: [number, number, number, number],
        count: number = 10
    ): void {
        if (this.particles.length > 950) return;
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
                color: [...color],
                size: 0.20
            });
        }
    }
}
