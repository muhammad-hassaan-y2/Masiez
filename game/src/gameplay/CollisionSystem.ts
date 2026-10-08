export interface AABB {
    id: string;
    min: [number, number, number];
    max: [number, number, number];
    name?: string;
}

export interface CylinderObstacle {
    id: string;
    center: [number, number]; // x, z
    radius: number;
    minY: number;
    maxY: number;
    name?: string;
}

export class CollisionSystem {
    private aabbs: AABB[] = [];
    private cylinders: CylinderObstacle[] = [];

    constructor() {
        this.initAirfieldColliders();
    }

    public initAirfieldColliders(): void {
        this.aabbs = [];
        this.cylinders = [];

        // 1. Airfield Control Tower
        // Tower concrete shaft: x=-35, z=-25, r=3.8, y=0..26
        this.cylinders.push({
            id: 'tower_shaft',
            center: [-35, -25],
            radius: 3.8,
            minY: 0,
            maxY: 26,
            name: 'Control Tower Shaft'
        });
        // Tower deck: x=-35, z=-25, r=5.6, y=26..32
        this.cylinders.push({
            id: 'tower_deck',
            center: [-35, -25],
            radius: 5.6,
            minY: 26,
            maxY: 32,
            name: 'Control Tower Deck'
        });

        // 2. Aircraft Hangars
        // Hangar 1 (North): center (-55, 6, 45), size (26, 12, 34)
        this.aabbs.push({
            id: 'hangar_1',
            min: [-68, 0, 28],
            max: [-42, 12.5, 62],
            name: 'North Aircraft Hangar'
        });

        // Hangar 2 (South): center (-55, 6, -55), size (26, 12, 34)
        this.aabbs.push({
            id: 'hangar_2',
            min: [-68, 0, -72],
            max: [-42, 12.5, -38],
            name: 'South Aircraft Hangar'
        });

        // 3. Fuel Depot Tanks: center (-78, -20) and (-78, -5), r=6.0, y=0..9
        this.cylinders.push({
            id: 'fuel_tank_1',
            center: [-78, -20],
            radius: 6.2,
            minY: 0,
            maxY: 9.5,
            name: 'Industrial Fuel Tank 1'
        });
        this.cylinders.push({
            id: 'fuel_tank_2',
            center: [-78, -5],
            radius: 6.2,
            minY: 0,
            maxY: 9.5,
            name: 'Industrial Fuel Tank 2'
        });

        // 4. Downtown City High-Rise District (11 Skyscraper towers)
        const cityBuildings = [
            { x: 120, z: -40, sx: 20, sy: 55, sz: 20, name: 'Metro Tower 1' },
            { x: 150, z: -30, sx: 24, sy: 78, sz: 22, name: 'Horizon Center' },
            { x: 180, z: -45, sx: 26, sy: 92, sz: 24, name: 'Apex Spire' },
            { x: 130, z: 0,   sx: 22, sy: 62, sz: 22, name: 'Civic Plaza' },
            { x: 165, z: 15,  sx: 28, sy: 110, sz: 28, name: 'Grand Skyline Tower' },
            { x: 200, z: 0,   sx: 22, sy: 68, sz: 22, name: 'Financial Hub' },
            { x: 135, z: 50,  sx: 24, sy: 48, sz: 24, name: 'Avenue Tower' },
            { x: 175, z: 65,  sx: 26, sy: 82, sz: 24, name: 'Summit Office Park' },
            { x: 210, z: 45,  sx: 20, sy: 58, sz: 20, name: 'Eastgate Tower' },
            { x: 150, z: -85, sx: 25, sy: 45, sz: 25, name: 'South Square' },
            { x: 190, z: -80, sx: 22, sy: 52, sz: 22, name: 'Commerce Center' },
        ];

        for (const b of cityBuildings) {
            const hx = b.sx * 0.5, hz = b.sz * 0.5;
            this.aabbs.push({
                id: `skyscraper_${b.name.replace(/\s+/g, '_')}`,
                min: [b.x - hx, 0, b.z - hz],
                max: [b.x + hx, b.sy + 2.0, b.z + hz],
                name: b.name
            });
        }

        // 5. Natural Vegetation Pine Trees (22 trees surrounding airfield)
        const treePositions = [
            [-20, 20], [-25, 28], [-18, 35], [-30, 10], [-22, -15], [-26, -20],
            [25, 15], [30, 30], [35, -20], [28, -40], [45, 5], [50, 40],
            [-70, 70], [-75, 50], [-80, 20], [-65, -80], [-80, -70],
            [75, -80], [90, -50], [85, 10], [95, 60], [80, 80],
        ];
        for (let i = 0; i < treePositions.length; i++) {
            const [tx, tz] = treePositions[i];
            this.cylinders.push({
                id: `airfield_tree_${i}`,
                center: [tx, tz],
                radius: 1.6,
                minY: 0,
                maxY: 8.0,
                name: `Pine Tree #${i + 1}`
            });
        }
    }

