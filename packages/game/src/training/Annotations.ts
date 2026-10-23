import { Camera } from '../scene/Camera';
import { TankTarget } from '../gpu/TankRenderer';

const NEAR_W = 0.05;

const EDGES: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
];

export interface ScreenBox {
    tankIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ClipPoint {
    x: number;
    y: number;
    z: number;
    w: number;
}

function toClip(matrix: Float32Array, x: number, y: number, z: number): ClipPoint {
    return {
        x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
        y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
        z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
    };
}

function lerpPoint(a: ClipPoint, b: ClipPoint, t: number): ClipPoint {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        w: a.w + (b.w - a.w) * t,
    };
}

function clipNearPlane(a: ClipPoint, b: ClipPoint): [ClipPoint, ClipPoint] | undefined {
    if (a.w <= NEAR_W && b.w <= NEAR_W) return undefined;
    let start = a;
    let end = b;
    if (start.w <= NEAR_W) {
        start = lerpPoint(a, b, (NEAR_W - a.w) / (b.w - a.w));
    }
    if (end.w <= NEAR_W) {
        end = lerpPoint(a, b, (NEAR_W - a.w) / (b.w - a.w));
    }
    return [start, end];
}

export function projectTankBoxes(
    camera: Camera,
    targets: TankTarget[],
    viewWidth: number,
    viewHeight: number,
): ScreenBox[] {
    const matrix = camera.viewProjMatrix;
    const boxes: ScreenBox[] = [];

    for (const target of targets) {
        const centerClip = toClip(matrix, target.center[0], target.center[1], target.center[2]);
        if (centerClip.w <= NEAR_W) continue;

        const cos = Math.cos(target.yaw);
        const sin = Math.sin(target.yaw);
        const corners: ClipPoint[] = [];
        for (let zi = 0; zi < 2; zi++) {
            for (let yi = 0; yi < 2; yi++) {
                for (let xi = 0; xi < 2; xi++) {
                    const lx = (xi === 0 ? -target.half[0] : target.half[0]);
                    const ly = (yi === 0 ? -target.half[1] : target.half[1]);
                    const lz = (zi === 0 ? -target.half[2] : target.half[2]);
                    const wx = target.center[0] + lx * cos - lz * sin;
                    const wy = target.center[1] + ly;
                    const wz = target.center[2] + lx * sin + lz * cos;
                    corners[xi + yi * 2 + zi * 4] = toClip(matrix, wx, wy, wz);
                }
            }
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let anyVisible = false;

        for (const [startIndex, endIndex] of EDGES) {
            const segment = clipNearPlane(corners[startIndex], corners[endIndex]);
            if (!segment) continue;
            for (const point of segment) {
                const sx = (point.x / point.w * 0.5 + 0.5) * viewWidth;
                const sy = (0.5 - point.y / point.w * 0.5) * viewHeight;
                minX = Math.min(minX, sx);
                minY = Math.min(minY, sy);
                maxX = Math.max(maxX, sx);
                maxY = Math.max(maxY, sy);
                anyVisible = true;
            }
        }

        if (!anyVisible) continue;

        const x0 = Math.max(0, Math.min(viewWidth, minX));
        const y0 = Math.max(0, Math.min(viewHeight, minY));
        const x1 = Math.max(0, Math.min(viewWidth, maxX));
        const y1 = Math.max(0, Math.min(viewHeight, maxY));
        if (x1 - x0 < 3 || y1 - y0 < 3) continue;

        boxes.push({
            tankIndex: target.index,
            x: x0,
            y: y0,
            width: x1 - x0,
            height: y1 - y0,
        });
    }

    return boxes;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export function buildCocoJson(
    imageName: string,
    imageWidth: number,
    imageHeight: number,
    boxes: ScreenBox[],
): string {
    const annotations = boxes.map((box, index) => ({
        id: index + 1,
        image_id: 1,
        category_id: 1,
        bbox: [round2(box.x), round2(box.y), round2(box.width), round2(box.height)],
        area: round2(box.width * box.height),
        iscrowd: 0,
    }));

    return JSON.stringify({
        info: {
            description: 'drone simulation training frame',
            date_created: new Date().toISOString(),
        },
        images: [{
            id: 1,
            file_name: imageName,
            width: imageWidth,
            height: imageHeight,
        }],
        annotations,
        categories: [{
            id: 1,
            name: 'tank',
            supercategory: 'vehicle',
        }],
    }, undefined, 2);
}
