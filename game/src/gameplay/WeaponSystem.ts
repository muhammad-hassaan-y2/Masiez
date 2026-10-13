import { CollisionSystem } from './CollisionSystem';
import { EntityManager, BaseEntity, WarProjectileSpawn, WarEffectCallbacks } from './EntityManager';
import { SoundManager } from './SoundManager';
import { MissionManager } from './MissionManager';
import { Camera } from '../scene/Camera';

export type ProjectileKind =
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
}

export interface ImpactParticle {
    pos: [number, number, number];
    vel: [number, number, number];
    life: number;
    maxLife: number;
    color: [number, number, number, number];
    size?: number;
    buoyancy?: number;
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
    weaponMode: 'KAMIKAZE_WARHEAD';
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
     * Find best hostile entity candidate aligned with camera crosshair within range
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
            if (!ent.isAlive || ent.faction !== 'HOSTILE') continue;
            const toEnt = [
                ent.pos[0] - camPos[0],
                (ent.pos[1] + ent.height * 0.5) - camPos[1],
                ent.pos[2] - camPos[2]
            ];
            const dist = Math.hypot(toEnt[0], toEnt[1], toEnt[2]);
            if (dist < 1.0 || dist > maxRange) continue;

            const dot = toEnt[0] * camFwd[0] + toEnt[1] * camFwd[1] + toEnt[2] * camFwd[2];
            if (dot <= 0) continue;

            const perpDist = Math.hypot(
                toEnt[0] - camFwd[0] * dot,
                toEnt[1] - camFwd[1] * dot,
                toEnt[2] - camFwd[2] * dot
            );

