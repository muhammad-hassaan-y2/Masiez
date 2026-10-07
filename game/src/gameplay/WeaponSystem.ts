import { CollisionSystem } from './CollisionSystem';
import { EntityManager, BaseEntity } from './EntityManager';
import { SoundManager } from './SoundManager';
import { MissionManager } from './MissionManager';

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

export class WeaponSystem {
    public projectiles: Projectile[] = [];
    public particles: ImpactParticle[] = [];

    private lastShotTime: number = 0;
    private fireCooldownSec: number = 0.16; // rapid fire laser (up to 6 shots/sec)
    private barrelToggle: boolean = false;

    public hitMarkerTimer: number = 0;
    public hitMarkerText: string = "";

    constructor() {}

    public fire(
        dronePos: [number, number, number],
        droneRotDeg: [number, number, number],
        droneVel: [number, number, number],
        soundManager: SoundManager,
        nowSec: number
    ): boolean {
        if (nowSec - this.lastShotTime < this.fireCooldownSec) {
            return false;
        }
        this.lastShotTime = nowSec;

        const rollRad = droneRotDeg[0] * (Math.PI / 180.0);
        const pitchRad = droneRotDeg[1] * (Math.PI / 180.0);
        const yawRad = droneRotDeg[2] * (Math.PI / 180.0);

        // Compute forward aiming vector from drone pitch & yaw
        const cy = Math.cos(yawRad), sy = Math.sin(yawRad);
        const cp = Math.cos(pitchRad), sp = Math.sin(pitchRad);
        
        // Forward vector in world space
        const fwdX = sy * cp;
        const fwdY = -sp;
        const fwdZ = cy * cp;

        // Right vector in world space
        const rightX = cy;
        const rightY = 0;
        const rightZ = -sy;

        // Alternate or fire twin cannons
        const sideOffset = (this.barrelToggle ? 0.38 : -0.38);
        this.barrelToggle = !this.barrelToggle;

        const muzzleX = dronePos[0] + fwdX * 0.45 + rightX * sideOffset;
        const muzzleY = dronePos[1] + fwdY * 0.45 - 0.05;
        const muzzleZ = dronePos[2] + fwdZ * 0.45 + rightZ * sideOffset;

        // Laser projectile speed
        const speed = 140.0;
        const pVel: [number, number, number] = [
            droneVel[0] * 0.3 + fwdX * speed,
            droneVel[1] * 0.3 + fwdY * speed,
            droneVel[2] * 0.3 + fwdZ * speed,
        ];

        this.projectiles.push({
            pos: [muzzleX, muzzleY, muzzleZ],
            prevPos: [muzzleX, muzzleY, muzzleZ],
            vel: pVel,
            life: 2.5,
            color: [0.0, 1.0, 0.85, 1.0] // Glowing Cyan Plasma
        });

        // Fire second twin barrel simultaneously for devastating twin cannon firepower
        const otherOffset = -sideOffset;
        const m2X = dronePos[0] + fwdX * 0.45 + rightX * otherOffset;
        const m2Y = dronePos[1] + fwdY * 0.45 - 0.05;
        const m2Z = dronePos[2] + fwdZ * 0.45 + rightZ * otherOffset;

        this.projectiles.push({
            pos: [m2X, m2Y, m2Z],
            prevPos: [m2X, m2Y, m2Z],
            vel: pVel,
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
        soundManager: SoundManager
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

            // Check Ground Collision
            if (p.pos[1] <= 0.0) {
                p.pos[1] = 0.05;
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
