export type EntityType =
    | 'PERSON'
    | 'SOLDIER'
    | 'ROVER'
    | 'TANK'
    | 'MISSILE_TRUCK'
    | 'TARGET_DRONE'
    | 'ATTACK_HELI'
    | 'FIGHTER_JET';

export type FactionType = 'ALLY' | 'HOSTILE' | 'NEUTRAL';

export interface BaseEntity {
    id: string;
    type: EntityType;
    faction: FactionType;
    pos: [number, number, number];
    headingDeg: number;
    turretYawDeg?: number;
    pitchDeg?: number;
    rollDeg?: number;
    speed: number;
    health: number;
    maxHealth: number;
    radius: number;
    height: number;
    walkPhase: number;
    isAlive: boolean;
    respawnTimer: number;
    color: [number, number, number, number];
    secondaryColor?: [number, number, number, number];
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
    kind: 'TANK_SHELL' | 'SAM_MISSILE' | 'RPG_ROCKET' | 'HELI_ROCKET' | 'TRACER' | 'ARTILLERY_SHELL';
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
    public latestBattleLog: string = 'FRONT LINE ACTIVE: ALLIED vs HOSTILE ARMOR & INFANTRY ENGAGED';
    public incomingSamWarning: boolean = false;
    private artilleryTimer: number = 1.5;
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
        this.latestBattleLog = `SECTOR ${mapId.toUpperCase()} WARZONE: ALLIED & HOSTILE FORCES CLASHING`;

        const sx = spawnPos[0];
        const sz = spawnPos[2];
        const gy = groundY;

        // ============================================================================
        // 1. ALLIED TASK FORCE (BLUE NATO FORCE — Advancing North/Forward)
        // ============================================================================
        this.addTank(
            `${mapId}_ally_tank_1`,
            'M1A2 Abrams MBT (Allied)',
            'ALLY',
            [sx - 18, gy, sz - 10],
            0,
            4.8,
            [0.24, 0.36, 0.25, 1.0],
            [
                [sx - 18, gy, sz - 10],
                [sx - 18, gy, sz + 35],
                [sx - 30, gy, sz + 35],
                [sx - 30, gy, sz - 10]
            ]
        );

        this.addTank(
            `${mapId}_ally_tank_2`,
            'Leopard 2A7V Heavy Tank (Allied)',
            'ALLY',
            [sx + 18, gy, sz - 8],
            0,
            5.0,
            [0.28, 0.38, 0.26, 1.0],
            [
                [sx + 18, gy, sz - 8],
                [sx + 18, gy, sz + 38],
                [sx + 32, gy, sz + 38],
                [sx + 32, gy, sz - 8]
            ]
        );

        this.addMissileTruck(
            `${mapId}_ally_sam_1`,
            'Patriot PAC-3 SAM Battery (Allied)',
            'ALLY',
            [sx - 32, gy, sz - 22],
            0,
            5.4,
            [0.26, 0.36, 0.28, 1.0],
            [
                [sx - 32, gy, sz - 22],
                [sx - 32, gy, sz + 25],
                [sx - 44, gy, sz + 25],
                [sx - 44, gy, sz - 22]
            ]
        );

        this.addSoldierBattalion(
            `${mapId}_ally_bat_1`,
            '1st Allied Airborne Battalion',
            'ALLY',
            [sx - 8, gy, sz + 6],
            0,
            1.75,
            [0.22, 0.35, 0.24, 1.0],
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
            '3rd Allied Spec-Ops Platoon',
            'ALLY',
            [sx + 10, gy, sz + 8],
            0,
            1.8,
            [0.20, 0.32, 0.36, 1.0],
            [
                [sx + 10, gy, sz + 8],
                [sx + 10, gy, sz + 44],
                [sx + 22, gy, sz + 44],
                [sx + 22, gy, sz + 8]
            ],
            8
        );

        const heliAlt = gy + 22.0;
        this.addAttackHeli(
            `${mapId}_ally_heli_1`,
            'AH-64E Apache Gunship (Allied)',
            'ALLY',
            [sx - 25, heliAlt, sz + 5],
            20,
            12.0,
            [0.22, 0.29, 0.22, 1.0],
            [
                [sx - 25, heliAlt, sz + 5],
                [sx + 30, heliAlt + 4, sz + 55],
                [sx + 40, heliAlt + 2, sz - 15],
                [sx - 35, heliAlt + 5, sz - 20]
            ]
        );

        const jetAlt = gy + 44.0;
        this.addFighterJet(
            `${mapId}_ally_jet_1`,
            'F-22A Raptor Fighter (Allied)',
            'ALLY',
            [sx - 75, jetAlt, sz - 60],
            35,
            25.0,
            [0.36, 0.42, 0.48, 1.0],
            [
                [sx - 75, jetAlt, sz - 60],
                [sx + 80, jetAlt + 8, sz + 85],
                [sx - 80, jetAlt + 4, sz + 85],
                [sx + 75, jetAlt - 2, sz - 60]
            ]
        );

