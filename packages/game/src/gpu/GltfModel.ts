import { GPUDeviceContext } from './Device';

export interface GltfPrimitive {
    vertexBuffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    indexCount: number;
    baseColorFactor: [number, number, number, number];
    textureView: GPUTextureView;
    hasTexture: boolean;
}

export interface GltfModel {
    primitives: GltfPrimitive[];
    min: [number, number, number];
    max: [number, number, number];
}

interface GltfAccessor {
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
}

interface GltfBufferView {
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
}

interface GltfImage {
    bufferView?: number;
    mimeType?: string;
    name?: string;
}

interface GltfTexture {
    source?: number;
}

interface GltfMaterial {
    pbrMetallicRoughness?: {
        baseColorFactor?: number[];
        baseColorTexture?: { index: number };
    };
}

interface GltfPrimitiveDef {
    attributes: Record<string, number>;
    indices?: number;
    material?: number;
    mode?: number;
}

interface GltfMesh {
    primitives: GltfPrimitiveDef[];
}

interface GltfJson {
    accessors: GltfAccessor[];
    bufferViews: GltfBufferView[];
    images?: GltfImage[];
    textures?: GltfTexture[];
    materials?: GltfMaterial[];
    meshes: GltfMesh[];
}

const COMPONENTS: Record<string, number> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
};

function readFloatAccessor(json: GltfJson, bin: Uint8Array, index: number): Float32Array | undefined {
    const acc = json.accessors[index];
    if (!acc || acc.bufferView === undefined) return undefined;
    const bv = json.bufferViews[acc.bufferView];
    if (!bv) return undefined;

    const comps = COMPONENTS[acc.type] || 1;
    const elementBytes = comps * 4;
    const stride = bv.byteStride !== undefined ? bv.byteStride : elementBytes;
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const out = new Float32Array(acc.count * comps);

    for (let i = 0; i < acc.count; i++) {
        for (let c = 0; c < comps; c++) {
            out[i * comps + c] = view.getFloat32(base + i * stride + c * 4, true);
        }
    }
    return out;
}

function readIndexAccessor(json: GltfJson, bin: Uint8Array, index: number): Uint32Array | undefined {
    const acc = json.accessors[index];
    if (!acc || acc.bufferView === undefined) return undefined;
    const bv = json.bufferViews[acc.bufferView];
    if (!bv) return undefined;

    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const out = new Uint32Array(acc.count);

    for (let i = 0; i < acc.count; i++) {
        if (acc.componentType === 5121) {
            out[i] = view.getUint8(base + i);
        } else if (acc.componentType === 5123) {
            out[i] = view.getUint16(base + i * 2, true);
        } else {
            out[i] = view.getUint32(base + i * 4, true);
        }
    }
    return out;
}

