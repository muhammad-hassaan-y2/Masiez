export type EntityType = 'SOLDIER' | 'TANK';

export type FactionType = 'ALLY' | 'HOSTILE';

export interface BaseEntity {
    id: string;
    type: EntityType;
    faction: FactionType;
    pos: [number, number, number];
    headingDeg: number;
    turretYawDeg?: number;
    speed: number;
    health: number;
    maxHealth: number;
    radius: number;
    height: number;
    walkPhase: number;
    isAlive: boolean;
    respawnTimer: number;
    color: [number, number, number, number];
    roleName: string;
    battalionId?: string;
    formationOffset?: [number, number]; // [rightOffset, forwardOffset]
    combatCooldown: number;
    isEngaged?: boolean;
}

export interface WaypointRoute {
    points: [number, number, number][];
    currentIndex: number;
}

export interface BattalionState {
    id: string;
    name: string;
    faction: FactionType;
    pos: [number, number, number];
    headingDeg: number;
    speed: number;
    route: WaypointRoute;
    isEngaged: boolean;
}

export interface WarProjectileSpawn {
    pos: [number, number, number];
    vel: [number, number, number];
    color: [number, number, number, number];
    kind: 'TANK_SHELL' | 'RPG_ROCKET' | 'TRACER' | 'ARTILLERY_SHELL';
    faction: 'ALLY' | 'HOSTILE';
    shooterId: string;
    shooterName: string;
    damage: number;
    life: number;
    gravity?: number;
    smokeTrail?: boolean;
    targetEntityId?: string;
    targetsPlayerDrone?: boolean;
    homingStrength?: number;
}

export interface WarEffectCallbacks {
    spawnWarProjectile: (proj: WarProjectileSpawn) => void;
    spawnMuzzleFlash: (
        pos: [number, number, number],
        dir: [number, number, number],
        color: [number, number, number, number],
        count: number
    ) => void;
    spawnWreckSmoke: (pos: [number, number, number]) => void;
    onGunfireAudio: (distToDrone: number) => void;
    onExplosionAudio: (distToDrone: number) => void;
    onMissileWarningAudio: () => void;
}

export class EntityManager {
    public entities: BaseEntity[] = [];
    private routes: Map<string, WaypointRoute> = new Map();
    private battalions: Map<string, BattalionState> = new Map();

    // Real-Time Battlefield War Telemetry
    public alliedKills: number = 0;
    public hostileKills: number = 0;
    public latestBattleLog: string = 'KAMIKAZE FPV MISSION: DESTROY ALL HOSTILE TARGETS';
    public incomingSamWarning: boolean = false;
    private artilleryTimer: number = 2.0;
    private centerSpawn: [number, number, number] = [0, 0, 0];
    private baseGroundY: number = 0;

    constructor() {
        this.initAirfieldEntities();
    }

    public getHostileTargets(): BaseEntity[] {
        return this.entities.filter(e => e.faction === 'HOSTILE');
    }

    public getAliveHostileTargets(): BaseEntity[] {
        return this.entities.filter(e => e.faction === 'HOSTILE' && e.isAlive);
    }

    public getTotalHostileCount(): number {
        return this.entities.filter(e => e.faction === 'HOSTILE').length;
    }

    public getDestroyedHostileCount(): number {
        return this.entities.filter(e => e.faction === 'HOSTILE' && !e.isAlive).length;
    }