            const tolerance = Math.max(ent.radius * 2.4, dot * 0.075);
            if (perpDist <= tolerance) {
                const score = perpDist + dist * 0.04;
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
            // If no hostile target is directly under reticle, cycle to the nearest alive hostile target
            const aliveHostiles = entityManager.getAliveHostileTargets();
            if (aliveHostiles.length > 0) {
                let nearest = aliveHostiles[0];
                let minDist = Infinity;
                for (const h of aliveHostiles) {
                    const d = Math.hypot(
                        h.pos[0] - camera.position[0],
                        h.pos[1] - camera.position[1],
                        h.pos[2] - camera.position[2]
                    );
                    if (d < minDist) {
                        minDist = d;
                        nearest = h;
                    }
                }
                this.lockedEntity = nearest;
                this.candidateEntity = nearest;
                this.lockState = 'LOCKED';
                this.acquireTimer = this.acquireDuration;
                this.lockBreakTimer = 0;
                soundManager.playTargetLocked();
            } else {
                soundManager.playLockLost();
            }
        }
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
     * Updates active target acquisition, line-of-sight tracking, and kamikaze intercept point
     */
    public updateTargetLock(
        camera: Camera,
        collisionSystem: CollisionSystem,
        entityManager: EntityManager,
        soundManager: SoundManager,
        dt: number,
        activeMapId: string = 'airfield',
        droneVel?: [number, number, number]
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
                bestDist = dist;
                targetFocusPoint = [ent.pos[0], ent.pos[1] + ent.height * 0.5, ent.pos[2]];
                this.lockState = 'LOCKED';
            }
        }

        // 2. If not locked, scan for candidate hostile targets under reticle
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

        // 3. Fallback to building/obstacle/ground raycast if no entity targeted
        if (!this.lockedEntity && !this.candidateEntity) {
            const colHit = collisionSystem.raycast(camPos, rayEnd);
            if (colHit && colHit.dist < bestDist) {
                bestDist = colHit.dist;
                targetFocusPoint = colHit.point;
            }

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

        const activeEnt = this.lockedEntity || this.candidateEntity;
        if (activeEnt) {
            const headingRad = activeEnt.headingDeg * (Math.PI / 180.0);
            const entVx = Math.sin(headingRad) * activeEnt.speed;
            const entVz = Math.cos(headingRad) * activeEnt.speed;
            const droneSpd = droneVel ? Math.max(20.0, Math.hypot(droneVel[0], droneVel[1], droneVel[2])) : 30.0;
            const interceptTime = Math.min(4.0, bestDist / droneSpd);

            this.predictedLeadPoint = [
                activeEnt.pos[0] + entVx * interceptTime,
                activeEnt.pos[1] + activeEnt.height * 0.5,
                activeEnt.pos[2] + entVz * interceptTime
            ];

            const toEntX = (activeEnt.pos[0] - camPos[0]) / (bestDist || 1);
            const toEntZ = (activeEnt.pos[2] - camPos[2]) / (bestDist || 1);
            const relVx = (droneVel ? droneVel[0] : 0) - entVx;
            const relVz = (droneVel ? droneVel[2] : 0) - entVz;
            this.targetClosureSpeed = relVx * toEntX + relVz * toEntZ;
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
            weaponMode: 'KAMIKAZE_WARHEAD'
        };
    }

    /**
     * Detonates the drone's onboard explosive warhead on impact, destroying any hostile targets
     * directly hit or within the warhead's 5.5m lethal blast radius.
     */
    public detonateWarhead(
        blastPos: [number, number, number],
        entityManager: EntityManager,
        soundManager: SoundManager,
        directHitEntity?: BaseEntity | null
    ): BaseEntity[] {
        soundManager.playExplosion();
        this.spawnHeavyExplosion(blastPos, 75);
        this.spawnImpactParticles(blastPos, [0, 1, 0], [1.0, 0.45, 0.08, 1.0], 50);
        this.spawnImpactParticles(blastPos, [0, 1, 0], [1.0, 0.90, 0.25, 1.0], 35);

        const destroyed = entityManager.detonateKamikazeStrike(blastPos, 5.5, directHitEntity);
        if (destroyed.length > 0) {
            this.hitMarkerTimer = 1.6;
            const names = destroyed.map(d => d.roleName.toUpperCase()).join(', ');
            this.hitMarkerText = `🎯 TARGET DESTROYED: ${names}`;
            if (this.lockedEntity && destroyed.some(d => d.id === this.lockedEntity?.id)) {
                this.clearLock();
            }
        }
        return destroyed;
    }

    public update(
        dt: number,
        collisionSystem: CollisionSystem,
        entityManager: EntityManager,
        _missionManager: MissionManager,
        soundManager: SoundManager,
        activeMapId: string = 'airfield',
        groundElevation: number = 0.0,
        dronePos?: [number, number, number]
    ): void {
        if (this.hitMarkerTimer > 0) {
            this.hitMarkerTimer -= dt;
        }

        // 1. Update Battlefield Projectiles (Ambient Tank Shells, Tracers, Artillery)
        for (const p of this.projectiles) {
            if (p.gravity) {
                p.vel[1] -= p.gravity * dt;
            }

            if (p.smokeTrail && this.particles.length < 950 && Math.random() < 0.75) {
                const smokeLife = 0.35;
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
                    color: [0.95, 0.55, 0.15, 0.9],
                    size: 0.28,
                    buoyancy: 1.5
                });
            }
        }

        // 2. Check Ambient Projectile Collisions
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

            const isHeavyOrdnance = p.kind === 'TANK_SHELL' || p.kind === 'ARTILLERY_SHELL';

            const pGroundY = collisionSystem.getGroundHeight(activeMapId, p.pos[0], p.pos[2], groundElevation);
            if (p.pos[1] <= pGroundY + 0.08) {
                p.pos[1] = pGroundY + 0.08;
                if (isHeavyOrdnance) {
                    this.spawnHeavyExplosion(p.pos, 24);
                    if (dronePos) {
                        const d = Math.hypot(p.pos[0] - dronePos[0], p.pos[1] - dronePos[1], p.pos[2] - dronePos[2]);
                        soundManager.playBattlefieldExplosion(d);
                    }
                } else {
                    this.spawnImpactParticles(p.pos, [0, 1, 0], [0.95, 0.7, 0.2, 1.0], 5);
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            const rayHit = collisionSystem.raycast(p.prevPos, p.pos);
            if (rayHit) {
                if (isHeavyOrdnance) {
                    this.spawnHeavyExplosion(rayHit.point, 20);
                } else {
                    this.spawnImpactParticles(rayHit.point, rayHit.normal, [0.4, 0.85, 1.0, 1.0], 6);
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            const entHit = entityManager.checkHit(p.prevPos, p.pos, 0, p.faction, p.shooterId);
            if (entHit.hitEntity && entHit.hitPoint) {
                if (isHeavyOrdnance) {
                    this.spawnHeavyExplosion(entHit.hitPoint, 18);
                } else {
                    this.spawnImpactParticles(entHit.hitPoint, [0, 1, 0], [1.0, 0.9, 0.2, 1.0], 5);
                }
                this.projectiles.splice(i, 1);
                continue;
            }
        }

        // 3. Update Impact & Explosion Particles
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
                color = [1.0, 0.38 + Math.random() * 0.3, 0.08, 1.0];
                size = 0.45 + Math.random() * 0.35;
            } else if (rRoll < 0.75) {
                color = [0.22, 0.22, 0.24, 0.9];
                size = 0.65 + Math.random() * 0.45;
                buoyancy = 3.5;
                life = 0.7 + Math.random() * 0.6;
            } else {
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
