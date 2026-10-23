const FLAT_RADIUS = 60;
const FULL_TERRAIN_RADIUS = 220;

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

export function terrainHeight(x: number, z: number): number {
    const dist = Math.hypot(x, z);
    const blend = smoothstep(FLAT_RADIUS, FULL_TERRAIN_RADIUS, dist);
    const h1 = Math.sin(x * 0.0055 + 0.7) * Math.cos(z * 0.0048 - 0.4) * 6.0;
    const h2 = Math.sin(x * 0.013 - 1.1) * Math.sin(z * 0.011 + 0.6) * 2.0;
    const h3 = Math.sin((x + z) * 0.0032) * 4.0;
    return (h1 + h2 + h3) * blend;
}

export function terrainNormal(x: number, z: number): [number, number, number] {
    const e = 1.0;
    const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
    const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
    const len = Math.hypot(dx, 2 * e, dz);
    return [-dx / len, (2 * e) / len, -dz / len];
}