    public initMapEntities(mapId: string, spawnPos: [number, number, number], groundY: number): void {
        if (mapId === 'airfield') {
            this.initAirfieldEntities();
            return;
        }

        this.entities = [];
        this.routes.clear();
        this.battalions.clear();
        this.alliedKills = 0;
        this.hostileKills = 0;
        this.centerSpawn = [...spawnPos];
        this.baseGroundY = groundY;
        this.latestBattleLog = `SECTOR ${mapId.toUpperCase()}: 6 HOSTILE TARGETS IDENTIFIED`;

        const sx = spawnPos[0];
        const sz = spawnPos[2];
        const gy = groundY;

        // 1. ALLIED SUPPORT UNITS (2 Allied Tanks + 1 Allied Squad)
        this.addTank(
            `${mapId}_ally_tank_1`,
            'Allied Tank Alpha',
            'ALLY',
            [sx - 20, gy, sz - 10],
            0,
            4.5,
            [0.22, 0.48, 0.30, 1.0],
            [
                [sx - 20, gy, sz - 10],
                [sx - 20, gy, sz + 25],
                [sx - 32, gy, sz + 25],
                [sx - 32, gy, sz - 10]
            ]
        );

        this.addTank(
            `${mapId}_ally_tank_2`,
            'Allied Tank Bravo',
            'ALLY',
            [sx + 20, gy, sz - 8],
            0,
            4.5,
            [0.24, 0.50, 0.32, 1.0],
            [
                [sx + 20, gy, sz - 8],
                [sx + 20, gy, sz + 28],
                [sx + 32, gy, sz + 28],
                [sx + 32, gy, sz - 8]
            ]
        );

        this.addSoldierBattalion(
            `${mapId}_ally_bat_1`,
            'Allied 1st Squad',
            'ALLY',
            [sx - 8, gy, sz + 4],
            0,
            1.7,
            [0.20, 0.58, 0.38, 1.0],
            [
                [sx - 8, gy, sz + 4],
                [sx - 8, gy, sz + 30],
                [sx - 18, gy, sz + 30],
                [sx - 18, gy, sz + 4]
            ],
            4
        );

        // 2. MISSION TARGETS: SET OF 6 HOSTILE TARGETS (3 Hostile Tanks + 3 Hostile Soldiers)
        this.addTank(
            `${mapId}_hostile_tank_1`,
            'Hostile Tank Alpha',
            'HOSTILE',
            [sx - 16, gy, sz + 52],
            180,
            3.8,
            [0.75, 0.22, 0.18, 1.0],
            [
                [sx - 16, gy, sz + 52],
                [sx - 16, gy, sz + 24],
                [sx - 28, gy, sz + 24],
                [sx - 28, gy, sz + 52]
            ]
        );

        this.addTank(
            `${mapId}_hostile_tank_2`,
            'Hostile Tank Bravo',
            'HOSTILE',
            [sx + 16, gy, sz + 58],
            180,
            4.0,
            [0.72, 0.20, 0.16, 1.0],
            [
                [sx + 16, gy, sz + 58],
                [sx + 16, gy, sz + 26],
                [sx + 28, gy, sz + 26],
                [sx + 28, gy, sz + 58]
            ]
        );

        this.addTank(
            `${mapId}_hostile_tank_3`,
            'Hostile Tank Charlie',
            'HOSTILE',
            [sx + 2, gy, sz + 78],
            180,
            3.6,
            [0.78, 0.24, 0.18, 1.0],
            [
                [sx + 2, gy, sz + 78],
                [sx - 12, gy, sz + 48],
                [sx + 14, gy, sz + 48],
                [sx + 2, gy, sz + 78]
            ]
        );

        this.addHostileSoldierTarget(
            `${mapId}_hostile_soldier_1`,
            'Hostile Soldier Alpha',
            [sx - 6, gy, sz + 38],
            180,
            1.6,
            [
                [sx - 6, gy, sz + 38],
                [sx - 6, gy, sz + 20],
                [sx - 14, gy, sz + 20],
                [sx - 14, gy, sz + 38]
            ]
        );

        this.addHostileSoldierTarget(
            `${mapId}_hostile_soldier_2`,
            'Hostile Soldier Bravo',
            [sx + 8, gy, sz + 42],
            180,
            1.6,
            [
                [sx + 8, gy, sz + 42],
                [sx + 8, gy, sz + 22],
                [sx + 16, gy, sz + 22],
                [sx + 16, gy, sz + 42]
            ]
        );

        this.addHostileSoldierTarget(
            `${mapId}_hostile_soldier_3`,
            'Hostile Soldier Charlie',
            [sx + 0, gy, sz + 64],
            180,
            1.6,
            [
                [sx + 0, gy, sz + 64],
                [sx + 0, gy, sz + 44],
                [sx + 10, gy, sz + 44],
                [sx + 10, gy, sz + 64]
            ]
        );
    }

