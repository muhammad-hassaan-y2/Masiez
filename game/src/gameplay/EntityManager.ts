export type EntityType = 'PERSON' | 'ROVER' | 'TARGET_DRONE';

export interface BaseEntity {
    id: string;
    type: EntityType;
    pos: [number, number, number];
    headingDeg: number;
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
}

export interface WaypointRoute {
    points: [number, number, number][];
    currentIndex: number;
}

export class EntityManager {
    public entities: BaseEntity[] = [];
    private routes: Map<string, WaypointRoute> = new Map();

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

        const sx = spawnPos[0];
        const sz = spawnPos[2];
        const gy = groundY;

        // 1. Map-specific moving pedestrians / personnel
        this.addPerson(`${mapId}_person_1`, 'Civilian Pedestrian A', [sx + 6, gy, sz + 8], 0, [0.95, 0.45, 0.2, 1.0], [
            [sx + 6, gy, sz + 8], [sx + 6, gy, sz + 24], [sx + 14, gy, sz + 24], [sx + 14, gy, sz + 8]
        ]);
        this.addPerson(`${mapId}_person_2`, 'Civilian Pedestrian B', [sx - 8, gy, sz + 12], 90, [0.2, 0.65, 0.95, 1.0], [
            [sx - 8, gy, sz + 12], [sx - 8, gy, sz - 15], [sx - 18, gy, sz - 15], [sx - 18, gy, sz + 12]
        ]);
        this.addPerson(`${mapId}_person_3`, 'Security Officer', [sx + 18, gy, sz - 10], 180, [0.95, 0.85, 0.1, 1.0], [
            [sx + 18, gy, sz - 10], [sx + 18, gy, sz + 15], [sx + 24, gy, sz + 15], [sx + 24, gy, sz - 10]
        ]);
        this.addPerson(`${mapId}_person_4`, 'City Patrolman', [sx - 20, gy, sz + 20], 270, [0.3, 0.85, 0.4, 1.0], [
            [sx - 20, gy, sz + 20], [sx - 4, gy, sz + 20], [sx - 4, gy, sz + 32], [sx - 20, gy, sz + 32]
        ]);

        // 2. Autonomous Patrol Vehicle / Rover
        this.entities.push({
            id: `${mapId}_rover`,
            type: 'ROVER',
            pos: [sx - 12, gy + 0.4, sz - 20],
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
            roleName: `${mapId.toUpperCase()} Patrol Unit`
        });
        this.routes.set(`${mapId}_rover`, {
            points: [
                [sx - 12, gy + 0.4, sz - 20],
                [sx - 12, gy + 0.4, sz + 45],
                [sx + 22, gy + 0.4, sz + 45],
                [sx + 22, gy + 0.4, sz - 20]
            ],
            currentIndex: 0
        });

        // 3. Aerial Training Target Drones
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

        // 1. Airport Crew / Pedestrians (5 animated persons)
        // Person 1: Hangar Crew Lead (High-vis orange vest)
        this.addPerson('worker_1', 'Airfield Crew (Hangar)', [-52, 0, 35], 0, [0.95, 0.45, 0.1, 1.0], [
            [-52, 0, 35], [-44, 0, 52], [-44, 0, 30], [-52, 0, 35]
        ]);

        // Person 2: Ground Safety Marshal (Neon yellow vest)
        this.addPerson('worker_2', 'Safety Marshal (Tower)', [-28, 0, -18], 90, [0.85, 0.95, 0.1, 1.0], [
            [-28, 0, -18], [-28, 0, -38], [-38, 0, -38], [-38, 0, -18]
        ]);

        // Person 3: Runway Inspection Technician (Blue jumpsuit)
        this.addPerson('worker_3', 'Runway Technician', [-12, 0, 10], 180, [0.2, 0.4, 0.85, 1.0], [
            [-12, 0, 10], [-12, 0, -25], [-6, 0, -25], [-6, 0, 10]
        ]);

        // Person 4: Helipad Supervisor (High-vis orange)
        this.addPerson('worker_4', 'Helipad Supervisor', [10, 0, 0], 270, [0.95, 0.45, 0.1, 1.0], [
            [10, 0, 0], [10, 0, 18], [-10, 0, 18], [-10, 0, 0]
        ]);

        // Person 5: Fuel Depot Engineer (Green safety gear)
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

        // 3. Aerial Training Target Drones (2 flying targets for aerial dogfight / shooting practice)
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

    public update(dt: number, dronePos: [number, number, number]): void {
        for (const ent of this.entities) {
            if (!ent.isAlive) {
                ent.respawnTimer -= dt;
                if (ent.respawnTimer <= 0) {
                    ent.isAlive = true;
                    ent.health = ent.maxHealth;
                    // Reset to first waypoint
                    const route = this.routes.get(ent.id);
                    if (route && route.points.length > 0) {
                        ent.pos = [...route.points[0]];
                        route.currentIndex = 0;
                    }
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

            if (dist < 1.0) {
                // Advance to next waypoint
                route.currentIndex = (route.currentIndex + 1) % route.points.length;
            } else {
                // Steer towards target waypoint
                const targetHeadingRad = Math.atan2(dx, dz);
                const targetHeadingDeg = targetHeadingRad * (180.0 / Math.PI);

                // Smooth turn towards target heading
                let diff = targetHeadingDeg - ent.headingDeg;
                while (diff > 180) diff -= 360;
                while (diff < -180) diff += 360;
                ent.headingDeg += Math.sign(diff) * Math.min(Math.abs(diff), 120.0 * dt);

                // Move forward
                const moveDist = ent.speed * dt;
                const hRad = ent.headingDeg * (Math.PI / 180.0);
                ent.pos[0] += Math.sin(hRad) * moveDist;
                ent.pos[2] += Math.cos(hRad) * moveDist;

                if (ent.type === 'TARGET_DRONE') {
                    ent.pos[1] += Math.sign(dy) * Math.min(Math.abs(dy), moveDist * 0.5);
                }

                // Advance walking cycle animation
                ent.walkPhase += ent.speed * 4.5 * dt;
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

            // Approximate cylinder bounding volume around entity
            const halfH = ent.height * 0.5;
            const centerY = ent.pos[1] + halfH;
            
            // Check vertical segment
            const midY = (p0[1] + p1[1]) * 0.5;
            if (midY < ent.pos[1] || midY > ent.pos[1] + ent.height) {
                continue;
            }

            // Check 2D distance to ray segment in XZ
            const dx = p1[0] - p0[0];
            const dz = p1[2] - p0[2];
            const segLen = Math.hypot(dx, dz);
            if (segLen < 0.001) continue;

            const nx = dx / segLen;
            const nz = dz / segLen;

            // Vector from p0 to entity center
            const vx = ent.pos[0] - p0[0];
            const vz = ent.pos[2] - p0[2];

            // Projection onto ray
            const proj = vx * nx + vz * nz;
            if (proj >= 0 && proj <= segLen) {
                const perpDist = Math.hypot(vx - proj * nx, vz - proj * nz);
                if (perpDist <= ent.radius) {
                    // Hit!
                    ent.health -= damage;
                    if (ent.health <= 0) {
                        ent.health = 0;
                        ent.isAlive = false;
                        ent.respawnTimer = ent.type === 'ROVER' ? 15.0 : 8.0;
                    }

                    const hitPoint: [number, number, number] = [
                        p0[0] + nx * proj,
                        centerY,
                        p0[2] + nz * proj
                    ];

                    return { hitEntity: ent, hitPoint };
                }
            }
        }

        return { hitEntity: null, hitPoint: null };
    }
}
