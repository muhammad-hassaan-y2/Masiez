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

    public get colliderCount(): number {
        return this.aabbs.length + this.cylinders.length;
    }

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

    private erangelHeightData: Uint16Array | null = null;
    private erangelWidth: number = 0;
    private erangelHeight: number = 0;
    private erangelScaleX: number = 20000.0;
    private erangelScaleY: number = 800.0;
    private erangelScaleZ: number = 20000.0;
    private erangelGroundElevation: number = 19.3;

    public loadHeightmap(
        data: Uint16Array,
        width: number,
        height: number,
        sx: number,
        sy: number,
        sz: number,
        groundElevation: number = 19.3
    ): void {
        this.erangelHeightData = data;
        this.erangelWidth = width;
        this.erangelHeight = height;
        this.erangelScaleX = sx;
        this.erangelScaleY = sy;
        this.erangelScaleZ = sz;
        this.erangelGroundElevation = groundElevation;
    }

    public clearHeightmap(): void {
        this.erangelHeightData = null;
    }

    /**
     * Exact analytical terrain height matching shaders/terrain.wgsl for the Tactical Airfield.
     */
    public getAirfieldTerrainHeight(px: number, pz: number): number {
        const distFromOrigin = Math.hypot(px, pz);
        const airfieldBlend = Math.max(0.0, Math.min(1.0, (distFromOrigin - 40.0) / 50.0));
        if (airfieldBlend <= 0.0) {
            return 0.0;
        }
        const h1 = Math.sin(px * 0.012 + 0.4) * Math.cos(pz * 0.012 + 0.6) * 22.0;
        const h2 = Math.sin(px * 0.024 + pz * 0.016) * 10.0;
        const h3 = Math.sin(px * 0.005 - 1.0) * Math.cos(pz * 0.006 + 0.5) * 28.0;
        const h4 = Math.sin(px * 0.05 + pz * 0.035) * 2.0;
        const rawHeight = h1 + h2 + h3 + h4 + 14.0;
        return Math.max(0.0, rawHeight * airfieldBlend);
    }

    /**
     * Returns true ground elevation at (x, z) for any active map.
     */
    public getGroundHeight(mapId: string, x: number, z: number, defaultElev: number = 0.0): number {
        if (mapId === 'airfield') {
            return this.getAirfieldTerrainHeight(x, z);
        }
        if (mapId === 'erangel' && this.erangelHeightData && this.erangelWidth > 0 && this.erangelHeight > 0) {
            const u = (x / this.erangelScaleX) + 0.5;
            const v = (z / this.erangelScaleZ) + 0.5;
            if (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0) {
                const ix = Math.max(0, Math.min(this.erangelWidth - 1, Math.floor(u * (this.erangelWidth - 1))));
                const iz = Math.max(0, Math.min(this.erangelHeight - 1, Math.floor(v * (this.erangelHeight - 1))));
                const hNorm = this.erangelHeightData[iz * this.erangelWidth + ix] / 65535.0;
                return hNorm * this.erangelScaleY + this.erangelGroundElevation;
            }
            return this.erangelGroundElevation;
        }
        return defaultElev;
    }

    public addAABB(min: [number, number, number], max: [number, number, number], id: string = 'custom'): void {
        this.aabbs.push({ id, min, max });
    }

    /**
     * Resolves continuous and discrete collision between drone sphere and all structures.
     * Prevents high-speed tunneling through walls, prevents pushing underground, and enables rooftop landing.
     */
    public resolveDroneCollision(
        pos: [number, number, number],
        vel: [number, number, number],
        radius: number = 0.45,
        prevPos?: [number, number, number],
        currentGroundY: number = 0.0
    ): { hit: boolean; normal: [number, number, number] | null; obstacleName?: string } {
        let hit = false;
        let lastNormal: [number, number, number] | null = null;
        let hitObstacleName: string | undefined = undefined;

        // 1. Test AABBs (Skyscrapers, Hangars, Buildings, Warehouses)
        for (const box of this.aabbs) {
            const bMinX = box.min[0] - radius, bMaxX = box.max[0] + radius;
            const bMinY = Math.max(currentGroundY, box.min[1] - radius), bMaxY = box.max[1] + radius;
            const bMinZ = box.min[2] - radius, bMaxZ = box.max[2] + radius;

            // A. Continuous Swept Line-Segment Check (Prevents high-speed tunneling through walls)
            const prevWasOutside = prevPos && (
                prevPos[0] < bMinX || prevPos[0] > bMaxX ||
                prevPos[1] < bMinY || prevPos[1] > bMaxY ||
                prevPos[2] < bMinZ || prevPos[2] > bMaxZ
            );
            if (prevWasOutside) {
                const segMinX = Math.min(prevPos[0], pos[0]);
                const segMaxX = Math.max(prevPos[0], pos[0]);
                const segMinY = Math.min(prevPos[1], pos[1]);
                const segMaxY = Math.max(prevPos[1], pos[1]);
                const segMinZ = Math.min(prevPos[2], pos[2]);
                const segMaxZ = Math.max(prevPos[2], pos[2]);

                if (segMaxX >= bMinX && segMinX <= bMaxX &&
                    segMaxY >= bMinY && segMinY <= bMaxY &&
                    segMaxZ >= bMinZ && segMinZ <= bMaxZ) {

                    const dxSeg = pos[0] - prevPos[0];
                    const dySeg = pos[1] - prevPos[1];
                    const dzSeg = pos[2] - prevPos[2];
                    const segLen = Math.hypot(dxSeg, dySeg, dzSeg);

                    if (segLen > 0.001) {
                        let t0 = 0.0, t1 = 1.0;
                        let hitNormal: [number, number, number] = [0, 0, 0];
                        let sweptHit = true;

                        const dims = [
                            { d: dxSeg, min: bMinX, max: bMaxX, p: prevPos[0], nNeg: [-1, 0, 0], nPos: [1, 0, 0] },
                            { d: dySeg, min: bMinY, max: bMaxY, p: prevPos[1], nNeg: [0, -1, 0], nPos: [0, 1, 0] },
                            { d: dzSeg, min: bMinZ, max: bMaxZ, p: prevPos[2], nNeg: [0, 0, -1], nPos: [0, 0, 1] },
                        ];

                        for (let i = 0; i < 3; i++) {
                            const { d, min, max, p, nNeg, nPos } = dims[i];
                            if (Math.abs(d) < 1e-6) {
                                if (p < min || p > max) { sweptHit = false; break; }
                            } else {
                                let tNear = (min - p) / d;
                                let tFar = (max - p) / d;
                                let enterNorm = nNeg;
                                if (tNear > tFar) {
                                    const tmp = tNear; tNear = tFar; tFar = tmp;
                                    enterNorm = nPos;
                                }
                                if (tNear > t0) {
                                    t0 = tNear;
                                    hitNormal = enterNorm as [number, number, number];
                                }
                                if (tFar < t1) t1 = tFar;
                                if (t0 > t1) { sweptHit = false; break; }
                            }
                        }

                        if (sweptHit && t0 >= 0.0 && t0 <= 1.0) {
                            hit = true;
                            hitObstacleName = box.name;

                            // Halt drone immediately at impact boundary
                            const safeT = Math.max(0, t0 - 0.02);
                            pos[0] = prevPos[0] + dxSeg * safeT;
                            pos[1] = Math.max(currentGroundY + 0.28, prevPos[1] + dySeg * safeT);
                            pos[2] = prevPos[2] + dzSeg * safeT;

                            const vDotN = vel[0] * hitNormal[0] + vel[1] * hitNormal[1] + vel[2] * hitNormal[2];
                            if (vDotN < 0) {
                                const restitution = 0.35;
                                vel[0] -= (1 + restitution) * vDotN * hitNormal[0];
                                vel[1] -= (1 + restitution) * vDotN * hitNormal[1];
                                vel[2] -= (1 + restitution) * vDotN * hitNormal[2];
                                vel[0] *= 0.75;
                                vel[2] *= 0.75;
                            }
                            if (hitNormal[1] > 0.5 && vel[1] < 0) {
                                vel[1] = 0;
                            }
                            lastNormal = hitNormal;
                            continue;
                        }
                    }
                }
            }

            // B. Discrete Sphere vs AABB Overlap
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
                    // Center inside AABB: find safest exit direction.
                    // CRITICAL: Grounded buildings MUST NEVER push downward into the ground!
                    const dMinX = pos[0] - box.min[0];
                    const dMaxX = box.max[0] - pos[0];
                    const dMaxY = box.max[1] - pos[1];
                    const dMinZ = pos[2] - box.min[2];
                    const dMaxZ = box.max[2] - pos[2];

                    let bestDir = 'xNeg';
                    let minD = dMinX;

                    if (dMaxX < minD) { minD = dMaxX; bestDir = 'xPos'; }
                    if (dMinZ < minD) { minD = dMinZ; bestDir = 'zNeg'; }
                    if (dMaxZ < minD) { minD = dMaxZ; bestDir = 'zPos'; }
                    if (dMaxY < minD) { minD = dMaxY; bestDir = 'yPos'; }

                    // Only allow -Y exit if building is elevated well above ground
                    const isElevatedOverpass = box.min[1] > currentGroundY + 2.5;
                    if (isElevatedOverpass) {
                        const dMinY = pos[1] - box.min[1];
                        if (dMinY < minD) { minD = dMinY; bestDir = 'yNeg'; }
                    }

                    if (bestDir === 'xNeg') { nx = -1; overlap = radius + dMinX; }
                    else if (bestDir === 'xPos') { nx = 1; overlap = radius + dMaxX; }
                    else if (bestDir === 'zNeg') { nz = -1; overlap = radius + dMinZ; }
                    else if (bestDir === 'zPos') { nz = 1; overlap = radius + dMaxZ; }
                    else if (bestDir === 'yPos') { ny = 1; overlap = radius + dMaxY; }
                    else if (bestDir === 'yNeg') { ny = -1; overlap = radius + (pos[1] - box.min[1]); }
                }

                // Push position firmly out of the building
                pos[0] += nx * overlap;
                pos[1] += ny * overlap;
                pos[2] += nz * overlap;

                // Ensure pushed position never goes below ground
                pos[1] = Math.max(currentGroundY + 0.28, pos[1]);

                // Physics reflection & friction
                const vDotN = vel[0] * nx + vel[1] * ny + vel[2] * nz;
                if (vDotN < 0) {
                    const restitution = 0.35;
                    vel[0] -= (1 + restitution) * vDotN * nx;
                    vel[1] -= (1 + restitution) * vDotN * ny;
                    vel[2] -= (1 + restitution) * vDotN * nz;
                    vel[0] *= 0.75;
                    vel[2] *= 0.75;
                }

                // Rooftop landing support
                if (ny > 0.5) {
                    if (vel[1] < 0) vel[1] = 0;
                }

                lastNormal = [nx, ny, nz];
            }
        }

        // 2. Test Cylinders (Control Tower, Fuel Tanks, Trees, Radar Masts)
        for (const cyl of this.cylinders) {
            const minCylY = Math.max(currentGroundY, cyl.minY - radius);
            const maxCylY = cyl.maxY + radius;
            const totalR = cyl.radius + radius;

            // A. Swept segment vs cylinder check (prevents high-speed tunneling through circular shafts)
            const prevWasOutsideCyl = prevPos && (
                Math.hypot(prevPos[0] - cyl.center[0], prevPos[2] - cyl.center[1]) >= totalR ||
                prevPos[1] < minCylY || prevPos[1] > maxCylY
            );
            if (prevWasOutsideCyl) {
                const segMinY = Math.min(prevPos[1], pos[1]);
                const segMaxY = Math.max(prevPos[1], pos[1]);
                if (segMaxY >= minCylY && segMinY <= maxCylY) {
                    const dxSeg = pos[0] - prevPos[0];
                    const dzSeg = pos[2] - prevPos[2];
                    const segLenSq = dxSeg * dxSeg + dzSeg * dzSeg;

                    if (segLenSq > 0.001) {
                        const tClamped = Math.max(0, Math.min(1, ((cyl.center[0] - prevPos[0]) * dxSeg + (cyl.center[1] - prevPos[2]) * dzSeg) / segLenSq));
                        const closestX = prevPos[0] + tClamped * dxSeg;
                        const closestZ = prevPos[2] + tClamped * dzSeg;
                        const distToCylSq = (closestX - cyl.center[0]) ** 2 + (closestZ - cyl.center[1]) ** 2;

                        if (distToCylSq < totalR * totalR) {
                            // Hit the cylinder along swept path
                            hit = true;
                            hitObstacleName = cyl.name;

                            const dirX = closestX - cyl.center[0];
                            const dirZ = closestZ - cyl.center[1];
                            const dLen = Math.hypot(dirX, dirZ) || 1.0;
                            const normX = dirX / dLen;
                            const normZ = dirZ / dLen;

                            // Place drone just outside cylinder
                            pos[0] = cyl.center[0] + normX * (totalR + 0.05);
                            pos[2] = cyl.center[1] + normZ * (totalR + 0.05);
                            pos[1] = Math.max(currentGroundY + 0.28, prevPos[1] + (pos[1] - prevPos[1]) * tClamped);

                            const vDotN = vel[0] * normX + vel[2] * normZ;
                            if (vDotN < 0) {
                                const restitution = 0.35;
                                vel[0] -= (1 + restitution) * vDotN * normX;
                                vel[2] -= (1 + restitution) * vDotN * normZ;
                                vel[0] *= 0.75;
                                vel[2] *= 0.75;
                            }
                            lastNormal = [normX, 0, normZ];
                            continue;
                        }
                    }
                }
            }

            // B. Discrete sphere vs cylinder
            if (pos[1] + radius < cyl.minY || pos[1] - radius > cyl.maxY) {
                continue;
            }

            const dx = pos[0] - cyl.center[0];
            const dz = pos[2] - cyl.center[1];
            const distXZ = Math.hypot(dx, dz);

            if (distXZ < totalR) {
                // Check if landing on rooftop of cylinder
                if (pos[1] >= cyl.maxY - 0.2) {
                    pos[1] = cyl.maxY + radius;
                    if (vel[1] < 0) vel[1] = 0;
                    hit = true;
                    lastNormal = [0, 1, 0];
                    hitObstacleName = cyl.name;
                    continue;
                }

                // Radial side collision
                hit = true;
                hitObstacleName = cyl.name;
                const nx = distXZ > 0.001 ? dx / distXZ : (prevPos ? (prevPos[0] - cyl.center[0]) : 1);
                const nz = distXZ > 0.001 ? dz / distXZ : (prevPos ? (prevPos[2] - cyl.center[1]) : 0);
                const nLen = Math.hypot(nx, nz) || 1.0;
                const normX = nx / nLen;
                const normZ = nz / nLen;
                const overlap = totalR - distXZ;

                pos[0] += normX * overlap;
                pos[2] += normZ * overlap;
                pos[1] = Math.max(currentGroundY + 0.28, pos[1]);

                const vDotN = vel[0] * normX + vel[2] * normZ;
                if (vDotN < 0) {
                    const restitution = 0.35;
                    vel[0] -= (1 + restitution) * vDotN * normX;
                    vel[2] -= (1 + restitution) * vDotN * normZ;
                    vel[0] *= 0.75;
                    vel[2] *= 0.75;
                }

                lastNormal = [normX, 0, normZ];
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

        // Ray vs Cylinders (Towers, Fuel Tanks, Pine Trees)
        for (const cyl of this.cylinders) {
            const cx = cyl.center[0];
            const cz = cyl.center[1];
            const r = cyl.radius;
            const minY = cyl.minY;
            const maxY = cyl.maxY;

            // 1. Check side surface of vertical cylinder
            const dx = p0[0] - cx;
            const dz = p0[2] - cz;
            const vxd = normDir[0];
            const vzd = normDir[2];

            const a = vxd * vxd + vzd * vzd;
            if (a > 0.00001) {
                const b = 2 * (dx * vxd + dz * vzd);
                const c = dx * dx + dz * dz - r * r;
                const disc = b * b - 4 * a * c;

                if (disc >= 0) {
                    const sqrtDisc = Math.sqrt(disc);
                    const tSide1 = (-b - sqrtDisc) / (2 * a);
                    const tSide2 = (-b + sqrtDisc) / (2 * a);

                    for (const tCandidate of [tSide1, tSide2]) {
                        if (tCandidate >= 0 && tCandidate <= maxDist) {
                            const hitY = p0[1] + normDir[1] * tCandidate;
                            if (hitY >= minY && hitY <= maxY) {
                                if (!closestHit || tCandidate < closestHit.dist) {
                                    const hitX = p0[0] + normDir[0] * tCandidate;
                                    const hitZ = p0[2] + normDir[2] * tCandidate;
                                    const normSide: [number, number, number] = [
                                        (hitX - cx) / r,
                                        0,
                                        (hitZ - cz) / r
                                    ];
                                    closestHit = {
                                        hit: true,
                                        point: [hitX, hitY, hitZ],
                                        normal: normSide,
                                        dist: tCandidate
                                    };
                                }
                            }
                        }
                    }
                }
            }

            // 2. Check top circular cap
            if (Math.abs(normDir[1]) > 0.0001) {
                const tCap = (maxY - p0[1]) / normDir[1];
                if (tCap >= 0 && tCap <= maxDist) {
                    const hitCapX = p0[0] + normDir[0] * tCap;
                    const hitCapZ = p0[2] + normDir[2] * tCap;
                    const distSq = (hitCapX - cx) * (hitCapX - cx) + (hitCapZ - cz) * (hitCapZ - cz);
                    if (distSq <= r * r) {
                        if (!closestHit || tCap < closestHit.dist) {
                            closestHit = {
                                hit: true,
                                point: [hitCapX, maxY, hitCapZ],
                                normal: [0, 1, 0],
                                dist: tCap
                            };
                        }
                    }
                }
            }
        }

        return closestHit;
    }
}