    public initAirfieldEntities(): void {
        this.entities = [];
        this.routes.clear();
        this.battalions.clear();
        this.alliedKills = 0;
        this.hostileKills = 0;
        this.centerSpawn = [0, 1.5, 0];
        this.baseGroundY = 0;
        this.latestBattleLog = 'AIRFIELD FRONTLINE: 6 HOSTILE TARGETS IDENTIFIED';

        // 1. ALLIED SUPPORT UNITS
        this.addTank(
            'airfield_ally_tank_1',
            'Allied Tank Alpha',
            'ALLY',
            [-20, 0, -12],
            0,
            4.5,
            [0.22, 0.48, 0.30, 1.0],
            [
                [-20, 0, -12],
                [-20, 0, 25],
                [-32, 0, 25],
                [-32, 0, -12]
            ]
        );

        this.addTank(
            'airfield_ally_tank_2',
            'Allied Tank Bravo',
            'ALLY',
            [20, 0, -10],
            0,
            4.5,
            [0.24, 0.50, 0.32, 1.0],
            [
                [20, 0, -10],
                [20, 0, 28],
                [32, 0, 28],
                [32, 0, -10]
            ]
        );

        this.addSoldierBattalion(
            'airfield_ally_bat_alpha',
            'Allied 1st Squad',
            'ALLY',
            [-8, 0, 6],
            0,
            1.7,
            [0.20, 0.58, 0.38, 1.0],
            [
                [-8, 0, 6],
                [-8, 0, 32],
                [-18, 0, 32],
                [-18, 0, 6]
            ],
            4
        );

        // 2. MISSION TARGETS: SET OF 6 HOSTILE TARGETS (3 Hostile Tanks + 3 Hostile Soldiers)
        this.addTank(
            'airfield_hostile_tank_1',
            'Hostile Tank Alpha',
            'HOSTILE',
            [-15, 0, 52],
            180,
            3.8,
            [0.75, 0.22, 0.18, 1.0],
            [
                [-15, 0, 52],
                [-15, 0, 24],
                [-28, 0, 24],
                [-28, 0, 52]
            ]
        );

        this.addTank(
            'airfield_hostile_tank_2',
            'Hostile Tank Bravo',
            'HOSTILE',
            [16, 0, 56],
            180,
            4.0,
            [0.72, 0.20, 0.16, 1.0],
            [
                [16, 0, 56],
                [16, 0, 24],
                [28, 0, 24],
                [28, 0, 56]
            ]
        );

        this.addTank(
            'airfield_hostile_tank_3',
            'Hostile Tank Charlie',
            'HOSTILE',
            [2, 0, 76],
            180,
            3.6,
            [0.78, 0.24, 0.18, 1.0],
            [
                [2, 0, 76],
                [-12, 0, 48],
                [14, 0, 48],
                [2, 0, 76]
            ]
        );

        this.addHostileSoldierTarget(
            'airfield_hostile_soldier_1',
            'Hostile Soldier Alpha',
            [-6, 0, 38],
            180,
            1.6,
            [
                [-6, 0, 38],
                [-6, 0, 20],
                [-14, 0, 20],
                [-14, 0, 38]
            ]
        );

        this.addHostileSoldierTarget(
            'airfield_hostile_soldier_2',
            'Hostile Soldier Bravo',
            [8, 0, 40],
            180,
            1.6,
            [
                [8, 0, 40],
                [8, 0, 22],
                [16, 0, 22],
                [16, 0, 40]
            ]
        );

        this.addHostileSoldierTarget(
            'airfield_hostile_soldier_3',
            'Hostile Soldier Charlie',
            [0, 0, 62],
            180,
            1.6,
            [
                [0, 0, 62],
                [0, 0, 44],
                [10, 0, 44],
                [10, 0, 62]
            ]
        );
    }