    public clearColliders(): void {
        this.aabbs = [];
        this.cylinders = [];
    }

    public initErangelColliders(groundY: number = 19.3): void {
        // Military Radio Watchtowers & Bunkers near spawn (0, 22, 300)
        this.cylinders.push({
            id: 'erangel_radar_tower',
            center: [25, 320],
            radius: 3.2,
            minY: groundY,
            maxY: groundY + 28.0,
            name: 'Military Radar Mast'
        });
        this.cylinders.push({
            id: 'erangel_water_tower',
            center: [-35, 340],
            radius: 4.5,
            minY: groundY,
            maxY: groundY + 22.0,
            name: 'Outpost Water Tower'
        });
        this.aabbs.push({
            id: 'erangel_barracks_1',
            min: [-22, groundY, 280],
            max: [-6, groundY + 6.5, 310],
            name: 'Military Barracks North'
        });
        this.aabbs.push({
            id: 'erangel_hangar',
            min: [15, groundY, 260],
            max: [45, groundY + 11.0, 295],
            name: 'Vehicle Depot Warehouse'
        });
        this.aabbs.push({
            id: 'erangel_command_post',
            min: [-10, groundY, 325],
            max: [10, groundY + 8.5, 350],
            name: 'Tactical Command Bunker'
        });
    }

    public addAABB(min: [number, number, number], max: [number, number, number], id: string = 'custom'): void {
        this.aabbs.push({ id, min, max });
    }

    /**
     * Resolves collision between drone sphere and all structures.
     * Pushes pos outside building and modifies vel with bounce & friction.
     */
    public resolveDroneCollision(
        pos: [number, number, number],
        vel: [number, number, number],
        radius: number = 0.45
    ): { hit: boolean; normal: [number, number, number] | null; obstacleName?: string } {
        let hit = false;
        let lastNormal: [number, number, number] | null = null;
        let hitObstacleName: string | undefined = undefined;

        // 1. Test AABBs
        for (const box of this.aabbs) {
            // Find closest point on AABB to sphere center
            const cx = Math.max(box.min[0], Math.min(pos[0], box.max[0]));
            const cy = Math.max(box.min[1], Math.min(pos[1], box.max[1]));
            const cz = Math.max(box.min[2], Math.min(pos[2], box.max[2]));

            const dx = pos[0] - cx;
            const dy = pos[1] - cy;
            const dz = pos[2] - cz;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < radius * radius) {
                hit = true;
                hitObstacleName = box.name;
                const dist = Math.sqrt(distSq);

                let nx = 0, ny = 0, nz = 0;
                let overlap = 0;

                if (dist > 0.0001) {
                    nx = dx / dist;
                    ny = dy / dist;
                    nz = dz / dist;
                    overlap = radius - dist;
                } else {
                    // Sphere center is inside AABB: find minimum exit direction
                    const dMinX = pos[0] - box.min[0];
                    const dMaxX = box.max[0] - pos[0];
                    const dMinY = pos[1] - box.min[1];
                    const dMaxY = box.max[1] - pos[1];
                    const dMinZ = pos[2] - box.min[2];
                    const dMaxZ = box.max[2] - pos[2];

                    const minD = Math.min(dMinX, dMaxX, dMinY, dMaxY, dMinZ, dMaxZ);
                    if (minD === dMinX) { nx = -1; overlap = radius + dMinX; }
                    else if (minD === dMaxX) { nx = 1; overlap = radius + dMaxX; }
                    else if (minD === dMinY) { ny = -1; overlap = radius + dMinY; }
                    else if (minD === dMaxY) { ny = 1; overlap = radius + dMaxY; }
                    else if (minD === dMinZ) { nz = -1; overlap = radius + dMinZ; }
                    else { nz = 1; overlap = radius + dMaxZ; }
                }

                // Push position out
                pos[0] += nx * overlap;
                pos[1] += ny * overlap;
                pos[2] += nz * overlap;

                // Adjust velocity
                const vDotN = vel[0] * nx + vel[1] * ny + vel[2] * nz;
                if (vDotN < 0) {
                    const restitution = 0.25; // mild bounce
                    vel[0] -= (1 + restitution) * vDotN * nx;
                    vel[1] -= (1 + restitution) * vDotN * ny;
                    vel[2] -= (1 + restitution) * vDotN * nz;

                    // Friction
                    vel[0] *= 0.8;
                    vel[2] *= 0.8;
                }

                // If on top of roof, support landing
                if (ny > 0.6) {
                    vel[1] = Math.max(0, vel[1]);
                }

                lastNormal = [nx, ny, nz];
            }
        }

