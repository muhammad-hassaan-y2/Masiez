export type EntityType =
    | 'PERSON'
    | 'SOLDIER'
    | 'ROVER'
    | 'TANK'
    | 'MISSILE_TRUCK'
    | 'TARGET_DRONE'
    | 'ATTACK_HELI'
    | 'FIGHTER_JET';

export interface BaseEntity {
    id: string;
    type: EntityType;
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
}

export interface WaypointRoute {
    points: [number, number, number][];
    currentIndex: number;
}

export interface BattalionState {
    id: string;
    name: string;
    pos: [number, number, number];
    headingDeg: number;
    speed: number;
    route: WaypointRoute;
}

export class EntityManager {
    public entities: BaseEntity[] = [];
    private routes: Map<string, WaypointRoute> = new Map();
    private battalions: Map<string, BattalionState> = new Map();

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

        const sx = spawnPos[0];
        const sz = spawnPos[2];
        const gy = groundY;

        // 1. Local Personnel / Sentries
        this.addPerson(`${mapId}_person_1`, 'Forward Recon Scout', [sx + 8, gy, sz + 12], 0, [0.95, 0.45, 0.2, 1.0], [
            [sx + 8, gy, sz + 12], [sx + 8, gy, sz + 28], [sx + 18, gy, sz + 28], [sx + 18, gy, sz + 12]
        ]);
        this.addPerson(`${mapId}_person_2`, 'Logistics Specialist', [sx - 10, gy, sz + 14], 90, [0.2, 0.65, 0.95, 1.0], [
            [sx - 10, gy, sz + 14], [sx - 10, gy, sz - 15], [sx - 20, gy, sz - 15], [sx - 20, gy, sz + 14]
        ]);
        this.addPerson(`${mapId}_person_3`, 'Base Security Officer', [sx + 20, gy, sz - 12], 180, [0.95, 0.85, 0.1, 1.0], [
            [sx + 20, gy, sz - 12], [sx + 20, gy, sz + 15], [sx + 28, gy, sz + 15], [sx + 28, gy, sz - 12]
        ]);