function createSolidTexture(ctx: GPUDeviceContext): GPUTextureView {
    const texture = ctx.device.createTexture({
        size: [1, 1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    ctx.device.queue.writeTexture(
        { texture },
        new Uint8Array([255, 255, 255, 255]),
        { bytesPerRow: 4 },
        [1, 1]
    );
    return texture.createView();
}

async function loadTexture(ctx: GPUDeviceContext, bytes: Uint8Array, mimeType: string): Promise<GPUTextureView | undefined> {
    try {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const blob = new Blob([copy], { type: mimeType });
        const bitmap = await createImageBitmap(blob);
        const texture = ctx.device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        ctx.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture },
            [bitmap.width, bitmap.height]
        );
        bitmap.close();
        return texture.createView();
    } catch (err) {
        console.warn('Failed to decode embedded glTF texture:', err);
        return undefined;
    }
}

export async function loadGltf(ctx: GPUDeviceContext, url: string): Promise<GltfModel | undefined> {
    const res = await fetch(url);
    if (!res.ok) {
        console.error(`Failed to fetch glTF model: ${url}`);
        return undefined;
    }

    const arrayBuffer = await res.arrayBuffer();
    const dataView = new DataView(arrayBuffer);
    if (dataView.getUint32(0, true) !== 0x46546c67) {
        console.error(`Not a binary glTF file: ${url}`);
        return undefined;
    }

    const totalLength = dataView.getUint32(8, true);
    let offset = 12;
    let json: GltfJson | undefined;
    let bin: Uint8Array | undefined;

    while (offset + 8 <= totalLength) {
        const chunkLength = dataView.getUint32(offset, true);
        const chunkType = dataView.getUint32(offset + 4, true);
        const chunk = new Uint8Array(arrayBuffer, offset + 8, chunkLength);
        if (chunkType === 0x4e4f534a) {
            json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
        } else if (chunkType === 0x004e4942) {
            bin = chunk;
        }
        offset += 8 + chunkLength;
    }

    if (!json || !bin) {
        console.error(`Malformed binary glTF file: ${url}`);
        return undefined;
    }

    const defaultTexture = createSolidTexture(ctx);
    const imageViews: (GPUTextureView | undefined)[] = [];
    for (const image of json.images || []) {
        if (image.bufferView === undefined) {
            imageViews.push(undefined);
            continue;
        }
        const bv = json.bufferViews[image.bufferView];
        const start = bv.byteOffset || 0;
        const bytes = bin.slice(start, start + bv.byteLength);
        const view = await loadTexture(ctx, bytes, image.mimeType || 'image/png');
        imageViews.push(view);
    }

    const primitives: GltfPrimitive[] = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const mesh of json.meshes || []) {
        for (const prim of mesh.primitives || []) {
            const positionIndex = prim.attributes.POSITION;
            if (positionIndex === undefined) continue;
            const positions = readFloatAccessor(json, bin, positionIndex);
            if (!positions) continue;
            const normals = prim.attributes.NORMAL !== undefined
                ? readFloatAccessor(json, bin, prim.attributes.NORMAL)
                : undefined;
            const uvs = prim.attributes.TEXCOORD_0 !== undefined
                ? readFloatAccessor(json, bin, prim.attributes.TEXCOORD_0)
                : undefined;
            const indices = prim.indices !== undefined
                ? readIndexAccessor(json, bin, prim.indices)
                : undefined;
            if (!indices) continue;

            const vertexCount = positions.length / 3;
            const vertices = new Float32Array(vertexCount * 8);
            for (let i = 0; i < vertexCount; i++) {
                vertices[i * 8 + 0] = positions[i * 3 + 0];
                vertices[i * 8 + 1] = positions[i * 3 + 1];
                vertices[i * 8 + 2] = positions[i * 3 + 2];
                vertices[i * 8 + 3] = normals ? normals[i * 3 + 0] : 0.0;
                vertices[i * 8 + 4] = normals ? normals[i * 3 + 1] : 1.0;
                vertices[i * 8 + 5] = normals ? normals[i * 3 + 2] : 0.0;
                vertices[i * 8 + 6] = uvs ? uvs[i * 2 + 0] : 0.0;
                vertices[i * 8 + 7] = uvs ? uvs[i * 2 + 1] : 0.0;

                minX = Math.min(minX, positions[i * 3 + 0]);
                minY = Math.min(minY, positions[i * 3 + 1]);
                minZ = Math.min(minZ, positions[i * 3 + 2]);
                maxX = Math.max(maxX, positions[i * 3 + 0]);
                maxY = Math.max(maxY, positions[i * 3 + 1]);
                maxZ = Math.max(maxZ, positions[i * 3 + 2]);
            }

            let baseColor: [number, number, number, number] = [0.8, 0.8, 0.8, 1.0];
            let textureView = defaultTexture;
            let hasTexture = false;

            if (prim.material !== undefined && json.materials) {
                const material = json.materials[prim.material];
                if (material && material.pbrMetallicRoughness) {
                    const factor = material.pbrMetallicRoughness.baseColorFactor;
                    if (factor && factor.length >= 4) {
                        baseColor = [factor[0], factor[1], factor[2], factor[3]];
                    }
                    const textureIndex = material.pbrMetallicRoughness.baseColorTexture
                        ? material.pbrMetallicRoughness.baseColorTexture.index
                        : undefined;
                    if (textureIndex !== undefined && json.textures) {
                        const textureDef = json.textures[textureIndex];
                        const source = textureDef ? textureDef.source : undefined;
                        if (source !== undefined) {
                            const view = imageViews[source];
                            if (view !== undefined) {
                                textureView = view;
                                hasTexture = true;
                            }
                        }
                    }
                }
            }

            primitives.push({
                vertexBuffer: ctx.createBuffer(vertices, GPUBufferUsage.VERTEX),
                indexBuffer: ctx.createBuffer(indices, GPUBufferUsage.INDEX),
                indexCount: indices.length,
                baseColorFactor: baseColor,
                textureView,
                hasTexture,
            });
        }
    }

    if (primitives.length === 0) {
        console.error(`No renderable primitives in glTF file: ${url}`);
        return undefined;
    }

    return {
        primitives,
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
    };
}
