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
    public latestBattleLog: string = 'FRONT LINE ACTIVE: ALLIED vs HOSTILE TANKS & BATTALIONS ENGAGED';
    public incomingSamWarning: boolean = false;
    private artilleryTimer: number = 2.0;
    private centerSpawn: [number, number, number] = [0, 0, 0];
    private baseGroundY: number = 0;

    constructor() {
        this.initAirfieldEntities();
    }

    public initMapEntities(mapId: string, spawnPos: [number, number, number], groundY: number): void {
        if (mapId === 'airfield') {
            this.initAirfieldEntities();
            return;
        }

        this.entities = [];
        this.routes.clear();
        this.battalions.clear();
        this.centerSpawn = [...spawnPos];
        this.baseGroundY = groundY;
        this.latestBattleLog = `SECTOR ${mapId.toUpperCase()} WARZONE: TANKS & SOLDIER BATTALIONS ENGAGED`;

        const sx = spawnPos[0];
        const sz = spawnPos[2];
        const gy = groundY;

        // 1. ALLIED TANKS & SOLDIER BATTALIONS
        this.addTank(
            `${mapId}_ally_tank_1`,
            'Allied Tank Alpha',
            'ALLY',
            [sx - 18, gy, sz - 10],
            0,
            4.8,
            [0.24, 0.42, 0.28, 1.0],
            [
                [sx - 18, gy, sz - 10],
                [sx - 18, gy, sz + 35],
                [sx - 30, gy, sz + 35],
                [sx - 30, gy, sz - 10]
            ]
        );

        this.addTank(
            `${mapId}_ally_tank_2`,
            'Allied Tank Bravo',
            'ALLY',
            [sx + 18, gy, sz - 8],
            0,
            5.0,
            [0.26, 0.44, 0.30, 1.0],
            [
                [sx + 18, gy, sz - 8],
                [sx + 18, gy, sz + 38],
                [sx + 32, gy, sz + 38],
                [sx + 32, gy, sz - 8]
            ]
        );

        this.addSoldierBattalion(
            `${mapId}_ally_bat_1`,
            'Allied 1st Battalion',
            'ALLY',
            [sx - 8, gy, sz + 6],
            0,
            1.75,
            [0.20, 0.55, 0.35, 1.0],
            [
                [sx - 8, gy, sz + 6],
                [sx - 8, gy, sz + 42],
                [sx - 18, gy, sz + 42],
                [sx - 18, gy, sz + 6]
            ],
            8
        );

        this.addSoldierBattalion(
            `${mapId}_ally_bat_2`,
            'Allied 2nd Battalion',
            'ALLY',
            [sx + 10, gy, sz + 8],
            0,
            1.8,
            [0.22, 0.50, 0.40, 1.0],
            [
                [sx + 10, gy, sz + 8],
                [sx + 10, gy, sz + 44],
                [sx + 22, gy, sz + 44],
                [sx + 22, gy, sz + 8]
            ],
            8
        );

        // 2. HOSTILE TANKS & SOLDIER BATTALIONS
        this.addTank(
            `${mapId}_hostile_tank_1`,
            'Hostile Tank Alpha',
            'HOSTILE',
            [sx - 14, gy, sz + 58],
            180,
            4.8,
            [0.58, 0.32, 0.24, 1.0],
            [
                [sx - 14, gy, sz + 58],
                [sx - 14, gy, sz + 14],
                [sx - 26, gy, sz + 14],
                [sx - 26, gy, sz + 58]
            ]
        );

        this.addTank(
            `${mapId}_hostile_tank_2`,
            'Hostile Tank Bravo',
            'HOSTILE',
            [sx + 16, gy, sz + 62],
            180,
            5.0,
            [0.54, 0.28, 0.22, 1.0],
            [
                [sx + 16, gy, sz + 62],
                [sx + 16, gy, sz + 16],
                [sx + 28, gy, sz + 16],
                [sx + 28, gy, sz + 62]
            ]
        );

        this.addTank(
            `${mapId}_hostile_tank_3`,
            'Hostile Tank Charlie',
            'HOSTILE',
            [sx + 38, gy, sz + 45],
            220,
            4.6,
            [0.50, 0.26, 0.20, 1.0],
            [
                [sx + 38, gy, sz + 45],
                [sx + 5, gy, sz + 22],
                [sx - 35, gy, sz + 48],
                [sx + 10, gy, sz + 72]
            ]
        );

        this.addSoldierBattalion(
            `${mapId}_hostile_bat_1`,
            'Hostile 1st Battalion',
            'HOSTILE',
            [sx - 6, gy, sz + 46],
            180,
            1.75,
            [0.65, 0.25, 0.20, 1.0],
            [
                [sx - 6, gy, sz + 46],
                [sx - 6, gy, sz + 10],
                [sx - 18, gy, sz + 10],
                [sx - 18, gy, sz + 46]
            ],
            8
        );

        this.addSoldierBattalion(
            `${mapId}_hostile_bat_2`,
            'Hostile 2nd Battalion',
            'HOSTILE',
            [sx + 12, gy, sz + 48],
            180,
            1.8,
            [0.60, 0.22, 0.18, 1.0],
            [
                [sx + 12, gy, sz + 48],
                [sx + 12, gy, sz + 12],
                [sx + 24, gy, sz + 12],
                [sx + 24, gy, sz + 48]
            ],
            8
        );
    }

    public initAirfieldEntities(): void {
        this.entities = [];
        this.routes.clear();
        this.battalions.clear();
        this.centerSpawn = [0, 1.5, 0];
        this.baseGroundY = 0;
        this.latestBattleLog = 'AIRFIELD FRONTLINE: ALLIED vs HOSTILE TANKS & BATTALIONS';

        // 1. ALLIED TANKS & SOLDIER BATTALIONS
        this.addTank(
            'airfield_ally_tank_1',
            'Allied Tank Alpha',
            'ALLY',
            [-18, 0, -12],
            0,
            5.0,
            [0.24, 0.42, 0.28, 1.0],
            [
                [-18, 0, -12],
                [-18, 0, 45],
                [-32, 0, 45],
                [-32, 0, -12]
            ]
        );

        this.addTank(
            'airfield_ally_tank_2',
            'Allied Tank Bravo',
            'ALLY',
            [18, 0, -10],
            0,
            5.2,
            [0.26, 0.44, 0.30, 1.0],
            [
                [18, 0, -10],
                [18, 0, 48],
                [34, 0, 48],
                [34, 0, -10]
            ]
        );

        this.addSoldierBattalion(
            'airfield_ally_bat_alpha',
            'Allied 1st Battalion',
            'ALLY',
            [-8, 0, 8],
            0,
            1.75,
            [0.20, 0.55, 0.35, 1.0],
            [
                [-8, 0, 8],
                [-8, 0, 48],
                [-18, 0, 48],
                [-18, 0, 8]
            ],
            8
        );

        this.addSoldierBattalion(
            'airfield_ally_bat_bravo',
            'Allied 2nd Battalion',
            'ALLY',
            [10, 0, 10],
            0,
            1.8,
            [0.22, 0.50, 0.40, 1.0],
            [
                [10, 0, 10],
                [10, 0, 50],
                [22, 0, 50],
                [22, 0, 10]
            ],
            8
        );

        // 2. HOSTILE TANKS & SOLDIER BATTALIONS
        this.addTank(
            'airfield_hostile_tank_1',
            'Hostile Tank Alpha',
            'HOSTILE',
            [-14, 0, 58],
            180,
            4.8,
            [0.58, 0.32, 0.24, 1.0],
            [
                [-14, 0, 58],
                [-14, 0, 12],
                [-28, 0, 12],
                [-28, 0, 58]
            ]
        );

        this.addTank(
            'airfield_hostile_tank_2',
            'Hostile Tank Bravo',
            'HOSTILE',
            [15, 0, 62],
            180,
            5.0,
            [0.54, 0.28, 0.22, 1.0],
            [
                [15, 0, 62],
                [15, 0, 15],
                [30, 0, 15],
                [30, 0, 62]
            ]
        );

        this.addTank(
            'airfield_hostile_tank_3',
            'Hostile Tank Charlie',
            'HOSTILE',
            [40, 0, 42],
            225,
            4.6,
            [0.50, 0.26, 0.20, 1.0],
            [
                [40, 0, 42],
                [6, 0, 20],
                [-32, 0, 50],
                [12, 0, 78]
            ]
        );

        this.addSoldierBattalion(
            'airfield_hostile_bat_1',
            'Hostile 1st Battalion',
            'HOSTILE',
            [-6, 0, 46],
            180,
            1.75,
            [0.65, 0.25, 0.20, 1.0],
            [
                [-6, 0, 46],
                [-6, 0, 12],
                [-16, 0, 12],
                [-16, 0, 46]
            ],
            8
        );

        this.addSoldierBattalion(
            'airfield_hostile_bat_2',
            'Hostile 2nd Battalion',
            'HOSTILE',
            [12, 0, 48],
            180,
            1.8,
            [0.60, 0.22, 0.18, 1.0],
            [
                [12, 0, 48],
                [12, 0, 14],
                [24, 0, 14],
                [24, 0, 48]
            ],
            8
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
            health: 520,
            maxHealth: 520,
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

    private addSoldierBattalion(
        battalionId: string,
        battalionName: string,
        faction: FactionType,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        uniformColor: [number, number, number, number],
        routePoints: [number, number, number][],
        soldierCount: number = 8
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
                this.artilleryTimer = 1.8 + Math.random() * 2.0;
                const angle = Math.random() * Math.PI * 2;
                const radius = 14 + Math.random() * 55;
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
                    damage: 140,
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

                ent.respawnTimer -= dt;
                if (ent.respawnTimer <= 0) {
                    ent.isAlive = true;
                    ent.health = ent.maxHealth;

                    if (ent.battalionId && ent.formationOffset) {
                        const bat = this.battalions.get(ent.battalionId);
                        if (bat) {
                            const hRad = bat.headingDeg * (Math.PI / 180.0);
                            const fwdX = Math.sin(hRad), fwdZ = Math.cos(hRad);
                            const rgtX = Math.cos(hRad), rgtZ = -Math.sin(hRad);
                            ent.pos[0] = bat.pos[0] + rgtX * ent.formationOffset[0] + fwdX * ent.formationOffset[1];
                            ent.pos[2] = bat.pos[2] + rgtZ * ent.formationOffset[0] + fwdZ * ent.formationOffset[1];
                            ent.pos[1] = getGroundHeight ? getGroundHeight(ent.pos[0], ent.pos[2]) : bat.pos[1];
                            ent.headingDeg = bat.headingDeg;
                        }
                    } else {
                        const route = this.routes.get(ent.id);
                        if (route && route.points.length > 0) {
                            ent.pos = [...route.points[0]];
                            route.currentIndex = 0;
                        }
                    }
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
                                damage: 14,
                                life: 1.4
                            });
                            warCallbacks.onGunfireAudio(distToDrone);
                            ent.combatCooldown = 0.28 + Math.random() * 0.45;
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

            // B. TANK ROUTE NAVIGATION & COMBAT AI
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
                        damage: 135,
                        life: 3.2,
                        gravity: grav,
                        smokeTrail: true
                    });
                    warCallbacks.spawnMuzzleFlash(muzzle, [Math.sin(aimRad), 0.1, Math.cos(aimRad)], [1.0, 0.72, 0.18, 1.0], 12);
                    warCallbacks.onExplosionAudio(distToDrone);
                    ent.combatCooldown = 2.0 + Math.random() * 1.5;
                }
            }
        }
    }

    public checkHit(
        p0: [number, number, number],
        p1: [number, number, number],
        damage: number = 40,
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
            const respawnSec = ent.type === 'TANK' ? 14.0 : 7.0;

            if (segLen < 0.001) {
                const dCenter = Math.hypot(p0[0] - ent.pos[0], p0[2] - ent.pos[2]);
                if (dCenter <= ent.radius * 1.4) {
                    ent.health -= damage;
                    if (ent.health <= 0) {
                        ent.health = 0;
                        ent.isAlive = false;
                        ent.respawnTimer = respawnSec;
                        this.recordKill(ent, projectileFaction);
                    }
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
                    ent.health -= damage;
                    if (ent.health <= 0) {
                        ent.health = 0;
                        ent.isAlive = false;
                        ent.respawnTimer = respawnSec;
                        this.recordKill(ent, projectileFaction);
                    }

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

    private recordKill(victim: BaseEntity, killerFaction?: 'PLAYER' | 'ALLY' | 'HOSTILE'): void {
        if (victim.faction === 'HOSTILE') {
            this.alliedKills++;
            this.latestBattleLog = killerFaction === 'PLAYER'
                ? `🎯 DRONE STRIKE DESTROYED ${victim.roleName.toUpperCase()}`
                : `⚔ ALLIED FORCE NEUTRALIZED ${victim.roleName.toUpperCase()}`;
        } else if (victim.faction === 'ALLY') {
            this.hostileKills++;
            this.latestBattleLog = `💥 HOSTILE FORCE DESTROYED ${victim.roleName.toUpperCase()}`;
        }
    }
}