        // 2. Autonomous Recon Rover
        this.entities.push({
            id: `${mapId}_rover`,
            type: 'ROVER',
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
            roleName: `${mapId.toUpperCase()} Recon Rover`
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

        // 3. Heavy Main Battle Tanks (Moving Armored Column)
        const isDesertOrErangel = mapId === 'erangel';
        const isUrban = mapId === 'street_city' || mapId === 'tram_station';
        const tankCamoA: [number, number, number, number] = isDesertOrErangel
            ? [0.42, 0.46, 0.30, 1.0]
            : (isUrban ? [0.34, 0.38, 0.42, 1.0] : [0.28, 0.36, 0.24, 1.0]);
        const tankCamoB: [number, number, number, number] = [0.58, 0.50, 0.34, 1.0];
        const tankCamoC: [number, number, number, number] = [0.25, 0.33, 0.22, 1.0];

        this.addTank(
            `${mapId}_tank_1`,
            'M1A2 Abrams MBT Alpha',
            [sx + 26, gy, sz - 35],
            0,
            4.8,
            tankCamoA,
            [
                [sx + 26, gy, sz - 35],
                [sx + 26, gy, sz + 55],
                [sx - 28, gy, sz + 55],
                [sx - 28, gy, sz - 35]
            ]
        );

        this.addTank(
            `${mapId}_tank_2`,
            'T-90M Armored Tank Bravo',
            [sx - 34, gy, sz + 40],
            180,
            4.5,
            tankCamoB,
            [
                [sx - 34, gy, sz + 40],
                [sx - 34, gy, sz - 50],
                [sx + 34, gy, sz - 50],
                [sx + 34, gy, sz + 40]
            ]
        );

        this.addTank(
            `${mapId}_tank_3`,
            'Leopard 2A7V Heavy Tank',
            [sx + 48, gy, sz + 15],
            270,
            5.0,
            tankCamoC,
            [
                [sx + 48, gy, sz + 15],
                [sx + 12, gy, sz + 75],
                [sx - 48, gy, sz + 65],
                [sx - 45, gy, sz + 10]
            ]
        );

        // 4. Mobile SAM / Armored Missile Launcher Trucks
        this.addMissileTruck(
            `${mapId}_sam_1`,
            'Patriot Mobile SAM Battery',
            [sx - 45, gy, sz - 25],
            0,
            5.5,
            [0.30, 0.37, 0.26, 1.0],
            [
                [sx - 45, gy, sz - 25],
                [sx - 45, gy, sz + 50],
                [sx - 18, gy, sz + 50],
                [sx - 18, gy, sz - 25]
            ]
        );

        this.addMissileTruck(
            `${mapId}_sam_2`,
            'Stryker ADATS Missile Carrier',
            [sx + 42, gy, sz - 45],
            90,
            5.8,
            [0.36, 0.40, 0.34, 1.0],
            [
                [sx + 42, gy, sz - 45],
                [sx + 68, gy, sz + 35],
                [sx + 32, gy, sz + 60],
                [sx + 20, gy, sz - 30]
            ]
        );

        // 5. Soldiers Battalions (Synchronized Marching Infantry Platoons)
        this.addSoldierBattalion(
            `${mapId}_battalion_alpha`,
            '1st Infantry Battalion (Alpha)',
            [sx + 16, gy, sz + 22],
            0,
            1.7,
            [0.26, 0.35, 0.22, 1.0],
            [
                [sx + 16, gy, sz + 22],
                [sx + 16, gy, sz + 62],
                [sx - 16, gy, sz + 62],
                [sx - 16, gy, sz + 22]
            ],
            8 // 8 armed soldiers in 2x4 formation
        );

        this.addSoldierBattalion(
            `${mapId}_battalion_bravo`,
            '2nd Ranger Battalion (Bravo)',
            [sx - 22, gy, sz - 18],
            180,
            1.75,
            [0.38, 0.34, 0.25, 1.0],
            [
                [sx - 22, gy, sz - 18],
                [sx - 22, gy, sz - 58],
                [sx + 22, gy, sz - 58],
                [sx + 22, gy, sz - 18]
            ],
            8 // 8 armed soldiers in 2x4 formation
        );

        this.addSoldierBattalion(
            `${mapId}_battalion_charlie`,
            '3rd Spec-Ops Strike Squad',
            [sx + 35, gy, sz - 10],
            90,
            1.85,
            [0.22, 0.26, 0.30, 1.0],
            [
                [sx + 35, gy, sz - 10],
                [sx + 58, gy, sz - 10],
                [sx + 58, gy, sz + 28],
                [sx + 35, gy, sz + 28]
            ],
            6 // 6 spec-ops soldiers in 2x3 formation
        );

        // 6. Military Craft: Attack Helicopters & Supersonic Fighter Jets
        const heliAlt = gy + 24.0;
        this.addAttackHeli(
            `${mapId}_heli_1`,
            'AH-64E Apache Guardian Gunship',
            [sx + 35, heliAlt, sz + 35],
            45,
            11.5,
            [0.22, 0.27, 0.20, 1.0],
            [
                [sx + 35, heliAlt, sz + 35],
                [sx + 75, heliAlt + 5, sz - 35],
                [sx - 35, heliAlt + 2, sz - 65],
                [sx - 65, heliAlt + 6, sz + 45]
            ]
        );

        this.addAttackHeli(
            `${mapId}_heli_2`,
            'Ka-52 Alligator Attack Chopper',
            [sx - 50, heliAlt + 8, sz - 30],
            220,
            12.5,
            [0.25, 0.30, 0.34, 1.0],
            [
                [sx - 50, heliAlt + 8, sz - 30],
                [sx - 75, heliAlt + 4, sz + 55],
                [sx + 40, heliAlt + 10, sz + 75],
                [sx + 55, heliAlt + 6, sz - 40]
            ]
        );

        const jetAlt = gy + 46.0;
        this.addFighterJet(
            `${mapId}_jet_1`,
            'F-22A Raptor Dominance Fighter',
            [sx + 80, jetAlt, sz - 80],
            0,
            24.0,
            [0.38, 0.42, 0.47, 1.0],
            [
                [sx + 95, jetAlt, sz - 95],
                [sx + 95, jetAlt + 10, sz + 110],
                [sx - 95, jetAlt + 4, sz + 110],
                [sx - 95, jetAlt - 4, sz - 95]
            ]
        );

        this.addFighterJet(
            `${mapId}_jet_2`,
            'Su-57 Felon Stealth Interceptor',
            [sx - 90, jetAlt + 14, sz + 80],
            180,
            26.0,
            [0.28, 0.35, 0.44, 1.0],
            [
                [sx - 110, jetAlt + 14, sz + 90],
                [sx + 110, jetAlt + 18, sz + 90],
                [sx + 110, jetAlt + 10, sz - 110],
                [sx - 110, jetAlt + 8, sz - 110]
            ]
        );

        // 7. Aerial Target Drones
        const targetAlt = gy + 14.0;
        this.entities.push({
            id: `${mapId}_drone_1`,
            type: 'TARGET_DRONE',
            pos: [sx + 15, targetAlt, sz + 20],
            headingDeg: 30,
            speed: 4.5,
            health: 90,
            maxHealth: 90,
            radius: 0.9,
            height: 0.6,
            walkPhase: 0,
            isAlive: true,
            respawnTimer: 0,
            color: [1.0, 0.25, 0.25, 1.0],
            roleName: 'Aerial Target Bravo'
        });
        this.routes.set(`${mapId}_drone_1`, {
            points: [
                [sx + 15, targetAlt, sz + 20],
                [sx + 35, targetAlt + 3, sz + 45],
                [sx + 20, targetAlt - 2, sz + 60],
                [sx - 5, targetAlt, sz + 30]
            ],
            currentIndex: 0
        });

        this.entities.push({
            id: `${mapId}_drone_2`,
            type: 'TARGET_DRONE',
            pos: [sx - 25, targetAlt + 4, sz - 15],
            headingDeg: 120,
            speed: 4.0,
            health: 90,
            maxHealth: 90,
            radius: 0.9,
            height: 0.6,
            walkPhase: 0,
            isAlive: true,
            respawnTimer: 0,
            color: [1.0, 0.65, 0.1, 1.0],
            roleName: 'Aerial Target Charlie'
        });
        this.routes.set(`${mapId}_drone_2`, {
            points: [
                [sx - 25, targetAlt + 4, sz - 15],
                [sx - 40, targetAlt + 2, sz + 20],
                [sx - 15, targetAlt + 5, sz + 40],
                [sx - 10, targetAlt + 3, sz - 5]
            ],
            currentIndex: 0
        });
    }

    public initAirfieldEntities(): void {
        this.entities = [];
        this.routes.clear();
        this.battalions.clear();

        // 1. Airport Crew / Logistics Personnel (5 animated persons)
        this.addPerson('worker_1', 'Airfield Crew (Hangar)', [-52, 0, 35], 0, [0.95, 0.45, 0.1, 1.0], [
            [-52, 0, 35], [-44, 0, 52], [-44, 0, 30], [-52, 0, 35]
        ]);
        this.addPerson('worker_2', 'Safety Marshal (Tower)', [-28, 0, -18], 90, [0.85, 0.95, 0.1, 1.0], [
            [-28, 0, -18], [-28, 0, -38], [-38, 0, -38], [-38, 0, -18]
        ]);
        this.addPerson('worker_3', 'Runway Technician', [-12, 0, 10], 180, [0.2, 0.4, 0.85, 1.0], [
            [-12, 0, 10], [-12, 0, -25], [-6, 0, -25], [-6, 0, 10]
        ]);
        this.addPerson('worker_4', 'Helipad Supervisor', [10, 0, 0], 270, [0.95, 0.45, 0.1, 1.0], [
            [10, 0, 0], [10, 0, 18], [-10, 0, 18], [-10, 0, 0]
        ]);
        this.addPerson('worker_5', 'Fuel Logistics Officer', [-70, 0, -12], 0, [0.2, 0.8, 0.35, 1.0], [
            [-70, 0, -12], [-70, 0, -2], [-76, 0, -2], [-76, 0, -12]
        ]);

        // 2. Autonomous Airport Security Patrol Rover
        this.entities.push({
            id: 'security_rover_1',
            type: 'ROVER',
            pos: [-18, 0.4, -60],
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
            roleName: 'Patrol Rover Delta'
        });
        this.routes.set('security_rover_1', {
            points: [
                [-18, 0.4, -60], [-18, 0.4, 90], [18, 0.4, 90], [18, 0.4, -60]
            ],
            currentIndex: 0
        });

        // 3. Heavy Main Battle Tanks (4 Moving Armored Tanks around Airfield & City Sector)
        this.addTank(
            'airfield_tank_1',
            'M1A2 Abrams MBT (Runway East)',
            [26, 0, -70],
            0,
            5.2,
            [0.28, 0.36, 0.24, 1.0], // NATO Olive Drab
            [
                [26, 0, -70],
                [26, 0, 85],
                [56, 0, 85],
                [56, 0, -70]
            ]
        );

        this.addTank(
            'airfield_tank_2',
            'T-90M Main Battle Tank (Hangar Guard)',
            [-36, 0, 65],
            180,
            4.8,
            [0.56, 0.48, 0.33, 1.0], // Desert Tan Armor
            [
                [-36, 0, 65],
                [-36, 0, -65],
                [-62, 0, -65],
                [-62, 0, 65]
            ]
        );

        this.addTank(
            'airfield_tank_3',
            'Leopard 2A7 Heavy Tank (North Perimeter)',
            [-25, 0, 95],
            90,
            5.0,
            [0.24, 0.32, 0.22, 1.0], // Woodland Camo
            [
                [-25, 0, 95],
                [70, 0, 95],
                [70, 0, 50],
                [-25, 0, 50]
            ]
        );

        this.addTank(
            'airfield_tank_4',
            'Challenger 3 Urban Tank (Metro Sector)',
            [98, 0, -55],
            0,
            4.6,
            [0.34, 0.38, 0.40, 1.0], // Urban Tactical Grey
            [
                [98, 0, -55],
                [98, 0, 65],
                [72, 0, 65],
                [72, 0, -55]
            ]
        );

        // 4. Mobile SAM / Armored Missile Launcher Trucks
        this.addMissileTruck(
            'airfield_sam_1',
            'Patriot PAC-3 SAM Launcher',
            [-48, 0, 12],
            0,
            5.5,
            [0.30, 0.37, 0.26, 1.0],
            [
                [-48, 0, 12],
                [-48, 0, 78],
                [-22, 0, 78],
                [-22, 0, 12]
            ]
        );

        this.addMissileTruck(
            'airfield_sam_2',
            'S-400 Triumf Mobile SAM Truck',
            [42, 0, -82],
            90,
            5.8,
            [0.36, 0.40, 0.30, 1.0],
            [
                [42, 0, -82],
                [88, 0, -82],
                [88, 0, -15],
                [42, 0, -15]
            ]
        );

        // 5. Soldiers Battalions (3 Full Marching Infantry Battalions)
        this.addSoldierBattalion(
            'airfield_battalion_alpha',
            '1st Airborne Infantry Battalion',
            [20, 0, -25],
            0,
            1.7,
            [0.25, 0.34, 0.21, 1.0], // Woodland Camo
            [
                [20, 0, -25],
                [20, 0, 48],
                [38, 0, 48],
                [38, 0, -25]
            ],
            8 // 8 armed soldiers marching in 2x4 column
        );

        this.addSoldierBattalion(
            'airfield_battalion_bravo',
            '2nd Armored Mech Battalion',
            [-22, 0, 25],
            180,
            1.75,
            [0.44, 0.39, 0.28, 1.0], // Arid Multicam
            [
                [-22, 0, 25],
                [-22, 0, -48],
                [-38, 0, -48],
                [-38, 0, 25]
            ],
            8 // 8 armed soldiers marching in 2x4 column
        );

        this.addSoldierBattalion(
            'airfield_battalion_charlie',
            '3rd Special Forces Garrison',
            [62, 0, -10],
            0,
            1.85,
            [0.20, 0.24, 0.28, 1.0], // Night Ops Black/Slate
            [
                [62, 0, -10],
                [62, 0, 42],
                [85, 0, 42],
                [85, 0, -10]
            ],
            6 // 6 spec-ops soldiers in 2x3 column
        );

        // 6. Military Craft (Attack Helicopters & Supersonic Fighter Jets)
        this.addAttackHeli(
            'airfield_heli_1',
            'AH-64E Apache Gunship Alpha',
            [40, 24, 30],
            0,
            12.0,
            [0.22, 0.27, 0.20, 1.0],
            [
                [40, 24, 30],
                [40, 28, 95],
                [-55, 26, 95],
                [-55, 22, -75],
                [40, 24, -75]
            ]
        );

        this.addAttackHeli(
            'airfield_heli_2',
            'Ka-52 Alligator Strike Heli',
            [-65, 30, -40],
            180,
            13.0,
            [0.26, 0.31, 0.35, 1.0],
            [
                [-65, 30, -40],
                [85, 34, -60],
                [95, 28, 70],
                [-65, 32, 60]
            ]
        );

        this.addFighterJet(
            'airfield_jet_1',
            'F-22 Raptor Stealth Fighter',
            [0, 48, -120],
            0,
            26.0,
            [0.38, 0.42, 0.47, 1.0],
            [
                [0, 48, -120],
                [90, 56, 120],
                [-90, 52, 120],
                [-90, 46, -120]
            ]
        );

        this.addFighterJet(
            'airfield_jet_2',
            'Su-57 Felon Tactical Jet',
            [110, 62, 90],
            225,
            28.0,
            [0.28, 0.35, 0.44, 1.0],
            [
                [110, 62, 90],
                [-110, 68, 90],
                [-110, 58, -110],
                [110, 60, -110]
            ]
        );

        // 7. Aerial Training Target Drones
        this.entities.push({
            id: 'aerial_target_1',
            type: 'TARGET_DRONE',
            pos: [28, 12, 35],
            headingDeg: 45,
            speed: 4.0,
            health: 80,
            maxHealth: 80,
            radius: 0.9,
            height: 0.6,
            walkPhase: 0,
            isAlive: true,
            respawnTimer: 0,
            color: [1.0, 0.2, 0.2, 1.0],
            roleName: 'Aerial Target Alpha'
        });
        this.routes.set('aerial_target_1', {
            points: [
                [28, 12, 35], [45, 16, 65], [40, 14, 20], [15, 10, 30]
            ],
            currentIndex: 0
        });

        this.entities.push({
            id: 'aerial_target_2',
            type: 'TARGET_DRONE',
            pos: [-30, 18, -45],
            headingDeg: 180,
            speed: 5.0,
            health: 80,
            maxHealth: 80,
            radius: 0.9,
            height: 0.6,
            walkPhase: 0,
            isAlive: true,
            respawnTimer: 0,
            color: [1.0, 0.6, 0.1, 1.0],
            roleName: 'Aerial Target Bravo'
        });
        this.routes.set('aerial_target_2', {
            points: [
                [-30, 18, -45], [-60, 22, -20], [-45, 16, 20], [-25, 14, -20]
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
            roleName: name
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
    }

    private addTank(
        id: string,
        name: string,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        armorColor: [number, number, number, number],
        routePoints: [number, number, number][]
    ): void {
        this.entities.push({
            id,
            type: 'TANK',
            pos: [...startPos],
            headingDeg: heading,
            turretYawDeg: heading,
            speed,
            health: 500,
            maxHealth: 500,
            radius: 2.6,
            height: 2.5,
            walkPhase: Math.random() * 10,
            isAlive: true,
            respawnTimer: 0,
            color: armorColor,
            roleName: name
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
    }

    private addMissileTruck(
        id: string,
        name: string,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        armorColor: [number, number, number, number],
        routePoints: [number, number, number][]
    ): void {
        this.entities.push({
            id,
            type: 'MISSILE_TRUCK',
            pos: [...startPos],
            headingDeg: heading,
            turretYawDeg: heading,
            speed,
            health: 340,
            maxHealth: 340,
            radius: 2.3,
            height: 2.8,
            walkPhase: Math.random() * 10,
            isAlive: true,
            respawnTimer: 0,
            color: armorColor,
            roleName: name
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
    }

    private addAttackHeli(
        id: string,
        name: string,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        hullColor: [number, number, number, number],
        routePoints: [number, number, number][]
    ): void {
        this.entities.push({
            id,
            type: 'ATTACK_HELI',
            pos: [...startPos],
            headingDeg: heading,
            pitchDeg: 6.0,
            rollDeg: 0.0,
            speed,
            health: 320,
            maxHealth: 320,
            radius: 2.8,
            height: 2.2,
            walkPhase: Math.random() * 10,
            isAlive: true,
            respawnTimer: 0,
            color: hullColor,
            roleName: name
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
    }

    private addFighterJet(
        id: string,
        name: string,
        startPos: [number, number, number],
        heading: number,
        speed: number,
        hullColor: [number, number, number, number],
        routePoints: [number, number, number][]
    ): void {
        this.entities.push({
            id,
            type: 'FIGHTER_JET',
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
            roleName: name
        });
        this.routes.set(id, {
            points: routePoints,
            currentIndex: 0
        });
    }

    private addSoldierBattalion(
        battalionId: string,
        battalionName: string,
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
            pos: [...startPos],
            headingDeg: heading,
            speed,
            route: {
                points: routePoints,
                currentIndex: 0
            }
        });

        const hRad = heading * (Math.PI / 180.0);
        const fwdX = Math.sin(hRad), fwdZ = Math.cos(hRad);
        const rgtX = Math.cos(hRad), rgtZ = -Math.sin(hRad);

        const roles = [
            'Battalion Commander',
            'Squad Leader',
            'Heavy Machine Gunner',
            'Anti-Armor Specialist',
            'Designated Marksman',
            'Combat Engineer',
            'Assault Rifleman',
            'Field Medic'
        ];

        for (let i = 0; i < soldierCount; i++) {
            const col = (i % 2 === 0) ? -1.1 : 1.1; // 2-column tactical march spacing (2.2m wide)
            const row = -Math.floor(i / 2) * 2.0;   // 2.0m front-to-back spacing

            const sx = startPos[0] + rgtX * col + fwdX * row;
            const sz = startPos[2] + rgtZ * col + fwdZ * row;
            const roleTitle = roles[i % roles.length];

            this.entities.push({
                id: `${battalionId}_soldier_${i + 1}`,
                type: 'SOLDIER',
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
                formationOffset: [col, row]
            });
        }
    }

    public update(
        dt: number,
        dronePos: [number, number, number],
        getGroundHeight?: (x: number, z: number) => number
    ): void {
        // 1. Update Battalion Formation Leaders
        for (const bat of this.battalions.values()) {
            const route = bat.route;
            if (!route || route.points.length === 0) continue;

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

                const moveDist = bat.speed * dt;
                const hRad = bat.headingDeg * (Math.PI / 180.0);
                bat.pos[0] += Math.sin(hRad) * moveDist;
                bat.pos[2] += Math.cos(hRad) * moveDist;
                if (getGroundHeight) {
                    bat.pos[1] = getGroundHeight(bat.pos[0], bat.pos[2]);
                }
            }
        }

        // 2. Update All Entities
        for (const ent of this.entities) {
            if (!ent.isAlive) {
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

            // Battalion Soldier Formation Tracking
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

                    let hDiff = bat.headingDeg - ent.headingDeg;
                    while (hDiff > 180) hDiff -= 360;
                    while (hDiff < -180) hDiff += 360;
                    ent.headingDeg += hDiff * Math.min(1.0, dt * 8.0);
                    ent.walkPhase += bat.speed * 4.8 * dt;
                }
                continue;
            }

            const route = this.routes.get(ent.id);
            if (!route || route.points.length === 0) continue;

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

                // Smooth banking for aircraft
                if (ent.type === 'FIGHTER_JET' || ent.type === 'ATTACK_HELI') {
                    const targetRoll = Math.max(-35, Math.min(35, diff * 0.55));
                    ent.rollDeg = (ent.rollDeg || 0) + (targetRoll - (ent.rollDeg || 0)) * Math.min(1.0, dt * 5.0);
                }

                // Move forward
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

            // Dynamic Turret Tracking for Tanks & SAM Missile Trucks
            if (ent.type === 'TANK' || ent.type === 'MISSILE_TRUCK') {
                const toDroneX = dronePos[0] - ent.pos[0];
                const toDroneZ = dronePos[2] - ent.pos[2];
                const droneDist = Math.hypot(toDroneX, toDroneZ);

                let desiredTurretYaw = ent.headingDeg + Math.sin(ent.walkPhase * 0.15) * 32.0;
                if (droneDist < 220.0) {
                    desiredTurretYaw = Math.atan2(toDroneX, toDroneZ) * (180.0 / Math.PI);
                }

                const curTurret = ent.turretYawDeg ?? ent.headingDeg;
                let tDiff = desiredTurretYaw - curTurret;
                while (tDiff > 180) tDiff -= 360;
                while (tDiff < -180) tDiff += 360;
                ent.turretYawDeg = curTurret + Math.sign(tDiff) * Math.min(Math.abs(tDiff), 55.0 * dt);
            }
        }
    }

    /**
     * Hit check against entities from laser ray/projectile
     */
    public checkHit(
        p0: [number, number, number],
        p1: [number, number, number],
        damage: number = 40
    ): { hitEntity: BaseEntity | null; hitPoint: [number, number, number] | null } {
        for (const ent of this.entities) {
            if (!ent.isAlive) continue;

            const entMinY = ent.pos[1] - (ent.type === 'FIGHTER_JET' || ent.type === 'ATTACK_HELI' ? ent.height * 0.5 : 0);
            const entMaxY = ent.pos[1] + ent.height;

            const segMinY = Math.min(p0[1], p1[1]);
            const segMaxY = Math.max(p0[1], p1[1]);
            if (segMaxY < entMinY - 0.5 || segMinY > entMaxY + 0.5) {
                continue;
            }

            const dx = p1[0] - p0[0];
            const dz = p1[2] - p0[2];
            const segLen = Math.hypot(dx, dz);
            const respawnSec = (ent.type === 'TANK' || ent.type === 'MISSILE_TRUCK')
                ? 18.0
                : (ent.type === 'FIGHTER_JET' || ent.type === 'ATTACK_HELI' || ent.type === 'ROVER' ? 14.0 : 8.0);

            if (segLen < 0.001) {
                const dCenter = Math.hypot(p0[0] - ent.pos[0], p0[2] - ent.pos[2]);
                if (dCenter <= ent.radius * 1.35) {
                    ent.health -= damage;
                    if (ent.health <= 0) {
                        ent.health = 0;
                        ent.isAlive = false;
                        ent.respawnTimer = respawnSec;
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

            const hitTolerance = ent.radius * 1.35;
            if (perpDist <= hitTolerance) {
                const tNorm = segLen > 0 ? clampedProj / segLen : 0;
                const hitY = p0[1] + (p1[1] - p0[1]) * tNorm;
                if (hitY >= entMinY - 0.5 && hitY <= entMaxY + 0.5) {
                    ent.health -= damage;
                    if (ent.health <= 0) {
                        ent.health = 0;
                        ent.isAlive = false;
                        ent.respawnTimer = respawnSec;
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
}