    private addTank(
        id: string,
        name: string,
        faction: FactionType,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        armorColor: [number, number, number, number],
        routePoints: [number, number, number][]
    ): void {
        this.entities.push({
            id,
            type: 'TANK',
            faction,
            pos: [...startPos],
            headingDeg: heading,
            turretYawDeg: heading,
            speed,
            health: 500,
            maxHealth: 500,
            radius: 2.6,
            height: 2.2,
            walkPhase: Math.random() * 10,
            isAlive: true,
            respawnTimer: 0,
            color: armorColor,
            roleName: name,
            combatCooldown: 0.5 + Math.random() * 1.5
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
    }

    private addHostileSoldierTarget(
        id: string,
        name: string,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        routePoints: [number, number, number][]
    ): void {
        this.entities.push({
            id,
            type: 'SOLDIER',
            faction: 'HOSTILE',
            pos: [...startPos],
            headingDeg: heading,
            speed,
            health: 120,
            maxHealth: 120,
            radius: 0.8,
            height: 1.8,
            walkPhase: Math.random() * Math.PI,
            isAlive: true,
            respawnTimer: 0,
            color: [0.85, 0.25, 0.20, 1.0],
            roleName: name,
            combatCooldown: 0.4 + Math.random() * 0.8
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
    }

    private addSoldierBattalion(
        battalionId: string,
        battalionName: string,
        faction: FactionType,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        uniformColor: [number, number, number, number],
        routePoints: [number, number, number][],
        soldierCount: number = 4
    ): void {
        this.battalions.set(battalionId, {
            id: battalionId,
            name: battalionName,
            faction,
            pos: [...startPos],
            headingDeg: heading,
            speed,
            route: {
                points: routePoints,
                currentIndex: 0
            },
            isEngaged: false
        });

        const hRad = heading * (Math.PI / 180.0);
        const fwdX = Math.sin(hRad), fwdZ = Math.cos(hRad);
        const rgtX = Math.cos(hRad), rgtZ = -Math.sin(hRad);

        for (let i = 0; i < soldierCount; i++) {
            const col = (i % 2 === 0) ? -1.2 : 1.2;
            const row = -Math.floor(i / 2) * 2.1;

            const sx = startPos[0] + rgtX * col + fwdX * row;
            const sz = startPos[2] + rgtZ * col + fwdZ * row;

            this.entities.push({
                id: `${battalionId}_soldier_${i + 1}`,
                type: 'SOLDIER',
                faction,
                pos: [sx, startPos[1], sz],
                headingDeg: heading,
                speed,
                health: 120,
                maxHealth: 120,
                radius: 0.5,
                height: 1.8,
                walkPhase: (i % 2) * Math.PI * 0.5,
                isAlive: true,
                respawnTimer: 0,
                color: uniformColor,
                roleName: `${battalionName} — Soldier #${i + 1}`,
                battalionId,
                formationOffset: [col, row],
                combatCooldown: Math.random() * 0.6
            });
        }
    }

    private findEnemyTarget(seeker: BaseEntity, maxRange: number): BaseEntity | null {
        let best: BaseEntity | null = null;
        let bestScore = Infinity;

        for (const cand of this.entities) {
            if (!cand.isAlive || cand.id === seeker.id) continue;
            if (cand.faction === seeker.faction) continue;

            const d = Math.hypot(
                cand.pos[0] - seeker.pos[0],
                cand.pos[1] - seeker.pos[1],
                cand.pos[2] - seeker.pos[2]
            );
            if (d > maxRange) continue;

            let score = d;
            if (seeker.type === 'TANK' && cand.type === 'TANK') {
                score *= 0.6;
            }

            if (score < bestScore) {
                bestScore = score;
                best = cand;
            }
        }

        return best;
    }

    public update(
        dt: number,
        dronePos: [number, number, number],
        getGroundHeight?: (x: number, z: number) => number,
        warCallbacks?: WarEffectCallbacks
    ): void {
        // 1. Update Battalion Formation Leaders
        for (const bat of this.battalions.values()) {
            const route = bat.route;
            if (!route || route.points.length === 0) continue;

            let enemyNear = false;
            for (const other of this.entities) {
                if (!other.isAlive || other.faction === bat.faction) continue;
                const d = Math.hypot(other.pos[0] - bat.pos[0], other.pos[2] - bat.pos[2]);
                if (d < 115.0) {
                    enemyNear = true;
                    break;
                }
            }
            bat.isEngaged = enemyNear;

            const targetPt = route.points[route.currentIndex];
            const dx = targetPt[0] - bat.pos[0];
            const dz = targetPt[2] - bat.pos[2];
            const dist = Math.hypot(dx, dz);

            if (dist < 1.5) {
                route.currentIndex = (route.currentIndex + 1) % route.points.length;
            } else {
                const targetHeadingRad = Math.atan2(dx, dz);
                const targetHeadingDeg = targetHeadingRad * (180.0 / Math.PI);

                let diff = targetHeadingDeg - bat.headingDeg;
                while (diff > 180) diff -= 360;
                while (diff < -180) diff += 360;
                bat.headingDeg += Math.sign(diff) * Math.min(Math.abs(diff), 95.0 * dt);

                const effectiveSpeed = bat.isEngaged ? bat.speed * 0.35 : bat.speed;
                const moveDist = effectiveSpeed * dt;
                const hRad = bat.headingDeg * (Math.PI / 180.0);
                bat.pos[0] += Math.sin(hRad) * moveDist;
                bat.pos[2] += Math.cos(hRad) * moveDist;
                if (getGroundHeight) {
                    bat.pos[1] = getGroundHeight(bat.pos[0], bat.pos[2]);
                }
            }
        }

        // 2. Ambient Battlefield Artillery Barrages
        if (warCallbacks) {
            this.artilleryTimer -= dt;
            if (this.artilleryTimer <= 0) {
                this.artilleryTimer = 2.4 + Math.random() * 2.5;
                const angle = Math.random() * Math.PI * 2;
                const radius = 25 + Math.random() * 55;
                const impactX = this.centerSpawn[0] + Math.cos(angle) * radius;
                const impactZ = this.centerSpawn[2] + Math.sin(angle) * radius + 22;
                const gY = getGroundHeight ? getGroundHeight(impactX, impactZ) : this.baseGroundY;

                warCallbacks.spawnWarProjectile({
                    pos: [impactX + (Math.random() - 0.5) * 18, gY + 95.0, impactZ + (Math.random() - 0.5) * 18],
                    vel: [(Math.random() - 0.5) * 8, -78.0, (Math.random() - 0.5) * 8],
                    color: [1.0, 0.48, 0.1, 1.0],
                    kind: 'ARTILLERY_SHELL',
                    faction: Math.random() < 0.5 ? 'ALLY' : 'HOSTILE',
                    shooterId: 'artillery_battery',
                    shooterName: 'Artillery Battery',
                    damage: 0,
                    life: 2.5,
                    gravity: 9.8,
                    smokeTrail: true
                });
            }
        }

        // 3. Update All Entities + Real-Time Combat AI
        for (const ent of this.entities) {
            if (!ent.isAlive) {
                if (warCallbacks && ent.type === 'TANK') {
                    if (Math.random() < dt * 14.0) {
                        warCallbacks.spawnWreckSmoke(ent.pos);
                    }
                }
                // Hostile mission targets stay destroyed once hit by kamikaze drone
                if (ent.faction === 'HOSTILE') {
                    continue;
                }

                ent.respawnTimer -= dt;
                if (ent.respawnTimer <= 0) {
                    ent.isAlive = true;
                    ent.health = ent.maxHealth;
                }
                continue;
            }

            ent.combatCooldown = Math.max(0, ent.combatCooldown - dt);
            const distToDrone = Math.hypot(
                dronePos[0] - ent.pos[0],
                dronePos[1] - ent.pos[1],
                dronePos[2] - ent.pos[2]
            );

            // A. BATTALION SOLDIER MOVEMENT & FIREFIGHT AI
            if (ent.battalionId && ent.formationOffset) {
                const bat = this.battalions.get(ent.battalionId);
                if (bat) {
                    const hRad = bat.headingDeg * (Math.PI / 180.0);
                    const fwdX = Math.sin(hRad), fwdZ = Math.cos(hRad);
                    const rgtX = Math.cos(hRad), rgtZ = -Math.sin(hRad);
                    const slotX = bat.pos[0] + rgtX * ent.formationOffset[0] + fwdX * ent.formationOffset[1];
                    const slotZ = bat.pos[2] + rgtZ * ent.formationOffset[0] + fwdZ * ent.formationOffset[1];

                    const blend = Math.min(1.0, dt * 6.0);
                    ent.pos[0] += (slotX - ent.pos[0]) * blend;
                    ent.pos[2] += (slotZ - ent.pos[2]) * blend;
                    ent.pos[1] = getGroundHeight ? getGroundHeight(ent.pos[0], ent.pos[2]) : bat.pos[1];

                    const enemy = this.findEnemyTarget(ent, 135.0);
                    if (enemy) {
                        ent.isEngaged = true;
                        const aimHeading = Math.atan2(enemy.pos[0] - ent.pos[0], enemy.pos[2] - ent.pos[2]) * (180.0 / Math.PI);
                        let hDiff = aimHeading - ent.headingDeg;
                        while (hDiff > 180) hDiff -= 360;
                        while (hDiff < -180) hDiff += 360;
                        ent.headingDeg += hDiff * Math.min(1.0, dt * 10.0);

                        if (warCallbacks && ent.combatCooldown <= 0) {
                            const muzzle: [number, number, number] = [
                                ent.pos[0] + Math.sin(ent.headingDeg * Math.PI / 180) * 0.55,
                                ent.pos[1] + 1.15,
                                ent.pos[2] + Math.cos(ent.headingDeg * Math.PI / 180) * 0.55
                            ];
                            const targetY = enemy.pos[1] + enemy.height * 0.55;
                            const dx = (enemy.pos[0] - muzzle[0]) + (Math.random() - 0.5) * 1.6;
                            const dy = (targetY - muzzle[1]) + (Math.random() - 0.5) * 0.8;
                            const dz = (enemy.pos[2] - muzzle[2]) + (Math.random() - 0.5) * 1.6;
                            const len = Math.hypot(dx, dy, dz) || 1.0;

                            const spd = 185.0;
                            const tracerColor: [number, number, number, number] = ent.faction === 'ALLY'
                                ? [0.15, 1.0, 0.55, 1.0]
                                : [1.0, 0.22, 0.12, 1.0];
                            warCallbacks.spawnWarProjectile({
                                pos: muzzle,
                                vel: [(dx / len) * spd, (dy / len) * spd, (dz / len) * spd],
                                color: tracerColor,
                                kind: 'TRACER',
                                faction: ent.faction,
                                shooterId: ent.id,
                                shooterName: ent.roleName,
                                damage: 0,
                                life: 1.4
                            });
                            warCallbacks.onGunfireAudio(distToDrone);
                            ent.combatCooldown = 0.35 + Math.random() * 0.55;
                        }
                    } else {
                        ent.isEngaged = false;
                        let hDiff = bat.headingDeg - ent.headingDeg;
                        while (hDiff > 180) hDiff -= 360;
                        while (hDiff < -180) hDiff += 360;
                        ent.headingDeg += hDiff * Math.min(1.0, dt * 8.0);
                    }

                    ent.walkPhase += (bat.isEngaged ? bat.speed * 0.45 : bat.speed) * 4.8 * dt;
                }
                continue;
            }

            // B. PATROL ROUTE NAVIGATION (Tanks & Hostile Soldier Targets)
            const route = this.routes.get(ent.id);
            if (route && route.points.length > 0) {
                const targetPt = route.points[route.currentIndex];
                const dx = targetPt[0] - ent.pos[0];
                const dz = targetPt[2] - ent.pos[2];
                const dist = Math.hypot(dx, dz);

                if (dist < 2.5) {
                    route.currentIndex = (route.currentIndex + 1) % route.points.length;
                } else {
                    const targetHeadingRad = Math.atan2(dx, dz);
                    const targetHeadingDeg = targetHeadingRad * (180.0 / Math.PI);

                    let diff = targetHeadingDeg - ent.headingDeg;
                    while (diff > 180) diff -= 360;
                    while (diff < -180) diff += 360;

                    ent.headingDeg += Math.sign(diff) * Math.min(Math.abs(diff), 65.0 * dt);

                    const moveDist = ent.speed * dt;
                    const hRad = ent.headingDeg * (Math.PI / 180.0);
                    ent.pos[0] += Math.sin(hRad) * moveDist;
                    ent.pos[2] += Math.cos(hRad) * moveDist;

                    if (getGroundHeight) {
                        ent.pos[1] = getGroundHeight(ent.pos[0], ent.pos[2]);
                    }
                    ent.walkPhase += ent.speed * 4.5 * dt;
                }
            }

            if (warCallbacks && ent.type === 'TANK') {
                const enemy = this.findEnemyTarget(ent, 240.0);
                if (enemy && ent.combatCooldown <= 0) {
                    const aimRad = Math.atan2(enemy.pos[0] - ent.pos[0], enemy.pos[2] - ent.pos[2]);
                    const muzzle: [number, number, number] = [
                        ent.pos[0] + Math.sin(aimRad) * 3.0,
                        ent.pos[1] + 1.4,
                        ent.pos[2] + Math.cos(aimRad) * 3.0
                    ];
                    const targetCenterY = enemy.pos[1] + enemy.height * 0.5;
                    const dx = enemy.pos[0] - muzzle[0];
                    const dy = targetCenterY - muzzle[1];
                    const dz = enemy.pos[2] - muzzle[2];
                    const dist = Math.hypot(dx, dy, dz) || 1.0;
                    const shellSpeed = 135.0;
                    const flightTime = dist / shellSpeed;
                    const grav = 9.8;

                    warCallbacks.spawnWarProjectile({
                        pos: muzzle,
                        vel: [(dx / dist) * shellSpeed, (dy / dist) * shellSpeed + 0.5 * grav * flightTime, (dz / dist) * shellSpeed],
                        color: [1.0, 0.65, 0.12, 1.0],
                        kind: 'TANK_SHELL',
                        faction: ent.faction,
                        shooterId: ent.id,
                        shooterName: ent.roleName,
                        damage: 0,
                        life: 3.2,
                        gravity: grav,
                        smokeTrail: true
                    });
                    warCallbacks.spawnMuzzleFlash(muzzle, [Math.sin(aimRad), 0.1, Math.cos(aimRad)], [1.0, 0.72, 0.18, 1.0], 12);
                    warCallbacks.onExplosionAudio(distToDrone);
                    ent.combatCooldown = 2.5 + Math.random() * 1.8;
                }
            }
        }
    }

    /**
     * Detonates the kamikaze drone's explosive warhead at `blastPos` and destroys any hostile targets
     * within `blastRadius` (or `directHitEntity`).
     */
    public detonateKamikazeStrike(
        blastPos: [number, number, number],
        blastRadius: number = 5.5,
        directHitEntity?: BaseEntity | null
    ): BaseEntity[] {
        const destroyed: BaseEntity[] = [];

        if (directHitEntity && directHitEntity.isAlive && directHitEntity.faction === 'HOSTILE') {
            directHitEntity.health = 0;
            directHitEntity.isAlive = false;
            directHitEntity.respawnTimer = 999999;
            destroyed.push(directHitEntity);
            this.alliedKills++;
            this.latestBattleLog = `🎯 KAMIKAZE STRIKE DESTROYED ${directHitEntity.roleName.toUpperCase()}`;
        }

        for (const ent of this.entities) {
            if (!ent.isAlive || ent.faction !== 'HOSTILE') continue;
            const entCenterY = ent.pos[1] + ent.height * 0.5;
            const dist = Math.hypot(
                blastPos[0] - ent.pos[0],
                blastPos[1] - entCenterY,
                blastPos[2] - ent.pos[2]
            );
            if (dist <= blastRadius + ent.radius) {
                ent.health = 0;
                ent.isAlive = false;
                ent.respawnTimer = 999999;
                destroyed.push(ent);
                this.alliedKills++;
                this.latestBattleLog = `🎯 KAMIKAZE STRIKE DESTROYED ${ent.roleName.toUpperCase()}`;
            }
        }

        return destroyed;
    }

    public checkHit(
        p0: [number, number, number],
        p1: [number, number, number],
        damage: number = 0,
        projectileFaction?: 'PLAYER' | 'ALLY' | 'HOSTILE',
        shooterId?: string
    ): { hitEntity: BaseEntity | null; hitPoint: [number, number, number] | null } {
        for (const ent of this.entities) {
            if (!ent.isAlive) continue;
            if (shooterId && ent.id === shooterId) continue;
            if (projectileFaction && projectileFaction !== 'PLAYER' && ent.faction === projectileFaction) {
                continue;
            }

            const entMinY = ent.pos[1];
            const entMaxY = ent.pos[1] + ent.height;

            const segMinY = Math.min(p0[1], p1[1]);
            const segMaxY = Math.max(p0[1], p1[1]);
            if (segMaxY < entMinY - 0.6 || segMinY > entMaxY + 0.6) {
                continue;
            }

            const dx = p1[0] - p0[0];
            const dz = p1[2] - p0[2];
            const segLen = Math.hypot(dx, dz);

            if (segLen < 0.001) {
                const dCenter = Math.hypot(p0[0] - ent.pos[0], p0[2] - ent.pos[2]);
                if (dCenter <= ent.radius * 1.4) {
                    return { hitEntity: ent, hitPoint: [ent.pos[0], (entMinY + entMaxY) * 0.5, ent.pos[2]] };
                }
                continue;
            }

            const nx = dx / segLen;
            const nz = dz / segLen;

            const vx = ent.pos[0] - p0[0];
            const vz = ent.pos[2] - p0[2];

            const proj = vx * nx + vz * nz;
            const clampedProj = Math.max(0, Math.min(segLen, proj));
            const perpDist = Math.hypot(vx - clampedProj * nx, vz - clampedProj * nz);

            const hitTolerance = ent.radius * 1.4;
            if (perpDist <= hitTolerance) {
                const tNorm = segLen > 0 ? clampedProj / segLen : 0;
                const hitY = p0[1] + (p1[1] - p0[1]) * tNorm;
                if (hitY >= entMinY - 0.6 && hitY <= entMaxY + 0.6) {
                    const hitPoint: [number, number, number] = [
                        p0[0] + nx * clampedProj,
                        Math.max(entMinY, Math.min(entMaxY, hitY)),
                        p0[2] + nz * clampedProj
                    ];
                    return { hitEntity: ent, hitPoint };
                }
            }
        }

        return { hitEntity: null, hitPoint: null };
    }
}