        // ============================================================================
        // 2. HOSTILE COALITION FORCE (RED OPFOR — Advancing South/Counter-Attacking)
        // ============================================================================
        this.addTank(
            `${mapId}_hostile_tank_1`,
            'T-90M Main Battle Tank (Hostile)',
            'HOSTILE',
            [sx - 14, gy, sz + 58],
            180,
            4.8,
            [0.52, 0.42, 0.28, 1.0],
            [
                [sx - 14, gy, sz + 58],
                [sx - 14, gy, sz + 14],
                [sx - 26, gy, sz + 14],
                [sx - 26, gy, sz + 58]
            ]
        );

        this.addTank(
            `${mapId}_hostile_tank_2`,
            'T-14 Armata Heavy Tank (Hostile)',
            'HOSTILE',
            [sx + 16, gy, sz + 62],
            180,
            5.0,
            [0.46, 0.36, 0.26, 1.0],
            [
                [sx + 16, gy, sz + 62],
                [sx + 16, gy, sz + 16],
                [sx + 28, gy, sz + 16],
                [sx + 28, gy, sz + 62]
            ]
        );

        this.addTank(
            `${mapId}_hostile_tank_3`,
            'Black Eagle Assault Tank (Hostile)',
            'HOSTILE',
            [sx + 38, gy, sz + 45],
            220,
            4.6,
            [0.42, 0.33, 0.25, 1.0],
            [
                [sx + 38, gy, sz + 45],
                [sx + 5, gy, sz + 22],
                [sx - 35, gy, sz + 48],
                [sx + 10, gy, sz + 72]
            ]
        );

        this.addMissileTruck(
            `${mapId}_hostile_sam_1`,
            'S-400 Triumf SAM Battery (Hostile)',
            'HOSTILE',
            [sx + 34, gy, sz + 55],
            180,
            5.5,
            [0.45, 0.38, 0.28, 1.0],
            [
                [sx + 34, gy, sz + 55],
                [sx + 34, gy, sz + 12],
                [sx + 46, gy, sz + 12],
                [sx + 46, gy, sz + 55]
            ]
        );

        this.addSoldierBattalion(
            `${mapId}_hostile_bat_1`,
            '2nd Crimson Shock Battalion (Hostile)',
            'HOSTILE',
            [sx - 6, gy, sz + 46],
            180,
            1.75,
            [0.45, 0.34, 0.24, 1.0],
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
            '4th OpFor Motorized Platoon (Hostile)',
            'HOSTILE',
            [sx + 12, gy, sz + 48],
            180,
            1.8,
            [0.38, 0.26, 0.22, 1.0],
            [
                [sx + 12, gy, sz + 48],
                [sx + 12, gy, sz + 12],
                [sx + 24, gy, sz + 12],
                [sx + 24, gy, sz + 48]
            ],
            8
        );

        this.addAttackHeli(
            `${mapId}_hostile_heli_1`,
            'Ka-52 Alligator Gunship (Hostile)',
            'HOSTILE',
            [sx + 28, heliAlt + 6, sz + 55],
            210,
            12.5,
            [0.32, 0.26, 0.24, 1.0],
            [
                [sx + 28, heliAlt + 6, sz + 55],
                [sx - 30, heliAlt + 3, sz + 10],
                [sx - 35, heliAlt + 8, sz + 65],
                [sx + 35, heliAlt + 5, sz + 25]
            ]
        );

        this.addFighterJet(
            `${mapId}_hostile_jet_1`,
            'Su-57 Felon Interceptor (Hostile)',
            'HOSTILE',
            [sx + 80, jetAlt + 10, sz + 80],
            225,
            26.0,
            [0.32, 0.35, 0.42, 1.0],
            [
                [sx + 80, jetAlt + 10, sz + 80],
                [sx - 80, jetAlt + 14, sz - 50],
                [sx + 80, jetAlt + 8, sz - 50],
                [sx - 80, jetAlt + 12, sz + 80]
            ]
        );

