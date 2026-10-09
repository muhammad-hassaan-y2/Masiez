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
}

export interface ImpactParticle {
    pos: [number, number, number];
    vel: [number, number, number];
    life: number;
    maxLife: number;
    color: [number, number, number, number];
}

export interface FocusTargetResult {
    targetPoint: [number, number, number];
    distance: number;
    lockedEntity: BaseEntity | null;
}

export class WeaponSystem {
    public projectiles: Projectile[] = [];
    public particles: ImpactParticle[] = [];

    private lastShotTime: number = 0;
    private fireCooldownSec: number = 0.16; // rapid fire laser (up to 6 shots/sec)

    public hitMarkerTimer: number = 0;
    public hitMarkerText: string = "";

    constructor() {}

    /**
     * Casts aim focus ray from camera through screen center crosshair/pointer into 3D world
     */
    public getFocusTarget(
        camera: Camera,
        collisionSystem: CollisionSystem,
        entityManager: EntityManager,
        activeMapId: string = 'airfield'
    ): FocusTargetResult {
        const camPos = camera.position;
        const camFwd = camera.getForwardVector();
        const maxRange = 350.0;
        const rayEnd: [number, number, number] = [
            camPos[0] + camFwd[0] * maxRange,
            camPos[1] + camFwd[1] * maxRange,
            camPos[2] + camFwd[2] * maxRange
        ];

        let targetFocusPoint: [number, number, number] = rayEnd;
        let bestDist = maxRange;
        let lockedTarget: BaseEntity | null = null;

        // 1. Check for Entity Focus Lock (Target Drones, Rovers, Pedestrians)
        // With smart aim assist: ray to entity distance within 1.5x entity radius or ~4° cone
        for (const ent of entityManager.entities) {
            if (!ent.isAlive) continue;
            const toEnt = [
                ent.pos[0] - camPos[0],
                (ent.pos[1] + ent.height * 0.5) - camPos[1],
                ent.pos[2] - camPos[2]
            ];
            const dot = toEnt[0] * camFwd[0] + toEnt[1] * camFwd[1] + toEnt[2] * camFwd[2];
            if (dot > 2.0 && dot < bestDist) {
                const perpDist = Math.hypot(
                    toEnt[0] - camFwd[0] * dot,
                    toEnt[1] - camFwd[1] * dot,
                    toEnt[2] - camFwd[2] * dot
                );
                // Smart lock-on cone (1.4x entity radius or subtle angular cone)
                const tolerance = Math.max(ent.radius * 1.4, dot * 0.045);
                if (perpDist <= tolerance) {
                    bestDist = dot;
                    targetFocusPoint = [ent.pos[0], ent.pos[1] + ent.height * 0.5, ent.pos[2]];
                    lockedTarget = ent;
                }
            }
        }

        // 2. If no entity targeted, check Building / Obstacle Colliders
        if (!lockedTarget) {
            const colHit = collisionSystem.raycast(camPos, rayEnd);
            if (colHit && colHit.dist < bestDist) {
                bestDist = colHit.dist;
                targetFocusPoint = colHit.point;
            }
        }

        // 3. Ground / Terrain Elevation Raymarch intersection
        if (!lockedTarget) {
            let prevT = 0;
            let prevDiff = camPos[1] - collisionSystem.getGroundHeight(activeMapId, camPos[0], camPos[2], camera.currentGroundElevation);
            const stepDist = 3.5;
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

        return {
            targetPoint: targetFocusPoint,
            distance: bestDist,
            lockedEntity: lockedTarget
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
        if (nowSec - this.lastShotTime < this.fireCooldownSec) {
            return false;
        }
        this.lastShotTime = nowSec;

        // Obtain exact target focus point from the crosshair/pointer raycast
        const focus = this.getFocusTarget(camera, collisionSystem, entityManager, activeMapId);
        const targetPoint = focus.targetPoint;

        const rollRad = droneRotDeg[0] * (Math.PI / 180.0);
        const pitchRad = droneRotDeg[1] * (Math.PI / 180.0);
        const yawRad = droneRotDeg[2] * (Math.PI / 180.0);

        const cy = Math.cos(yawRad), sy = Math.sin(yawRad);
        const cp = Math.cos(pitchRad), sp = Math.sin(pitchRad);
        
        // Drone right and forward vectors in world space
        const rightX = cy, rightZ = -sy;
        const fwdX = sy * cp, fwdY = -sp, fwdZ = cy * cp;

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

        // Laser speed: 220 m/s for instant, crisp arcade response
        const speed = 220.0;

        const computeVel = (muzzle: [number, number, number]): [number, number, number] => {
            const dx = targetPoint[0] - muzzle[0];
            const dy = targetPoint[1] - muzzle[1];
            const dz = targetPoint[2] - muzzle[2];
            const len = Math.hypot(dx, dy, dz) || 1.0;
            // Pure laser vector directly to crosshair target without drift
            return [
                (dx / len) * speed,
                (dy / len) * speed,
                (dz / len) * speed
            ];
        };

        this.projectiles.push({
            pos: [m1Pos[0], m1Pos[1], m1Pos[2]],
            prevPos: [m1Pos[0], m1Pos[1], m1Pos[2]],
            vel: computeVel(m1Pos),
            life: 2.5,
            color: [0.0, 1.0, 0.85, 1.0] // Neon Cyan Plasma
        });

        this.projectiles.push({
            pos: [m2Pos[0], m2Pos[1], m2Pos[2]],
            prevPos: [m2Pos[0], m2Pos[1], m2Pos[2]],
            vel: computeVel(m2Pos),
            life: 2.5,
            color: [0.0, 1.0, 0.85, 1.0]
        });

        // Play laser shot sound
        soundManager.playLaserShot();

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

        // 1. Update Projectiles
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
                this.spawnImpactParticles(p.pos, [0, 1, 0], [0.95, 0.7, 0.2, 1.0], 8);
                soundManager.playImpact();
                this.projectiles.splice(i, 1);
                continue;
            }

            // Check Building / Obstacle Collision
            const rayHit = collisionSystem.raycast(p.prevPos, p.pos);
            if (rayHit) {
                this.spawnImpactParticles(rayHit.point, rayHit.normal, [0.4, 0.85, 1.0, 1.0], 12);
                soundManager.playImpact();
                this.projectiles.splice(i, 1);
                continue;
            }

            // Check Entity Collision (Moving persons, rovers, aerial target drones)
            const entHit = entityManager.checkHit(p.prevPos, p.pos, 45);
            if (entHit.hitEntity && entHit.hitPoint) {
                const ent = entHit.hitEntity;
                const wasKilled = !ent.isAlive;

                // Trigger Hit Marker
                this.hitMarkerTimer = 0.35;
                this.hitMarkerText = wasKilled ? `DESTROYED: ${ent.roleName.toUpperCase()}!` : `HIT: ${ent.roleName}`;

                if (wasKilled) {
                    const awardPoints = ent.type === 'ROVER' ? 500 : (ent.type === 'TARGET_DRONE' ? 250 : 150);
                    missionManager.score += awardPoints;
                    missionManager.showNotification(`TARGET DESTROYED! +${awardPoints} PTS`);
                    this.spawnImpactParticles(entHit.hitPoint, [0, 1, 0], [1.0, 0.4, 0.1, 1.0], 24);
                    soundManager.playExplosion();
                } else {
                    missionManager.score += 50;
                    this.spawnImpactParticles(entHit.hitPoint, [0, 1, 0], [1.0, 0.9, 0.2, 1.0], 14);
                    soundManager.playImpact();
                }

                this.projectiles.splice(i, 1);
                continue;
            }
        }

        // 2. Update Impact Particles
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

    private spawnImpactParticles(
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