        // 2. Test Cylinders
        for (const cyl of this.cylinders) {
            if (pos[1] + radius < cyl.minY || pos[1] - radius > cyl.maxY) {
                continue;
            }

            const dx = pos[0] - cyl.center[0];
            const dz = pos[2] - cyl.center[1];
            const distXZ = Math.hypot(dx, dz);
            const totalR = cyl.radius + radius;

            if (distXZ < totalR) {
                // Check if hitting top/bottom cap vs side
                const distToTop = Math.abs(pos[1] - (cyl.maxY + radius));
                if (pos[1] >= cyl.maxY && distToTop < radius * 1.5) {
                    // Rooftop of cylinder
                    pos[1] = cyl.maxY + radius;
                    if (vel[1] < 0) vel[1] = 0;
                    hit = true;
                    lastNormal = [0, 1, 0];
                    hitObstacleName = cyl.name;
                    continue;
                }

                // Side collision
                hit = true;
                hitObstacleName = cyl.name;
                const nx = distXZ > 0.001 ? dx / distXZ : 1;
                const nz = distXZ > 0.001 ? dz / distXZ : 0;
                const overlap = totalR - distXZ;

                pos[0] += nx * overlap;
                pos[2] += nz * overlap;

                const vDotN = vel[0] * nx + vel[2] * nz;
                if (vDotN < 0) {
                    vel[0] -= 1.25 * vDotN * nx;
                    vel[2] -= 1.25 * vDotN * nz;
                    vel[0] *= 0.8;
                    vel[2] *= 0.8;
                }

                lastNormal = [nx, 0, nz];
            }
        }

        return { hit, normal: lastNormal, obstacleName: hitObstacleName };
    }

    /**
     * Raycast against all colliders (for laser bullets)
     */
    public raycast(
        p0: [number, number, number],
        p1: [number, number, number]
    ): { hit: boolean; point: [number, number, number]; normal: [number, number, number]; dist: number } | null {
        let closestHit: { hit: boolean; point: [number, number, number]; normal: [number, number, number]; dist: number } | null = null;
        const dir = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const maxDist = Math.hypot(dir[0], dir[1], dir[2]);
        if (maxDist < 0.0001) return null;
        const normDir = [dir[0] / maxDist, dir[1] / maxDist, dir[2] / maxDist];

        // Ray vs AABBs
        for (const box of this.aabbs) {
            let tMin = 0.0;
            let tMax = maxDist;
            let nHit: [number, number, number] = [0, 1, 0];

            for (let i = 0; i < 3; ++i) {
                const invD = 1.0 / (normDir[i] === 0 ? 0.000001 : normDir[i]);
                let t0 = (box.min[i] - p0[i]) * invD;
                let t1 = (box.max[i] - p0[i]) * invD;
                let ni = -1;
                if (invD < 0.0) {
                    const temp = t0; t0 = t1; t1 = temp;
                    ni = 1;
                }

                if (t0 > tMin) {
                    tMin = t0;
                    nHit = [i === 0 ? ni : 0, i === 1 ? ni : 0, i === 2 ? ni : 0];
                }
                tMax = Math.min(tMax, t1);
                if (tMax < tMin) break;
            }

            if (tMax >= tMin && tMin >= 0 && tMin <= maxDist) {
                if (!closestHit || tMin < closestHit.dist) {
                    closestHit = {
                        hit: true,
                        point: [
                            p0[0] + normDir[0] * tMin,
                            p0[1] + normDir[1] * tMin,
                            p0[2] + normDir[2] * tMin
                        ],
                        normal: nHit,
                        dist: tMin
                    };
                }
            }
        }

        return closestHit;
    }
}