        // 3. Recon Rover & Target Drones
        this.entities.push({
            id: `${mapId}_rover`,
            type: 'ROVER',
            faction: 'ALLY',
            pos: [sx - 14, gy + 0.4, sz - 22],
            headingDeg: 0,
            speed: 6.0,
            health: 220,
            maxHealth: 220,
            radius: 1.4,
            height: 1.3,
            walkPhase: 0,
            isAlive: true,
            respawnTimer: 0,
            color: [0.15, 0.75, 0.95, 1.0],
            roleName: `${mapId.toUpperCase()} Recon Rover`,
            combatCooldown: 2.0
        });
        this.routes.set(`${mapId}_rover`, {
            points: [
                [sx - 14, gy + 0.4, sz - 22],
                [sx - 14, gy + 0.4, sz + 45],
                [sx + 22, gy + 0.4, sz + 45],
                [sx + 22, gy + 0.4, sz - 22]
            ],
            currentIndex: 0
        });
    }

    public initAirfieldEntities(): void {
        this.entities = [];
        this.routes.clear();
        this.battalions.clear();
        this.centerSpawn = [0, 1.5, 0];
        this.baseGroundY = 0;
        this.latestBattleLog = 'AIRFIELD FRONTLINE: ALLIED TASK FORCE vs HOSTILE ARMORED DIVISION';

        // ============================================================================
        // 1. ALLIED DEFENSE FORCE (BLUE NATO — Defending South/West Airfield Sector)
        // ============================================================================
        this.addTank(
            'airfield_ally_tank_1',
            'M1A2 Abrams MBT Alpha (Allied)',
            'ALLY',
            [-18, 0, -12],
            0,
            5.0,
            [0.24, 0.36, 0.24, 1.0],
            [
                [-18, 0, -12],
                [-18, 0, 45],
                [-32, 0, 45],
                [-32, 0, -12]
            ]
        );

        this.addTank(
            'airfield_ally_tank_2',
            'Leopard 2A7V Heavy Tank (Allied)',
            'ALLY',
            [18, 0, -10],
            0,
            5.2,
            [0.26, 0.38, 0.25, 1.0],
            [
                [18, 0, -10],
                [18, 0, 48],
                [34, 0, 48],
                [34, 0, -10]
            ]
        );

        this.addMissileTruck(
            'airfield_ally_sam_1',
            'Patriot PAC-3 SAM Battery (Allied)',
            'ALLY',
            [-36, 0, -18],
            0,
            5.5,
            [0.26, 0.36, 0.28, 1.0],
            [
                [-36, 0, -18],
                [-36, 0, 35],
                [-48, 0, 35],
                [-48, 0, -18]
            ]
        );

        this.addSoldierBattalion(
            'airfield_ally_bat_alpha',
            '1st Airborne Infantry Battalion (Allied)',
            'ALLY',
            [-8, 0, 8],
            0,
            1.75,
            [0.22, 0.35, 0.23, 1.0],
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
            '3rd Ranger Strike Battalion (Allied)',
            'ALLY',
            [10, 0, 10],
            0,
            1.8,
            [0.20, 0.32, 0.36, 1.0],
            [
                [10, 0, 10],
                [10, 0, 50],
                [22, 0, 50],
                [22, 0, 10]
            ],
            8
        );

        this.addAttackHeli(
            'airfield_ally_heli_1',
            'AH-64E Apache Gunship (Allied)',
            'ALLY',
            [-28, 22, 5],
            25,
            12.5,
            [0.22, 0.29, 0.22, 1.0],
            [
                [-28, 22, 5],
                [32, 25, 65],
                [45, 22, -15],
                [-35, 24, -25]
            ]
        );

        this.addFighterJet(
            'airfield_ally_jet_1',
            'F-22A Raptor Stealth Fighter (Allied)',
            'ALLY',
            [-75, 44, -65],
            35,
            26.0,
            [0.36, 0.42, 0.48, 1.0],
            [
                [-75, 44, -65],
                [85, 50, 90],
                [-85, 46, 90],
                [75, 42, -65]
            ]
        );

        // ============================================================================
        // 2. HOSTILE ASSAULT FORCE (RED OPFOR — Storming South Down the Runway)
        // ============================================================================
        this.addTank(
            'airfield_hostile_tank_1',
            'T-90M Main Battle Tank (Hostile)',
            'HOSTILE',
            [-14, 0, 58],
            180,
            4.8,
            [0.54, 0.43, 0.28, 1.0],
            [
                [-14, 0, 58],
                [-14, 0, 12],
                [-28, 0, 12],
                [-28, 0, 58]
            ]
        );

        this.addTank(
            'airfield_hostile_tank_2',
            'T-14 Armata Heavy Tank (Hostile)',
            'HOSTILE',
            [15, 0, 62],
            180,
            5.0,
            [0.48, 0.36, 0.26, 1.0],
            [
                [15, 0, 62],
                [15, 0, 15],
                [30, 0, 15],
                [30, 0, 62]
            ]
        );

        this.addTank(
            'airfield_hostile_tank_3',
            'Black Eagle Strike Tank (Hostile)',
            'HOSTILE',
            [40, 0, 42],
            225,
            4.6,
            [0.44, 0.33, 0.25, 1.0],
            [
                [40, 0, 42],
                [6, 0, 20],
                [-32, 0, 50],
                [12, 0, 78]
            ]
        );

        this.addMissileTruck(
            'airfield_hostile_sam_1',
            'S-400 Triumf Mobile SAM (Hostile)',
            'HOSTILE',
            [35, 0, 55],
            180,
            5.5,
            [0.46, 0.38, 0.28, 1.0],
            [
                [35, 0, 55],
                [35, 0, 10],
                [50, 0, 10],
                [50, 0, 55]
            ]
        );

        this.addMissileTruck(
            'airfield_hostile_sam_2',
            'Pantsir-S1 AA Missile Truck (Hostile)',
            'HOSTILE',
            [-36, 0, 65],
            160,
            5.8,
            [0.42, 0.35, 0.27, 1.0],
            [
                [-36, 0, 65],
                [-20, 0, 22],
                [20, 0, 68],
                [-25, 0, 82]
            ]
        );

        this.addSoldierBattalion(
            'airfield_hostile_bat_1',
            '2nd Crimson Guards Battalion (Hostile)',
            'HOSTILE',
            [-6, 0, 46],
            180,
            1.75,
            [0.46, 0.34, 0.24, 1.0],
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
            '4th Shock Infantry Battalion (Hostile)',
            'HOSTILE',
            [12, 0, 48],
            180,
            1.8,
            [0.40, 0.26, 0.22, 1.0],
            [
                [12, 0, 48],
                [12, 0, 14],
                [24, 0, 14],
                [24, 0, 48]
            ],
            8
        );

        this.addAttackHeli(
            'airfield_hostile_heli_1',
            'Ka-52 Alligator Gunship (Hostile)',
            'HOSTILE',
            [28, 26, 55],
            210,
            13.0,
            [0.34, 0.27, 0.25, 1.0],
            [
                [28, 26, 55],
                [-30, 24, 12],
                [-35, 28, 70],
                [38, 25, 20]
            ]
        );

        this.addFighterJet(
            'airfield_hostile_jet_1',
            'Su-57 Felon Interceptor (Hostile)',
            'HOSTILE',
            [85, 52, 85],
            225,
            27.0,
            [0.32, 0.35, 0.42, 1.0],
            [
                [85, 52, 85],
                [-85, 56, -55],
                [85, 48, -55],
                [-85, 54, 85]
            ]
        );

        // 3. Support Personnel & Recon Rover
        this.addPerson('worker_1', 'Combat Field Engineer (Allied)', [-48, 0, 25], 0, [0.95, 0.45, 0.1, 1.0], [
            [-48, 0, 25], [-44, 0, 45], [-44, 0, 20], [-48, 0, 25]
        ]);
        this.entities.push({
            id: 'security_rover_1',
            type: 'ROVER',
            faction: 'ALLY',
            pos: [-22, 0.4, -35],
            headingDeg: 0,
            speed: 6.5,
            health: 200,
            maxHealth: 200,
            radius: 1.4,
            height: 1.3,
            walkPhase: 0,
            isAlive: true,
            respawnTimer: 0,
            color: [0.15, 0.65, 0.95, 1.0],
            roleName: 'Allied Command Rover',
            combatCooldown: 2.0
        });
        this.routes.set('security_rover_1', {
            points: [
                [-22, 0.4, -35], [-22, 0.4, 55], [22, 0.4, 55], [22, 0.4, -35]
            ],
            currentIndex: 0
        });
    }

    private addPerson(
        id: string,
        name: string,
        startPos: [number, number, number],
        heading: number,
        vestColor: [number, number, number, number],
        routePoints: [number, number, number][]
    ): void {
        this.entities.push({
            id,
            type: 'PERSON',
            faction: 'ALLY',
            pos: [...startPos],
            headingDeg: heading,
            speed: 1.35,
            health: 100,
            maxHealth: 100,
            radius: 0.45,
            height: 1.8,
            walkPhase: Math.random() * Math.PI * 2,
            isAlive: true,
            respawnTimer: 0,
            color: vestColor,
            roleName: name,
            combatCooldown: 99
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
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
            height: 2.5,
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

    private addMissileTruck(
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
            type: 'MISSILE_TRUCK',
            faction,
            pos: [...startPos],
            headingDeg: heading,
            turretYawDeg: heading,
            speed,
            health: 350,
            maxHealth: 350,
            radius: 2.3,
            height: 2.8,
            walkPhase: Math.random() * 10,
            isAlive: true,
            respawnTimer: 0,
            color: armorColor,
            roleName: name,
            combatCooldown: 1.0 + Math.random() * 1.8
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
    }

    private addAttackHeli(
        id: string,
        name: string,
        faction: FactionType,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        hullColor: [number, number, number, number],
        routePoints: [number, number, number][]
    ): void {
        this.entities.push({
            id,
            type: 'ATTACK_HELI',
            faction,
            pos: [...startPos],
            headingDeg: heading,
            pitchDeg: 6.0,
            rollDeg: 0.0,
            speed,
            health: 340,
            maxHealth: 340,
            radius: 2.8,
            height: 2.2,
            walkPhase: Math.random() * 10,
            isAlive: true,
            respawnTimer: 0,
            color: hullColor,
            roleName: name,
            combatCooldown: 0.4 + Math.random() * 0.8
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
    }

    private addFighterJet(
        id: string,
        name: string,
        faction: FactionType,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        hullColor: [number, number, number, number],
        routePoints: [number, number, number][]
    ): void {
        this.entities.push({
            id,
            type: 'FIGHTER_JET',
            faction,
            pos: [...startPos],
            headingDeg: heading,
            pitchDeg: 0.0,
            rollDeg: 0.0,
            speed,
            health: 380,
            maxHealth: 380,
            radius: 3.4,
            height: 1.8,
            walkPhase: Math.random() * 10,
            isAlive: true,
            respawnTimer: 0,
            color: hullColor,
            roleName: name,
            combatCooldown: 1.0 + Math.random() * 1.5
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

        const roles = [
            'Battalion Commander',
            'Squad Leader',
            'Heavy Machine Gunner',
            'Anti-Armor RPG Specialist',
            'Designated Marksman',
            'Combat Engineer',
            'Assault Rifleman',
            'Field Medic'
        ];

        for (let i = 0; i < soldierCount; i++) {
            const col = (i % 2 === 0) ? -1.2 : 1.2;
            const row = -Math.floor(i / 2) * 2.1;

            const sx = startPos[0] + rgtX * col + fwdX * row;
            const sz = startPos[2] + rgtZ * col + fwdZ * row;
            const roleTitle = roles[i % roles.length];

            this.entities.push({
                id: `${battalionId}_soldier_${i + 1}`,
                type: 'SOLDIER',
                faction,
                pos: [sx, startPos[1], sz],
                headingDeg: heading,
                speed,
                health: 120,
                maxHealth: 120,
                radius: 0.48,
                height: 1.85,
                walkPhase: (i % 2) * Math.PI * 0.5,
                isAlive: true,
                respawnTimer: 0,
                color: uniformColor,
                roleName: `${battalionName} — ${roleTitle}`,
                battalionId,
                formationOffset: [col, row],
                combatCooldown: Math.random() * 0.6
            });
        }
    }

    /**
     * Finds the best opposing enemy entity within maxRange
     */
    private findEnemyTarget(
        seeker: BaseEntity,
        maxRange: number,
        preferAir: boolean = false
    ): BaseEntity | null {
        let best: BaseEntity | null = null;
        let bestScore = Infinity;

        for (const cand of this.entities) {
            if (!cand.isAlive || cand.id === seeker.id) continue;
            if (cand.faction === seeker.faction || cand.faction === 'NEUTRAL') continue;

            const d = Math.hypot(
                cand.pos[0] - seeker.pos[0],
                cand.pos[1] - seeker.pos[1],
                cand.pos[2] - seeker.pos[2]
            );
            if (d > maxRange) continue;

            let score = d;
            const isAir = cand.type === 'ATTACK_HELI' || cand.type === 'FIGHTER_JET' || cand.type === 'TARGET_DRONE';
            if (preferAir && isAir) {
                score *= 0.35; // SAMs & Fighters strongly prioritize air targets
            } else if (!preferAir && isAir && seeker.type === 'TANK') {
                score *= 2.5; // Tanks prefer ground armor/infantry unless heli is close
            } else if (seeker.type === 'TANK' && (cand.type === 'TANK' || cand.type === 'MISSILE_TRUCK')) {
                score *= 0.55; // Tanks prioritize enemy armor
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
        // 1. Update Battalion Formation Leaders (Slow down to tactical advance when engaged in firefights)
        for (const bat of this.battalions.values()) {
            const route = bat.route;
            if (!route || route.points.length === 0) continue;

            // Check if opposing forces are within firefight range (115m) of battalion leader
            let enemyNear = false;
            for (const other of this.entities) {
                if (!other.isAlive || other.faction === bat.faction || other.faction === 'NEUTRAL') continue;
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
                this.artilleryTimer = 1.6 + Math.random() * 1.8;
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
                    shooterName: 'Howitzer Artillery Battery',
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
                // Emit continuous burning wreckage smoke & flames for destroyed vehicles
                if (warCallbacks && ent.type !== 'PERSON' && ent.type !== 'SOLDIER') {
                    if (Math.random() < dt * 16.0) {
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

            // ====================================================================
            // A. BATTALION SOLDIER MOVEMENT & LIVE INFANTRY FIREFIGHT AI
            // ====================================================================
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

                    const enemy = this.findEnemyTarget(ent, 135.0, false);
                    if (enemy) {
                        ent.isEngaged = true;
                        const aimHeading = Math.atan2(enemy.pos[0] - ent.pos[0], enemy.pos[2] - ent.pos[2]) * (180.0 / Math.PI);
                        let hDiff = aimHeading - ent.headingDeg;
                        while (hDiff > 180) hDiff -= 360;
                        while (hDiff < -180) hDiff += 360;
                        ent.headingDeg += hDiff * Math.min(1.0, dt * 10.0);

                        // Fire Infantry Assault Rifle Tracers or Anti-Tank RPG!
                        if (warCallbacks && ent.combatCooldown <= 0 && ent.faction !== 'NEUTRAL') {
                            const isRPG = ent.roleName.includes('RPG') && (enemy.type === 'TANK' || enemy.type === 'MISSILE_TRUCK' || Math.random() < 0.35);
                            const muzzle: [number, number, number] = [
                                ent.pos[0] + Math.sin(ent.headingDeg * Math.PI / 180) * 0.55,
                                ent.pos[1] + 1.18,
                                ent.pos[2] + Math.cos(ent.headingDeg * Math.PI / 180) * 0.55
                            ];
                            const targetY = enemy.pos[1] + enemy.height * 0.55;
                            const dx = (enemy.pos[0] - muzzle[0]) + (Math.random() - 0.5) * 1.6;
                            const dy = (targetY - muzzle[1]) + (Math.random() - 0.5) * 0.8;
                            const dz = (enemy.pos[2] - muzzle[2]) + (Math.random() - 0.5) * 1.6;
                            const len = Math.hypot(dx, dy, dz) || 1.0;

                            if (isRPG) {
                                const spd = 78.0;
                                warCallbacks.spawnWarProjectile({
                                    pos: muzzle,
                                    vel: [(dx / len) * spd, (dy / len) * spd + 1.5, (dz / len) * spd],
                                    color: [1.0, 0.55, 0.15, 1.0],
                                    kind: 'RPG_ROCKET',
                                    faction: ent.faction,
                                    shooterId: ent.id,
                                    shooterName: ent.roleName,
                                    damage: 85,
                                    life: 2.8,
                                    gravity: 3.5,
                                    smokeTrail: true
                                });
                                warCallbacks.spawnMuzzleFlash(muzzle, [dx / len, dy / len, dz / len], [1.0, 0.6, 0.15, 1.0], 5);
                                ent.combatCooldown = 2.6 + Math.random() * 1.5;
                            } else {
                                const spd = 185.0;
                                const tracerColor: [number, number, number, number] = ent.faction === 'ALLY'
                                    ? [0.15, 1.0, 0.55, 1.0]  // Allied NATO Neon Green Tracer
                                    : [1.0, 0.22, 0.12, 1.0]; // Hostile OpFor Crimson Tracer
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
                                ent.combatCooldown = 0.24 + Math.random() * 0.48;
                            }
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

            // ====================================================================
            // B. ROUTE NAVIGATION FOR TANKS, SAMS, HELICOPTERS & JETS
            // ====================================================================
            const route = this.routes.get(ent.id);
            if (route && route.points.length > 0) {
                const targetPt = route.points[route.currentIndex];
                const dx = targetPt[0] - ent.pos[0];
                const dy = targetPt[1] - ent.pos[1];
                const dz = targetPt[2] - ent.pos[2];
                const dist = Math.hypot(dx, dz);

                const switchDist = ent.type === 'FIGHTER_JET' ? 12.0 : (ent.type === 'ATTACK_HELI' ? 5.0 : (ent.type === 'TANK' || ent.type === 'MISSILE_TRUCK' ? 2.5 : 1.0));

                if (dist < switchDist) {
                    route.currentIndex = (route.currentIndex + 1) % route.points.length;
                } else {
                    const targetHeadingRad = Math.atan2(dx, dz);
                    const targetHeadingDeg = targetHeadingRad * (180.0 / Math.PI);

                    let diff = targetHeadingDeg - ent.headingDeg;
                    while (diff > 180) diff -= 360;
                    while (diff < -180) diff += 360;

                    const turnRate = (ent.type === 'TANK' || ent.type === 'MISSILE_TRUCK') ? 65.0 : (ent.type === 'FIGHTER_JET' ? 85.0 : 120.0);
                    ent.headingDeg += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);

                    if (ent.type === 'FIGHTER_JET' || ent.type === 'ATTACK_HELI') {
                        const targetRoll = Math.max(-35, Math.min(35, diff * 0.55));
                        ent.rollDeg = (ent.rollDeg || 0) + (targetRoll - (ent.rollDeg || 0)) * Math.min(1.0, dt * 5.0);
                    }

                    const moveDist = ent.speed * dt;
                    const hRad = ent.headingDeg * (Math.PI / 180.0);
                    ent.pos[0] += Math.sin(hRad) * moveDist;
                    ent.pos[2] += Math.cos(hRad) * moveDist;

                    if (ent.type === 'TARGET_DRONE' || ent.type === 'ATTACK_HELI' || ent.type === 'FIGHTER_JET') {
                        ent.pos[1] += Math.sign(dy) * Math.min(Math.abs(dy), moveDist * 0.45);
                        if (getGroundHeight) {
                            const minAirY = getGroundHeight(ent.pos[0], ent.pos[2]) + (ent.type === 'FIGHTER_JET' ? 25.0 : 10.0);
                            if (ent.pos[1] < minAirY) ent.pos[1] = minAirY;
                        }
                    } else if (getGroundHeight) {
                        const gY = getGroundHeight(ent.pos[0], ent.pos[2]);
                        ent.pos[1] = ent.type === 'ROVER' ? gY + 0.4 : gY;
                    }

                    ent.walkPhase += ent.speed * 4.5 * dt;
                }
            }

            // ====================================================================
            // C. REAL-TIME WAR COMBAT AI FOR TANKS, SAMS, HELICOPTERS & JETS
            // ====================================================================
            if (!warCallbacks || ent.faction === 'NEUTRAL') continue;

            if (ent.type === 'TANK') {
                const enemy = this.findEnemyTarget(ent, 240.0, false);
                let desiredTurretYaw = ent.headingDeg + Math.sin(ent.walkPhase * 0.15) * 30.0;

                if (enemy) {
                    const toX = enemy.pos[0] - ent.pos[0];
                    const toZ = enemy.pos[2] - ent.pos[2];
                    desiredTurretYaw = Math.atan2(toX, toZ) * (180.0 / Math.PI);
                }

                const curTurret = ent.turretYawDeg ?? ent.headingDeg;
                let tDiff = desiredTurretYaw - curTurret;
                while (tDiff > 180) tDiff -= 360;
                while (tDiff < -180) tDiff += 360;
                ent.turretYawDeg = curTurret + Math.sign(tDiff) * Math.min(Math.abs(tDiff), 75.0 * dt);

                // Fire 120mm High-Explosive Tank Cannon Shell when aimed!
                if (enemy && Math.abs(tDiff) < 16.0 && ent.combatCooldown <= 0) {
                    const tRad = ent.turretYawDeg * (Math.PI / 180.0);
                    const muzzle: [number, number, number] = [
                        ent.pos[0] + Math.sin(tRad) * 4.75,
                        ent.pos[1] + 1.58,
                        ent.pos[2] + Math.cos(tRad) * 4.75
                    ];
                    const targetCenterY = enemy.pos[1] + enemy.height * 0.5;
                    const dx = enemy.pos[0] - muzzle[0];
                    const dy = targetCenterY - muzzle[1];
                    const dz = enemy.pos[2] - muzzle[2];
                    const dist = Math.hypot(dx, dy, dz) || 1.0;
                    const shellSpeed = 135.0;
                    const flightTime = dist / shellSpeed;
                    const grav = 9.8;

                    const vx = (dx / dist) * shellSpeed;
                    const vy = (dy / dist) * shellSpeed + 0.5 * grav * flightTime;
                    const vz = (dz / dist) * shellSpeed;

                    warCallbacks.spawnWarProjectile({
                        pos: muzzle,
                        vel: [vx, vy, vz],
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
                    warCallbacks.spawnMuzzleFlash(muzzle, [Math.sin(tRad), 0.1, Math.cos(tRad)], [1.0, 0.72, 0.18, 1.0], 14);
                    warCallbacks.onExplosionAudio(distToDrone);
                    ent.combatCooldown = 2.0 + Math.random() * 1.4;
                }
            } else if (ent.type === 'MISSILE_TRUCK') {
                // SAM Trucks prioritize enemy aircraft (and Hostile SAMs also engage the Player Drone if close!)
                const enemyAir = this.findEnemyTarget(ent, 300.0, true);
                const droneInSamRange = ent.faction === 'HOSTILE' && distToDrone < 145.0 && dronePos[1] > this.baseGroundY + 8.0;

                let targetPos: [number, number, number] | null = null;
                let targetId: string | undefined = undefined;
                let targetIsDrone = false;

                if (droneInSamRange && Math.random() < 0.35) {
                    targetPos = [...dronePos];
                    targetIsDrone = true;
                } else if (enemyAir) {
                    targetPos = [enemyAir.pos[0], enemyAir.pos[1] + enemyAir.height * 0.5, enemyAir.pos[2]];
                    targetId = enemyAir.id;
                }

                let desiredTurretYaw = ent.headingDeg + Math.sin(ent.walkPhase * 0.2) * 40.0;
                if (targetPos) {
                    desiredTurretYaw = Math.atan2(targetPos[0] - ent.pos[0], targetPos[2] - ent.pos[2]) * (180.0 / Math.PI);
                }

                const curTurret = ent.turretYawDeg ?? ent.headingDeg;
                let tDiff = desiredTurretYaw - curTurret;
                while (tDiff > 180) tDiff -= 360;
                while (tDiff < -180) tDiff += 360;
                ent.turretYawDeg = curTurret + Math.sign(tDiff) * Math.min(Math.abs(tDiff), 85.0 * dt);

                if (targetPos && Math.abs(tDiff) < 22.0 && ent.combatCooldown <= 0) {
                    const tRad = ent.turretYawDeg * (Math.PI / 180.0);
                    const launchPos: [number, number, number] = [
                        ent.pos[0] + Math.sin(tRad) * 0.4,
                        ent.pos[1] + 2.25,
                        ent.pos[2] + Math.cos(tRad) * 0.4
                    ];
                    const dx = targetPos[0] - launchPos[0];
                    const dy = targetPos[1] - launchPos[1];
                    const dz = targetPos[2] - launchPos[2];
                    const len = Math.hypot(dx, dy, dz) || 1.0;
                    const samSpeed = 88.0;

                    warCallbacks.spawnWarProjectile({
                        pos: launchPos,
                        vel: [(dx / len) * samSpeed, Math.max(18.0, (dy / len) * samSpeed + 12.0), (dz / len) * samSpeed],
                        color: ent.faction === 'ALLY' ? [0.2, 0.85, 1.0, 1.0] : [1.0, 0.35, 0.15, 1.0],
                        kind: 'SAM_MISSILE',
                        faction: ent.faction,
                        shooterId: ent.id,
                        shooterName: ent.roleName,
                        damage: 125,
                        life: 4.5,
                        smokeTrail: true,
                        targetEntityId: targetId,
                        targetsPlayerDrone: targetIsDrone,
                        homingStrength: targetIsDrone ? 0.22 : 0.45
                    });
                    warCallbacks.spawnMuzzleFlash(launchPos, [dx / len, 0.5, dz / len], [1.0, 0.8, 0.3, 1.0], 12);
                    warCallbacks.onExplosionAudio(distToDrone);
                    if (targetIsDrone) {
                        warCallbacks.onMissileWarningAudio();
                    }
                    ent.combatCooldown = 3.0 + Math.random() * 1.6;
                }
            } else if (ent.type === 'ATTACK_HELI') {
                const enemy = this.findEnemyTarget(ent, 260.0, false);
                if (enemy && ent.combatCooldown <= 0) {
                    const hRad = ent.headingDeg * (Math.PI / 180.0);
                    const muzzle: [number, number, number] = [
                        ent.pos[0] + Math.sin(hRad) * 2.4,
                        ent.pos[1] - 0.35,
                        ent.pos[2] + Math.cos(hRad) * 2.4
                    ];
                    const dx = enemy.pos[0] - muzzle[0] + (Math.random() - 0.5) * 2.0;
                    const dy = (enemy.pos[1] + enemy.height * 0.5) - muzzle[1];
                    const dz = enemy.pos[2] - muzzle[2] + (Math.random() - 0.5) * 2.0;
                    const len = Math.hypot(dx, dy, dz) || 1.0;

                    if (Math.random() < 0.42) {
                        // Fire Hydra-70 Unguided Strike Rocket
                        const spd = 115.0;
                        warCallbacks.spawnWarProjectile({
                            pos: muzzle,
                            vel: [(dx / len) * spd, (dy / len) * spd, (dz / len) * spd],
                            color: [1.0, 0.55, 0.15, 1.0],
                            kind: 'HELI_ROCKET',
                            faction: ent.faction,
                            shooterId: ent.id,
                            shooterName: ent.roleName,
                            damage: 90,
                            life: 3.0,
                            gravity: 2.0,
                            smokeTrail: true
                        });
                        warCallbacks.spawnMuzzleFlash(muzzle, [dx / len, dy / len, dz / len], [1.0, 0.7, 0.2, 1.0], 8);
                        ent.combatCooldown = 0.65 + Math.random() * 0.6;
                    } else {
                        // Fire 30mm Chain-Gun Tracer Round
                        const spd = 205.0;
                        warCallbacks.spawnWarProjectile({
                            pos: muzzle,
                            vel: [(dx / len) * spd, (dy / len) * spd, (dz / len) * spd],
                            color: ent.faction === 'ALLY' ? [0.25, 1.0, 0.65, 1.0] : [1.0, 0.35, 0.15, 1.0],
                            kind: 'TRACER',
                            faction: ent.faction,
                            shooterId: ent.id,
                            shooterName: ent.roleName,
                            damage: 24,
                            life: 1.6
                        });
                        warCallbacks.onGunfireAudio(distToDrone);
                        ent.combatCooldown = 0.20 + Math.random() * 0.25;
                    }
                }
            } else if (ent.type === 'FIGHTER_JET') {
                const enemy = this.findEnemyTarget(ent, 360.0, true);
                if (enemy && ent.combatCooldown <= 0) {
                    const hRad = ent.headingDeg * (Math.PI / 180.0);
                    const launchPos: [number, number, number] = [
                        ent.pos[0] + Math.sin(hRad) * 1.5,
                        ent.pos[1] - 0.3,
                        ent.pos[2] + Math.cos(hRad) * 1.5
                    ];
                    const dx = enemy.pos[0] - launchPos[0];
                    const dy = (enemy.pos[1] + enemy.height * 0.5) - launchPos[1];
                    const dz = enemy.pos[2] - launchPos[2];
                    const len = Math.hypot(dx, dy, dz) || 1.0;
                    const missileSpd = 135.0;

                    warCallbacks.spawnWarProjectile({
                        pos: launchPos,
                        vel: [(dx / len) * missileSpd, (dy / len) * missileSpd, (dz / len) * missileSpd],
                        color: ent.faction === 'ALLY' ? [0.3, 0.9, 1.0, 1.0] : [1.0, 0.4, 0.15, 1.0],
                        kind: 'SAM_MISSILE',
                        faction: ent.faction,
                        shooterId: ent.id,
                        shooterName: ent.roleName,
                        damage: 135,
                        life: 3.8,
                        smokeTrail: true,
                        targetEntityId: enemy.id,
                        homingStrength: 0.45
                    });
                    warCallbacks.spawnMuzzleFlash(launchPos, [dx / len, dy / len, dz / len], [1.0, 0.85, 0.3, 1.0], 10);
                    ent.combatCooldown = 2.4 + Math.random() * 1.4;
                }
            }
        }
    }

    /**
     * Hit check against entities from laser ray/projectile or battlefield ordnance
     */
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
            // Faction friendly-fire protection for AI units
            if (projectileFaction && projectileFaction !== 'PLAYER' && ent.faction === projectileFaction) {
                continue;
            }

            const entMinY = ent.pos[1] - (ent.type === 'FIGHTER_JET' || ent.type === 'ATTACK_HELI' ? ent.height * 0.5 : 0);
            const entMaxY = ent.pos[1] + ent.height;

            const segMinY = Math.min(p0[1], p1[1]);
            const segMaxY = Math.max(p0[1], p1[1]);
            if (segMaxY < entMinY - 0.6 || segMinY > entMaxY + 0.6) {
                continue;
            }

            const dx = p1[0] - p0[0];
            const dz = p1[2] - p0[2];
            const segLen = Math.hypot(dx, dz);
            const respawnSec = (ent.type === 'TANK' || ent.type === 'MISSILE_TRUCK')
                ? 14.0
                : (ent.type === 'FIGHTER_JET' || ent.type === 'ATTACK_HELI' || ent.type === 'ROVER' ? 11.0 : 7.0);

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
