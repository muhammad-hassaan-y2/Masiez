export interface AABB {
    id: string;
    min: [number, number, number];
    max: [number, number, number];
}

export interface OBB {
    id: string;
    center: [number, number, number];
    half: [number, number, number];
    yaw: number;
}

export interface CollisionResult {
    hit: boolean;
    normal: [number, number, number];
    obstacleId: string;
}

export class CollisionSystem {
    private obstacles: OBB[] = [];

    public get colliderCount(): number {
        return this.obstacles.length;
    }

    public addOBB(center: [number, number, number], half: [number, number, number], yaw: number, id: string = 'custom'): void {
        this.obstacles.push({ id, center, half, yaw });
    }

    public clearColliders(): void {
        this.obstacles = [];
    }

    public removeObstacle(id: string): void {
        this.obstacles = this.obstacles.filter((box) => box.id !== id);
    }

    public resolveDroneCollision(
        pos: [number, number, number],
        vel: [number, number, number],
        radius: number = 0.25,
        prevPos?: [number, number, number],
        currentGroundY: number = 0.0
    ): CollisionResult {
        let hit = false;
        let lastNormal: [number, number, number] = [0, 0, 0];
        let hitObstacleId = '';

        for (const box of this.obstacles) {
            const cos = Math.cos(box.yaw);
            const sin = Math.sin(box.yaw);

            const relX = pos[0] - box.center[0];
            const relY = pos[1] - box.center[1];
            const relZ = pos[2] - box.center[2];
            const localPos: [number, number, number] = [
                relX * cos + relZ * sin,
                relY,
                -relX * sin + relZ * cos,
            ];

            const localVel: [number, number, number] = [
                vel[0] * cos + vel[2] * sin,
                vel[1],
                -vel[0] * sin + vel[2] * cos,
            ];

            let prevLocal: [number, number, number] = [0, 0, 0];
            let hasPrev = false;
            if (prevPos) {
                const prevRelX = prevPos[0] - box.center[0];
                const prevRelY = prevPos[1] - box.center[1];
                const prevRelZ = prevPos[2] - box.center[2];
                prevLocal = [
                    prevRelX * cos + prevRelZ * sin,
                    prevRelY,
                    -prevRelX * sin + prevRelZ * cos,
                ];
                hasPrev = true;
            }

            const groundLocal = currentGroundY - box.center[1];
            const bMinX = -box.half[0] - radius, bMaxX = box.half[0] + radius;
            const bMinY = Math.max(groundLocal, -box.half[1] - radius), bMaxY = box.half[1] + radius;
            const bMinZ = -box.half[2] - radius, bMaxZ = box.half[2] + radius;

            let boxHit = false;
            let localNormal: [number, number, number] = [0, 0, 0];

            const prevWasOutside = hasPrev && (
                prevLocal[0] < bMinX || prevLocal[0] > bMaxX ||
                prevLocal[1] < bMinY || prevLocal[1] > bMaxY ||
                prevLocal[2] < bMinZ || prevLocal[2] > bMaxZ
            );

            if (prevWasOutside) {
                const segMinX = Math.min(prevLocal[0], localPos[0]);
                const segMaxX = Math.max(prevLocal[0], localPos[0]);
                const segMinY = Math.min(prevLocal[1], localPos[1]);
                const segMaxY = Math.max(prevLocal[1], localPos[1]);
                const segMinZ = Math.min(prevLocal[2], localPos[2]);
                const segMaxZ = Math.max(prevLocal[2], localPos[2]);

                if (segMaxX >= bMinX && segMinX <= bMaxX &&
                    segMaxY >= bMinY && segMinY <= bMaxY &&
                    segMaxZ >= bMinZ && segMinZ <= bMaxZ) {

                    const dxSeg = localPos[0] - prevLocal[0];
                    const dySeg = localPos[1] - prevLocal[1];
                    const dzSeg = localPos[2] - prevLocal[2];
                    const segLen = Math.hypot(dxSeg, dySeg, dzSeg);

                    if (segLen > 0.001) {
                        let t0 = 0.0, t1 = 1.0;
                        let hitNormal: [number, number, number] = [0, 0, 0];
                        let sweptHit = true;

                        const dims = [
                            { d: dxSeg, min: bMinX, max: bMaxX, p: prevLocal[0], nNeg: [-1, 0, 0], nPos: [1, 0, 0] },
                            { d: dySeg, min: bMinY, max: bMaxY, p: prevLocal[1], nNeg: [0, -1, 0], nPos: [0, 1, 0] },
                            { d: dzSeg, min: bMinZ, max: bMaxZ, p: prevLocal[2], nNeg: [0, 0, -1], nPos: [0, 0, 1] },
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
                            boxHit = true;
                            localNormal = hitNormal;

                            const safeT = Math.max(0, t0 - 0.02);
                            localPos[0] = prevLocal[0] + dxSeg * safeT;
                            localPos[1] = Math.max(groundLocal + 0.12, prevLocal[1] + dySeg * safeT);
                            localPos[2] = prevLocal[2] + dzSeg * safeT;

                            const vDotN = localVel[0] * hitNormal[0] + localVel[1] * hitNormal[1] + localVel[2] * hitNormal[2];
                            if (vDotN < 0) {
                                const restitution = 0.35;
                                localVel[0] -= (1 + restitution) * vDotN * hitNormal[0];
                                localVel[1] -= (1 + restitution) * vDotN * hitNormal[1];
                                localVel[2] -= (1 + restitution) * vDotN * hitNormal[2];
                                localVel[0] *= 0.75;
                                localVel[2] *= 0.75;
                            }
                            if (hitNormal[1] > 0.5 && localVel[1] < 0) {
                                localVel[1] = 0;
                            }
                        }
                    }
                }
            }

            if (!boxHit) {
                const cx = Math.max(-box.half[0], Math.min(localPos[0], box.half[0]));
                const cy = Math.max(-box.half[1], Math.min(localPos[1], box.half[1]));
                const cz = Math.max(-box.half[2], Math.min(localPos[2], box.half[2]));

                const dx = localPos[0] - cx;
                const dy = localPos[1] - cy;
                const dz = localPos[2] - cz;
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq < radius * radius) {
                    boxHit = true;
                    const dist = Math.sqrt(distSq);

                    let nx = 0, ny = 0, nz = 0;
                    let overlap = 0;

                    if (dist > 0.0001) {
                        nx = dx / dist;
                        ny = dy / dist;
                        nz = dz / dist;
                        overlap = radius - dist;
                    } else {
                        const dMinX = localPos[0] + box.half[0];
                        const dMaxX = box.half[0] - localPos[0];
                        const dMaxY = box.half[1] - localPos[1];
                        const dMinZ = localPos[2] + box.half[2];
                        const dMaxZ = box.half[2] - localPos[2];

                        let bestDir = 'xNeg';
                        let minD = dMinX;

                        if (dMaxX < minD) { minD = dMaxX; bestDir = 'xPos'; }
                        if (dMinZ < minD) { minD = dMinZ; bestDir = 'zNeg'; }
                        if (dMaxZ < minD) { minD = dMaxZ; bestDir = 'zPos'; }
                        if (dMaxY < minD) { minD = dMaxY; bestDir = 'yPos'; }

                        const isElevatedOverpass = -box.half[1] > groundLocal + 2.5;
                        if (isElevatedOverpass) {
                            const dMinY = localPos[1] + box.half[1];
                            if (dMinY < minD) { minD = dMinY; bestDir = 'yNeg'; }
                        }

                        if (bestDir === 'xNeg') { nx = -1; overlap = radius + dMinX; }
                        else if (bestDir === 'xPos') { nx = 1; overlap = radius + dMaxX; }
                        else if (bestDir === 'zNeg') { nz = -1; overlap = radius + dMinZ; }
                        else if (bestDir === 'zPos') { nz = 1; overlap = radius + dMaxZ; }
                        else if (bestDir === 'yPos') { ny = 1; overlap = radius + dMaxY; }
                        else if (bestDir === 'yNeg') { ny = -1; overlap = radius + (localPos[1] + box.half[1]); }
                    }

                    localPos[0] += nx * overlap;
                    localPos[1] += ny * overlap;
                    localPos[2] += nz * overlap;

                    localPos[1] = Math.max(groundLocal + 0.12, localPos[1]);

                    const vDotN = localVel[0] * nx + localVel[1] * ny + localVel[2] * nz;
                    if (vDotN < 0) {
                        const restitution = 0.35;
                        localVel[0] -= (1 + restitution) * vDotN * nx;
                        localVel[1] -= (1 + restitution) * vDotN * ny;
                        localVel[2] -= (1 + restitution) * vDotN * nz;
                        localVel[0] *= 0.75;
                        localVel[2] *= 0.75;
                    }

                    if (ny > 0.5) {
                        if (localVel[1] < 0) localVel[1] = 0;
                    }

                    localNormal = [nx, ny, nz];
                }
            }

            if (boxHit) {
                hit = true;
                hitObstacleId = box.id;

                pos[0] = box.center[0] + localPos[0] * cos - localPos[2] * sin;
                pos[1] = box.center[1] + localPos[1];
                pos[2] = box.center[2] + localPos[0] * sin + localPos[2] * cos;

                vel[0] = localVel[0] * cos - localVel[2] * sin;
                vel[1] = localVel[1];
                vel[2] = localVel[0] * sin + localVel[2] * cos;

                lastNormal = [
                    localNormal[0] * cos - localNormal[2] * sin,
                    localNormal[1],
                    localNormal[0] * sin + localNormal[2] * cos,
                ];
            }
        }

        return { hit, normal: lastNormal, obstacleId: hitObstacleId };
    }
}
